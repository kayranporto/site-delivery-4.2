# Publicação segura — Multi Delivery 4.4.5

## 1. Gate de release

```bash
npm ci
npm run verify
npm run package
```

`npm run verify` executa a verificação estrutural de 252 arquivos versionados, os 149 testes automatizados e o type-check TypeScript das Edge Functions. O empacotamento repete o gate antes de gerar o ZIP e exclui `.git`, `node_modules`, releases anteriores e arquivos ZIP antigos.

## 2. Banco de dados

1. Gere backup e documente o procedimento de restauração.
2. Confirme que as migrations 014 a 024 estão aplicadas, na ordem, no projeto hospedado.
3. Execute Security Advisor e Performance Advisor.
4. Confirme RLS nas tabelas públicas, inclusive `empresa_unidades`, `produto_variantes` e `estoque_movimentos`.
5. Teste RPCs com contas separadas de cliente, restaurante, entregador e administrador.
6. Valide que `private.criar_pedido_impl` não é executável diretamente por clientes.

A migration 016 adiciona variações, cozinha, idempotência do checkout, auditoria de estoque e a fundação multiunidade. A migration 018 reconcilia o catálogo publicado com o estado live e restringe as permissões do papel anônimo. A migration 019 elimina políticas redundantes e otimiza chamadas de identidade nas políticas RLS. A migration 020 remove atualizações diretas de estado em pedidos e exige RPCs autenticadas para pagamento presencial e cancelamento não pago. A migration 021 valida a referência do pedido antes de registrar eventos do Mercado Pago e devolve erro controlado para referências inexistentes. A migration 022 impede que pedidos online sem pagamento confirmado avancem para preparo, retirada ou entrega. A migration 023 remove a RPC legada de telemetria de login que não possui consumidores no frontend. A migration 024 restringe privilégios padrão de funções novas e remove `EXECUTE` direto de funções privadas utilizadas exclusivamente como triggers.

As migrations `20260819003047_entrega_propria_hibrida_4_4_5.sql` e `20260819011044_index_empresa_entregadores_criado_por_4_4_5.sql` adicionam modalidade de entrega por unidade, vínculos de entregadores próprios, origem das ofertas, fallback híbrido, atribuição direta protegida e o índice de cobertura da chave `criado_por`. Aplique-as somente após confirmar que não há entregador associado a mais de uma corrida ativa; o índice parcial da primeira migration passa a garantir essa regra no banco.

A migration `20260821213807_remove_historico_public_policy.sql` remove a leitura pública irrestrita de `historico_status_pedido`, revoga privilégios do papel `anon` e preserva somente a leitura autenticada submetida às políticas RLS. Ela foi aplicada e validada no projeto hospedado em 21/08/2026.

### Backup e restauração

O plano Free não apresentou backups físicos disponíveis e está com PITR desativado na consulta de 21/08/2026. Use `npm run backup:supabase` com `SUPABASE_DB_PASSWORD` definido somente no ambiente para gerar `roles.sql`, `schema.sql` e `data.sql` em `backups/`, diretório ignorado pelo Git.

Teste a restauração exclusivamente em um projeto Supabase temporário e vazio, na ordem `roles.sql` → `schema.sql` → `data.sql`. Registre contagens e smoke tests antes de excluir o projeto temporário. Nunca use o banco de produção como destino do ensaio.

## 3. Edge Functions

Funções obrigatórias para pagamento online:

- `criar-pagamento`;
- `mercado-pago-webhook`;
- `processar-reembolso`.

`enviar-push` é opcional. Configure segredos somente no ambiente de funções; nunca no frontend.

Enquanto o sandbox não estiver completamente aprovado, mantenha `pagamentoOnlineAtivo: false` em `js/core/config.js`. Ative a opção somente depois de confirmar os segredos, a compatibilidade do token com o ambiente e os fluxos de pagamento, webhook e reembolso.

## 4. Testes obrigatórios de sandbox

