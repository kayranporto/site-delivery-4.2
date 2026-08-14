-- Multi Delivery 4.3: corrige a validação da ação definir_prioridade.
-- O parâmetro p_preparo_estimado é reutilizado pela RPC legada para prioridade 0..3;
-- portanto a validação 5..240 deve ser aplicada apenas às ações de preparo.

begin;

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
  v_permissao text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;

  select p.* into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;

  v_permissao := case
    when p_acao in ('iniciar_preparo', 'marcar_pronto', 'reabrir_preparo') then 'cozinha_operar'
    when p_acao in ('recusar_pedido', 'enviar_entrega', 'confirmar_entrega', 'definir_prioridade') then 'atendimento_operar'
    else null
  end;

  if v_permissao is null
     or not private.tem_permissao_empresa(v_pedido.empresa_id::text, v_permissao) then
    raise exception 'Acesso não autorizado para esta ação.';
  end if;

  v_status_anterior := v_pedido.status;

  if p_acao in ('iniciar_preparo', 'marcar_pronto', 'reabrir_preparo', 'enviar_entrega', 'confirmar_entrega')
     and v_pedido.pagamento_modalidade = 'online'
     and v_pedido.pagamento_status is distinct from 'pago' then
    raise exception 'Aguarde a confirmação do pagamento online antes de avançar o pedido.';
  end if;

  if p_acao <> 'definir_prioridade'
     and p_preparo_estimado is not null
     and (p_preparo_estimado < 5 or p_preparo_estimado > 240) then
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
      if v_pedido.pagamento_status = 'pago' then raise exception 'Pedido pago deve seguir o fluxo de cancelamento e reembolso.'; end if;
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
      update public.pedidos
      set pronto_em = null, updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'enviar_entrega' then
      if v_pedido.status <> 'preparando' or v_pedido.pronto_em is null then raise exception 'Marque o pedido como pronto antes de enviar para entrega.'; end if;
      if v_pedido.entregador_id is not null then raise exception 'O entregador atribuído deve confirmar a retirada pelo aplicativo.'; end if;
      update public.pedidos
      set status = 'saiu_para_entrega',
          retirado_em = coalesce(retirado_em, now()),
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'confirmar_entrega' then
      if v_pedido.status <> 'saiu_para_entrega' then raise exception 'Somente pedidos em entrega podem ser concluídos.'; end if;
      if v_pedido.entregador_id is not null then raise exception 'O entregador atribuído deve confirmar a entrega pelo aplicativo.'; end if;
      update public.pedidos
      set status = 'entregue',
          entregue_em = coalesce(entregue_em, now()),
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    when 'definir_prioridade' then
      if p_preparo_estimado is null or p_preparo_estimado < 0 or p_preparo_estimado > 3 then
        raise exception 'A prioridade deve ficar entre 0 e 3.';
      end if;
      update public.pedidos
      set prioridade = p_preparo_estimado::smallint,
          updated_at = now()
      where id = p_pedido_id returning * into v_pedido;

    else raise exception 'Ação operacional inválida.';
  end case;

  insert into public.pedido_operacao_eventos(
    pedido_id, empresa_id, acao, status_anterior, status_novo,
    preparo_estimado_minutos, observacao, usuario_id
  ) values (
    v_pedido.id, v_pedido.empresa_id::text, p_acao, v_status_anterior, v_pedido.status,
    case when p_acao = 'definir_prioridade' then null else p_preparo_estimado end,
    nullif(left(trim(coalesce(p_observacao, '')), 500), ''),
    auth.uid()
  );

  return v_pedido;
end;
$$;

revoke all on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  to authenticated;

commit;
