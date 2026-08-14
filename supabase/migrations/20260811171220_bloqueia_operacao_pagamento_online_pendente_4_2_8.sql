begin;

-- Defesa central: nenhuma transição operacional pode ocorrer enquanto um
-- pagamento online ainda não tiver sido confirmado pelo provedor.
create or replace function private.validar_transicao_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.cancelamento_status = 'solicitado'
     and new.cancelamento_status = 'solicitado'
     and new.status is distinct from old.status then
    raise exception 'Resolva a solicitação de cancelamento antes de avançar o pedido.';
  end if;

  if new.pagamento_modalidade = 'online'
     and new.pagamento_status is distinct from 'pago'
     and (
       (new.status is distinct from old.status and new.status in ('preparando', 'saiu_para_entrega', 'entregue'))
       or (new.pronto_em is distinct from old.pronto_em and new.pronto_em is not null)
     ) then
    raise exception 'Aguarde a confirmação do pagamento online antes de avançar o pedido.';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'recebido' and new.status in ('preparando', 'cancelado')) or
    (old.status = 'preparando' and new.status in ('saiu_para_entrega', 'cancelado')) or
    (old.status = 'saiu_para_entrega' and new.status = 'entregue')
  ) then
    raise exception 'Transição de status inválida: % → %.', old.status, new.status;
  end if;

  if new.pagamento_status = 'pago'
     and new.status = 'cancelado'
     and new.reembolso_status not in ('pendente', 'processando', 'concluido') then
    raise exception 'Defina o reembolso antes de cancelar um pedido pago.';
  end if;

  return new;
end;
$$;

revoke all on function private.validar_transicao_pedido() from public, anon, authenticated;

create or replace function public.empresa_atualizar_operacao_pedido(
  p_pedido_id uuid,
  p_acao text,
  p_preparo_estimado integer default null,
  p_observacao text default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_status_anterior text;
begin
  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
    and exists (
      select 1 from public.empresas e
      where e.id::text = p.empresa_id::text and e.usuario_id = auth.uid()
    )
  for update;

  if not found then raise exception 'Pedido não encontrado para este restaurante.'; end if;
  v_status_anterior := v_pedido.status;

  if p_acao in ('iniciar_preparo', 'marcar_pronto', 'reabrir_preparo', 'enviar_entrega', 'confirmar_entrega')
     and v_pedido.pagamento_modalidade = 'online'
     and v_pedido.pagamento_status is distinct from 'pago' then
    raise exception 'Aguarde a confirmação do pagamento online antes de avançar o pedido.';
  end if;

  if p_preparo_estimado is not null and (p_preparo_estimado < 5 or p_preparo_estimado > 240) then
    raise exception 'O tempo de preparo deve ficar entre 5 e 240 minutos.';
  end if;

  case p_acao
    when 'iniciar_preparo' then
      if v_pedido.status <> 'recebido' then raise exception 'O pedido não pode iniciar preparo neste estado.'; end if;
      update public.pedidos
      set status = 'preparando',
          preparo_iniciado_em = coalesce(preparo_iniciado_em, now()),
          preparo_estimado_minutos = coalesce(p_preparo_estimado, preparo_estimado_minutos, 30),
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), cozinha_observacao),
          pronto_em = null,
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'recusar_pedido' then
      if v_pedido.status <> 'recebido' then raise exception 'Somente pedidos ainda não aceitos podem ser recusados.'; end if;
      if v_pedido.pagamento_status = 'pago' then
        raise exception 'Pedido pago deve seguir o fluxo de cancelamento e reembolso.';
      end if;
      update public.pedidos
      set status = 'cancelado',
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), 'Recusado pelo restaurante'),
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'marcar_pronto' then
      if v_pedido.status <> 'preparando' then raise exception 'Somente pedidos em preparo podem ser marcados como prontos.'; end if;
      update public.pedidos
      set pronto_em = coalesce(pronto_em, now()),
          preparo_iniciado_em = coalesce(preparo_iniciado_em, created_at),
          cozinha_observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), cozinha_observacao),
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'reabrir_preparo' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then raise exception 'Este pedido não está marcado como pronto.'; end if;
      update public.pedidos set pronto_em = null, updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'enviar_entrega' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then raise exception 'Marque o pedido como pronto antes de enviar para entrega.'; end if;
      if v_pedido.entregador_id is not null then raise exception 'O entregador atribuído deve confirmar a retirada pelo aplicativo.'; end if;
      update public.pedidos set status = 'saiu_para_entrega', retirado_em = coalesce(retirado_em, now()), updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'confirmar_entrega' then
      if v_pedido.status <> 'saiu_para_entrega' then raise exception 'Somente pedidos em entrega podem ser concluídos.'; end if;
      if v_pedido.entregador_id is not null then raise exception 'O entregador atribuído deve confirmar a entrega pelo aplicativo.'; end if;
      update public.pedidos set status = 'entregue', entregue_em = coalesce(entregue_em, now()), updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'definir_prioridade' then
      update public.pedidos
      set prioridade = greatest(0, least(3, coalesce(p_preparo_estimado, 0)))::smallint,
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    else raise exception 'Ação operacional inválida.';
  end case;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo,
    preparo_estimado_minutos, observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, p_acao, v_status_anterior, v_pedido.status,
    p_preparo_estimado, nullif(left(trim(coalesce(p_observacao, '')), 500), ''), auth.uid()
  );

  return v_pedido;
