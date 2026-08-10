# Publicação segura — Multi Delivery 4.2.0

## 1. Gate de release

```bash
npm ci
npm run verify
npm run package
```

O release somente pode avançar com todos os comandos aprovados. O empacotamento exclui `.git`, `node_modules`, releases anteriores e ZIPs antigos.

## 2. Banco de dados

1. Gere backup e documente o procedimento de restauração.
2. Aplique as migrations pendentes em ordem: 014, 015 e 016.
3. Execute Security Advisor e Performance Advisor.
4. Confirme RLS nas tabelas públicas, inclusive `empresa_unidades`, `produto_variantes` e `estoque_movimentos`.
5. Teste RPCs com contas separadas de cliente, restaurante, entregador e administrador.
6. Valide que `private.criar_pedido_impl` não é executável diretamente por clientes.

A migration 016 adiciona variações, cozinha, idempotência do checkout, auditoria de estoque e a fundação multiunidade.

## 3. Edge Functions

Funções obrigatórias para pagamento online:

- `criar-pagamento`;
- `mercado-pago-webhook`;
- `processar-reembolso`.

`enviar-push` é opcional. Configure segredos somente no ambiente de funções; nunca no frontend.

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

- desative **Confirm email** somente se o cadastro imediato for decisão definitiva;
- ative proteção contra senhas vazadas;
- configure Cloudflare Turnstile ou hCaptcha;
- ajuste rate limits de cadastro, login e recuperação;
- configure URLs exatas de produção;
- preserve confirmação segura para troca de e-mail;
- mantenha recuperação de senha por e-mail operacional.

## 6. Hospedagem

Confirme por inspeção HTTP real:

- Content-Security-Policy;
- Strict-Transport-Security;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- proteção contra framing;
- cache correto do service worker 4.2.0.

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

- [ ] migrations 014, 015 e 016 aplicadas;
- [ ] 58 testes automatizados aprovados;
- [ ] Edge Functions publicadas e segredos configurados;
- [ ] webhook validado no sandbox;
- [ ] fluxo completo da cozinha e entrega testado;
- [ ] backup e restauração testados;
- [ ] CAPTCHA e rate limits configurados;
- [ ] cabeçalhos confirmados no domínio;
- [ ] política de privacidade revisada;
- [ ] responsáveis operacionais definidos.
