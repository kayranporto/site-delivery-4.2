-- Multi Delivery 3.5: operacao real, estoque, regioes, fidelidade e suporte.
-- Execute depois de 012_experiencia_completa.sql.

begin;

-- =========================================================
-- 1) HORARIOS, PAUSAS E REGIOES DE ENTREGA
-- =========================================================

create table if not exists public.empresa_horarios (
  empresa_id text not null,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  abre time not null default '08:00',
  fecha time not null default '22:00',
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, dia_semana)
);

create table if not exists public.empresa_pausas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  created_at timestamptz not null default now(),
  check (fim > inicio)
);

create table if not exists public.empresa_regioes (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  bairro text not null,
  cidade text not null,
  uf text not null,
  taxa_entrega numeric(12,2) not null default 0 check (taxa_entrega >= 0),
  pedido_minimo numeric(12,2) not null default 0 check (pedido_minimo >= 0),
  tempo_min integer not null default 25 check (tempo_min between 5 and 240),
  tempo_max integer not null default 45 check (tempo_max between 5 and 300),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tempo_max >= tempo_min)
);

create unique index if not exists empresa_regioes_local_unique_ci
  on public.empresa_regioes (empresa_id, lower(trim(bairro)), lower(trim(cidade)), upper(trim(uf)));
create index if not exists empresa_pausas_periodo_idx on public.empresa_pausas(empresa_id, inicio, fim);

alter table public.empresa_horarios enable row level security;
alter table public.empresa_pausas enable row level security;
alter table public.empresa_regioes enable row level security;

drop policy if exists "proprietario gerencia horarios" on public.empresa_horarios;
create policy "proprietario gerencia horarios" on public.empresa_horarios for all to authenticated
using (exists (select 1 from public.empresas e where e.id::text = empresa_horarios.empresa_id and e.usuario_id = auth.uid()))
with check (exists (select 1 from public.empresas e where e.id::text = empresa_horarios.empresa_id and e.usuario_id = auth.uid()));
drop policy if exists "proprietario gerencia pausas" on public.empresa_pausas;
create policy "proprietario gerencia pausas" on public.empresa_pausas for all to authenticated
using (exists (select 1 from public.empresas e where e.id::text = empresa_pausas.empresa_id and e.usuario_id = auth.uid()))
with check (exists (select 1 from public.empresas e where e.id::text = empresa_pausas.empresa_id and e.usuario_id = auth.uid()));
drop policy if exists "proprietario gerencia regioes" on public.empresa_regioes;
create policy "proprietario gerencia regioes" on public.empresa_regioes for all to authenticated
using (exists (select 1 from public.empresas e where e.id::text = empresa_regioes.empresa_id and e.usuario_id = auth.uid()))
with check (exists (select 1 from public.empresas e where e.id::text = empresa_regioes.empresa_id and e.usuario_id = auth.uid()));
drop policy if exists "admin le operacao empresa" on public.empresa_horarios;
create policy "admin le operacao empresa" on public.empresa_horarios for select to authenticated using ((select private.is_admin()));
drop policy if exists "admin le pausas empresa" on public.empresa_pausas;
create policy "admin le pausas empresa" on public.empresa_pausas for select to authenticated using ((select private.is_admin()));
drop policy if exists "admin le regioes empresa" on public.empresa_regioes;
create policy "admin le regioes empresa" on public.empresa_regioes for select to authenticated using ((select private.is_admin()));

grant select, insert, update, delete on public.empresa_horarios, public.empresa_pausas, public.empresa_regioes to authenticated;

create or replace function private.validar_regiao_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_minimo numeric; v_cidade text; v_uf text;
begin
  select pedido_minimo,cidade_atendimento,uf_atendimento into v_minimo,v_cidade,v_uf from public.empresas where id::text = new.empresa_id;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if new.pedido_minimo < coalesce(v_minimo, 0) then
    raise exception 'O pedido mínimo da região não pode ser menor que o mínimo geral da loja.';
  end if;
  new.bairro := trim(new.bairro); new.cidade := trim(new.cidade); new.uf := upper(trim(new.uf));
  if nullif(trim(coalesce(v_cidade,'')),'') is not null and lower(trim(v_cidade))<>lower(new.cidade) then raise exception 'A região deve pertencer à cidade configurada na loja.'; end if;
  if nullif(trim(coalesce(v_uf,'')),'') is not null and upper(trim(v_uf))<>new.uf then raise exception 'A região deve pertencer à UF configurada na loja.'; end if;
  update public.empresas e set bairros_atendidos=array_append(coalesce(e.bairros_atendidos,'{}'::text[]),new.bairro),updated_at=now()
    where e.id::text=new.empresa_id and not exists(select 1 from unnest(coalesce(e.bairros_atendidos,'{}'::text[])) b where lower(trim(b))=lower(new.bairro));
  new.updated_at := now();
  return new;
