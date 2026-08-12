# Publicação segura — Multi Delivery 4.2.8

## 1. Gate de release

```bash
npm ci
npm run verify
npm run package
```

`npm run verify` executa a verificação estrutural, os 65 testes automatizados e o type-check TypeScript das Edge Functions. O empacotamento repete o gate antes de gerar o ZIP e exclui `.git`, `node_modules`, releases anteriores e arquivos ZIP antigos.

## 2. Banco de dados

1. Gere backup e documente o procedimento de restauração.
2. Confirme que as migrations 014 a 024 estão aplicadas, na ordem, no projeto hospedado.
3. Execute Security Advisor e Performance Advisor.
4. Confirme RLS nas tabelas públicas, inclusive `empresa_unidades`, `produto_variantes` e `estoque_movimentos`.
5. Teste RPCs com contas separadas de cliente, restaurante, entregador e administrador.
6. Valide que `private.criar_pedido_impl` não é executável diretamente por clientes.

A migration 016 adiciona variações, cozinha, idempotência do checkout, auditoria de estoque e a fundação multiunidade. A migration 018 reconcilia o catálogo publicado com o estado live e restringe as permissões do papel anônimo. A migration 019 elimina políticas redundantes e otimiza chamadas de identidade nas políticas RLS. A migration 020 remove atualizações diretas de estado em pedidos e exige RPCs autenticadas para pagamento presencial e cancelamento não pago. A migration 021 valida a referência do pedido antes de registrar eventos do Mercado Pago e devolve erro controlado para referências inexistentes. A migration 022 impede que pedidos online sem pagamento confirmado avancem para preparo, retirada ou entrega. A migration 023 remove a RPC legada de telemetria de login que não possui consumidores no frontend. A migration 024 restringe privilégios padrão de funções novas e remove `EXECUTE` direto de funções privadas utilizadas exclusivamente como triggers.

## 3. Edge Functions

Funções obrigatórias para pagamento online:

- `criar-pagamento`;
- `mercado-pago-webhook`;
- `processar-reembolso`.

`enviar-push` é opcional. Configure segredos somente no ambiente de funções; nunca no frontend.

Enquanto o sandbox não estiver completamente aprovado, mantenha `pagamentoOnlineAtivo: false` em `js/config.js`. Ative a opção somente depois de confirmar os segredos, a compatibilidade do token com o ambiente e os fluxos de pagamento, webhook e reembolso.

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

Registre evidências e resultados antes de usar credenciais reais.

## 5. Autenticação

- mantenha **Confirm email** desativado somente enquanto o cadastro imediato for a decisão vigente;
- mantenha senha mínima de 8 caracteres no backend e a política local de letra + número no frontend;
- ative proteção contra senhas vazadas quando o projeto estiver em plano Pro ou superior; no plano Free trate a ausência como risco residual documentado;
- configure Cloudflare Turnstile ou hCaptcha;
- ajuste rate limits de cadastro, login e recuperação;
- configure URLs exatas de produção;
- preserve confirmação segura para troca de e-mail;
- mantenha recuperação de senha por e-mail operacional.

## 6. Hospedagem

O GitHub Pages não permite configurar cabeçalhos HTTP personalizados. A CSP em meta e a política de referência continuam ativas, mas `X-Content-Type-Options`, `Permissions-Policy` e proteção contra framing exigem um domínio servido por proxy ou hospedagem que permita configurar cabeçalhos (por exemplo, Cloudflare ou Vercel). Esse é um risco residual enquanto o site permanecer somente no Pages.

Confirme por inspeção HTTP real:

- Content-Security-Policy;
- Strict-Transport-Security;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- proteção contra framing;
- cache correto do service worker 4.2.8.

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

- [ ] migrations 014 a 024 confirmadas no projeto hospedado;
- [x] 65 testes automatizados aprovados no commit de release;
- [ ] Edge Functions publicadas e segredos configurados;
- [ ] webhook validado no sandbox;
- [ ] fluxo completo da cozinha e entrega testado;
- [ ] RLS validada com contas de cada papel;
- [ ] backup e restauração testados;
- [ ] proteção contra senhas vazadas ativada (Pro+) ou risco formalmente aceito enquanto permanecer no Free;
- [ ] CAPTCHA e rate limits configurados;
- [ ] cabeçalhos confirmados no domínio;
- [ ] política de privacidade revisada;
- [ ] responsáveis operacionais definidos.

## 9. Auditoria técnica — 12/08/2026

Validações executadas no ambiente hospedado e no commit de produção:

- o workflow de publicação da `main` executou `npm ci` e `npm run verify` antes do deploy e concluiu com sucesso;
- Security Advisor e Performance Advisor foram executados no projeto Supabase;
- nenhuma tabela do schema `public` foi encontrada com RLS desativada na auditoria de metadados;
- `private.criar_pedido_impl(text,text,text,text,text,jsonb)` não é executável diretamente pelos papéis `anon` nem `authenticated`;
- `criar-pagamento`, `mercado-pago-webhook` e `processar-reembolso` estão publicadas e ativas;
- o webhook do Mercado Pago valida assinatura HMAC, consulta o pagamento diretamente no provedor e usa chave de deduplicação antes da conciliação;
- `pagamentoOnlineAtivo` permanece `false` até a conclusão dos testes de sandbox;
- a migration hospedada `20260812232054_restringe_execucao_funcoes_futuras_4_2_8` foi aplicada com sucesso;
- privilégios padrão de funções novas no schema `public`, quando criadas pelo papel `postgres`, agora exigem concessão explícita para `anon`, `authenticated` e `service_role`;
- `private.normalizar_autor_mensagem()`, `private.notificar_evento_pedido()` e `private.notificar_mensagem_pedido()` permanecem vinculadas aos respectivos triggers, mas não são mais executáveis diretamente por papéis da API;
- a organização Supabase está atualmente no plano Free; a proteção HIBP não é disponibilizada nesse plano;
- `scripts/configurar-auth-sem-confirmacao.sh` foi ajustado para aplicar a configuração básica primeiro e ativar HIBP separadamente apenas quando `ENABLE_HIBP=true`.

Revisão das RPCs `SECURITY DEFINER`:

- as duas RPCs anônimas (`calcular_entrega_empresa` e `empresa_disponibilidade`) são endpoints públicos intencionais de cálculo/disponibilidade e delegam para helpers no schema privado;
- as RPCs administrativas inspecionadas validam `private.is_admin()` antes de acessar ou alterar dados privilegiados;
- as RPCs de cliente, restaurante e entregador inspecionadas vinculam a operação a `auth.uid()` e/ou à propriedade/atribuição do pedido;
- os avisos do Security Advisor permanecem porque funções `SECURITY DEFINER` intencionalmente expostas continuam sendo reportadas pelo linter; não deve ser feita revogação em massa sem substituir a arquitetura de autorização.

Pendências que impedem aprovação final:

- a proteção contra senhas vazadas permanece indisponível enquanto a organização estiver no plano Free;
- os testes de sandbox de pagamento, reembolso, concorrência e ordem de webhooks ainda precisam de evidências operacionais;
- a validação de RLS ainda precisa ser concluída com contas reais separadas de cliente, restaurante, entregador e administrador;
- o histórico de migrations do projeto hospedado usa timestamps e nomes de implantação que não correspondem literalmente à numeração 014–023; a equivalência deve ser documentada antes de marcar esse item como concluído;
- backup/restauração, CAPTCHA/rate limits, cabeçalhos do domínio, privacidade e responsáveis operacionais continuam pendentes.
