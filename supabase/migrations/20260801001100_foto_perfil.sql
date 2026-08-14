-- Multi Delivery 3.3: foto de perfil do cliente.
-- Execute depois de 010_admin_avancado.sql.

begin;

alter table public.usuarios
  add column if not exists avatar_url text;

comment on column public.usuarios.avatar_url is
  'URL pública da foto de perfil armazenada no bucket avatars.';

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Cada conta só pode criar, substituir ou apagar o objeto fixo da sua pasta.
drop policy if exists "usuario cria proprio avatar" on storage.objects;
create policy "usuario cria proprio avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name = (select auth.uid()::text) || '/avatar'
);

drop policy if exists "usuario le proprio avatar" on storage.objects;
create policy "usuario le proprio avatar"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name = (select auth.uid()::text) || '/avatar'
);

drop policy if exists "usuario atualiza proprio avatar" on storage.objects;
create policy "usuario atualiza proprio avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name = (select auth.uid()::text) || '/avatar'
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name = (select auth.uid()::text) || '/avatar'
);

drop policy if exists "usuario remove proprio avatar" on storage.objects;
create policy "usuario remove proprio avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name = (select auth.uid()::text) || '/avatar'
);

commit;

notify pgrst, 'reload schema';
