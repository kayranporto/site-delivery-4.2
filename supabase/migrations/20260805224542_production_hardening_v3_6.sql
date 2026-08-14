begin;

alter view if exists public.empresas_catalogo
  set (security_invoker = true, security_barrier = true);

alter view if exists public.avaliacoes_resumo
  set (security_invoker = true, security_barrier = true);

create index if not exists admin_auditoria_admin_id_idx
  on public.admin_auditoria (admin_id);
create index if not exists app_logs_usuario_id_idx
  on public.app_logs (usuario_id);
create index if not exists avaliacoes_usuario_id_idx
  on public.avaliacoes (usuario_id);
create index if not exists chamados_suporte_pedido_id_idx
  on public.chamados_suporte (pedido_id);
create index if not exists chamados_suporte_respondido_por_idx
  on public.chamados_suporte (respondido_por);
create index if not exists chamados_suporte_usuario_id_idx
  on public.chamados_suporte (usuario_id);
create index if not exists entrega_localizacoes_entregador_id_idx
  on public.entrega_localizacoes (entregador_id);
create index if not exists fidelidade_movimentos_usuario_id_idx
  on public.fidelidade_movimentos (usuario_id);
create index if not exists fidelidade_resgates_usuario_id_idx
  on public.fidelidade_resgates (usuario_id);
create index if not exists historico_status_pedido_alterado_por_idx
  on public.historico_status_pedido (alterado_por);
create index if not exists notificacoes_pedido_id_idx
  on public.notificacoes (pedido_id);
create index if not exists pedido_mensagens_autor_id_idx
  on public.pedido_mensagens (autor_id);
create index if not exists pedidos_endereco_id_idx
  on public.pedidos (endereco_id);

drop index if exists public.pedidos_numero_unique;

notify pgrst, 'reload schema';
commit;