begin;

-- O frontend deixou de registrar telemetria de login controlada pelo cliente
-- na migration 015. A migration 018 restaurou a RPC durante a reconciliação
-- do estado live, embora nenhum cliente ainda a utilize. Removê-la reduz a
-- superfície SECURITY DEFINER exposta a anon e authenticated.
revoke all on function public.registrar_tentativa_login(text, boolean)
  from public, anon, authenticated, service_role;
drop function if exists public.registrar_tentativa_login(text, boolean);

commit;
