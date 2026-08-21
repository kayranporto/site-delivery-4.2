begin;

-- O acompanhamento exige sessão e o acesso ao pedido já é limitado ao cliente,
-- restaurante, entregador atribuído ou administrador. A política legada abaixo
-- anulava esse isolamento ao liberar todo o histórico para PUBLIC.
drop policy if exists "historico_public"
on public.historico_status_pedido;

revoke all on table public.historico_status_pedido from anon, authenticated;
grant select on table public.historico_status_pedido to authenticated;

commit;