end; $$;
revoke all on function private.validar_regiao_empresa() from public, anon, authenticated;
drop trigger if exists validar_regiao_empresa on public.empresa_regioes;
create trigger validar_regiao_empresa before insert or update on public.empresa_regioes
for each row execute function private.validar_regiao_empresa();

create or replace function private.empresa_aberta_em(p_empresa_id text, p_quando timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_local timestamp := timezone('America/Sao_Paulo', p_quando);
  v_dia smallint;
  v_hora time;
begin
  if exists (select 1 from public.empresa_pausas p where p.empresa_id = p_empresa_id and p_quando >= p.inicio and p_quando < p.fim) then
    return false;
  end if;
  if not exists (select 1 from public.empresa_horarios h where h.empresa_id = p_empresa_id) then return true; end if;
  v_dia := extract(dow from v_local)::smallint;
  v_hora := v_local::time;
  return exists (
    select 1 from public.empresa_horarios h
    where h.empresa_id = p_empresa_id and h.ativo = true and (
      (h.dia_semana = v_dia and h.abre <= h.fecha and v_hora >= h.abre and v_hora < h.fecha)
      or (h.dia_semana = v_dia and h.abre > h.fecha and v_hora >= h.abre)
      or (h.dia_semana = ((v_dia + 6) % 7) and h.abre > h.fecha and v_hora < h.fecha)
    )
  );
end; $$;
revoke all on function private.empresa_aberta_em(text,timestamptz) from public, anon, authenticated;

create or replace function private.calcular_entrega_impl(p_empresa_id text, p_cidade text, p_uf text, p_bairro text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_empresa record; v_regiao record; v_tem_regioes boolean; v_atendido boolean;
begin
  select e.taxa_entrega, e.pedido_minimo, e.tempo_estimado_min, e.tempo_estimado_max,
         e.cidade_atendimento, e.uf_atendimento, e.bairros_atendidos, e.status, e.publicado
  into v_empresa from public.empresas e where e.id::text = p_empresa_id limit 1;
  if not found or not coalesce(v_empresa.status, false) or not coalesce(v_empresa.publicado, false) then
    return jsonb_build_object('atendido',false,'aberto',false,'mensagem','Restaurante indisponível.');
  end if;
  select exists(select 1 from public.empresa_regioes r where r.empresa_id = p_empresa_id and r.ativo) into v_tem_regioes;
  if v_tem_regioes then
    select r.* into v_regiao from public.empresa_regioes r
    where r.empresa_id = p_empresa_id and r.ativo
      and lower(trim(r.bairro)) = lower(trim(coalesce(p_bairro,'')))
      and lower(trim(r.cidade)) = lower(trim(coalesce(p_cidade,'')))
      and upper(trim(r.uf)) = upper(trim(coalesce(p_uf,''))) limit 1;
    if not found then return jsonb_build_object('atendido',false,'aberto',private.empresa_aberta_em(p_empresa_id,now()),'mensagem','Este bairro ainda não faz parte da área de entrega.'); end if;
    return jsonb_build_object('atendido',true,'aberto',private.empresa_aberta_em(p_empresa_id,now()),'taxa_entrega',v_regiao.taxa_entrega,
      'pedido_minimo',v_regiao.pedido_minimo,'tempo_min',v_regiao.tempo_min,'tempo_max',v_regiao.tempo_max,'regiao_id',v_regiao.id,
      'mensagem',case when private.empresa_aberta_em(p_empresa_id,now()) then 'Entrega disponível.' else 'Restaurante fechado neste horário.' end);
  end if;
  v_atendido := (nullif(trim(coalesce(v_empresa.cidade_atendimento,'')),'') is null or lower(trim(p_cidade)) = lower(trim(v_empresa.cidade_atendimento)))
    and (nullif(trim(coalesce(v_empresa.uf_atendimento,'')),'') is null or upper(trim(p_uf)) = upper(trim(v_empresa.uf_atendimento)))
    and (cardinality(coalesce(v_empresa.bairros_atendidos,'{}'::text[])) = 0 or exists(select 1 from unnest(v_empresa.bairros_atendidos) b where lower(trim(b)) = lower(trim(p_bairro))));
  return jsonb_build_object('atendido',v_atendido,'aberto',private.empresa_aberta_em(p_empresa_id,now()),
    'taxa_entrega',v_empresa.taxa_entrega,'pedido_minimo',v_empresa.pedido_minimo,
    'tempo_min',coalesce(v_empresa.tempo_estimado_min,25),'tempo_max',coalesce(v_empresa.tempo_estimado_max,45),
    'mensagem',case when v_atendido then 'Entrega disponível.' else 'Endereço fora da área de entrega.' end);
end; $$;
revoke all on function private.calcular_entrega_impl(text,text,text,text) from public, anon, authenticated;

create or replace function public.calcular_entrega_empresa(p_empresa_id text, p_cidade text, p_uf text, p_bairro text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.calcular_entrega_impl(p_empresa_id,p_cidade,p_uf,p_bairro);
$$;
revoke all on function public.calcular_entrega_empresa(text,text,text,text) from public;
grant execute on function public.calcular_entrega_empresa(text,text,text,text) to anon, authenticated;

create or replace function public.empresa_disponibilidade(p_empresa_id text, p_quando timestamptz default now())
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('aberto',private.empresa_aberta_em(p_empresa_id,p_quando),
    'momento',p_quando,'mensagem',case when private.empresa_aberta_em(p_empresa_id,p_quando) then 'Aberto para pedidos.' else 'Fechado neste horário.' end);
$$;
revoke all on function public.empresa_disponibilidade(text,timestamptz) from public;
grant execute on function public.empresa_disponibilidade(text,timestamptz) to anon, authenticated;

-- =========================================================
-- 2) ESTOQUE, CANCELAMENTO E REEMBOLSO
-- =========================================================

alter table public.produtos
  add column if not exists controle_estoque boolean not null default false,
  add column if not exists estoque integer not null default 0,
  add column if not exists estoque_minimo integer not null default 5;
alter table public.pedidos
  add column if not exists endereco_id uuid references public.enderecos(id) on delete set null,
  add column if not exists cancelamento_status text,
  add column if not exists cancelamento_motivo text,
  add column if not exists cancelamento_solicitado_em timestamptz,
  add column if not exists cancelamento_decidido_em timestamptz,
  add column if not exists cancelamento_observacao text,
  add column if not exists reembolso_status text not null default 'nao_aplicavel',
  add column if not exists estoque_devolvido boolean not null default false;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='produtos_estoque_check') then alter table public.produtos add constraint produtos_estoque_check check(estoque >= 0 and estoque_minimo >= 0) not valid; end if;
  if not exists(select 1 from pg_constraint where conname='pedidos_cancelamento_status_check') then alter table public.pedidos add constraint pedidos_cancelamento_status_check check(cancelamento_status is null or cancelamento_status in('solicitado','aprovado','recusado')) not valid; end if;
  if not exists(select 1 from pg_constraint where conname='pedidos_reembolso_status_check') then alter table public.pedidos add constraint pedidos_reembolso_status_check check(reembolso_status in('nao_aplicavel','pendente','processando','concluido','falhou')) not valid; end if;
end $$;

create index if not exists produtos_estoque_baixo_idx on public.produtos(empresa_id,estoque) where controle_estoque and disponivel;
create index if not exists pedidos_cancelamento_pendente_idx on public.pedidos(empresa_id,created_at desc) where cancelamento_status='solicitado';

create or replace function private.normalizar_estoque_produto()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.estoque:=greatest(coalesce(new.estoque,0),0); new.estoque_minimo:=greatest(coalesce(new.estoque_minimo,0),0);
  if new.controle_estoque and new.estoque=0 then new.disponivel:=false; end if;
  return new;
end; $$;
revoke all on function private.normalizar_estoque_produto() from public,anon,authenticated;
drop trigger if exists normalizar_estoque_produto on public.produtos;
create trigger normalizar_estoque_produto before insert or update of controle_estoque,estoque,estoque_minimo on public.produtos for each row execute function private.normalizar_estoque_produto();

create or replace function private.reservar_estoque_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_controla boolean;
begin
  if new.produto_id is null then return new; end if;
  select controle_estoque into v_controla from public.produtos where id::text=new.produto_id for update;
  if coalesce(v_controla,false) then
    update public.produtos set estoque=estoque-new.quantidade, disponivel=case when estoque-new.quantidade <= 0 then false else disponivel end, updated_at=now()
    where id::text=new.produto_id and estoque>=new.quantidade;
    if not found then raise exception 'Estoque insuficiente para %.',new.nome_produto; end if;
  end if;
  return new;
end; $$;
revoke all on function private.reservar_estoque_item() from public,anon,authenticated;
drop trigger if exists reservar_estoque_item on public.pedido_itens;
create trigger reservar_estoque_item before insert on public.pedido_itens for each row execute function private.reservar_estoque_item();

create or replace function private.restaurar_estoque_cancelamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  if new.status='cancelado' and old.status<>'cancelado' and not coalesce(old.estoque_devolvido,false) then
    for v_item in select produto_id,quantidade from public.pedido_itens where pedido_id=old.id loop
      update public.produtos set estoque=estoque+v_item.quantidade,updated_at=now() where id::text=v_item.produto_id and controle_estoque;
    end loop;
    update public.fidelidade_resgates set status='disponivel' where usuario_id=old.usuario_id and empresa_id=old.empresa_id and upper(codigo)=upper(coalesce(old.cupom,'')) and status='usado';
    if found then update public.cupons set usos=greatest(usos-1,0),updated_at=now() where empresa_id=old.empresa_id and upper(codigo)=upper(old.cupom); end if;
    new.estoque_devolvido:=true;
  end if;
  return new;
end; $$;
revoke all on function private.restaurar_estoque_cancelamento() from public,anon,authenticated;
drop trigger if exists a0_restaurar_estoque_cancelamento on public.pedidos;
create trigger a0_restaurar_estoque_cancelamento before update of status on public.pedidos for each row execute function private.restaurar_estoque_cancelamento();

create or replace function private.validar_transicao_pedido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.cancelamento_status='solicitado' and new.cancelamento_status='solicitado' and new.status is distinct from old.status then
    raise exception 'Resolva a solicitação de cancelamento antes de avançar o pedido.';
  end if;
  if new.status is distinct from old.status and not (
    (old.status='recebido' and new.status in('preparando','cancelado')) or
    (old.status='preparando' and new.status in('saiu_para_entrega','cancelado')) or
    (old.status='saiu_para_entrega' and new.status='entregue')
  ) then raise exception 'Transição de status inválida: % → %.',old.status,new.status; end if;
  if new.pagamento_status='pago' and new.status='cancelado' and new.reembolso_status not in('pendente','processando','concluido') then
    raise exception 'Defina o reembolso antes de cancelar um pedido pago.';
  end if;
  return new;
end; $$;
revoke all on function private.validar_transicao_pedido() from public,anon,authenticated;

create or replace function public.cliente_solicitar_cancelamento(p_pedido_id uuid,p_motivo text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_pedido public.pedidos%rowtype;
begin
  select * into v_pedido from public.pedidos where id=p_pedido_id and usuario_id=auth.uid() for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_pedido.status not in('recebido','preparando') then raise exception 'Este pedido já não pode ser cancelado por solicitação.'; end if;
  if v_pedido.cancelamento_status='solicitado' then return true; end if;
  if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Explique o motivo do cancelamento.'; end if;
  update public.pedidos set cancelamento_status='solicitado',cancelamento_motivo=left(trim(p_motivo),500),cancelamento_solicitado_em=now(),updated_at=now() where id=p_pedido_id;
  insert into public.notificacoes(usuario_id,pedido_id,titulo,mensagem,tipo)
    select e.usuario_id,p_pedido_id,'Cancelamento solicitado','O cliente solicitou o cancelamento do pedido.','cancelamento' from public.empresas e where e.id::text=v_pedido.empresa_id;
  return true;
end; $$;
revoke all on function public.cliente_solicitar_cancelamento(uuid,text) from public,anon,authenticated;
grant execute on function public.cliente_solicitar_cancelamento(uuid,text) to authenticated;

create or replace function public.empresa_decidir_cancelamento(p_pedido_id uuid,p_aprovar boolean,p_observacao text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_pedido public.pedidos%rowtype; v_autorizado boolean;
begin
  select * into v_pedido from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select exists(select 1 from public.empresas e where e.id::text=v_pedido.empresa_id and e.usuario_id=auth.uid()) or private.is_admin() into v_autorizado;
  if not v_autorizado then raise exception 'Acesso não autorizado.'; end if;
  if v_pedido.cancelamento_status<>'solicitado' then raise exception 'Não há solicitação pendente.'; end if;
  if p_aprovar then
    update public.pedidos set cancelamento_status='aprovado',cancelamento_decidido_em=now(),cancelamento_observacao=nullif(left(trim(coalesce(p_observacao,'')),500),''),
      reembolso_status=case when pagamento_modalidade='online' and pagamento_status='pago' then 'pendente' else 'nao_aplicavel' end,status='cancelado',updated_at=now() where id=p_pedido_id;
  else
    update public.pedidos set cancelamento_status='recusado',cancelamento_decidido_em=now(),cancelamento_observacao=nullif(left(trim(coalesce(p_observacao,'')),500),''),updated_at=now() where id=p_pedido_id;
  end if;
  insert into public.notificacoes(usuario_id,pedido_id,titulo,mensagem,tipo) values(v_pedido.usuario_id,p_pedido_id,
    case when p_aprovar then 'Cancelamento aprovado' else 'Cancelamento recusado' end,
    case when p_aprovar then 'Seu pedido foi cancelado. Se houver pagamento online, o reembolso seguirá para processamento.' else 'O restaurante não aprovou o cancelamento. Consulte o suporte se precisar.' end,'cancelamento');
  return true;
end; $$;
revoke all on function public.empresa_decidir_cancelamento(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.empresa_decidir_cancelamento(uuid,boolean,text) to authenticated;

-- =========================================================
-- 3) CHECKOUT OPERACIONAL COM PRECO AUTORITATIVO POR REGIAO
-- =========================================================

create or replace function public.criar_pedido_operacional(
  p_empresa_id text,p_endereco_id uuid,p_pagamento text,p_observacoes text,p_cupom text,p_itens jsonb,p_agendado_para timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_endereco record; v_texto text; v_entrega jsonb; v_resultado jsonb; v_id uuid; v_pedido public.pedidos%rowtype; v_cupom public.cupons%rowtype; v_taxa numeric; v_minimo numeric; v_desconto numeric:=0; v_quando timestamptz:=coalesce(p_agendado_para,now());
begin
  if auth.uid() is null then raise exception 'Faça login para finalizar o pedido.'; end if;
  if p_agendado_para is not null and (p_agendado_para<now()+interval '30 minutes' or p_agendado_para>now()+interval '7 days') then raise exception 'O agendamento deve ficar entre 30 minutos e 7 dias.'; end if;
  select * into v_endereco from public.enderecos where id=p_endereco_id and usuario_id=auth.uid();
  if not found then raise exception 'Selecione um endereço válido da sua conta.'; end if;
  v_entrega:=private.calcular_entrega_impl(p_empresa_id,v_endereco.cidade,v_endereco.uf,v_endereco.bairro);
  if not coalesce((v_entrega->>'atendido')::boolean,false) then raise exception '%',coalesce(v_entrega->>'mensagem','Endereço fora da área de entrega.'); end if;
  if not private.empresa_aberta_em(p_empresa_id,v_quando) then raise exception 'O restaurante não atende no horário escolhido.'; end if;
  v_texto:=concat_ws(', ',nullif(trim(v_endereco.logradouro),''),nullif(trim(v_endereco.numero),''),nullif(trim(v_endereco.complemento),''),nullif(trim(v_endereco.bairro),''),nullif(trim(v_endereco.cidade),''),nullif(trim(v_endereco.uf),''),nullif(trim(v_endereco.cep),''));
  v_resultado:=private.criar_pedido_impl(p_empresa_id,v_texto,p_pagamento,p_observacoes,p_cupom,p_itens);
  v_id:=(v_resultado->>'id')::uuid;
  select * into v_pedido from public.pedidos where id=v_id for update;
  v_taxa:=coalesce((v_entrega->>'taxa_entrega')::numeric,0); v_minimo:=coalesce((v_entrega->>'pedido_minimo')::numeric,0);
  if v_pedido.subtotal<v_minimo then raise exception 'O pedido mínimo para esta região é R$ %.',to_char(v_minimo,'FM999999990D00'); end if;
  if v_pedido.cupom is not null then
    select * into v_cupom from public.cupons c where upper(c.codigo)=upper(v_pedido.cupom) and (c.empresa_id is null or c.empresa_id=p_empresa_id) order by(c.empresa_id is not null) desc limit 1;
    if found then
      v_desconto:=case v_cupom.tipo when 'percentual' then round(v_pedido.subtotal*least(v_cupom.valor,100)/100,2) when 'fixo' then least(v_cupom.valor,v_pedido.subtotal) when 'frete' then v_taxa else 0 end;
      if v_cupom.max_desconto is not null then v_desconto:=least(v_desconto,v_cupom.max_desconto); end if;
    end if;
  end if;
  update public.pedidos set endereco_id=p_endereco_id,endereco=v_texto,taxa_entrega=v_taxa,desconto=v_desconto,
    total=greatest(0,subtotal+v_taxa-v_desconto),previsao_min=coalesce((v_entrega->>'tempo_min')::integer,25),previsao_max=coalesce((v_entrega->>'tempo_max')::integer,45),agendado_para=p_agendado_para,updated_at=now() where id=v_id returning * into v_pedido;
  return v_resultado||jsonb_build_object('taxa_entrega',v_pedido.taxa_entrega,'desconto',v_pedido.desconto,'total',v_pedido.total,'agendado_para',v_pedido.agendado_para);
end; $$;
revoke all on function public.criar_pedido_operacional(text,uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.criar_pedido_operacional(text,uuid,text,text,text,jsonb,timestamptz) to authenticated;

-- A partir da 3.5 o navegador usa somente o fluxo que recebe um endereco da
-- propria conta e valida horario, regiao e estoque. As assinaturas antigas
-- permanecem no banco apenas para preservar dependencias internas.
revoke execute on function private.criar_pedido_impl(text,text,text,text,text,jsonb) from authenticated;
revoke execute on function public.criar_pedido(text,text,text,text,text,jsonb) from authenticated;
revoke execute on function public.criar_pedido(text,text,text,text,text,jsonb,timestamptz) from authenticated;

-- =========================================================
-- 4) FIDELIDADE E FINANCEIRO DO RESTAURANTE
-- =========================================================

create table if not exists public.programa_fidelidade_empresa (
  empresa_id text primary key, ativo boolean not null default false, pontos_por_real numeric(8,2) not null default 1 check(pontos_por_real>0),
  pontos_para_beneficio integer not null default 500 check(pontos_para_beneficio>0), valor_beneficio numeric(12,2) not null default 20 check(valor_beneficio>0), updated_at timestamptz not null default now()
);
create table if not exists public.fidelidade_saldos (
  usuario_id uuid not null references auth.users(id) on delete cascade, empresa_id text not null, pontos integer not null default 0 check(pontos>=0), updated_at timestamptz not null default now(), primary key(usuario_id,empresa_id)
);
create table if not exists public.fidelidade_movimentos (
  id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id) on delete cascade,empresa_id text not null,pedido_id uuid references public.pedidos(id) on delete set null,
  tipo text not null check(tipo in('credito','debito','ajuste')),pontos integer not null,descricao text,created_at timestamptz not null default now()
);
create table if not exists public.fidelidade_resgates (
  id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id) on delete cascade,empresa_id text not null,codigo text not null unique,
  pontos integer not null check(pontos>0),valor numeric(12,2) not null check(valor>0),status text not null default 'disponivel' check(status in('disponivel','usado','expirado')),validade timestamptz not null default(now()+interval '30 days'),created_at timestamptz not null default now()
);
create unique index if not exists fidelidade_pedido_tipo_unique on public.fidelidade_movimentos(pedido_id,tipo) where pedido_id is not null;
alter table public.empresas add column if not exists taxa_plataforma_percentual numeric(5,2) not null default 10;
alter table public.programa_fidelidade_empresa enable row level security; alter table public.fidelidade_saldos enable row level security; alter table public.fidelidade_movimentos enable row level security; alter table public.fidelidade_resgates enable row level security;
drop policy if exists "proprietario gerencia fidelidade" on public.programa_fidelidade_empresa;
create policy "proprietario gerencia fidelidade" on public.programa_fidelidade_empresa for all to authenticated using(exists(select 1 from public.empresas e where e.id::text=programa_fidelidade_empresa.empresa_id and e.usuario_id=auth.uid())) with check(exists(select 1 from public.empresas e where e.id::text=programa_fidelidade_empresa.empresa_id and e.usuario_id=auth.uid()));
drop policy if exists "cliente le saldo fidelidade" on public.fidelidade_saldos; create policy "cliente le saldo fidelidade" on public.fidelidade_saldos for select to authenticated using(usuario_id=auth.uid());
drop policy if exists "cliente le movimentos fidelidade" on public.fidelidade_movimentos; create policy "cliente le movimentos fidelidade" on public.fidelidade_movimentos for select to authenticated using(usuario_id=auth.uid());
drop policy if exists "cliente le resgates fidelidade" on public.fidelidade_resgates; create policy "cliente le resgates fidelidade" on public.fidelidade_resgates for select to authenticated using(usuario_id=auth.uid());
drop policy if exists "admin le fidelidade" on public.fidelidade_saldos; create policy "admin le fidelidade" on public.fidelidade_saldos for select to authenticated using((select private.is_admin()));
grant select,insert,update,delete on public.programa_fidelidade_empresa to authenticated; grant select on public.fidelidade_saldos,public.fidelidade_movimentos,public.fidelidade_resgates to authenticated;

create or replace function private.creditar_fidelidade_pedido()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_programa public.programa_fidelidade_empresa%rowtype; v_pontos integer; v_inseridos integer;
begin
  if old.status<>'entregue' and new.status='entregue' then
    select * into v_programa from public.programa_fidelidade_empresa where empresa_id=new.empresa_id and ativo;
    if found then
      v_pontos:=floor(new.subtotal*v_programa.pontos_por_real)::integer;
      if v_pontos>0 then
        insert into public.fidelidade_movimentos(usuario_id,empresa_id,pedido_id,tipo,pontos,descricao) values(new.usuario_id,new.empresa_id,new.id,'credito',v_pontos,'Pontos do pedido') on conflict do nothing;
        get diagnostics v_inseridos=row_count;
        if v_inseridos>0 then insert into public.fidelidade_saldos(usuario_id,empresa_id,pontos) values(new.usuario_id,new.empresa_id,v_pontos) on conflict(usuario_id,empresa_id) do update set pontos=public.fidelidade_saldos.pontos+excluded.pontos,updated_at=now(); end if;
      end if;
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.creditar_fidelidade_pedido() from public,anon,authenticated;
drop trigger if exists z_creditar_fidelidade_pedido on public.pedidos; create trigger z_creditar_fidelidade_pedido after update of status on public.pedidos for each row execute function private.creditar_fidelidade_pedido();

create or replace function public.meus_beneficios_fidelidade()
returns table(empresa_id text,pontos integer,pontos_para_beneficio integer,valor_beneficio numeric) language sql stable security definer set search_path='' as $$
  select s.empresa_id,s.pontos,p.pontos_para_beneficio,p.valor_beneficio from public.fidelidade_saldos s join public.programa_fidelidade_empresa p on p.empresa_id=s.empresa_id and p.ativo where s.usuario_id=auth.uid() order by s.pontos desc;
$$;
revoke all on function public.meus_beneficios_fidelidade() from public,anon,authenticated; grant execute on function public.meus_beneficios_fidelidade() to authenticated;

create or replace function public.resgatar_beneficio_fidelidade(p_empresa_id text)
returns text language plpgsql security definer set search_path='' as $$
declare v_programa public.programa_fidelidade_empresa%rowtype; v_codigo text;
begin
  if auth.uid() is null then raise exception 'Faça login para resgatar.'; end if;
  select * into v_programa from public.programa_fidelidade_empresa where empresa_id=p_empresa_id and ativo; if not found then raise exception 'Programa de fidelidade indisponível.'; end if;
  update public.fidelidade_saldos set pontos=pontos-v_programa.pontos_para_beneficio,updated_at=now() where usuario_id=auth.uid() and empresa_id=p_empresa_id and pontos>=v_programa.pontos_para_beneficio;
  if not found then raise exception 'Saldo de pontos insuficiente.'; end if;
  v_codigo:='FID-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.fidelidade_movimentos(usuario_id,empresa_id,tipo,pontos,descricao) values(auth.uid(),p_empresa_id,'debito',-v_programa.pontos_para_beneficio,'Resgate de benefício');
  insert into public.fidelidade_resgates(usuario_id,empresa_id,codigo,pontos,valor) values(auth.uid(),p_empresa_id,v_codigo,v_programa.pontos_para_beneficio,v_programa.valor_beneficio);
  insert into public.cupons(empresa_id,codigo,tipo,valor,pedido_minimo,limite_usos,usos,primeiro_pedido,inicio,fim,ativo,limite_por_usuario) values(p_empresa_id,v_codigo,'fixo',v_programa.valor_beneficio,0,1,0,false,now(),now()+interval '30 days',true,1);
  return v_codigo;
end; $$;
revoke all on function public.resgatar_beneficio_fidelidade(text) from public,anon,authenticated; grant execute on function public.resgatar_beneficio_fidelidade(text) to authenticated;

create or replace function private.validar_resgate_fidelidade()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_resgate public.fidelidade_resgates%rowtype;
begin
  if new.cupom is null then return new; end if;
  select * into v_resgate from public.fidelidade_resgates where upper(codigo)=upper(new.cupom) limit 1 for update;
  if found then
    if v_resgate.usuario_id<>new.usuario_id or v_resgate.empresa_id<>new.empresa_id or v_resgate.status<>'disponivel' or v_resgate.validade<now() then raise exception 'Este benefício de fidelidade não está disponível para esta conta.'; end if;
    update public.fidelidade_resgates set status='usado' where id=v_resgate.id;
  end if;
  return new;
end; $$;
revoke all on function private.validar_resgate_fidelidade() from public,anon,authenticated;
drop trigger if exists zy_validar_resgate_fidelidade on public.pedidos; create trigger zy_validar_resgate_fidelidade before insert on public.pedidos for each row execute function private.validar_resgate_fidelidade();

create or replace function public.empresa_relatorio_financeiro(p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_empresa public.empresas%rowtype; v_resultado jsonb;
begin
  select * into v_empresa from public.empresas where usuario_id=auth.uid() limit 1; if not found then raise exception 'Restaurante não encontrado.'; end if;
  select jsonb_build_object('bruto',coalesce(sum(total) filter(where status='entregue'),0),'pedidos_entregues',count(*) filter(where status='entregue'),
    'taxa_plataforma',round(coalesce(sum(total) filter(where status='entregue'),0)*v_empresa.taxa_plataforma_percentual/100,2),
    'liquido',round(coalesce(sum(total) filter(where status='entregue'),0)*(100-v_empresa.taxa_plataforma_percentual)/100,2),
    'online_pendente',coalesce(sum(total) filter(where pagamento_modalidade='online' and pagamento_status='pendente' and status<>'cancelado'),0),
    'reembolsos_pendentes',count(*) filter(where reembolso_status in('pendente','processando')),'cancelamentos_pendentes',count(*) filter(where cancelamento_status='solicitado')) into v_resultado
  from public.pedidos where empresa_id=v_empresa.id::text and created_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_dias,30),365)));
  return v_resultado||jsonb_build_object('taxa_percentual',v_empresa.taxa_plataforma_percentual,'periodo_dias',greatest(1,least(coalesce(p_dias,30),365)));
