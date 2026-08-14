begin;

-- Cadastro por e-mail passa a ser de acesso imediato por decisão de produto.
-- A configuração hospedada é aplicada no Auth; esta migração remove endpoints
-- legados que permitiam telemetria ou atualização financeira controlada pelo cliente.

revoke all on function public.registrar_tentativa_login(text, boolean) from public, anon, authenticated;
drop function if exists public.registrar_tentativa_login(text, boolean);

revoke all on function public.admin_atualizar_reembolso(uuid, text) from public, anon, authenticated, service_role;

comment on function public.reconciliar_pagamento_mercado_pago(uuid, text, text, numeric, text, text, text, text, jsonb)
    is 'RPC interna e idempotente de reconciliação; execução restrita ao service_role.';

notify pgrst, 'reload schema';
commit;
