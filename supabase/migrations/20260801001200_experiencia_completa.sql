-- Multi Delivery 3.4: mídia do catálogo, favoritos em nuvem, identidade social,
-- controle de tentativas e inteligência administrativa.
-- Execute depois de 011_foto_perfil.sql.

begin;

-- Favoritos persistentes e sincronizados entre dispositivos.
create table if not exists public.favoritos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id text not null,
  created_at timestamptz not null default now(),
  constraint favoritos_pkey primary key (usuario_id, empresa_id)
);

create index if not exists favoritos_empresa_idx
  on public.favoritos(empresa_id, created_at desc);

alter table public.favoritos enable row level security;
drop policy if exists "usuario le favoritos" on public.favoritos;
create policy "usuario le favoritos" on public.favoritos
for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists "usuario cria favoritos" on public.favoritos;
create policy "usuario cria favoritos" on public.favoritos
for insert to authenticated with check (usuario_id = (select auth.uid()));
drop policy if exists "usuario remove favoritos" on public.favoritos;
create policy "usuario remove favoritos" on public.favoritos
for delete to authenticated using (usuario_id = (select auth.uid()));
grant select, insert, delete on public.favoritos to authenticated;

-- Bucket público para exibição do catálogo; somente o dono da loja altera sua pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogo', 'catalogo', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "catalogo leitura publica" on storage.objects;
create policy "catalogo leitura publica" on storage.objects
for select to public using (bucket_id = 'catalogo');

drop policy if exists "restaurante cria midia" on storage.objects;
create policy "restaurante cria midia" on storage.objects
for insert to authenticated with check (
  bucket_id = 'catalogo'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.empresas e where e.usuario_id = (select auth.uid()))
);

drop policy if exists "restaurante atualiza midia" on storage.objects;
create policy "restaurante atualiza midia" on storage.objects
for update to authenticated
using (
  bucket_id = 'catalogo'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.empresas e where e.usuario_id = (select auth.uid()))
)
with check (
  bucket_id = 'catalogo'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.empresas e where e.usuario_id = (select auth.uid()))
);

drop policy if exists "restaurante remove midia" on storage.objects;
create policy "restaurante remove midia" on storage.objects
for delete to authenticated using (
  bucket_id = 'catalogo'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.empresas e where e.usuario_id = (select auth.uid()))
);

-- A foto do cliente acompanha avaliações e mensagens sem expor o perfil inteiro.
alter table public.avaliacoes
  add column if not exists autor_nome text,
  add column if not exists autor_avatar_url text;

alter table public.pedido_mensagens
  add column if not exists autor_nome text,
  add column if not exists autor_avatar_url text;

create or replace function private.preencher_identidade_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.usuario_id = auth.uid() then
    select nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), ''), u.avatar_url
      into new.autor_nome, new.autor_avatar_url
    from public.usuarios u where u.id = new.usuario_id;
  end if;
  return new;
end;
$$;

create or replace function private.preencher_identidade_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.autor_id = auth.uid() and new.autor_tipo = 'cliente' then
    select nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), ''), u.avatar_url
      into new.autor_nome, new.autor_avatar_url
    from public.usuarios u where u.id = new.autor_id;
  end if;
  return new;
end;
$$;

revoke all on function private.preencher_identidade_avaliacao() from public, anon, authenticated;
revoke all on function private.preencher_identidade_mensagem() from public, anon, authenticated;
drop trigger if exists avaliacoes_identidade_social on public.avaliacoes;
create trigger avaliacoes_identidade_social
before insert or update on public.avaliacoes
for each row execute function private.preencher_identidade_avaliacao();
drop trigger if exists mensagens_identidade_social on public.pedido_mensagens;
create trigger mensagens_identidade_social
before insert or update on public.pedido_mensagens
for each row execute function private.preencher_identidade_mensagem();

create or replace function private.sincronizar_identidade_social_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := nullif(trim(concat_ws(' ', new.nome, new.sobrenome)), '');
begin
  update public.avaliacoes set autor_nome = v_nome, autor_avatar_url = new.avatar_url
  where usuario_id = new.id;
  update public.pedido_mensagens set autor_nome = v_nome, autor_avatar_url = new.avatar_url
  where autor_id = new.id and autor_tipo = 'cliente';
  return new;
end;
$$;

