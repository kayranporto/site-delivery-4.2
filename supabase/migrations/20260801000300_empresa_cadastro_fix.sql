-- Correção do cadastro de restaurantes.
-- Execute este arquivo no Supabase caso o cadastro de empresa ainda falhe
-- após a instalação do SETUP-COMPLETO.sql.

drop index if exists public.empresas_usuario_id_unique;
create unique index empresas_usuario_id_unique
  on public.empresas(usuario_id);

create unique index if not exists empresas_cnpj_unique
  on public.empresas(cnpj) where cnpj is not null and cnpj <> '';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_conta text;
  v_cnpj text;
begin
  v_tipo_conta := coalesce(new.raw_user_meta_data ->> 'tipo_conta', 'cliente');
  v_cnpj := nullif(pg_catalog.regexp_replace(coalesce(new.raw_user_meta_data ->> 'cnpj', ''), '\D', '', 'g'), '');

  insert into public.usuarios (id, nome, sobrenome, telefone, cpf)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.raw_user_meta_data ->> 'sobrenome', ''),
    coalesce(new.raw_user_meta_data ->> 'telefone', ''),
    nullif(new.raw_user_meta_data ->> 'cpf', '')
  )
  on conflict (id) do update set
    nome = excluded.nome,
    sobrenome = excluded.sobrenome,
    telefone = excluded.telefone,
    cpf = coalesce(excluded.cpf, public.usuarios.cpf);

  if v_tipo_conta = 'restaurante' then
    if v_cnpj is null then
      raise exception 'CNPJ do restaurante não informado.' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.empresas e
      where e.cnpj = v_cnpj
    ) then
      raise exception 'Este CNPJ já está cadastrado em outro restaurante.' using errcode = 'P0001';
    end if;

    insert into public.empresas (
      usuario_id, nome, email, telefone, cnpj, status, taxa_entrega, pedido_minimo
    ) values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), 'Restaurante'),
      new.email,
      coalesce(new.raw_user_meta_data ->> 'telefone', ''),
      v_cnpj,
      true,
      0,
      0
    )
    on conflict (usuario_id) do update set
      nome = excluded.nome,
      email = excluded.email,
      telefone = excluded.telefone,
      cnpj = excluded.cnpj;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_delivery on auth.users;

create trigger on_auth_user_created_delivery
after insert on auth.users
for each row execute function private.handle_new_user();
