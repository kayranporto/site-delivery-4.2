-- Multi Delivery: recursos avançados, histórico, endereços, cupons e avaliações.
-- Execute após as migrações 001, 002 e 003.

create table if not exists public.enderecos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  apelido text not null default 'Casa',
  cep text,
  logradouro text not null,
  numero text not null,
  complemento text,
  bairro text not null,
  cidade text not null,
  uf text not null,
  referencia text,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.historico_status_pedido (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  status text not null check (status in ('recebido','preparando','saiu_para_entrega','entregue','cancelado')),
  alterado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cupons (
  id uuid primary key default gen_random_uuid(),
  empresa_id text,
  codigo text not null,
  tipo text not null check (tipo in ('percentual','fixo','frete')),
  valor numeric(12,2) not null check (valor >= 0),
  pedido_minimo numeric(12,2) not null default 0 check (pedido_minimo >= 0),
  limite_usos integer check (limite_usos is null or limite_usos > 0),
  usos integer not null default 0 check (usos >= 0),
  primeiro_pedido boolean not null default false,
  inicio timestamptz not null default now(),
  fim timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id text not null,
  nota integer not null check (nota between 1 and 5),
  comentario text check (char_length(comentario) <= 1000),
  resposta text check (char_length(resposta) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enderecos_usuario_idx on public.enderecos(usuario_id);
create index if not exists historico_pedido_idx on public.historico_status_pedido(pedido_id, created_at);
create index if not exists cupons_codigo_idx on public.cupons(upper(codigo));
create index if not exists avaliacoes_empresa_idx on public.avaliacoes(empresa_id, created_at desc);

alter table public.enderecos enable row level security;
alter table public.historico_status_pedido enable row level security;
alter table public.cupons enable row level security;
alter table public.avaliacoes enable row level security;

-- Endereços: somente o dono.
drop policy if exists "usuario gerencia enderecos" on public.enderecos;
create policy "usuario gerencia enderecos" on public.enderecos for all to authenticated
using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Histórico: cliente do pedido ou proprietário do restaurante.
drop policy if exists "participantes leem historico" on public.historico_status_pedido;
create policy "participantes leem historico" on public.historico_status_pedido for select to authenticated using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and (
    p.usuario_id = auth.uid() or exists (select 1 from public.empresas e where e.id::text = p.empresa_id and e.usuario_id = auth.uid())
  ))
);

-- Cupons ativos podem ser consultados; somente o restaurante gerencia os próprios.
drop policy if exists "cupons ativos leitura" on public.cupons;
create policy "cupons ativos leitura" on public.cupons for select to authenticated using (
  ativo = true and inicio <= now() and (fim is null or fim >= now()) and (limite_usos is null or usos < limite_usos)
  or exists (select 1 from public.empresas e where e.id::text = empresa_id and e.usuario_id = auth.uid())
);
drop policy if exists "restaurante gerencia cupons" on public.cupons;
create policy "restaurante gerencia cupons" on public.cupons for all to authenticated using (
  exists (select 1 from public.empresas e where e.id::text = empresa_id and e.usuario_id = auth.uid())
) with check (
  exists (select 1 from public.empresas e where e.id::text = empresa_id and e.usuario_id = auth.uid())
);

-- Avaliações públicas para leitura. Criação apenas pelo cliente após entrega.
drop policy if exists "avaliacoes leitura publica" on public.avaliacoes;
create policy "avaliacoes leitura publica" on public.avaliacoes for select to anon, authenticated using (true);
drop policy if exists "cliente cria avaliacao" on public.avaliacoes;
create policy "cliente cria avaliacao" on public.avaliacoes for insert to authenticated with check (
  usuario_id = auth.uid() and exists (
    select 1 from public.pedidos p where p.id = pedido_id and p.usuario_id = auth.uid() and p.empresa_id = empresa_id and p.status = 'entregue'
  )
);
drop policy if exists "cliente atualiza avaliacao" on public.avaliacoes;
create policy "cliente atualiza avaliacao" on public.avaliacoes for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create or replace function private.registrar_status_pedido()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.historico_status_pedido(pedido_id,status,alterado_por)
    values(new.id,new.status,auth.uid());
  end if;
  return new;
end;$$;

drop trigger if exists registrar_status_pedido on public.pedidos;
create trigger registrar_status_pedido after insert or update of status on public.pedidos
for each row execute function private.registrar_status_pedido();

-- Apenas um endereço principal por usuário.
create unique index if not exists enderecos_um_principal_idx on public.enderecos(usuario_id) where principal = true;

-- Permissões mínimas da API.
grant select, insert, update, delete on public.enderecos to authenticated;
grant select on public.historico_status_pedido to authenticated;
grant select on public.cupons to authenticated;
grant insert, update, delete on public.cupons to authenticated;
grant select on public.avaliacoes to anon, authenticated;
grant insert, update on public.avaliacoes to authenticated;
grant usage, select on sequence public.historico_status_pedido_id_seq to authenticated;

-- Habilita eventos Realtime quando a tabela ainda não está na publicação.
do $$ begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null; when undefined_object then null;
end $$;
