-- Multi Delivery 4.4: frete por distância configurável por unidade.
-- Compatibilidade: permanece desligado por padrão e, quando desligado ou sem GPS no endereço,
-- preserva integralmente as regras atuais por região/bairro.

begin;

alter table public.empresa_unidades
  add column if not exists frete_distancia_ativo boolean not null default false,
  add column if not exists frete_taxa_base numeric(10,2),
  add column if not exists frete_valor_km numeric(10,2),
  add column if not exists frete_raio_max_km numeric(10,2);

alter table public.empresa_unidades drop constraint if exists empresa_unidades_frete_taxa_base_check;
alter table public.empresa_unidades add constraint empresa_unidades_frete_taxa_base_check
  check (frete_taxa_base is null or frete_taxa_base >= 0);

alter table public.empresa_unidades drop constraint if exists empresa_unidades_frete_valor_km_check;
alter table public.empresa_unidades add constraint empresa_unidades_frete_valor_km_check
  check (frete_valor_km is null or frete_valor_km >= 0);

alter table public.empresa_unidades drop constraint if exists empresa_unidades_frete_raio_check;
alter table public.empresa_unidades add constraint empresa_unidades_frete_raio_check
  check (frete_raio_max_km is null or (frete_raio_max_km > 0 and frete_raio_max_km <= 5000));

alter table public.empresa_unidades drop constraint if exists empresa_unidades_frete_distancia_config_check;
alter table public.empresa_unidades add constraint empresa_unidades_frete_distancia_config_check check (
  frete_distancia_ativo = false
  or (
    frete_taxa_base is not null
    and frete_valor_km is not null
    and frete_raio_max_km is not null
    and latitude is not null
    and longitude is not null
  )
);

