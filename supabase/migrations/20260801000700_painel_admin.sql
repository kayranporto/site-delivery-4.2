-- Multi Delivery 3.0: painel administrativo protegido.
-- Execute depois das migrações 005 e 006 atualizadas.

begin;

alter table public.usuarios
  add column if not exists bloqueado boolean not null default false;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function public.usuario_eh_admin() from public, anon, authenticated;
grant execute on function public.usuario_eh_admin() to authenticated;

-- Leitura global somente para contas cujo app_metadata.role seja admin.
drop policy if exists "admin le usuarios" on public.usuarios;
create policy "admin le usuarios" on public.usuarios
for select to authenticated using ((select private.is_admin()));

drop policy if exists "admin le empresas" on public.empresas;
create policy "admin le empresas" on public.empresas
for select to authenticated using ((select private.is_admin()));

drop policy if exists "admin le pedidos" on public.pedidos;
create policy "admin le pedidos" on public.pedidos
for select to authenticated using ((select private.is_admin()));

drop policy if exists "admin le itens" on public.pedido_itens;
create policy "admin le itens" on public.pedido_itens
for select to authenticated using ((select private.is_admin()));

drop policy if exists "admin le cupons" on public.cupons;
create policy "admin le cupons" on public.cupons
for select to authenticated using ((select private.is_admin()));

grant select on public.usuarios, public.empresas, public.pedidos,
  public.pedido_itens, public.cupons to authenticated;

create table if not exists public.admin_auditoria (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  acao text not null,
  alvo_id text,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_auditoria enable row level security;
drop policy if exists "admin le auditoria" on public.admin_auditoria;
create policy "admin le auditoria" on public.admin_auditoria
for select to authenticated using ((select private.is_admin()));
grant select on public.admin_auditoria to authenticated;

create or replace function public.admin_definir_restaurante(
  p_empresa_id uuid,
  p_publicado boolean,
  p_status boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  update public.empresas
  set publicado = p_publicado,
      status = p_status,
      updated_at = now()
  where id = p_empresa_id;

  if found then
    insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
    values (auth.uid(), 'restaurante_atualizado', p_empresa_id::text,
      jsonb_build_object('publicado', p_publicado, 'status', p_status));
  end if;

  return found;
end;
$$;

create or replace function public.admin_definir_usuario_bloqueio(
  p_usuario_id uuid,
  p_bloqueado boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  update public.usuarios
  set bloqueado = p_bloqueado,
      updated_at = now()
  where id = p_usuario_id;

  if found then
    insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
    values (auth.uid(), 'usuario_bloqueio_atualizado', p_usuario_id::text,
      jsonb_build_object('bloqueado', p_bloqueado));
  end if;

  return found;
end;
$$;

create or replace function public.admin_definir_cupom(
  p_cupom_id uuid,
  p_ativo boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  update public.cupons
  set ativo = p_ativo,
      updated_at = now()
  where id = p_cupom_id;

  if found then
    insert into public.admin_auditoria(admin_id, acao, alvo_id, detalhes)
    values (auth.uid(), 'cupom_atualizado', p_cupom_id::text,
      jsonb_build_object('ativo', p_ativo));
  end if;

  return found;
end;
$$;

revoke all on function public.admin_definir_restaurante(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.admin_definir_usuario_bloqueio(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_definir_cupom(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_definir_restaurante(uuid, boolean, boolean) to authenticated;
grant execute on function public.admin_definir_usuario_bloqueio(uuid, boolean) to authenticated;
grant execute on function public.admin_definir_cupom(uuid, boolean) to authenticated;

-- Bloquear um perfil impede novos pedidos, sem apagar conta ou histórico.
create or replace function private.impedir_pedido_usuario_bloqueado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.usuarios u
    where u.id = new.usuario_id and u.bloqueado = true
  ) then
    raise exception 'Esta conta está impedida de realizar novos pedidos.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.impedir_pedido_usuario_bloqueado() from public, anon, authenticated;
drop trigger if exists a_impedir_pedido_usuario_bloqueado on public.pedidos;
create trigger a_impedir_pedido_usuario_bloqueado
before insert on public.pedidos
for each row execute function private.impedir_pedido_usuario_bloqueado();

commit;
