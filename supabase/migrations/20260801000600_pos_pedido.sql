-- Multi Delivery: compatibilidade e recursos de pós-pedido.
-- Execute depois da versão atualizada de 005_production_fixes.sql.

begin;

-- Instalações antigas já possuíam avaliacoes, porém empresa_id era uuid e
-- não existiam resposta/updated_at. As políticas precisam ser removidas antes
-- da conversão para evitar dependências no tipo antigo.
drop view if exists public.avaliacoes_resumo;
drop policy if exists "avaliacoes leitura publica" on public.avaliacoes;
drop policy if exists "cliente cria avaliacao" on public.avaliacoes;
drop policy if exists "cliente atualiza avaliacao" on public.avaliacoes;

alter table public.avaliacoes
  add column if not exists resposta text,
  add column if not exists updated_at timestamptz not null default now();

-- pedidos.empresa_id é text no projeto. A conversão preserva os UUIDs já
-- armazenados e permite comparar corretamente pedido e avaliação.
alter table public.avaliacoes
  alter column empresa_id type text using empresa_id::text;

-- Adiciona o vínculo ao pedido quando a instalação antiga não o possuía.
-- NOT VALID preserva registros históricos eventualmente incompletos, mas
-- valida normalmente todos os novos registros.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.avaliacoes'::regclass
      and contype = 'f'
      and conname = 'avaliacoes_pedido_id_fkey'
  ) then
    alter table public.avaliacoes
      add constraint avaliacoes_pedido_id_fkey
      foreign key (pedido_id) references public.pedidos(id)
      on delete cascade not valid;
  end if;
end $$;

create index if not exists avaliacoes_empresa_idx
  on public.avaliacoes (empresa_id, created_at desc);

-- Um pedido deve receber somente uma avaliação. Se uma instalação antiga já
-- tiver duplicidades, elas são preservadas e o índice pode ser criado depois
-- que o administrador decidir qual registro manter.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'avaliacoes_pedido_unico_idx'
  ) and not exists (
    select 1 from public.avaliacoes
    where pedido_id is not null
    group by pedido_id
    having count(*) > 1
  ) then
    create unique index avaliacoes_pedido_unico_idx
      on public.avaliacoes (pedido_id)
      where pedido_id is not null;
  end if;
end $$;

alter table public.avaliacoes enable row level security;

create policy "avaliacoes leitura publica"
on public.avaliacoes
for select to anon, authenticated
using (true);

create policy "cliente cria avaliacao"
on public.avaliacoes
for insert to authenticated
with check (
  usuario_id = auth.uid()
  and pedido_id is not null
  and empresa_id is not null
  and exists (
    select 1
    from public.pedidos p
    where p.id = avaliacoes.pedido_id
      and p.usuario_id = auth.uid()
      and p.empresa_id = avaliacoes.empresa_id
      and p.status = 'entregue'
  )
);

create policy "cliente atualiza avaliacao"
on public.avaliacoes
for update to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

grant select on public.avaliacoes to anon, authenticated;
grant insert on public.avaliacoes to authenticated;
revoke update on public.avaliacoes from authenticated;
grant update (nota, comentario, updated_at)
  on public.avaliacoes to authenticated;

-- Resumo público usado nos cartões e na página do restaurante.
create view public.avaliacoes_resumo
with (security_barrier = true)
as
select
  empresa_id,
  count(*)::bigint as quantidade_avaliacoes,
  round(avg(nota)::numeric, 1) as nota_media
from public.avaliacoes
where empresa_id is not null and nota between 1 and 5
group by empresa_id;

revoke all on public.avaliacoes_resumo from public, anon, authenticated;
grant select on public.avaliacoes_resumo to anon, authenticated;

comment on view public.avaliacoes_resumo is
  'Quantidade de avaliações e nota média pública por restaurante.';

commit;
