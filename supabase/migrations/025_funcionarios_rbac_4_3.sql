-- Multi Delivery 4.3: fundação segura para funcionários do estabelecimento.
-- Esta migration cria vínculos e RPCs de gestão, sem ampliar automaticamente
-- o acesso dos papéis às tabelas operacionais existentes.

begin;

create table if not exists public.empresa_funcionarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('gerente', 'cozinha', 'atendente', 'financeiro')),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists empresa_funcionarios_empresa_usuario_idx
  on public.empresa_funcionarios(empresa_id, usuario_id);

create index if not exists empresa_funcionarios_usuario_ativo_idx
  on public.empresa_funcionarios(usuario_id, ativo, empresa_id);

create index if not exists empresa_funcionarios_empresa_papel_idx
  on public.empresa_funcionarios(empresa_id, ativo, papel);

alter table public.empresa_funcionarios enable row level security;

-- O funcionário enxerga apenas o próprio vínculo. O proprietário enxerga a
-- equipe inteira da própria empresa. Gestão é feita somente pelas RPCs abaixo.
drop policy if exists "funcionario le proprio vinculo" on public.empresa_funcionarios;
create policy "funcionario le proprio vinculo" on public.empresa_funcionarios
for select to authenticated
using (usuario_id = (select auth.uid()));

drop policy if exists "proprietario le equipe" on public.empresa_funcionarios;
create policy "proprietario le equipe" on public.empresa_funcionarios
for select to authenticated
using (exists (
  select 1
  from public.empresas e
  where e.id::text = empresa_funcionarios.empresa_id::text
    and e.usuario_id = (select auth.uid())
));

revoke all on table public.empresa_funcionarios from anon, authenticated;
grant select on table public.empresa_funcionarios to authenticated;

create or replace function private.eh_proprietario_empresa(p_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresas e
    where e.id::text = p_empresa_id::text
      and e.usuario_id = auth.uid()
  );
$$;

create or replace function private.tem_vinculo_empresa(
  p_empresa_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.eh_proprietario_empresa(p_empresa_id)
    or exists (
      select 1
      from public.empresa_funcionarios f
      where f.empresa_id::text = p_empresa_id::text
        and f.usuario_id = auth.uid()
        and f.ativo = true
        and (p_papeis is null or f.papel = any(p_papeis))
    );
$$;

revoke all on function private.eh_proprietario_empresa(text)
  from public, anon, authenticated, service_role;
revoke all on function private.tem_vinculo_empresa(text, text[])
  from public, anon, authenticated, service_role;

-- Resolve empresas acessíveis pelo usuário autenticado. O proprietário sempre
-- recebe papel "proprietario"; funcionários recebem apenas vínculos ativos.
create or replace function public.empresa_meu_acesso()
returns table (
  empresa_id text,
  empresa_nome text,
  papel text,
  proprietario boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id::text, e.nome::text, 'proprietario'::text, true
  from public.empresas e
  where e.usuario_id = auth.uid()

  union all

  select e.id::text, e.nome::text, f.papel::text, false
  from public.empresa_funcionarios f
  join public.empresas e on e.id::text = f.empresa_id::text
  where f.usuario_id = auth.uid()
    and f.ativo = true
    and e.usuario_id is distinct from auth.uid()
  order by proprietario desc, empresa_nome;
$$;

-- Lista a equipe sem conceder SELECT direto em auth.users. Apenas o
-- proprietário da empresa pode consultar e-mails dos membros vinculados.
create or replace function public.empresa_listar_funcionarios(p_empresa_id text)
returns table (
  usuario_id uuid,
  nome text,
  email text,
  papel text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.eh_proprietario_empresa(p_empresa_id) then
    raise exception 'Apenas o proprietário pode consultar a equipe.';
  end if;

  return query
  select
    f.usuario_id,
    coalesce(nullif(trim(concat_ws(' ', u.nome, u.sobrenome)), ''), au.email)::text as nome,
    au.email::text,
    f.papel::text,
    f.ativo,
    f.created_at,
    f.updated_at
  from public.empresa_funcionarios f
  join auth.users au on au.id = f.usuario_id
  left join public.usuarios u on u.id = f.usuario_id
  where f.empresa_id::text = p_empresa_id::text
  order by f.ativo desc, nome, au.email;
end;
$$;

-- Adiciona, reativa ou troca o papel de um usuário que já possui conta no
-- Supabase Auth. Convites por e-mail serão implementados em etapa própria.
create or replace function public.empresa_salvar_funcionario(
  p_empresa_id text,
  p_email text,
  p_papel text
)
returns public.empresa_funcionarios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_funcionario public.empresa_funcionarios%rowtype;
begin
  if auth.uid() is null or not private.eh_proprietario_empresa(p_empresa_id) then
    raise exception 'Apenas o proprietário pode gerenciar a equipe.';
  end if;

  if p_papel not in ('gerente', 'cozinha', 'atendente', 'financeiro') then
    raise exception 'Papel de funcionário inválido.';
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Informe o e-mail do funcionário.';
  end if;

  select au.id into v_usuario_id
  from auth.users au
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_usuario_id is null then
    raise exception 'O usuário precisa criar uma conta antes de ser vinculado à equipe.';
  end if;

  if exists (
    select 1 from public.empresas e
    where e.id::text = p_empresa_id::text and e.usuario_id = v_usuario_id
  ) then
    raise exception 'O proprietário já possui acesso total à empresa.';
  end if;

  insert into public.empresa_funcionarios(
    empresa_id, usuario_id, papel, ativo, criado_por, updated_at
  ) values (
    p_empresa_id::text, v_usuario_id, p_papel, true, auth.uid(), now()
  )
  on conflict (empresa_id, usuario_id) do update
  set papel = excluded.papel,
      ativo = true,
      criado_por = auth.uid(),
      updated_at = now()
  returning * into v_funcionario;

  return v_funcionario;
end;
$$;

-- Remoção lógica preserva a trilha histórica e permite reativação posterior.
create or replace function public.empresa_remover_funcionario(
  p_empresa_id text,
  p_usuario_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.eh_proprietario_empresa(p_empresa_id) then
    raise exception 'Apenas o proprietário pode gerenciar a equipe.';
  end if;

  update public.empresa_funcionarios
  set ativo = false,
      updated_at = now()
  where empresa_id::text = p_empresa_id::text
    and usuario_id = p_usuario_id
    and ativo = true;

  return found;
end;
$$;

revoke all on function public.empresa_meu_acesso()
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_listar_funcionarios(text)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_salvar_funcionario(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.empresa_remover_funcionario(text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.empresa_meu_acesso() to authenticated;
grant execute on function public.empresa_listar_funcionarios(text) to authenticated;
grant execute on function public.empresa_salvar_funcionario(text, text, text) to authenticated;
grant execute on function public.empresa_remover_funcionario(text, uuid) to authenticated;

commit;