create or replace function private.calcular_entrega_unidade_endereco_impl(
  p_empresa_id text,
  p_unidade_id uuid,
  p_usuario_id uuid,
  p_endereco_id uuid,
  p_quando timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa record;
  v_unidade record;
  v_endereco record;
  v_regiao record;
  v_fallback jsonb;
  v_aberto boolean;
  v_distancia numeric;
  v_taxa numeric;
  v_minimo numeric;
  v_tempo_min integer;
  v_tempo_max integer;
begin
  select
    e.pedido_minimo,
    e.tempo_estimado_min,
    e.tempo_estimado_max,
    e.status,
    e.publicado
  into v_empresa
  from public.empresas e
  where e.id::text = p_empresa_id::text
  limit 1;

  select
    u.id,
    u.ativa,
    u.latitude,
    u.longitude,
    u.frete_distancia_ativo,
    u.frete_taxa_base,
    u.frete_valor_km,
    u.frete_raio_max_km
  into v_unidade
  from public.empresa_unidades u
  where u.id = p_unidade_id
    and u.empresa_id::text = p_empresa_id::text
  limit 1;

  if v_empresa is null
     or not coalesce(v_empresa.status, false)
     or not coalesce(v_empresa.publicado, false)
     or v_unidade is null
     or not coalesce(v_unidade.ativa, false) then
    return jsonb_build_object(
      'atendido', false,
      'aberto', false,
      'modo_frete', 'indisponivel',
      'mensagem', 'Unidade indisponível.'
    );
  end if;

  select
    e.id,
    e.bairro,
    e.cidade,
    coalesce(e.uf, e.estado) as uf,
    e.latitude,
    e.longitude
  into v_endereco
  from public.enderecos e
  where e.id = p_endereco_id
    and e.usuario_id = p_usuario_id
  limit 1;

  if v_endereco is null then
    return jsonb_build_object(
      'atendido', false,
      'aberto', false,
      'modo_frete', 'endereco_invalido',
      'mensagem', 'Endereço não encontrado ou acesso negado.'
    );
  end if;

  if not coalesce(v_unidade.frete_distancia_ativo, false) then
    v_fallback := private.calcular_entrega_unidade_impl(
      p_empresa_id,
      p_unidade_id,
      coalesce(v_endereco.cidade, ''),
      coalesce(v_endereco.uf, ''),
      coalesce(v_endereco.bairro, ''),
      p_quando
    );
    return v_fallback || jsonb_build_object(
      'modo_frete', 'regiao',
      'frete_distancia_ativo', false
    );
  end if;

  if v_unidade.latitude is null
     or v_unidade.longitude is null
     or v_endereco.latitude is null
     or v_endereco.longitude is null then
    v_fallback := private.calcular_entrega_unidade_impl(
      p_empresa_id,
      p_unidade_id,
      coalesce(v_endereco.cidade, ''),
      coalesce(v_endereco.uf, ''),
      coalesce(v_endereco.bairro, ''),
      p_quando
    );
    return v_fallback || jsonb_build_object(
      'modo_frete', 'regiao_fallback_sem_gps',
      'frete_distancia_ativo', true,
      'mensagem', case
        when coalesce((v_fallback->>'atendido')::boolean, false)
          then coalesce(v_fallback->>'mensagem', 'Entrega disponível.') || ' Frete por distância aguardando GPS deste endereço.'
        else coalesce(v_fallback->>'mensagem', 'Endereço fora da área de entrega.')
      end
    );
  end if;

  v_aberto := private.empresa_aberta_unidade_em(p_empresa_id, p_unidade_id, p_quando);
  v_distancia := private.distancia_km(
    v_unidade.latitude,
    v_unidade.longitude,
    v_endereco.latitude,
    v_endereco.longitude
  );

  select r.* into v_regiao
  from public.empresa_regioes r
  where r.empresa_id::text = p_empresa_id::text
    and r.unidade_id = p_unidade_id
    and r.ativo
    and lower(trim(r.bairro)) = lower(trim(coalesce(v_endereco.bairro, '')))
    and lower(trim(r.cidade)) = lower(trim(coalesce(v_endereco.cidade, '')))
    and upper(trim(r.uf)) = upper(trim(coalesce(v_endereco.uf, '')))
  limit 1;

  v_minimo := coalesce(v_regiao.pedido_minimo, v_empresa.pedido_minimo, 0);
  v_tempo_min := coalesce(v_regiao.tempo_min, v_empresa.tempo_estimado_min, 25);
  v_tempo_max := coalesce(v_regiao.tempo_max, v_empresa.tempo_estimado_max, 45);

  if v_distancia > v_unidade.frete_raio_max_km then
    return jsonb_build_object(
      'atendido', false,
      'aberto', v_aberto,
      'modo_frete', 'distancia',
      'frete_distancia_ativo', true,
      'distancia_km', v_distancia,
      'raio_max_km', v_unidade.frete_raio_max_km,
      'pedido_minimo', v_minimo,
      'tempo_min', v_tempo_min,
      'tempo_max', v_tempo_max,
      'regiao_id', v_regiao.id,
      'mensagem', 'Endereço fora do raio máximo de entrega desta unidade.'
    );
  end if;

  v_taxa := round((v_unidade.frete_taxa_base + (v_unidade.frete_valor_km * v_distancia))::numeric, 2);

  return jsonb_build_object(
    'atendido', true,
    'aberto', v_aberto,
    'modo_frete', 'distancia',
    'frete_distancia_ativo', true,
    'distancia_km', v_distancia,
    'raio_max_km', v_unidade.frete_raio_max_km,
    'taxa_base', v_unidade.frete_taxa_base,
    'valor_km', v_unidade.frete_valor_km,
    'taxa_entrega', v_taxa,
    'pedido_minimo', v_minimo,
    'tempo_min', v_tempo_min,
    'tempo_max', v_tempo_max,
    'regiao_id', v_regiao.id,
    'mensagem', case when v_aberto then 'Entrega disponível por distância.' else 'Unidade fechada neste horário.' end
  );
end;
$$;

revoke all on function private.calcular_entrega_unidade_endereco_impl(text,uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.calcular_entrega_unidade_endereco(
  p_empresa_id text,
  p_unidade_id uuid,
  p_endereco_id uuid,
  p_quando timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  return private.calcular_entrega_unidade_endereco_impl(
    p_empresa_id,
    p_unidade_id,
    auth.uid(),
    p_endereco_id,
    p_quando
  );
end;
$$;

create or replace function public.empresa_unidade_configurar_frete_distancia(
  p_unidade_id uuid,
  p_ativo boolean,
  p_taxa_base numeric,
  p_valor_km numeric,
  p_raio_max_km numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade record;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  if p_taxa_base is not null and p_taxa_base < 0 then
    raise exception 'A taxa base não pode ser negativa.';
  end if;
  if p_valor_km is not null and p_valor_km < 0 then
    raise exception 'O valor por km não pode ser negativo.';
  end if;
  if p_raio_max_km is not null and (p_raio_max_km <= 0 or p_raio_max_km > 5000) then
    raise exception 'O raio máximo deve ser maior que zero e menor ou igual a 5000 km.';
  end if;

  select u.id,u.empresa_id,u.latitude,u.longitude
  into v_unidade
  from public.empresa_unidades u
  join public.empresas e on e.id::text = u.empresa_id::text
  where u.id = p_unidade_id
    and e.usuario_id = auth.uid()
  limit 1;

  if v_unidade is null then
    raise exception 'Unidade não encontrada ou acesso negado.';
  end if;

  if coalesce(p_ativo, false) and (
    p_taxa_base is null
    or p_valor_km is null
    or p_raio_max_km is null
  ) then
    raise exception 'Informe taxa base, valor por km e raio máximo antes de ativar.';
  end if;

  if coalesce(p_ativo, false) and (v_unidade.latitude is null or v_unidade.longitude is null) then
    raise exception 'Defina o GPS da unidade antes de ativar o frete por distância.';
  end if;

  update public.empresa_unidades
  set frete_distancia_ativo = coalesce(p_ativo, false),
      frete_taxa_base = p_taxa_base,
      frete_valor_km = p_valor_km,
      frete_raio_max_km = p_raio_max_km,
      updated_at = now()
  where id = p_unidade_id;

  return jsonb_build_object(
    'unidade_id', p_unidade_id,
    'ativo', coalesce(p_ativo, false),
    'taxa_base', p_taxa_base,
    'valor_km', p_valor_km,
    'raio_max_km', p_raio_max_km
  );
end;
$$;

create or replace function public.criar_pedido_operacional_unidade(
  p_empresa_id text,
  p_unidade_id uuid,
  p_endereco_id uuid,
  p_pagamento text,
  p_observacoes text,
  p_cupom text,
  p_itens jsonb,
  p_agendado_para timestamptz,
  p_chave_cliente uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endereco record;
  v_texto text;
  v_entrega jsonb;
  v_resultado jsonb;
  v_id uuid;
  v_pedido public.pedidos%rowtype;
  v_existente public.pedidos%rowtype;
  v_cupom public.cupons%rowtype;
  v_taxa numeric;
  v_minimo numeric;
  v_desconto numeric := 0;
  v_quando timestamptz := coalesce(p_agendado_para, now());
begin
  if auth.uid() is null then raise exception 'Faça login para finalizar o pedido.'; end if;
  if p_chave_cliente is null then raise exception 'Identificador do checkout ausente.'; end if;
  if p_agendado_para is not null and (p_agendado_para < now() + interval '30 minutes' or p_agendado_para > now() + interval '7 days') then
    raise exception 'O agendamento deve ficar entre 30 minutos e 7 dias.';
  end if;

  if not exists (
    select 1 from public.empresa_unidades u join public.empresas e on e.id::text=u.empresa_id::text
    where u.id=p_unidade_id and u.empresa_id::text=p_empresa_id::text and u.ativa and e.publicado and e.status
  ) then raise exception 'A unidade selecionada não está disponível.'; end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens)=0 then raise exception 'O pedido precisa ter itens.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) item
    left join public.produtos p on p.id::text=item->>'produto_id'
    where p.id is null or p.empresa_id::text<>p_empresa_id::text or p.unidade_id is distinct from p_unidade_id or p.disponivel is distinct from true
  ) then raise exception 'O carrinho contém produto indisponível ou de outra unidade.'; end if;

  select p.* into v_existente from public.pedidos p
  where p.usuario_id=auth.uid() and p.chave_cliente=p_chave_cliente limit 1;
  if found then
    if v_existente.unidade_id is distinct from p_unidade_id then raise exception 'Este checkout já foi utilizado em outra unidade.'; end if;
    return jsonb_build_object(
      'id',v_existente.id,'numero',v_existente.numero,'status',v_existente.status,'created_at',v_existente.created_at,
      'subtotal',v_existente.subtotal,'taxa_entrega',v_existente.taxa_entrega,'desconto',v_existente.desconto,
      'total',v_existente.total,'agendado_para',v_existente.agendado_para,'unidade_id',v_existente.unidade_id,
      'distancia_km',v_existente.distancia_km,'reutilizado',true
    );
  end if;

  select * into v_endereco from public.enderecos where id=p_endereco_id and usuario_id=auth.uid();
  if not found then raise exception 'Selecione um endereço válido da sua conta.'; end if;

  v_entrega := private.calcular_entrega_unidade_endereco_impl(
    p_empresa_id,
    p_unidade_id,
    auth.uid(),
    p_endereco_id,
    v_quando
  );
  if not coalesce((v_entrega->>'atendido')::boolean,false) then raise exception '%',coalesce(v_entrega->>'mensagem','Endereço fora da área de entrega.'); end if;
  if not coalesce((v_entrega->>'aberto')::boolean,false) then raise exception 'A unidade não atende no horário escolhido.'; end if;

  v_texto := concat_ws(', ',nullif(trim(v_endereco.logradouro),''),nullif(trim(v_endereco.numero),''),nullif(trim(v_endereco.complemento),''),nullif(trim(v_endereco.bairro),''),nullif(trim(v_endereco.cidade),''),nullif(trim(coalesce(v_endereco.uf,v_endereco.estado)),''),nullif(trim(v_endereco.cep),''));
  v_resultado := private.criar_pedido_impl(p_empresa_id,v_texto,p_pagamento,p_observacoes,p_cupom,p_itens);
  v_id := (v_resultado->>'id')::uuid;
  select * into v_pedido from public.pedidos where id=v_id for update;

  v_taxa := coalesce((v_entrega->>'taxa_entrega')::numeric,0);
  v_minimo := coalesce((v_entrega->>'pedido_minimo')::numeric,0);
  if v_pedido.subtotal < v_minimo then raise exception 'O pedido mínimo para esta região é R$ %.',to_char(v_minimo,'FM999999990D00'); end if;

  if v_pedido.cupom is not null then
    select * into v_cupom from public.cupons c
    where upper(c.codigo)=upper(v_pedido.cupom) and (c.empresa_id is null or c.empresa_id=p_empresa_id)
    order by (c.empresa_id is not null) desc limit 1;
    if found then
      v_desconto := case v_cupom.tipo when 'percentual' then round(v_pedido.subtotal*least(v_cupom.valor,100)/100,2) when 'fixo' then least(v_cupom.valor,v_pedido.subtotal) when 'frete' then v_taxa else 0 end;
      if v_cupom.max_desconto is not null then v_desconto:=least(v_desconto,v_cupom.max_desconto); end if;
    end if;
  end if;

  update public.pedidos set
    unidade_id=p_unidade_id,endereco_id=p_endereco_id,endereco=v_texto,taxa_entrega=v_taxa,desconto=v_desconto,
    total=greatest(0,subtotal+v_taxa-v_desconto),previsao_min=coalesce((v_entrega->>'tempo_min')::integer,25),
    previsao_max=coalesce((v_entrega->>'tempo_max')::integer,45),
    preparo_estimado_minutos=greatest(5,least(240,coalesce((v_entrega->>'tempo_min')::integer,30))),
    agendado_para=p_agendado_para,chave_cliente=p_chave_cliente,updated_at=now()
  where id=v_id returning * into v_pedido;

  return v_resultado || jsonb_build_object(
    'taxa_entrega',v_pedido.taxa_entrega,'desconto',v_pedido.desconto,'total',v_pedido.total,
    'agendado_para',v_pedido.agendado_para,'unidade_id',v_pedido.unidade_id,
    'unidade_nome',(select u.nome from public.empresa_unidades u where u.id=p_unidade_id),
    'distancia_km',v_pedido.distancia_km,'modo_frete',v_entrega->>'modo_frete','reutilizado',false
  );
exception when unique_violation then
  select p.* into v_existente from public.pedidos p where p.usuario_id=auth.uid() and p.chave_cliente=p_chave_cliente limit 1;
  if found and v_existente.unidade_id is not distinct from p_unidade_id then
    return jsonb_build_object(
      'id',v_existente.id,'numero',v_existente.numero,'status',v_existente.status,'created_at',v_existente.created_at,
      'subtotal',v_existente.subtotal,'taxa_entrega',v_existente.taxa_entrega,'desconto',v_existente.desconto,
      'total',v_existente.total,'agendado_para',v_existente.agendado_para,'unidade_id',v_existente.unidade_id,
      'distancia_km',v_existente.distancia_km,'reutilizado',true
    );
  end if;
  raise;
end;
$$;

revoke all on function public.calcular_entrega_unidade_endereco(text,uuid,uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_unidade_configurar_frete_distancia(uuid,boolean,numeric,numeric,numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.criar_pedido_operacional_unidade(text,uuid,uuid,text,text,text,jsonb,timestamptz,uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.calcular_entrega_unidade_endereco(text,uuid,uuid,timestamptz) to authenticated;
grant execute on function public.empresa_unidade_configurar_frete_distancia(uuid,boolean,numeric,numeric,numeric) to authenticated;
grant execute on function public.criar_pedido_operacional_unidade(text,uuid,uuid,text,text,text,jsonb,timestamptz,uuid) to authenticated;

commit;
