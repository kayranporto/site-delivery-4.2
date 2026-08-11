begin;

-- 4.2.8: todas as mudanças de estado do pedido passam por RPCs que
-- validam o ator, a empresa e as regras de negócio antes da escrita.

revoke all on table public.pedidos from anon;
revoke update on table public.pedidos from public;
revoke update (status, pagamento_status) on table public.pedidos from authenticated;

drop policy if exists "restaurante atualiza pedidos" on public.pedidos;

create or replace function public.empresa_marcar_pagamento_offline(
  p_pedido_id uuid
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
    and exists (
      select 1
      from public.empresas e
      where e.id::text = p.empresa_id::text
        and e.usuario_id = auth.uid()
    )
  for update;

  if not found then
    raise exception 'Pedido não encontrado para este restaurante.';
  end if;
  if v_pedido.pagamento_modalidade = 'online' then
    raise exception 'O pagamento online é confirmado exclusivamente pelo provedor.';
  end if;
  if v_pedido.status = 'cancelado' then
    raise exception 'Pedido cancelado não pode receber confirmação de pagamento.';
  end if;
  if v_pedido.pagamento_status = 'pago' then
    return v_pedido;
  end if;

  update public.pedidos
  set pagamento_status = 'pago',
      pagamento_atualizado_em = now(),
      updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo,
    observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, 'marcar_pagamento_offline',
    v_pedido.status, v_pedido.status, 'Pagamento presencial confirmado', auth.uid()
  );

  return v_pedido;
end;
$$;

create or replace function public.empresa_cancelar_pedido_nao_pago(
  p_pedido_id uuid,
  p_motivo text
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 500), '');
  v_status_anterior text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
    and exists (
      select 1
      from public.empresas e
      where e.id::text = p.empresa_id::text
        and e.usuario_id = auth.uid()
    )
  for update;

  if not found then
    raise exception 'Pedido não encontrado para este restaurante.';
  end if;
  if v_pedido.pagamento_status = 'pago' then
    raise exception 'Pedido pago deve seguir o fluxo de cancelamento e reembolso.';
  end if;
  if v_pedido.status not in ('recebido', 'preparando') then
    raise exception 'O pedido não pode ser cancelado neste estado.';
  end if;
  v_status_anterior := v_pedido.status;

  update public.pedidos
  set status = 'cancelado',
      cozinha_observacao = v_motivo,
      cancelamento_observacao = v_motivo,
      cancelamento_status = case
        when cancelamento_status = 'solicitado' then 'aprovado'
        else cancelamento_status
      end,
      cancelamento_decidido_em = case
        when cancelamento_status = 'solicitado' then now()
        else cancelamento_decidido_em
      end,
      updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo,
    observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, 'cancelar_pedido_nao_pago',
    v_status_anterior, v_pedido.status, v_motivo, auth.uid()
  );

  return v_pedido;
end;
$$;

revoke execute on function public.empresa_marcar_pagamento_offline(uuid)
  from public, anon;
revoke execute on function public.empresa_cancelar_pedido_nao_pago(uuid, text)
  from public, anon;

grant execute on function public.empresa_marcar_pagamento_offline(uuid)
  to authenticated, service_role;
grant execute on function public.empresa_cancelar_pedido_nao_pago(uuid, text)
  to authenticated, service_role;

commit;
