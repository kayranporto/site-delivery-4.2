-- Exclusão administrativa definitiva de restaurantes, instalada em produção.
-- Os arquivos do bucket catalogo são removidos pela Storage API no painel
-- antes desta função, evitando objetos órfãos no armazenamento.

begin;

drop policy if exists "admin remove midia catalogo" on storage.objects;
create policy "admin remove midia catalogo"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'catalogo'
  and (select private.is_admin())
);

create or replace function public.admin_excluir_restaurante(
  p_empresa_id uuid,
  p_nome_confirmacao text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa public.empresas%rowtype;
  v_tabela regclass;
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '30s', true);

  select *
  into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    return false;
  end if;

  if lower(trim(coalesce(p_nome_confirmacao, ''))) <> lower(trim(v_empresa.nome)) then
    raise exception 'Digite o nome exato do restaurante para confirmar.' using errcode = '22023';
  end if;

  -- Dependências sem empresa_id próprio precisam sair antes dos registros-pai.
  delete from public.pagamento_eventos pe
  using public.pedidos p
  where pe.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.notificacoes n
  using public.pedidos p
  where n.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.entrega_localizacoes el
  using public.pedidos p
  where el.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.entrega_ofertas eo
  using public.pedidos p
  where eo.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.historico_status_pedido h
  using public.pedidos p
  where h.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.pedido_mensagens pm
  using public.pedidos p
  where pm.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.pedido_itens pi
  using public.pedidos p
  where pi.pedido_id = p.id and p.empresa_id = p_empresa_id::text;

  delete from public.produto_variantes pv
  using public.produtos p
  where pv.produto_id = p.id::text and p.empresa_id = p_empresa_id::text;

  delete from public.produto_grupos pg
  using public.produtos p
  where pg.produto_id = p.id::text and p.empresa_id = p_empresa_id::text;

  delete from public.produto_grupos pg
  using public.grupos_adicionais g
  where pg.grupo_id = g.id::text and g.empresa_id = p_empresa_id::text;

  delete from public.adicionais a
  using public.grupos_adicionais g
  where a.grupo_id = g.id::text and g.empresa_id = p_empresa_id::text;

  -- Remove todas as tabelas atuais e futuras que tenham empresa_id.
  -- Unidades ficam por último por serem referenciadas por vários recursos.
  for v_tabela in
    select c.oid::regclass
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attname = 'empresa_id'
      and a.attnum > 0
      and not a.attisdropped
      and c.relname not in ('empresas', 'empresa_unidades')
    order by c.relname
  loop
    execute format('delete from %s where empresa_id::text = $1', v_tabela)
    using p_empresa_id::text;
  end loop;

  delete from public.empresa_unidades
  where empresa_id = p_empresa_id::text;

  -- Remove também ações administrativas anteriores que apontavam para a loja.
  delete from public.admin_auditoria
  where alvo_id = p_empresa_id::text
     or detalhes::text ilike '%' || p_empresa_id::text || '%';

  delete from public.empresas
  where id = p_empresa_id;

  return found;
end;
$$;

revoke all on function public.admin_excluir_restaurante(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_excluir_restaurante(uuid, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
