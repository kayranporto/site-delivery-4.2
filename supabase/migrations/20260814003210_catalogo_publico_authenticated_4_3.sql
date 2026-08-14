-- 4.3 — Corrige catálogo público após login.
--
-- A view public.empresas_catalogo usa security_invoker. Portanto, quando o
-- visitante entra na conta, a leitura passa a obedecer às policies do papel
-- authenticated na tabela public.empresas. Sem esta policy, clientes comuns
-- recebiam catálogo vazio mesmo com restaurantes publicados e ativos.

DROP POLICY IF EXISTS "catalogo_empresas_authenticated" ON public.empresas;

CREATE POLICY "catalogo_empresas_authenticated"
ON public.empresas
FOR SELECT
TO authenticated
USING (publicado = true AND status = true);
