-- Multi Delivery 4.3: horários, pausas, regiões e checkout por unidade.

begin;

alter table public.empresa_horarios
  add column if not exists unidade_id uuid references public.empresa_unidades(id) on delete cascade;
alter table public.empresa_pausas
  add column if not exists unidade_id uuid references public.empresa_unidades(id) on delete cascade;
alter table public.empresa_regioes
  add column if not exists unidade_id uuid references public.empresa_unidades(id) on delete cascade;

update public.empresa_horarios h
set unidade_id = u.id
from public.empresa_unidades u
where h.unidade_id is null
  and u.empresa_id::text = h.empresa_id::text
  and u.principal;

update public.empresa_pausas p
set unidade_id = u.id
from public.empresa_unidades u
where p.unidade_id is null
  and u.empresa_id::text = p.empresa_id::text
  and u.principal;

update public.empresa_regioes r
set unidade_id = u.id
from public.empresa_unidades u
where r.unidade_id is null
  and u.empresa_id::text = r.empresa_id::text
  and u.principal;

alter table public.empresa_horarios alter column unidade_id set not null;
alter table public.empresa_pausas alter column unidade_id set not null;
alter table public.empresa_regioes alter column unidade_id set not null;

alter table public.empresa_horarios drop constraint if exists empresa_horarios_pkey;
alter table public.empresa_horarios
  add constraint empresa_horarios_pkey primary key (empresa_id, unidade_id, dia_semana);

create index if not exists empresa_pausas_unidade_idx
  on public.empresa_pausas(unidade_id, inicio, fim);
create index if not exists empresa_regioes_unidade_idx
  on public.empresa_regioes(unidade_id, ativo, cidade, uf, bairro);

create or replace function private.atribuir_unidade_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unidade_id is null and nullif(new.empresa_id::text, '') is not null then
    select u.id into new.unidade_id
    from public.empresa_unidades u
    where u.empresa_id::text = new.empresa_id::text
      and u.principal
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function private.atribuir_unidade_principal()
  from public, anon, authenticated, service_role;

drop trigger if exists atribuir_unidade_horario on public.empresa_horarios;
create trigger atribuir_unidade_horario
before insert on public.empresa_horarios
for each row execute function private.atribuir_unidade_principal();

drop trigger if exists atribuir_unidade_pausa on public.empresa_pausas;
create trigger atribuir_unidade_pausa
before insert on public.empresa_pausas
for each row execute function private.atribuir_unidade_principal();

drop trigger if exists atribuir_unidade_regiao on public.empresa_regioes;
create trigger atribuir_unidade_regiao
before insert on public.empresa_regioes
for each row execute function private.atribuir_unidade_principal();

