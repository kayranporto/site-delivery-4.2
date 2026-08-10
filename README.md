# Multi Delivery 4.2.0

Aplicação web integrada ao Supabase para marketplace de restaurantes, pedidos, cozinha, entregadores, suporte e pagamentos pelo Mercado Pago.

## Verificação local

Requer Node.js 20 ou superior.

```bash
npm ci
npm run verify
```

A verificação atual cobre 166 arquivos, sintaxe JavaScript, JSON, referências locais, IDs HTML duplicados, exposição de segredos, migrations críticas e 58 testes automatizados.

## Estrutura canônica

```text
assets/                 imagens locais
css/                    estilos
js/                     frontend
supabase/migrations/    banco, RLS, RPCs e triggers
supabase/functions/     Edge Functions
scripts/                verificação e empacotamento
tests/                  testes automatizados
```

O diretório testado deve ser exatamente o diretório publicado. Não mantenha cópias paralelas do frontend.

## Base estabilizada

- pagamentos e reembolsos idempotentes;
- reconciliação de valor, moeda e identificadores do Mercado Pago;
- snapshot transacional de preços e adicionais;
- tratamento de pagamento aprovado depois do cancelamento;
- CSP, cabeçalhos de segurança, lockfile e CI;
- cadastro imediato sem confirmação obrigatória de e-mail;
- CAPTCHA opcional e política de senha centralizada;
- painel do restaurante por telas;
- exportação e solicitação de exclusão de dados.

## Novidades da versão 4.2

- fila de cozinha com pedidos recebidos, em preparo, prontos e atrasados;
- tempo estimado, início do preparo e horários reais de conclusão;
- ações operacionais transacionais no banco;
- tamanhos e variações de produtos com preço próprio;
- preço da variação validado novamente no checkout;
- chave idempotente contra pedido duplicado;
- entregadores visualizam somente pedidos marcados como prontos;
- histórico automático de movimentações de estoque;
- fundação de banco para múltiplas unidades;
- cache e assets atualizados para 4.2.0;
- 58 testes automatizados.

## Implantação

Leia, nesta ordem:

1. `PRODUCAO.md`
2. `AUTENTICACAO.md`
3. `supabase/README-SETUP.md`
4. `supabase/functions/README.md`
5. `RUNBOOK-OPERACIONAL.md`
6. `ROADMAP-PLATAFORMA.md`

A aplicação não deve receber pagamentos reais antes da aplicação das migrations 014, 015 e 016, publicação das Edge Functions e conclusão dos testes de sandbox.