end; $$;
revoke all on function public.empresa_relatorio_financeiro(integer) from public,anon,authenticated; grant execute on function public.empresa_relatorio_financeiro(integer) to authenticated;

-- =========================================================
-- 5) CENTRAL DE SUPORTE E SAUDE OPERACIONAL
-- =========================================================

create table if not exists public.chamados_suporte (
  id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id) on delete cascade,pedido_id uuid references public.pedidos(id) on delete set null,empresa_id text,
  categoria text not null check(categoria in('pedido','pagamento','entrega','conta','restaurante','outro')),assunto text not null,mensagem text not null,status text not null default 'aberto' check(status in('aberto','em_analise','respondido','fechado')),
  prioridade text not null default 'normal' check(prioridade in('baixa','normal','alta','urgente')),resposta text,respondido_por uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists chamados_status_idx on public.chamados_suporte(status,prioridade,created_at);
alter table public.chamados_suporte enable row level security;
drop policy if exists "cliente le chamados" on public.chamados_suporte; create policy "cliente le chamados" on public.chamados_suporte for select to authenticated using(usuario_id=auth.uid());
drop policy if exists "restaurante le chamados" on public.chamados_suporte; create policy "restaurante le chamados" on public.chamados_suporte for select to authenticated using(exists(select 1 from public.empresas e where e.id::text=chamados_suporte.empresa_id and e.usuario_id=auth.uid()));
drop policy if exists "admin gerencia chamados" on public.chamados_suporte; create policy "admin gerencia chamados" on public.chamados_suporte for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
grant select on public.chamados_suporte to authenticated;