create or replace function private.empresa_aberta_unidade_em(
  p_empresa_id text,
  p_unidade_id uuid,
  p_quando timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := timezone('America/Sao_Paulo', p_quando);
  v_dia smallint;
  v_hora time;
begin
  if not exists (
    select 1 from public.empresa_unidades u
    where u.id = p_unidade_id
      and u.empresa_id::text = p_empresa_id::text
      and u.ativa = true
  ) then return false; end if;

  if exists (
    select 1 from public.empresa_pausas p
    where p.empresa_id::text = p_empresa_id::text
      and p.unidade_id = p_unidade_id
      and p_quando >= p.inicio and p_quando < p.fim
  ) then return false; end if;

  if not exists (
    select 1 from public.empresa_horarios h
    where h.empresa_id::text = p_empresa_id::text
      and h.unidade_id = p_unidade_id
  ) then return true; end if;

  v_dia := extract(dow from v_local)::smallint;
  v_hora := v_local::time;
  return exists (
    select 1 from public.empresa_horarios h
    where h.empresa_id::text = p_empresa_id::text
      and h.unidade_id = p_unidade_id
      and h.ativo = true
      and (
        (h.dia_semana = v_dia and h.abre <= h.fecha and v_hora >= h.abre and v_hora < h.fecha)
        or (h.dia_semana = v_dia and h.abre > h.fecha and v_hora >= h.abre)
        or (h.dia_semana = ((v_dia + 6) % 7) and h.abre > h.fecha and v_hora < h.fecha)
      )
  );
end;
$$;

create or replace function private.empresa_aberta_em(p_empresa_id text, p_quando timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_unidade uuid;
begin
  select u.id into v_unidade
  from public.empresa_unidades u
  where u.empresa_id::text = p_empresa_id::text and u.principal and u.ativa
  limit 1;
  if v_unidade is null then return false; end if;
  return private.empresa_aberta_unidade_em(p_empresa_id, v_unidade, p_quando);
end;
$$;

create or replace function private.calcular_entrega_unidade_impl(
  p_empresa_id text,
  p_unidade_id uuid,
  p_cidade text,
  p_uf text,
  p_bairro text,
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
  v_regiao record;
  v_tem_regioes boolean;
  v_atendido boolean;
  v_aberto boolean;
begin
  select e.taxa_entrega, e.pedido_minimo, e.tempo_estimado_min, e.tempo_estimado_max,
         e.cidade_atendimento, e.uf_atendimento, e.bairros_atendidos, e.status, e.publicado
  into v_empresa from public.empresas e where e.id::text = p_empresa_id limit 1;

  select u.id, u.ativa into v_unidade
  from public.empresa_unidades u
  where u.id = p_unidade_id and u.empresa_id::text = p_empresa_id::text
  limit 1;

  if v_empresa is null or not coalesce(v_empresa.status, false) or not coalesce(v_empresa.publicado, false)
     or v_unidade is null or not coalesce(v_unidade.ativa, false) then
    return jsonb_build_object('atendido',false,'aberto',false,'mensagem','Unidade indisponível.');
  end if;

  v_aberto := private.empresa_aberta_unidade_em(p_empresa_id, p_unidade_id, p_quando);
  select exists(
    select 1 from public.empresa_regioes r
    where r.empresa_id::text = p_empresa_id::text
      and r.unidade_id = p_unidade_id
      and r.ativo
  ) into v_tem_regioes;

  if v_tem_regioes then
    select r.* into v_regiao
    from public.empresa_regioes r
    where r.empresa_id::text = p_empresa_id::text
      and r.unidade_id = p_unidade_id
      and r.ativo
      and lower(trim(r.bairro)) = lower(trim(coalesce(p_bairro,'')))
      and lower(trim(r.cidade)) = lower(trim(coalesce(p_cidade,'')))
      and upper(trim(r.uf)) = upper(trim(coalesce(p_uf,'')))
    limit 1;
    if not found then
      return jsonb_build_object('atendido',false,'aberto',v_aberto,'mensagem','Este bairro ainda não faz parte da área de entrega desta unidade.');
    end if;
    return jsonb_build_object(
      'atendido',true,'aberto',v_aberto,'taxa_entrega',v_regiao.taxa_entrega,
      'pedido_minimo',v_regiao.pedido_minimo,'tempo_min',v_regiao.tempo_min,
      'tempo_max',v_regiao.tempo_max,'regiao_id',v_regiao.id,
      'mensagem',case when v_aberto then 'Entrega disponível.' else 'Unidade fechada neste horário.' end
    );
  end if;

  v_atendido := (nullif(trim(coalesce(v_empresa.cidade_atendimento,'')),'') is null or lower(trim(p_cidade)) = lower(trim(v_empresa.cidade_atendimento)))
    and (nullif(trim(coalesce(v_empresa.uf_atendimento,'')),'') is null or upper(trim(p_uf)) = upper(trim(v_empresa.uf_atendimento)))
    and (cardinality(coalesce(v_empresa.bairros_atendidos,'{}'::text[])) = 0 or exists(select 1 from unnest(v_empresa.bairros_atendidos) b where lower(trim(b)) = lower(trim(p_bairro))));

  return jsonb_build_object(
    'atendido',v_atendido,'aberto',v_aberto,
    'taxa_entrega',v_empresa.taxa_entrega,'pedido_minimo',v_empresa.pedido_minimo,
    'tempo_min',coalesce(v_empresa.tempo_estimado_min,25),'tempo_max',coalesce(v_empresa.tempo_estimado_max,45),
    'mensagem',case when v_atendido then 'Entrega disponível.' else 'Endereço fora da área de entrega.' end
  );
end;
$$;

create or replace function private.calcular_entrega_impl(p_empresa_id text, p_cidade text, p_uf text, p_bairro text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_unidade uuid;
begin
  select u.id into v_unidade
  from public.empresa_unidades u
  where u.empresa_id::text = p_empresa_id::text and u.principal and u.ativa
  limit 1;
  if v_unidade is null then
    return jsonb_build_object('atendido',false,'aberto',false,'mensagem','Restaurante indisponível.');
  end if;
  return private.calcular_entrega_unidade_impl(p_empresa_id, v_unidade, p_cidade, p_uf, p_bairro, now());
end;
$$;

revoke all on function private.empresa_aberta_unidade_em(text, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.calcular_entrega_unidade_impl(text, uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.empresa_aberta_em(text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.calcular_entrega_impl(text, text, text, text) from public, anon, authenticated, service_role;

create or replace function public.empresa_disponibilidade_unidade(
  p_empresa_id text,
  p_unidade_id uuid,
  p_quando timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.empresas e
    join public.empresa_unidades u on u.empresa_id::text = e.id::text
    where e.id::text = p_empresa_id::text
      and e.publicado = true and e.status = true
      and u.id = p_unidade_id and u.ativa = true
  ) then jsonb_build_object(
    'aberto', private.empresa_aberta_unidade_em(p_empresa_id,p_unidade_id,p_quando),
    'momento', p_quando,
    'mensagem', case when private.empresa_aberta_unidade_em(p_empresa_id,p_unidade_id,p_quando) then 'Aberto para pedidos.' else 'Fechado neste horário.' end
  ) else jsonb_build_object('aberto',false,'momento',p_quando,'mensagem','Unidade indisponível.') end;
$$;

create or replace function public.calcular_entrega_unidade(
  p_empresa_id text,
  p_unidade_id uuid,
  p_cidade text,
  p_uf text,
  p_bairro text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.calcular_entrega_unidade_impl(p_empresa_id,p_unidade_id,p_cidade,p_uf,p_bairro,now());
$$;

revoke all on function public.empresa_disponibilidade_unidade(text, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.calcular_entrega_unidade(text, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.empresa_disponibilidade_unidade(text, uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.calcular_entrega_unidade(text, uuid, text, text, text) to anon, authenticated, service_role;

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
      'total',v_existente.total,'agendado_para',v_existente.agendado_para,'unidade_id',v_existente.unidade_id,'reutilizado',true
    );
  end if;

  select * into v_endereco from public.enderecos where id=p_endereco_id and usuario_id=auth.uid();
  if not found then raise exception 'Selecione um endereço válido da sua conta.'; end if;

  v_entrega := private.calcular_entrega_unidade_impl(p_empresa_id,p_unidade_id,v_endereco.cidade,v_endereco.uf,v_endereco.bairro,v_quando);
  if not coalesce((v_entrega->>'atendido')::boolean,false) then raise exception '%',coalesce(v_entrega->>'mensagem','Endereço fora da área de entrega.'); end if;
  if not coalesce((v_entrega->>'aberto')::boolean,false) then raise exception 'A unidade não atende no horário escolhido.'; end if;

  v_texto := concat_ws(', ',nullif(trim(v_endereco.logradouro),''),nullif(trim(v_endereco.numero),''),nullif(trim(v_endereco.complemento),''),nullif(trim(v_endereco.bairro),''),nullif(trim(v_endereco.cidade),''),nullif(trim(v_endereco.uf),''),nullif(trim(v_endereco.cep),''));
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
    'unidade_nome',(select u.nome from public.empresa_unidades u where u.id=p_unidade_id),'reutilizado',false
  );
exception when unique_violation then
  select p.* into v_existente from public.pedidos p where p.usuario_id=auth.uid() and p.chave_cliente=p_chave_cliente limit 1;
  if found and v_existente.unidade_id is not distinct from p_unidade_id then
    return jsonb_build_object('id',v_existente.id,'numero',v_existente.numero,'status',v_existente.status,'created_at',v_existente.created_at,'subtotal',v_existente.subtotal,'taxa_entrega',v_existente.taxa_entrega,'desconto',v_existente.desconto,'total',v_existente.total,'agendado_para',v_existente.agendado_para,'unidade_id',v_existente.unidade_id,'reutilizado',true);
  end if;
  raise;
end;
$$;

revoke all on function public.criar_pedido_operacional_unidade(text,uuid,uuid,text,text,text,jsonb,timestamptz,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.criar_pedido_operacional_unidade(text,uuid,uuid,text,text,text,jsonb,timestamptz,uuid)
  to authenticated;

commit;
