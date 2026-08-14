begin;

create table if not exists public.pedido_operacao_eventos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  empresa_id text not null,
  acao text not null,
  status_anterior text,
  status_novo text,
  preparo_estimado_minutos integer,
  observacao text,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists pedido_operacao_eventos_empresa_idx
  on public.pedido_operacao_eventos(empresa_id, created_at desc);
create index if not exists pedido_operacao_eventos_pedido_idx
  on public.pedido_operacao_eventos(pedido_id, created_at desc);

alter table public.pedido_operacao_eventos enable row level security;
drop policy if exists "restaurante le historico operacional" on public.pedido_operacao_eventos;
create policy "restaurante le historico operacional"
on public.pedido_operacao_eventos
for select to authenticated
using (exists (
  select 1 from public.empresas e
  where e.id::text = pedido_operacao_eventos.empresa_id::text
    and e.usuario_id = (select auth.uid())
));

grant select on public.pedido_operacao_eventos to authenticated;
revoke insert, update, delete on public.pedido_operacao_eventos from anon, authenticated;

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

revoke all on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.empresa_atualizar_operacao_pedido(uuid, text, integer, text)
  to authenticated;

commit;