1. Pagamento aprovado normalmente.
2. Webhook repetido.
3. Webhooks fora de ordem.
4. Cancelamento antes da confirmação do pagamento.
5. Pagamento aprovado após cancelamento.
6. Reembolso repetido.
7. Valor ou moeda divergente.
8. Duas compras concorrentes da última unidade.
9. Alteração de preço e de variação durante o checkout.
10. Duplo clique ou reenvio do mesmo checkout, confirmando um único pedido.
11. Pedido recebido → preparo → pronto → aceite do entregador → entrega.
12. Restaurante tentando concluir entrega já atribuída a entregador.
13. Cliente, restaurante, entregador e administrador tentando acessar dados de outro papel.
14. Modo próprio ofertando somente para entregadores vinculados à unidade.
15. Modo híbrido liberando a plataforma somente após o prazo configurado.
16. Troca de modalidade encerrando ofertas antigas e redistribuindo pela regra nova.
17. Duas atribuições simultâneas para o mesmo entregador, confirmando apenas uma corrida ativa.

Registre evidências e resultados antes de usar credenciais reais.

## 5. Autenticação

- mantenha **Confirm email** desativado somente enquanto o cadastro imediato for a decisão vigente;
- mantenha senha mínima de 8 caracteres no backend e a política local de letra + número no frontend;
- ative proteção contra senhas vazadas quando o projeto estiver em plano Pro ou superior; no plano Free trate a ausência como risco residual documentado;
- ajuste os rate limits dos endpoints de Auth suportados e monitore respostas HTTP 429;
- use `npm run configure:auth:rate-limits -- --check` para consultar e `--apply` somente com valores revisados; o CAPTCHA permanece desativado por decisão de produto;
- configure URLs exatas de produção;
- preserve confirmação segura para troca de e-mail;
- mantenha recuperação de senha por e-mail operacional.

## 6. Hospedagem

A produção está publicada no Vercel em `https://site-delivery-42.vercel.app`. O deploy `dpl_vnqtihqw8DQrSgF4c5SejAy8MnvM` foi validado em 21/08/2026. O GitHub Pages pode permanecer como canal secundário, mas o domínio Vercel é a referência operacional por suportar os cabeçalhos HTTP configurados em `vercel.json`.

Confirme por inspeção HTTP real:

- Content-Security-Policy;
- Strict-Transport-Security;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- proteção contra framing;
- cache correto do service worker 4.4.5.

## 7. Observabilidade

Configure alertas para:

- erros das Edge Functions;
- pagamentos divergentes;
- reembolsos em `falhou`;
- pedidos em preparo atrasados;
- crescimento anormal de cadastros;
- indisponibilidade do site e do backend;
- produtos com estoque negativo ou divergente.

## 8. Aprovação final

- [x] 47 migrations locais confirmadas no projeto hospedado em 21/08/2026;
- [x] 149 testes automatizados aprovados em 21/08/2026;
- [x] 4 Edge Functions publicadas e ativas (`criar-pagamento`, `mercado-pago-webhook`, `processar-reembolso`, `enviar-push`);
- [ ] segredos Mercado Pago ausentes no ambiente em 21/08/2026; configurar credenciais sandbox antes dos testes;
- [ ] webhook validado no sandbox;
- [ ] fluxo completo da cozinha e entrega testado;
- [x] RLS validada por papel, incluindo entregador sintético isolado em transação reversível;
- [ ] backup e restauração testados;
- [ ] proteção contra senhas vazadas ativada (Pro+) ou risco formalmente aceito enquanto permanecer no Free;
- [ ] URLs Auth aplicadas e rate limits confirmados; falta restaurar MFA TOTP/OTP de 8 dígitos e monitorar HTTP 429;
- [x] cabeçalhos confirmados no domínio Vercel com `npm run verify:production`;
- [ ] política de privacidade revisada;
- [ ] responsáveis operacionais definidos.

## 9. Auditoria técnica — atualizada em 21/08/2026

Validações executadas no ambiente hospedado e no commit de produção:

