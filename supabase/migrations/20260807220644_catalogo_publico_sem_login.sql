begin;

-- A vitrine publica expoe apenas as colunas definidas na view e somente lojas publicadas.
-- A view precisa executar com os privilegios do proprietario da view, pois a tabela
-- public.empresas contem dados administrativos que nao devem ser concedidos ao anon.
alter view public.empresas_catalogo reset (security_invoker);
alter view public.empresas_catalogo set (security_barrier = true);
revoke all on public.empresas_catalogo from public, anon, authenticated;
grant select on public.empresas_catalogo to anon, authenticated;

-- As politicas anteriores misturavam a regra publica com uma subconsulta em empresas.
-- Para o papel anon, apenas referenciar a tabela protegida ja exigia privilegio e fazia
-- produtos/categorias falharem com "permission denied for table empresas".

-- Categorias
drop policy if exists "catalogo_categorias_select" on public.categorias;
drop policy if exists "catalogo categorias publico" on public.categorias;
drop policy if exists "catalogo_categorias_anon" on public.categorias;
drop policy if exists "catalogo_categorias_authenticated" on public.categorias;
create policy "catalogo_categorias_anon"
on public.categorias for select to anon
using (ativo = true);
create policy "catalogo_categorias_authenticated"
on public.categorias for select to authenticated
using (
  ativo = true
  or exists (
    select 1 from public.empresas e
    where e.id::text = categorias.empresa_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- Produtos
drop policy if exists "catalogo_produtos_select" on public.produtos;
drop policy if exists "catalogo produtos publico" on public.produtos;
drop policy if exists "catalogo_produtos_anon" on public.produtos;
drop policy if exists "catalogo_produtos_authenticated" on public.produtos;
create policy "catalogo_produtos_anon"
on public.produtos for select to anon
using (disponivel = true);
create policy "catalogo_produtos_authenticated"
on public.produtos for select to authenticated
using (
  disponivel = true
  or exists (
    select 1 from public.empresas e
    where e.id::text = produtos.empresa_id::text
      and e.usuario_id = (select auth.uid())
  )
);

-- Grupos de adicionais
drop policy if exists "catalogo_grupos_select" on public.grupos_adicionais;
drop policy if exists "catalogo grupos adicionais publico" on public.grupos_adicionais;
drop policy if exists "catalogo_grupos_anon" on public.grupos_adicionais;
drop policy if exists "catalogo_grupos_authenticated" on public.grupos_adicionais;
create policy "catalogo_grupos_anon"
on public.grupos_adicionais for select to anon
using (ativo = true);
create policy "catalogo_grupos_authenticated"
on public.grupos_adicionais for select to authenticated
using (ativo = true);

-- Adicionais
drop policy if exists "catalogo_adicionais_select" on public.adicionais;
drop policy if exists "catalogo adicionais publico" on public.adicionais;
drop policy if exists "catalogo_adicionais_anon" on public.adicionais;
drop policy if exists "catalogo_adicionais_authenticated" on public.adicionais;
create policy "catalogo_adicionais_anon"
on public.adicionais for select to anon
using (ativo = true);
create policy "catalogo_adicionais_authenticated"
on public.adicionais for select to authenticated
using (ativo = true);

-- Vinculos produto -> grupo. O anon pode ver somente vinculos de itens publicos.
drop policy if exists "catalogo_produto_grupos_select" on public.produto_grupos;
drop policy if exists "catalogo produto grupos publico" on public.produto_grupos;
drop policy if exists "catalogo_produto_grupos_anon" on public.produto_grupos;
drop policy if exists "catalogo_produto_grupos_authenticated" on public.produto_grupos;
create policy "catalogo_produto_grupos_anon"
on public.produto_grupos for select to anon
using (
  exists (
    select 1
    from public.produtos p
    join public.grupos_adicionais g on g.id::text = produto_grupos.grupo_id::text
    where p.id::text = produto_grupos.produto_id::text
      and p.disponivel = true
      and g.ativo = true
  )
);
create policy "catalogo_produto_grupos_authenticated"
on public.produto_grupos for select to authenticated
using (
  exists (
    select 1
    from public.produtos p
    join public.grupos_adicionais g on g.id::text = produto_grupos.grupo_id::text
    where p.id::text = produto_grupos.produto_id::text
      and p.disponivel = true
      and g.ativo = true
  )
);

notify pgrst, 'reload schema';
commit;