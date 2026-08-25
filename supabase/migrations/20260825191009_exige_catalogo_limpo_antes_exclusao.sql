-- Impede exclusões parciais quando um painel antigo não removeu o Storage.

begin;

create or replace function private.exigir_catalogo_limpo_antes_excluir_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.usuario_id is not null and exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'catalogo'
      and (storage.foldername(o.name))[1] = old.usuario_id::text
  ) then
    raise exception 'Remova os arquivos do catálogo antes de apagar a loja.'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

revoke all on function private.exigir_catalogo_limpo_antes_excluir_empresa()
  from public, anon, authenticated, service_role;

drop trigger if exists a_exigir_catalogo_limpo_antes_excluir on public.empresas;
create trigger a_exigir_catalogo_limpo_antes_excluir
before delete on public.empresas
for each row execute function private.exigir_catalogo_limpo_antes_excluir_empresa();

commit;