- o workflow de publicação da `main` executou `npm ci` e `npm run verify` antes do deploy e concluiu com sucesso;
- Security Advisor e Performance Advisor foram executados no projeto Supabase;
- nenhuma tabela do schema `public` foi encontrada com RLS desativada na auditoria de metadados;
- `private.criar_pedido_impl(text,text,text,text,text,jsonb)` não é executável diretamente pelos papéis `anon` nem `authenticated`;
- as 47 migrations locais estão registradas no histórico do projeto hospedado;
- `criar-pagamento`, `mercado-pago-webhook`, `processar-reembolso` e `enviar-push` estão publicadas e ativas;
- o webhook do Mercado Pago valida assinatura HMAC, consulta o pagamento diretamente no provedor e usa chave de deduplicação antes da conciliação;
- `pagamentoOnlineAtivo` permanece `false` até a conclusão dos testes de sandbox;
- as migrations 4.3 e 4.4.5 de equipe, multiunidade, planos, distância, ganhos, distribuição e entrega própria/híbrida foram aplicadas;
- privilégios padrão de funções novas no schema `public`, quando criadas pelo papel `postgres`, agora exigem concessão explícita para `anon`, `authenticated` e `service_role`;
- `private.normalizar_autor_mensagem()`, `private.notificar_evento_pedido()` e `private.notificar_mensagem_pedido()` permanecem vinculadas aos respectivos triggers, mas não são mais executáveis diretamente por papéis da API;
- a organização Supabase está atualmente no plano Free; a proteção HIBP não é disponibilizada nesse plano;
- `scripts/configurar-auth-sem-confirmacao.sh` foi ajustado para aplicar a configuração básica primeiro e ativar HIBP separadamente apenas quando `ENABLE_HIBP=true`.

Validação de RLS por impersonação do papel `authenticated` com JWT controlado:

- cliente: vê apenas o próprio perfil e zero pedidos de terceiros;
- restaurante: vê 8 pedidos, todos vinculados à própria empresa, e zero pedidos de outra empresa;
- administrador: `private.is_admin()` retorna verdadeiro e a conta vê o conjunto administrativo esperado;
- entregador: um usuário sintético sem perfil de cliente/admin foi criado dentro de transação, associado somente como entregador e testado com JWT controlado. As 8 asserções de identidade, perfil, pedido atribuído, itens, oferta, histórico e bloqueio anônimo passaram; a transação terminou em `ROLLBACK`, sem persistir dados artificiais. O teste reproduzível está em `supabase/tests/production/rls_entregador_isolado.sql`.

Revisão das RPCs `SECURITY DEFINER`:

- as duas RPCs anônimas (`calcular_entrega_empresa` e `empresa_disponibilidade`) são endpoints públicos intencionais de cálculo/disponibilidade e delegam para helpers no schema privado;
- as RPCs administrativas inspecionadas validam `private.is_admin()` antes de acessar ou alterar dados privilegiados;
- as RPCs de cliente, restaurante e entregador inspecionadas vinculam a operação a `auth.uid()` e/ou à propriedade/atribuição do pedido;
- os avisos do Security Advisor permanecem porque funções `SECURITY DEFINER` intencionalmente expostas continuam sendo reportadas pelo linter; não deve ser feita revogação em massa sem substituir a arquitetura de autorização.
- o Security Advisor reporta 75 itens (73 warnings), incluindo `pg_net` no schema `public`, HIBP desativado e RPCs expostas intencionalmente;
- o Performance Advisor reporta 46 itens: 8 foreign keys sem índice de cobertura, 16 grupos de políticas permissivas duplicadas e 22 índices ainda sem uso no volume atual. A remoção de `historico_public` reduziu os grupos duplicados de 17 para 16.

Pendências que impedem aprovação final:

- a proteção contra senhas vazadas permanece indisponível enquanto a organização estiver no plano Free;
- os testes de sandbox de pagamento, reembolso, concorrência e ordem de webhooks ainda precisam de evidências operacionais;
- a triagem e documentação da allowlist dos advisors Supabase ainda precisa ser concluída;
- backup/restauração, aplicação/monitoramento dos rate limits, privacidade e responsáveis operacionais continuam pendentes;
- os cabeçalhos e as rotas críticas do domínio Vercel foram validados automaticamente em 21/08/2026.
