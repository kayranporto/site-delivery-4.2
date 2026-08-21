# Evidências de produção — 21/08/2026

## Estado consolidado

| Controle | Estado | Evidência |
|---|---|---|
| Pull request anterior | Concluído | PR #11 integrado por squash na `main`, commit `6844d9ef9c563b2dcc0a6aa269275dc402964490` |
| Deploy Vercel | Concluído | Deploy `dpl_vnqtihqw8DQrSgF4c5SejAy8MnvM`, produção em `https://site-delivery-42.vercel.app` |
| Rotas públicas | Concluído | HTTP 200 em `/`, login, cadastro, manifesto e service worker |
| Cabeçalhos HTTP | Concluído | CSP, HSTS, `nosniff`, anti-framing, referrer, permissions, COOP e CORP validados por `npm run verify:production` |
| Gate local | Concluído | 250 arquivos verificados, 148/148 testes aprovados e type-check das Edge Functions sem erro |
| Histórico de pedido | Corrigido | Política `historico_public` removida; `anon` sem `SELECT`; migration aplicada no remoto |
| RLS do entregador | Concluído | 8/8 asserções com identidade sintética isolada e `ROLLBACK`; roteiro em `supabase/tests/production/rls_entregador_isolado.sql` |
| Advisors Supabase | Executado | Segurança: 75 itens, sendo 73 warnings. Performance: 46 itens, sendo 16 políticas permissivas duplicadas |
| URLs e rate limits Auth | Preparado | Valores declarados em `supabase/config.toml`; aplicação remota aguarda autorização explícita |
| Backup físico/PITR | Indisponível | Plano Free sem backup físico listado e com PITR desativado |
| Backup lógico | Preparado | `npm run backup:supabase` exige `SUPABASE_DB_PASSWORD` e grava somente em `backups/`, ignorado pelo Git |
| Mercado Pago sandbox | Bloqueado | Segredos Mercado Pago ausentes no projeto e nenhuma execução de Edge Function nas últimas 24 horas |

## Pendências externas

1. Autorizar e aplicar as URLs e os rate limits do Auth no Supabase de produção.
2. Fornecer/configurar credenciais de teste do Mercado Pago e executar os 17 cenários de `docs/PRODUCAO.md`.
3. Fornecer a senha do banco por variável de ambiente e criar um projeto Supabase temporário para ensaio de restauração.
4. Revisar juridicamente a política de privacidade e nomear responsáveis operacionais.

O CAPTCHA permanece desativado e `pagamentoOnlineAtivo` permanece `false`.
