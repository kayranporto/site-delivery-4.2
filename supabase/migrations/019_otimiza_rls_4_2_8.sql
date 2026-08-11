begin;

-- 4.2.8: remove políticas redundantes e evita reavaliar auth.uid()
-- para cada linha, preservando as mesmas regras de autorização.

drop policy if exists "usuario gerencia enderecos" on public.enderecos;
drop policy if exists "proprietario le unidades" on public.empresa_unidades;
drop policy if exists "proprietario le variantes" on public.produto_variantes;

alter policy enderecos_delete on public.enderecos
  using (usuario_id = (select auth.uid()));

alter policy enderecos_insert on public.enderecos
  with check (usuario_id = (select auth.uid()));

alter policy enderecos_select on public.enderecos
  using (usuario_id = (select auth.uid()));

alter policy enderecos_update on public.enderecos
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

alter policy "proprietario gerencia horarios" on public.empresa_horarios
  using (exists (
    select 1 from public.empresas e
    where e.id::text = empresa_horarios.empresa_id
      and e.usuario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.empresas e
    where e.id::text = empresa_horarios.empresa_id
      and e.usuario_id = (select auth.uid())
  ));

alter policy "proprietario gerencia pausas" on public.empresa_pausas
  using (exists (
    select 1 from public.empresas e
    where e.id::text = empresa_pausas.empresa_id
      and e.usuario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.empresas e
    where e.id::text = empresa_pausas.empresa_id
      and e.usuario_id = (select auth.uid())
  ));

alter policy "proprietario gerencia regioes" on public.empresa_regioes
  using (exists (
    select 1 from public.empresas e
    where e.id::text = empresa_regioes.empresa_id
      and e.usuario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.empresas e
    where e.id::text = empresa_regioes.empresa_id
      and e.usuario_id = (select auth.uid())
  ));

alter policy "proprietario gerencia fidelidade" on public.programa_fidelidade_empresa
  using (exists (
    select 1 from public.empresas e
    where e.id::text = programa_fidelidade_empresa.empresa_id
      and e.usuario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.empresas e
    where e.id::text = programa_fidelidade_empresa.empresa_id
      and e.usuario_id = (select auth.uid())
  ));

alter policy "cliente le saldo fidelidade" on public.fidelidade_saldos
  using (usuario_id = (select auth.uid()));

alter policy "cliente le movimentos fidelidade" on public.fidelidade_movimentos
  using (usuario_id = (select auth.uid()));

alter policy "cliente le resgates fidelidade" on public.fidelidade_resgates
  using (usuario_id = (select auth.uid()));

alter policy "cliente le chamados" on public.chamados_suporte
  using (usuario_id = (select auth.uid()));

alter policy "restaurante le chamados" on public.chamados_suporte
  using (exists (
    select 1 from public.empresas e
    where e.id::text = chamados_suporte.empresa_id
      and e.usuario_id = (select auth.uid())
  ));

alter policy "cupons ativos leitura" on public.cupons
  using (
    (
      ativo = true
      and inicio <= now()
      and (fim is null or fim >= now())
      and (limite_usos is null or usos < limite_usos)
    )
    or exists (
      select 1 from public.empresas e
      where e.id::text = cupons.empresa_id
        and e.usuario_id = (select auth.uid())
    )
  );

alter policy "restaurante gerencia cupons" on public.cupons
  using (exists (
    select 1 from public.empresas e
    where e.id::text = cupons.empresa_id
      and e.usuario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.empresas e
    where e.id::text = cupons.empresa_id
      and e.usuario_id = (select auth.uid())
  ));

alter policy "cliente cria avaliacao" on public.avaliacoes
  with check (
    usuario_id = (select auth.uid())
    and pedido_id is not null
    and empresa_id is not null
    and exists (
      select 1 from public.pedidos p
      where p.id = avaliacoes.pedido_id
        and p.usuario_id = (select auth.uid())
        and p.empresa_id = avaliacoes.empresa_id
        and p.status = 'entregue'
    )
  );

alter policy "cliente atualiza avaliacao" on public.avaliacoes
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

alter policy "entregador le cadastro" on public.entregadores
  using (
    id = (select auth.uid())
    or (select private.is_admin())
  );

alter policy "entregador le pedidos atribuidos" on public.pedidos
  using (entregador_id = (select auth.uid()));

alter policy "entregador le itens atribuidos" on public.pedido_itens
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_itens.pedido_id
      and p.entregador_id = (select auth.uid())
  ));

alter policy "participantes enviam mensagens" on public.pedido_mensagens
  with check (
    autor_id = (select auth.uid())
    and (select private.participa_pedido(pedido_mensagens.pedido_id))
  );

alter policy "usuario le notificacoes" on public.notificacoes
  using (usuario_id = (select auth.uid()));

alter policy "usuario atualiza notificacoes" on public.notificacoes
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

alter policy "usuario gerencia push" on public.push_subscriptions
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

alter policy "usuario registra log" on public.app_logs
  with check (usuario_id = (select auth.uid()));

commit;
