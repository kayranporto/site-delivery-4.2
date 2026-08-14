begin;

-- Volta a view para SECURITY INVOKER. O acesso público passa a ser controlado
-- diretamente por RLS + privilégios de coluna na tabela empresas.
alter view public.empresas_catalogo set (security_invoker = true);
alter view public.empresas_catalogo set (security_barrier = true);

-- Visitantes não recebem acesso à tabela inteira, apenas às colunas que compõem
-- a vitrine pública. Dados administrativos permanecem sem privilégio.
revoke all on public.empresas from anon;
grant select (
  id, nome, descricao, categoria, tipo, logo, banner,
  taxa_entrega, pedido_minimo, status, publicado,
  cidade_atendimento, uf_atendimento, bairros_atendidos,
  tempo_estimado_min, tempo_estimado_max
) on public.empresas to anon;

-- RLS pública somente para lojas publicadas e ativas.
drop policy if exists "catalogo_empresas_publicas" on public.empresas;
create policy "catalogo_empresas_publicas"
on public.empresas for select to anon
using (publicado = true and status = true);

-- A view continua acessível à vitrine.
revoke all on public.empresas_catalogo from public, anon, authenticated;
grant select on public.empresas_catalogo to anon, authenticated;

notify pgrst, 'reload schema';
commit;