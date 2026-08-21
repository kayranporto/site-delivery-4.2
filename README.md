# Multi Delivery 4.4.5

Aplicação web integrada ao Supabase para marketplace de restaurantes, pedidos, cozinha, entregadores, suporte e pagamentos pelo Mercado Pago.

## Verificação local

Requer Node.js 20 ou superior.

```bash
npm ci
npm run verify
```

Os mesmos comandos funcionam em Linux, macOS, Prompt de Comando e PowerShell; a descoberta dos arquivos de teste é feita pelo próprio test runner do Node.js, sem depender de expansão de curingas pelo shell.

`npm run verify` cobre 241 arquivos, sintaxe JavaScript, JSON, referências locais, IDs HTML duplicados, exposição de segredos, migrations críticas, 143 testes automatizados e o type-check TypeScript das Edge Functions.

Para gerar o pacote de publicação depois da verificação:

```bash
npm run package
```

## Estrutura canônica

```text
assets/                 imagens locais
css/
  core/                 estilos compartilhados e fundação visual
  pages/                estilos específicos das páginas
  modules/              estilos de funcionalidades incrementais
docs/                   produto, operação, segurança e compliance
html/                   páginas da aplicação
js/
  core/                 infraestrutura e utilitários compartilhados
  pages/                controladores das páginas
  modules/              funcionalidades e extensões de domínio
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
- CSP em meta, política de referência, lockfile e CI;
- cadastro imediato sem confirmação obrigatória de e-mail;
- CAPTCHA opcional e política de senha centralizada;
- painel do restaurante por telas;
- exportação e solicitação de exclusão de dados.

## Operação 4.2 a 4.4.5

- fila de cozinha com pedidos recebidos, em preparo, prontos e atrasados;
- tempo estimado, início do preparo e horários reais de conclusão;
- ações operacionais transacionais no banco;
- tamanhos e variações de produtos com preço próprio;
- preço da variação validado novamente no checkout;
- chave idempotente contra pedido duplicado;
- entregadores visualizam somente pedidos marcados como prontos;
- histórico automático de movimentações de estoque;
- fundação de banco para múltiplas unidades;
- reconciliação do catálogo publicado e permissões de menor privilégio na migration 018;
- políticas RLS otimizadas e redundâncias removidas na migration 019;
- transições de pedido restritas a RPCs autenticadas na migration 020;
- referências externas de pagamento validadas antes do registro de eventos na migration 021;
- pedidos online pendentes bloqueados antes da cozinha e da entrega na migration 022;
- RPC legada de tentativas de login removida na migration 023;
- pagamento online desativado por padrão até a validação do gateway em sandbox;
- cache, PWA e assets unificados na versão 4.2.8;
- gestão multiunidade pública e operacional, com catálogo, horários, regiões e checkout por unidade;
- planos, assinaturas, limites e perfis internos com autorização fail-closed;
- frete por distância configurável e distribuição de entregas por proximidade;
- histórico e ganhos do entregador sem exposição indevida de dados do cliente;
- web push para ofertas de entrega e onboarding operacional do entregador;
- entrega própria, pela plataforma ou híbrida configurável por unidade;
- vínculo da equipe própria, prioridade automática e atribuição direta de pedidos prontos;
- trava transacional para impedir duas corridas ativas por entregador;
- cache PWA e gate de release alinhados na versão 4.4.5;
- 143 testes automatizados.

## Implantação

Leia, nesta ordem:

1. `docs/PRODUCAO.md`
2. `docs/AUTENTICACAO.md`
3. `supabase/README-SETUP.md`
4. `supabase/functions/README.md`
5. `docs/RUNBOOK-OPERACIONAL.md`
6. `docs/ROADMAP-PLATAFORMA.md`

A aplicação não deve receber pagamentos reais antes da confirmação das migrations 014 a 023 no projeto hospedado, da publicação das Edge Functions, da configuração dos segredos, da conclusão dos testes de sandbox descritos em `docs/PRODUCAO.md` e da ativação explícita de `pagamentoOnlineAtivo` em `js/core/config.js`.
