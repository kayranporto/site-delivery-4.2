-- Histórico e ganhos do entregador 4.4.2
--
-- O valor por entrega é configurado administrativamente e capturado como
-- snapshot no momento em que a rota é aceita. Apenas pedidos entregues entram
-- nos totais. O valor padrão é zero para não inventar uma política comercial.

alter table public.entregadores
  add column if not exists valor_por_entrega numeric(10,2) not null default 0
  check (valor_por_entrega >= 0 and valor_por_entrega <= 9999.99);

alter table public.pedidos
  add column if not exists entregador_valor numeric(10,2) not null default 0
  check (entregador_valor >= 0 and entregador_valor <= 9999.99);

create index if not exists pedidos_entregador_historico_idx
  on public.pedidos (entregador_id, status, entregue_em desc)
  where entregador_id is not null;

create or replace function public.entregador_aceitar_pedido(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_valor numeric(10,2);
begin
  select d.valor_por_entrega
    into v_valor
  from public.entregadores d
  where d.id = auth.uid()
    and d.aprovado = true
    and d.online = true;

  if not found then
    raise exception 'Entregador indisponível ou ainda não aprovado.';
  end if;

  update public.pedidos
  set entregador_id = auth.uid(),
      entregador_valor = coalesce(v_valor, 0),
      updated_at = now()
  where id = p_pedido_id
    and status = 'preparando'
    and pronto_em is not null
    and entregador_id is null
    and (pagamento_modalidade is distinct from 'online' or pagamento_status = 'pago');

  return found;
end;
$function$;

create or replace function public.entregador_meu_resumo_ganhos()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with contexto as (
    select
      auth.uid() as entregador_id,
      timezone('America/Sao_Paulo', now())::date as hoje
  ),
  cadastro as (
    select d.valor_por_entrega
    from public.entregadores d, contexto c
    where d.id = c.entregador_id
  ),
  entregues as (
    select
      p.entregador_valor,
      timezone('America/Sao_Paulo', coalesce(p.entregue_em, p.updated_at))::date as dia
    from public.pedidos p, contexto c
    where p.entregador_id = c.entregador_id
      and p.status = 'entregue'
  )
  select case
    when not exists (select 1 from cadastro) then
      jsonb_build_object('cadastrado', false)
    else jsonb_build_object(
      'cadastrado', true,
      'valor_por_entrega', coalesce((select valor_por_entrega from cadastro limit 1), 0),
      'hoje_entregas', (select count(*) from entregues e, contexto c where e.dia = c.hoje),
      'hoje_ganhos', (select coalesce(sum(e.entregador_valor), 0) from entregues e, contexto c where e.dia = c.hoje),
      'sete_dias_entregas', (select count(*) from entregues e, contexto c where e.dia between c.hoje - 6 and c.hoje),
      'sete_dias_ganhos', (select coalesce(sum(e.entregador_valor), 0) from entregues e, contexto c where e.dia between c.hoje - 6 and c.hoje),
      'mes_entregas', (select count(*) from entregues e, contexto c where date_trunc('month', e.dia::timestamp) = date_trunc('month', c.hoje::timestamp)),
      'mes_ganhos', (select coalesce(sum(e.entregador_valor), 0) from entregues e, contexto c where date_trunc('month', e.dia::timestamp) = date_trunc('month', c.hoje::timestamp)),
      'total_entregas', (select count(*) from entregues),
      'total_ganhos', (select coalesce(sum(entregador_valor), 0) from entregues)
    )
  end;
$function$;

create or replace function public.entregador_meu_historico_ganhos(
  p_limite integer default 30,
  p_offset integer default 0
)
returns table (
  pedido_id uuid,
  numero bigint,
  empresa_nome text,
  entregue_em timestamptz,
  valor numeric,
  distancia_km numeric,
  total_pedido numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p.id,
    p.numero,
    p.empresa_nome,
    coalesce(p.entregue_em, p.updated_at),
    p.entregador_valor,
    p.distancia_km,
    p.total
  from public.pedidos p
  where p.entregador_id = auth.uid()
    and p.status = 'entregue'
  order by coalesce(p.entregue_em, p.updated_at) desc
  limit least(greatest(coalesce(p_limite, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

create or replace function public.admin_definir_valor_entregador(
  p_entregador_id uuid,
  p_valor numeric
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_anterior numeric(10,2);
  v_novo numeric(10,2);
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.';
  end if;

  if p_valor is null or p_valor < 0 or p_valor > 9999.99 then
    raise exception 'Valor por entrega inválido.';
  end if;

  v_novo := round(p_valor::numeric, 2);

  select valor_por_entrega into v_anterior
  from public.entregadores
  where id = p_entregador_id
  for update;

  if not found then
    return false;
  end if;

  update public.entregadores
  set valor_por_entrega = v_novo,
      updated_at = now()
  where id = p_entregador_id;

  insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
  values (
    auth.uid(),
    'entregador_valor_por_entrega',
    p_entregador_id::text,
    jsonb_build_object('anterior', v_anterior, 'novo', v_novo)
  );

  return true;
end;
$function$;

revoke all on function public.entregador_meu_resumo_ganhos() from public, anon;
revoke all on function public.entregador_meu_historico_ganhos(integer, integer) from public, anon;
revoke all on function public.admin_definir_valor_entregador(uuid, numeric) from public, anon;

grant execute on function public.entregador_meu_resumo_ganhos() to authenticated;
grant execute on function public.entregador_meu_historico_ganhos(integer, integer) to authenticated;
grant execute on function public.admin_definir_valor_entregador(uuid, numeric) to authenticated;