create or replace function public.abrir_chamado_suporte(p_categoria text,p_assunto text,p_mensagem text,p_pedido_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_empresa text;
begin
  if auth.uid() is null then raise exception 'Faça login para falar com o suporte.'; end if;
  if p_categoria not in('pedido','pagamento','entrega','conta','restaurante','outro') then raise exception 'Categoria inválida.'; end if;
  if length(trim(coalesce(p_assunto,'')))<4 or length(trim(coalesce(p_mensagem,'')))<10 then raise exception 'Descreva melhor sua solicitação.'; end if;
  if p_pedido_id is not null then select empresa_id into v_empresa from public.pedidos where id=p_pedido_id and usuario_id=auth.uid(); if not found then raise exception 'Pedido inválido.'; end if; end if;
  insert into public.chamados_suporte(usuario_id,pedido_id,empresa_id,categoria,assunto,mensagem,prioridade) values(auth.uid(),p_pedido_id,v_empresa,p_categoria,left(trim(p_assunto),120),left(trim(p_mensagem),2000),case when p_categoria in('pagamento','entrega') then 'alta' else 'normal' end) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.abrir_chamado_suporte(text,text,text,uuid) from public,anon,authenticated; grant execute on function public.abrir_chamado_suporte(text,text,text,uuid) to authenticated;

create or replace function public.admin_responder_chamado(p_chamado_id uuid,p_resposta text,p_fechar boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_usuario uuid;
begin
  if not private.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  if length(trim(coalesce(p_resposta,'')))<3 then raise exception 'Informe uma resposta.'; end if;
  update public.chamados_suporte set resposta=left(trim(p_resposta),2000),respondido_por=auth.uid(),status=case when p_fechar then 'fechado' else 'respondido' end,updated_at=now() where id=p_chamado_id returning usuario_id into v_usuario;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  insert into public.notificacoes(usuario_id,titulo,mensagem,tipo) values(v_usuario,'O suporte respondeu',left(trim(p_resposta),240),'suporte');
  insert into public.admin_auditoria(admin_id,acao,alvo_id,detalhes) values(auth.uid(),'responder_chamado',p_chamado_id::text,jsonb_build_object('fechado',p_fechar));
  return true;
end; $$;
revoke all on function public.admin_responder_chamado(uuid,text,boolean) from public,anon,authenticated; grant execute on function public.admin_responder_chamado(uuid,text,boolean) to authenticated;

create or replace function public.admin_saude_operacao()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  return jsonb_build_object(
    'chamados_abertos',(select count(*) from public.chamados_suporte where status in('aberto','em_analise')),
    'cancelamentos_pendentes',(select count(*) from public.pedidos where cancelamento_status='solicitado'),
    'reembolsos_pendentes',(select count(*) from public.pedidos where reembolso_status in('pendente','processando')),
    'produtos_estoque_baixo',(select count(*) from public.produtos where controle_estoque and estoque<=estoque_minimo),
    'restaurantes_pausados',(select count(distinct empresa_id) from public.empresa_pausas where now()>=inicio and now()<fim),
    'gerado_em',now());
end; $$;
revoke all on function public.admin_saude_operacao() from public,anon,authenticated; grant execute on function public.admin_saude_operacao() to authenticated;

create or replace function public.admin_atualizar_reembolso(p_pedido_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_usuario uuid;
begin
  if not private.is_admin() then raise exception 'Acesso administrativo necessário.'; end if;
  if p_status not in('pendente','processando','concluido','falhou') then raise exception 'Status de reembolso inválido.'; end if;
  update public.pedidos set reembolso_status=p_status,pagamento_status=case when p_status='concluido' then 'estornado' else pagamento_status end,updated_at=now()
  where id=p_pedido_id and reembolso_status<>'nao_aplicavel' returning usuario_id into v_usuario;
  if not found then raise exception 'Pedido sem reembolso pendente.'; end if;
  insert into public.notificacoes(usuario_id,pedido_id,titulo,mensagem,tipo) values(v_usuario,p_pedido_id,'Reembolso atualizado',
    case p_status when 'concluido' then 'O reembolso foi concluído.' when 'falhou' then 'O reembolso precisa de nova análise.' else 'O reembolso está em processamento.' end,'pagamento');
  insert into public.admin_auditoria(admin_id,acao,alvo_id,detalhes) values(auth.uid(),'atualizar_reembolso',p_pedido_id::text,jsonb_build_object('status',p_status));
  return true;
end; $$;
revoke all on function public.admin_atualizar_reembolso(uuid,text) from public,anon,authenticated; grant execute on function public.admin_atualizar_reembolso(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
