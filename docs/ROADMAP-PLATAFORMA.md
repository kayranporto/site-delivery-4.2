# Roadmap da plataforma Multi Delivery

**Versão de referência:** 4.4.5
**Atualizado em:** 20/08/2026

## 4.2 — Operação e catálogo — **ENTREGUE**

Entregue neste pacote:

- cozinha e SLA;
- variações de produto;
- idempotência do checkout;
- auditoria de estoque;
- fluxo de entrega após pedido pronto;
- fundação multiunidade.

## 4.3 — Plataforma comercial — **PARCIALMENTE ENTREGUE**

Entregue até 4.4.5:

- gestão de unidades no painel;
- cardápio, estoque, horários e regiões por unidade;
- checkout e operação por unidade;
- planos, período de teste e limites por assinatura;
- perfis de gerente, cozinha, atendente e financeiro, com autorização no banco.

Pendente:

- cobrança recorrente dos planos;
- comissão por restaurante e por unidade;
- extrato, repasses e fechamento;
- domínio, tema e identidade white-label por loja;
- aprovação documental estruturada de restaurantes.

## 4.4 — Logística e comunicação — **PARCIALMENTE ENTREGUE (ATUAL 4.4.5)**

Entregue até 4.4.5:

- coordenadas opcionais de unidade, cliente e entregador;
- frete por distância Haversine, com taxa-base, valor por km, raio e fallback por bairro;
- ofertas automáticas por proximidade, expansão de raio e aceite concorrente;
- web push para ofertas;
- histórico e ganhos do entregador com snapshot da tarifa;
- entrega própria, pela plataforma ou híbrida por unidade;
- vínculo de equipe própria e atribuição direta pelo restaurante;
- rastreamento durante a entrega e central de mensagens vinculada ao pedido;
- atalhos manuais de contato via WhatsApp.

Pendente:

- geocodificação e cálculo de rota viária;
- atribuição direta totalmente automática e agrupamento de corridas;
- política formal de consentimento e retenção limitada da localização;
- prova de entrega por código ou foto;
- fechamento, liquidação e repasse do entregador;
- e-mail transacional e WhatsApp Business API.

## 4.5 — Crescimento e fidelidade

- combos e ficha técnica de ingredientes;
- campanhas segmentadas;
- cashback e carteira de benefícios;
- indicação de clientes;
- recuperação de carrinho;
- recomendação de produtos;
- regras antifraude para cupons;
- analytics de conversão, retenção e churn.

## 5.0 — Escala

- frontend componentizado e migrado progressivamente para TypeScript;
- ambiente de homologação e previews por pull request;
- testes E2E e carga contínuos;
- filas assíncronas para eventos críticos;
- observabilidade centralizada;
- políticas de retenção e anonimização automatizadas;
- arquitetura preparada para alto volume e múltiplas cidades.

Cada etapa deve passar por migration revisada, testes automatizados, sandbox e aprovação operacional antes da próxima.

## Gate transversal de produção

Antes de ativar pagamentos reais ou ampliar volume:

- concluir os 17 cenários de sandbox de `PRODUCAO.md`;
- validar RLS com identidades isoladas de todos os papéis;
- configurar e monitorar rate limits; CAPTCHA permanece fora do escopo atual;
- testar backup/restauração;
- confirmar cabeçalhos no domínio final;
- revisar a política de privacidade;
- triagem formal dos advisors Supabase (`pg_net`, índices de FKs, políticas redundantes e RPCs públicas intencionais).
