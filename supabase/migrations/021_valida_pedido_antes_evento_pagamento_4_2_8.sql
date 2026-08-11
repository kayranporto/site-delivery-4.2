begin;

-- 4.2.8: valida a referência do pedido antes de inserir o evento.
-- Isso evita que uma referência externa inexistente estoure a FK de
-- pagamento_eventos e transforma o caso em uma resposta controlada.

create or replace function public.reconciliar_pagamento_mercado_pago(
  p_pedido_id uuid,
  p_payment_id text,
  p_provider_status text,
  p_amount numeric,
  p_currency text,
  p_dedupe_key text,
  p_preference_id text default null,
  p_request_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento_id uuid;
  v_pedido public.pedidos%rowtype;
  v_novo_status text;
  v_novo_reembolso text;
  v_erro text;
  v_status_anterior text;
  v_final_sem_cobranca boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Operação restrita ao serviço de pagamento.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_payment_id, '')), '') is null
     or nullif(trim(coalesce(p_provider_status, '')), '') is null
     or nullif(trim(coalesce(p_dedupe_key, '')), '') is null then
    raise exception 'Evento de pagamento incompleto.';
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Pedido não encontrado para a referência externa.'
    );
  end if;

  insert into public.pagamento_eventos(
    provider, dedupe_key, pedido_id, payment_id, preference_id,
    request_id, provider_status, valor, moeda, payload
  ) values (
    'mercado_pago', left(p_dedupe_key, 240), p_pedido_id,
    left(p_payment_id, 160), nullif(left(coalesce(p_preference_id, ''), 160), ''),
    nullif(left(coalesce(p_request_id, ''), 160), ''),
    left(p_provider_status, 80), p_amount,
    upper(left(coalesce(p_currency, ''), 8)), coalesce(p_payload, '{}'::jsonb)
  )
  on conflict(provider, dedupe_key) do nothing
  returning id into v_evento_id;

  if v_evento_id is null then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  if exists (
    select 1 from public.pedidos p
    where p.pagamento_provider = 'mercado_pago'
      and p.pagamento_id = p_payment_id
      and p.id <> p_pedido_id
  ) then
    v_erro := 'Identificador de pagamento já associado a outro pedido.';
  elsif v_pedido.pagamento_id is not null
        and v_pedido.pagamento_id <> p_payment_id then
    v_erro := 'Pedido já associado a outro pagamento.';
  elsif lower(p_provider_status) in ('approved', 'refunded', 'charged_back')
        and (
          p_amount is null
          or abs(p_amount - v_pedido.total) > 0.01
          or upper(coalesce(p_currency, '')) <> 'BRL'
        ) then
    v_erro := 'Valor ou moeda do pagamento diverge do pedido.';
  end if;

  if v_erro is not null then
    update public.pagamento_eventos
    set erro = v_erro, processed_at = now()
    where id = v_evento_id;

    update public.pedidos
    set pagamento_reconciliacao_status = 'divergente',
        pagamento_provider_status = left(p_provider_status, 80),
        pagamento_atualizado_em = now(),
        updated_at = now()
    where id = p_pedido_id;

    return jsonb_build_object('ok', false, 'erro', v_erro);
  end if;

  v_status_anterior := v_pedido.pagamento_status;
  v_final_sem_cobranca := lower(p_provider_status) in (
    'rejected', 'cancelled', 'canceled', 'expired'
  );

  if v_pedido.pagamento_status = 'estornado' then
    v_novo_status := 'estornado';
  elsif lower(p_provider_status) in ('refunded', 'charged_back') then
    v_novo_status := 'estornado';
  elsif v_pedido.pagamento_status = 'pago' then
    v_novo_status := 'pago';
  elsif lower(p_provider_status) = 'approved' then
    v_novo_status := 'pago';
  else
    v_novo_status := 'pendente';
  end if;

  v_novo_reembolso := v_pedido.reembolso_status;
  if v_novo_status = 'estornado' then
    v_novo_reembolso := 'concluido';
  elsif v_novo_status = 'pago' and v_pedido.status = 'cancelado' then
    v_novo_reembolso := 'pendente';
  elsif v_novo_status = 'pendente'
        and v_pedido.status = 'cancelado'
        and v_pedido.reembolso_status = 'aguardando_pagamento'
        and v_final_sem_cobranca then
    v_novo_reembolso := 'nao_aplicavel';
  end if;

  update public.pedidos
  set pagamento_status = v_novo_status,
      pagamento_modalidade = 'online',
      pagamento_provider = 'mercado_pago',
      pagamento_preferencia_id = coalesce(
        nullif(p_preference_id, ''), pagamento_preferencia_id
      ),
      pagamento_id = p_payment_id,
      pagamento_referencia = p_payment_id,
      pagamento_provider_status = left(p_provider_status, 80),
      pagamento_valor_confirmado = p_amount,
      pagamento_moeda = upper(coalesce(p_currency, '')),
      pagamento_reconciliacao_status = 'ok',
      pagamento_reconciliado_em = now(),
      pagamento_atualizado_em = now(),
      reembolso_status = v_novo_reembolso,
      updated_at = now()
  where id = p_pedido_id;

  update public.pagamento_eventos
  set processado = true, processed_at = now()
  where id = v_evento_id;

  if v_status_anterior is distinct from v_novo_status then
    insert into public.notificacoes(usuario_id, pedido_id, titulo, mensagem, tipo)
    values (
      v_pedido.usuario_id,
      p_pedido_id,
      case v_novo_status
        when 'pago' then 'Pagamento confirmado'
        when 'estornado' then 'Pagamento estornado'
        else 'Pagamento atualizado'
      end,
      case
        when v_novo_status = 'pago' and v_pedido.status = 'cancelado'
          then 'O pagamento foi confirmado após o cancelamento e o reembolso foi aberto automaticamente.'
        when v_novo_status = 'pago'
          then 'O pagamento online do seu pedido foi confirmado.'
        when v_novo_status = 'estornado'
          then 'O estorno do pagamento foi confirmado.'
        else 'O status do pagamento foi atualizado.'
      end,
      'pagamento'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicado', false,
    'pagamento_status', v_novo_status,
    'reembolso_status', v_novo_reembolso
  );
end;
$$;

commit;
