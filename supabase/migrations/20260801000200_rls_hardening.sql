-- Multi Delivery - endurecimento de permissões e RLS
-- Execute DEPOIS de 001_delivery_core.sql.
-- Este arquivo pode ser executado novamente com segurança.

-- =========================================================
-- 1) PRINCÍPIO DE MENOR PRIVILÉGIO
-- =========================================================

-- O frontend não precisa acessar sequências diretamente: pedidos são criados
-- pela função criar_pedido e as demais tabelas usam UUIDs gerados pelo banco.
revoke usage, select on all sequences in schema public from anon, authenticated;

-- O catálogo continua disponível somente pela view segura.
revoke all on public.empresas from anon;
revoke all on public.empresas_catalogo from public, anon, authenticated;
grant select on public.empresas_catalogo to anon, authenticated;

-- Garante que a numeração pública do pedido seja realmente única em bancos
-- que já existiam antes desta migração.
create unique index if not exists pedidos_numero_unique
  on public.pedidos(numero);

-- =========================================================
-- 2) VIEW DO CATÁLOGO PÚBLICO
-- =========================================================

-- A view expõe somente informações de catálogo. Dados administrativos
-- (usuario_id, e-mail, telefone administrativo e CNPJ) continuam fora dela.
create or replace view public.empresas_catalogo
with (security_barrier = true)
as
select
  e.id::text as id,
  e.nome,
  e.descricao,
  e.categoria,
  e.tipo,
  e.logo,
  e.banner,
  e.taxa_entrega,
  e.pedido_minimo,
  e.status
from public.empresas e;

revoke all on public.empresas_catalogo from public, anon, authenticated;
grant select on public.empresas_catalogo to anon, authenticated;

-- =========================================================
-- 3) POLÍTICAS RLS DE LEITURA DO CATÁLOGO
-- =========================================================
-- Uma única política de SELECT por tabela evita a combinação de várias
-- políticas permissivas para authenticated. Usuários anônimos só satisfazem
-- a parte pública; proprietários também podem enxergar registros inativos
-- do próprio restaurante para administrá-los no painel.

-- CATEGORIAS

drop policy if exists "catalogo categorias publico" on public.categorias;
drop policy if exists "proprietario le categorias" on public.categorias;
drop policy if exists "catalogo_categorias_select" on public.categorias;
create policy "catalogo_categorias_select"
on public.categorias
for select
to anon, authenticated
using (
  ativo = true
  or exists (
    select 1
    from public.empresas e
    where e.id::text = categorias.empresa_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- PRODUTOS

drop policy if exists "catalogo produtos publico" on public.produtos;
drop policy if exists "proprietario le produtos" on public.produtos;
drop policy if exists "catalogo_produtos_select" on public.produtos;
create policy "catalogo_produtos_select"
on public.produtos
for select
to anon, authenticated
using (
  disponivel = true
  or exists (
    select 1
    from public.empresas e
    where e.id::text = produtos.empresa_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- GRUPOS DE ADICIONAIS

drop policy if exists "catalogo grupos adicionais publico" on public.grupos_adicionais;
drop policy if exists "proprietario le grupos" on public.grupos_adicionais;
drop policy if exists "catalogo_grupos_select" on public.grupos_adicionais;
create policy "catalogo_grupos_select"
on public.grupos_adicionais
for select
to anon, authenticated
using (
  ativo = true
  or exists (
    select 1
    from public.empresas e
    where e.id::text = grupos_adicionais.empresa_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- ADICIONAIS

drop policy if exists "catalogo adicionais publico" on public.adicionais;
drop policy if exists "proprietario le adicionais" on public.adicionais;
drop policy if exists "catalogo_adicionais_select" on public.adicionais;
create policy "catalogo_adicionais_select"
on public.adicionais
for select
to anon, authenticated
using (
  ativo = true
  or exists (
    select 1
    from public.grupos_adicionais g
    join public.empresas e
      on e.id::text = g.empresa_id::text
    where g.id::text = adicionais.grupo_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- VÍNCULOS PRODUTO -> GRUPO
-- Público só enxerga vínculos de produtos disponíveis e grupos ativos.

drop policy if exists "catalogo produto grupos publico" on public.produto_grupos;
drop policy if exists "catalogo_produto_grupos_select" on public.produto_grupos;
create policy "catalogo_produto_grupos_select"
on public.produto_grupos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.produtos p
    join public.grupos_adicionais g
      on g.id::text = produto_grupos.grupo_id::text
    where p.id::text = produto_grupos.produto_id::text
      and p.disponivel = true
      and g.ativo = true
  )
  or exists (
    select 1
    from public.produtos p
    join public.empresas e
      on e.id::text = p.empresa_id::text
    where p.id::text = produto_grupos.produto_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- =========================================================
-- 4) MANTÉM RLS EXPLICITAMENTE ATIVO
-- =========================================================

alter table public.usuarios enable row level security;
alter table public.empresas enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.produto_grupos enable row level security;
alter table public.grupos_adicionais enable row level security;
alter table public.adicionais enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;

-- =========================================================
-- 5) FUNÇÃO INTERNA DE PEDIDO
-- =========================================================
-- O cliente deve usar apenas public.criar_pedido. A função interna executa
-- com privilégios elevados para gravar pedidos, mas continua inacessível
-- diretamente ao papel anon e só é executável por authenticated porque o
-- wrapper público depende dela.

revoke all on function private.criar_pedido_impl(text, text, text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function private.criar_pedido_impl(text, text, text, text, text, jsonb)
to authenticated;

revoke all on function public.criar_pedido(text, text, text, text, text, jsonb)
from public, anon;
grant execute on function public.criar_pedido(text, text, text, text, text, jsonb)
to authenticated;

-- Não permitir criação direta de pedidos pelo navegador.
revoke insert, delete on public.pedidos, public.pedido_itens from anon, authenticated;

-- =========================================================
-- 6) RESUMO DOS PAPÉIS
-- =========================================================
-- anon:
--   leitura do catálogo público + execução de nenhum procedimento privado.
-- authenticated:
--   perfil próprio; administração do próprio restaurante; leitura dos seus
--   pedidos; atualização apenas do status dos pedidos do próprio restaurante;
--   criação de pedidos exclusivamente por public.criar_pedido.
-- service_role:
--   permanece com o acesso administrativo padrão do Supabase.

comment on table public.usuarios is 'Perfil do cliente vinculado a auth.users; protegido por RLS.';
comment on table public.empresas is 'Dados administrativos e de catálogo dos restaurantes; dados sensíveis não são expostos diretamente ao anon.';
comment on table public.pedidos is 'Pedidos criados exclusivamente pela função public.criar_pedido e protegidos por RLS.';
comment on table public.pedido_itens is 'Itens de pedidos; leitura permitida somente a cliente ou restaurante participante.';