end;
$$;

create or replace function public.listar_entregas_disponiveis()
returns table (
  pedido_id uuid,
  numero bigint,
  restaurante text,
  bairro text,
  total numeric,
  pagamento text,
  agendado_para timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.numero, p.empresa_nome,
    coalesce((regexp_match(p.endereco, '— ([^—]+) —'))[1], 'Endereço após aceitar'),
    p.total, p.pagamento, p.agendado_para, p.created_at
  from public.pedidos p
  where p.status = 'preparando'
    and p.pronto_em is not null
    and p.entregador_id is null
    and (p.pagamento_modalidade is distinct from 'online' or p.pagamento_status = 'pago')
    and (p.agendado_para is null or p.agendado_para <= now() + interval '45 minutes')
    and exists (
      select 1 from public.entregadores d
      where d.id = auth.uid() and d.aprovado = true and d.online = true
    )
  order by p.prioridade desc, coalesce(p.agendado_para, p.created_at), p.created_at
  limit 50;
$$;

create or replace function public.entregador_aceitar_pedido(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.entregadores d
    where d.id = auth.uid() and d.aprovado = true and d.online = true
  ) then raise exception 'Entregador indisponível ou ainda não aprovado.'; end if;

  update public.pedidos
  set entregador_id = auth.uid(), updated_at = now()
  where id = p_pedido_id and status = 'preparando'
    and pronto_em is not null and entregador_id is null
    and (pagamento_modalidade is distinct from 'online' or pagamento_status = 'pago');
  return found;
end;
$$;

create or replace function public.entregador_atualizar_status(
  p_pedido_id uuid,
  p_status text,
  p_pagamento_recebido boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('saiu_para_entrega', 'entregue') then
    raise exception 'Status de entrega inválido.';
  end if;

  update public.pedidos
  set status = p_status,
      retirado_em = case when p_status = 'saiu_para_entrega' then coalesce(retirado_em, now()) else retirado_em end,
      entregue_em = case when p_status = 'entregue' then coalesce(entregue_em, now()) else entregue_em end,
      pagamento_status = case
        when p_pagamento_recebido and pagamento_modalidade = 'na_entrega' then 'pago'
        else pagamento_status
      end,
      updated_at = now()
  where id = p_pedido_id and entregador_id = auth.uid()
    and (pagamento_modalidade is distinct from 'online' or pagamento_status = 'pago')
    and ((status = 'preparando' and pronto_em is not null and p_status = 'saiu_para_entrega')
      or (status = 'saiu_para_entrega' and p_status = 'entregue'));
  return found;
end;
$$;

revoke all on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.listar_entregas_disponiveis() from public, anon, authenticated;
revoke all on function public.entregador_aceitar_pedido(uuid) from public, anon, authenticated;
revoke all on function public.entregador_atualizar_status(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text) to authenticated;
grant execute on function public.listar_entregas_disponiveis() to authenticated;
grant execute on function public.entregador_aceitar_pedido(uuid) to authenticated;
grant execute on function public.entregador_atualizar_status(uuid, text, boolean) to authenticated;

commit;