revoke all on function private.sincronizar_identidade_social_usuario() from public, anon, authenticated;
drop trigger if exists usuario_sincroniza_identidade_social on public.usuarios;
create trigger usuario_sincroniza_identidade_social
after update of nome, sobrenome, avatar_url on public.usuarios
for each row execute function private.sincronizar_identidade_social_usuario();

update public.avaliacoes a
set autor_nome = nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), ''),
    autor_avatar_url = u.avatar_url
from public.usuarios u
where u.id = a.usuario_id and (a.autor_nome is null or a.autor_avatar_url is null);

update public.pedido_mensagens m
set autor_nome = nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), ''),
    autor_avatar_url = u.avatar_url
from public.usuarios u
where u.id = m.autor_id and m.autor_tipo = 'cliente'
  and (m.autor_nome is null or m.autor_avatar_url is null);

-- Registro pseudonimizado para mostrar risco e tentativas recentes ao administrador.
create table if not exists public.tentativas_login (
  id bigint generated always as identity primary key,
  email_hash text not null,
  sucesso boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tentativas_login_hash_data_idx
  on public.tentativas_login(email_hash, created_at desc);
alter table public.tentativas_login enable row level security;
drop policy if exists "admin le tentativas login" on public.tentativas_login;
create policy "admin le tentativas login" on public.tentativas_login
for select to authenticated using ((select private.is_admin()));
grant select on public.tentativas_login to authenticated;

create or replace function public.registrar_tentativa_login(p_email text, p_sucesso boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := md5(lower(trim(coalesce(p_email, ''))));
  v_falhas integer;
  v_eventos integer;
begin
  if length(trim(coalesce(p_email, ''))) < 5 then
    return jsonb_build_object('bloqueado', false, 'falhas', 0);
  end if;

  select count(*)::integer into v_eventos from public.tentativas_login
  where email_hash = v_hash and created_at >= now() - interval '1 hour';
  if v_eventos < 30 or p_sucesso then
    insert into public.tentativas_login(email_hash, sucesso) values (v_hash, coalesce(p_sucesso, false));
  end if;

  select count(*)::integer into v_falhas
  from public.tentativas_login
  where email_hash = v_hash and sucesso = false and created_at >= now() - interval '15 minutes';

  return jsonb_build_object('bloqueado', v_falhas >= 5, 'falhas', v_falhas, 'aguarde_segundos', case when v_falhas >= 5 then 60 else 0 end);
end;
$$;

revoke all on function public.registrar_tentativa_login(text, boolean) from public, anon, authenticated;
grant execute on function public.registrar_tentativa_login(text, boolean) to anon, authenticated;

-- Relatório de produtos, clientes recorrentes e segurança do acesso.
create or replace function public.admin_relatorio_clientes_produtos(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365));
  v_resultado jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'produtos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.quantidade desc, x.receita desc)
      from (
        select i.nome_produto as nome, p.empresa_nome,
               sum(i.quantidade)::integer as quantidade,
               round(sum(i.preco_unitario * i.quantidade), 2) as receita
        from public.pedido_itens i
        join public.pedidos p on p.id = i.pedido_id
        where p.created_at >= v_inicio and p.status = 'entregue'
        group by i.nome_produto, p.empresa_nome
        order by quantidade desc, receita desc limit 10
      ) x
    ), '[]'::jsonb),
    'clientes_recorrentes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.pedidos desc, x.total desc)
      from (
        select p.usuario_id,
               coalesce(nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), ''), 'Cliente') as nome,
               u.avatar_url, count(*)::integer as pedidos, round(sum(p.total), 2) as total
        from public.pedidos p
        left join public.usuarios u on u.id = p.usuario_id
        where p.created_at >= v_inicio and p.status <> 'cancelado'
        group by p.usuario_id, u.nome, u.sobrenome, u.avatar_url
        having count(*) > 1
        order by pedidos desc, total desc limit 10
      ) x
    ), '[]'::jsonb),
    'seguranca', jsonb_build_object(
      'falhas_24h', (select count(*) from public.tentativas_login where sucesso = false and created_at >= now() - interval '24 hours'),
      'emails_em_risco', (select count(*) from (
        select email_hash from public.tentativas_login
        where sucesso = false and created_at >= now() - interval '15 minutes'
        group by email_hash having count(*) >= 5
      ) risco)
    )
  ) into v_resultado;
  return v_resultado;
end;
$$;

revoke all on function public.admin_relatorio_clientes_produtos(integer) from public, anon, authenticated;
grant execute on function public.admin_relatorio_clientes_produtos(integer) to authenticated;

commit;

notify pgrst, 'reload schema';
