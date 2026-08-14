-- Multi Delivery 4.2.8: endurecimento de privilégios de funções.
-- Mantém as RPCs existentes inalteradas e reduz a superfície para funções futuras.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

alter default privileges for role postgres in schema private
  revoke execute on functions from anon, authenticated, service_role, public;

-- Estas funções são usadas exclusivamente como triggers. O chamador da API
-- não precisa ter EXECUTE direto sobre elas.
revoke execute on function private.normalizar_autor_mensagem()
  from public, anon, authenticated, service_role;
revoke execute on function private.notificar_evento_pedido()
  from public, anon, authenticated, service_role;
revoke execute on function private.notificar_mensagem_pedido()
  from public, anon, authenticated, service_role;
