# Status de produção — 31/08/2026

Este documento complementa `PRODUCAO.md` com o estado verificado mais recente do Multi Delivery.

## Concluído e verificado

- aplicação, `package.json`, `js/core/config.js` e Service Worker alinhados na versão 4.4.5;
- referências de cache de `config.js` atualizadas para 4.4.5 no Service Worker e no painel do entregador;
- CI e publicação do GitHub Pages aprovados após as alterações técnicas;
- projeto Supabase de produção ativo e saudável;
- 53 migrations registradas no projeto hospedado após a migration `20260831220634_indexa_fks_multiunidade_4_4_6`;
- 4 Edge Functions permanecem publicadas conforme a arquitetura atual;
- RLS continua habilitada nas tabelas públicas auditadas;
- as 8 ocorrências de foreign keys sem índice de cobertura reportadas anteriormente pelo Performance Advisor foram resolvidas pela migration de 31/08/2026;
- a migration de índices foi testada primeiro no projeto `site-delivery-restore-test` e depois aplicada em produção;
- triagem formal dos Advisors registrada em `../security/ADVISORS-SUPABASE.md`;
- `planos_plataforma` e `empresa_assinaturas` permanecem sem policies diretas por decisão de arquitetura: `anon` e `authenticated` não têm privilégios diretos nessas tabelas e o acesso ocorre por RPC autorizada;
- `pg_net` permanece em allowlist porque sustenta o Web Push e não é relocável no projeto atual;
- RPCs `SECURITY DEFINER` intencionais permanecem sob allowlist e testes de autorização, sem revogação em massa;
- pagamento online continua desativado por segurança (`pagamentoOnlineAtivo: false`).

## Decisões de produto fechadas

### Checkout convidado

**Decisão atual: não suportar checkout convidado.**

O checkout exige usuário autenticado porque pedido, endereço, histórico, cancelamento, favoritos e controles de acesso estão vinculados à identidade do cliente. Essa é uma decisão explícita de produto para a versão atual, e não uma pendência acidental.

Uma futura implementação de checkout convidado deve ser tratada como nova funcionalidade, com modelo de identidade próprio, política antifraude, recuperação de pedido e revisão de LGPD.

## Pendências externas que ainda bloqueiam aprovação final

### Mercado Pago

- configurar credenciais de sandbox nos segredos das Edge Functions;
- validar o webhook no sandbox;
- executar e registrar os 17 cenários obrigatórios de pagamento, reembolso, concorrência e ordem de eventos;
- manter `pagamentoOnlineAtivo: false` até todos os cenários passarem.

Essas etapas não podem ser concluídas apenas pelo código do repositório sem credenciais de teste válidas do Mercado Pago.

### Backup e restauração de dados

Existe um projeto Supabase separado de restauração e o schema foi exercitado, porém a validação de 31/08/2026 mostrou que ele não contém a cópia dos dados atuais de produção. Portanto, **backup/restauração de dados continua pendente**.

Para fechar o item é necessário gerar um dump lógico com as credenciais do banco, restaurar em projeto temporário e comparar contagens/objetos conforme `PRODUCAO.md`.

### Auth em produção

Os rate limits, URLs e MFA estão declarados em `supabase/config.toml`. Ainda é necessário confirmar/aplicar os valores no Auth hospedado e monitorar respostas HTTP 429 em uso real.

### Proteção contra senhas vazadas

O Security Advisor continua reportando HIBP desativado. Enquanto o recurso não estiver disponível no plano atual, manter como risco residual documentado ou migrar para plano compatível antes de escalar cadastros.

### Privacidade e operação

- revisão jurídica da política de privacidade;
- definição nominal dos responsáveis operacionais e de incidentes.

Esses dois itens exigem decisão humana/organizacional e não devem ser marcados automaticamente como concluídos por alteração de código.

## Backlog que não bloqueia o MVP técnico atual

Continuam planejados para evolução comercial e de escala:

- cobrança recorrente dos planos, comissão, extrato, fechamento e repasses;
- white-label por loja e aprovação documental estruturada de restaurantes;
- geocodificação e rota viária;
- prova de entrega por código ou foto;
- liquidação financeira do entregador;
- e-mail transacional e WhatsApp Business API;
- agrupamento e automação avançada de corridas;
- campanhas, cashback, indicação, recuperação de carrinho e recomendações;
- frontend progressivamente componentizado/TypeScript, testes E2E/carga e observabilidade centralizada.

Esses itens são evolução de produto e não devem ser confundidos com defeitos do site atual.

## Gate atual

Antes de ativar pagamento real ou declarar produção financeira aprovada:

1. concluir Mercado Pago sandbox e evidências dos 17 cenários;
2. concluir backup/restauração com dados em projeto temporário;
3. confirmar os rate limits do Auth hospedado e monitorar 429;
4. resolver/aceitar formalmente o risco de HIBP;
5. obter revisão jurídica de privacidade;
6. nomear responsáveis operacionais;
7. executar novamente `npm run verify`, Advisors Supabase e `npm run verify:production`.
