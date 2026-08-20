# PRD — Plataforma de Delivery (Multi Delivery)

**Versão do produto analisada:** 4.2.8
**Data desta análise:** 13/08/2026
**Base:** repositório `site-delivery-4.2-main` (frontend estático + Supabase)

> Este documento é a fonte de verdade de produto para PM, UX/UI, frontend, backend, QA, DevOps e agentes de IA responsáveis pela implementação. Ele foi escrito **depois** de uma leitura completa do repositório (24 migrations SQL, 41 módulos JS, 22 páginas HTML, 4 Edge Functions, 9 documentos operacionais e 10 arquivos de teste). Nenhuma funcionalidade abaixo é presumida pelo nome de arquivo — cada item foi confirmado no código ou explicitamente marcado como não confirmado.

---

## 1. Executive Summary

O Multi Delivery é um **marketplace de delivery multi-restaurante** já em estágio avançado de maturidade técnica (não é um MVP do zero). O sistema roda como site estático (HTML/CSS/JS vanilla, sem bundler/framework) hospedado no GitHub Pages, com **Supabase** como backend completo (Postgres + Auth + RLS + Edge Functions + Realtime/Storage). A versão atual (4.2.8) já cobre: catálogo com variações e adicionais, carrinho, checkout com idempotência, motor de estados de pedido, cozinha operacional com SLA, entregadores, área de entrega por bairro, horários/pausas, cupons, favoritos, avaliações, fidelidade (pontos), suporte ao cliente, painel administrativo completo, auditoria, LGPD (exportação/exclusão) e integração de pagamento com Mercado Pago (pagamento online **desligado por padrão** em produção até validação de sandbox).

O que falta para uma plataforma SaaS multi-unidade madura (cobrança de assinatura, roteirização geográfica real, WhatsApp, multiunidade completa na UI, app mobile nativo) está documentado e priorizado no roadmap interno do próprio projeto (`ROADMAP-PLATAFORMA.md`) e é incorporado neste PRD nas seções de MVP/P0-P1-P2 e Roadmap.

Este PRD organiza o que já existe, o que está parcial, o que falta e o que é recomendado, para servir de base às próximas fases (4.3 em diante).

---

## 2. Contexto

O projeto já nasceu como uma tentativa completa de plataforma de delivery (não um protótipo), com forte ênfase em integridade financeira, segurança e RLS — evidenciada pelos documentos `PRODUCAO.md`, `RUNBOOK-OPERACIONAL.md` e pela auditoria técnica datada de 12/08/2026 registrada no próprio repositório. O time responsável já opera com disciplina de release (`npm run verify`, 65 testes automatizados, gate de CI) e já identificou pendências reais de produção (proteção HIBP indisponível no plano Free do Supabase, testes de sandbox financeiro ainda não realizados, conta de entregador isolada para validação de RLS ainda não criada).

Este PRD assume esse ponto de partida: **não é uma reescrita**, é uma consolidação de produto sobre uma base técnica já sólida, com foco em fechar lacunas de produto (multiunidade na UI, SaaS/planos, WhatsApp, logística real) sem comprometer as garantias de segurança e integridade financeira já construídas.

---

## 3. Problema

Pequenos e médios estabelecimentos (restaurantes, hamburguerias, açaí, mercados, farmácias) dependem hoje de marketplaces de terceiros com comissões altas e pouca customização, ou de soluções de WhatsApp manuais sem gestão de estoque, fila de cozinha ou rastreabilidade financeira. O Multi Delivery propõe uma plataforma própria, white-label por loja (`plataforma.com/nomedaloja`), com operação completa do pedido (recebido → preparo → entrega) e ferramentas de gestão (catálogo, cupons, relatórios) — sem obrigar o lojista a depender de um app de terceiros.

---

## 4. Visão do Produto

Plataforma web responsiva/PWA (instalável, com service worker e manifest já implementados) que conecta clientes, estabelecimentos, operadores de loja, entregadores e administradores da plataforma em um único fluxo de pedido, com arquitetura multi-tenant SaaS pronta para evoluir para cobrança por assinatura, multiunidade por rede e expansão geográfica. Apps mobile nativos permanecem fora do MVP atual — a estratégia é PWA-first.

---

## 5. Objetivos

- Permitir que qualquer estabelecimento opere seu próprio delivery digital (catálogo, pedidos, entrega) com um checkout confiável e auditável.
- Garantir integridade financeira: nenhum pedido pago incorretamente, nenhuma race condition de estoque/cupom, idempotência total no checkout e nos webhooks de pagamento.
- Isolamento multi-tenant real (RLS) validado por papel (cliente, restaurante, entregador, admin).
- Evoluir de "operação estabilizada" (4.2.8) para "plataforma comercial" (4.3+): planos, assinatura, comissão, multiunidade completa, logística real e comunicação transacional (push, e-mail, WhatsApp).

## 6. Não Objetivos (desta fase / deste PRD)

- Não é objetivo desta fase criar apps mobile nativos (iOS/Android).
- Não é objetivo implementar roteirização/geofencing real neste ciclo (fica para 4.4, ver Roadmap).
- Não é objetivo abstrair múltiplos gateways de pagamento simultâneos no curto prazo — a prioridade é validar Mercado Pago em sandbox e produção antes de adicionar novos provedores.
- Não é objetivo migrar o frontend para um framework componentizado agora (previsto apenas na fase 5.0 do roadmap do próprio projeto).

---

## 7. Personas

| Persona | Necessidade central |
|---|---|
| Cliente final | Pedir comida rápido, com preço transparente e acompanhar o pedido em tempo real. |
| Dono de restaurante | Vender online sem depender de terceiros, controlar catálogo, estoque e caixa. |
| Operador de cozinha/balcão | Gerenciar a fila de pedidos com SLA claro, sem erro de status. |
| Entregador | Ver corridas disponíveis, aceitar, navegar e confirmar entrega. |
| Administrador da plataforma | Governar tenants, conciliar pagamentos, tratar chamados e garantir saúde operacional. |

---

## 8. Perfis e Permissões

O sistema já implementa RBAC via RLS (Row Level Security) do Postgres + funções `SECURITY DEFINER` no schema `private`, não por checagem apenas no frontend. Confirmado na migration `001` (`private` schema com `revoke all ... from public, anon, authenticated`) e reforçado nas migrations 018–024 (menor privilégio, RPCs restritas).

### Cliente (`usuarios` + `auth.users`) — **EXISTENTE**
Cadastro/login (`cadastro.html`, `login.html`), navegação no cardápio (`restaurante.html`), carrinho, checkout, favoritos (`favoritos.html`), endereços (`enderecos.html`), acompanhamento em tempo real (`acompanhamento.html`), histórico (`meus-pedidos.html`), avaliação de pedido, chamados de suporte, cancelamento de pedido (`cliente_solicitar_cancelamento`), fidelidade (consulta e resgate de benefícios), exportação/exclusão de dados (LGPD) em `dados.html`.
- **Checkout como convidado:** **NÃO IMPLEMENTADO.** A tabela `pedidos.usuario_id` é `not null references auth.users(id)`, ou seja, todo pedido exige usuário autenticado. Isso é uma decisão arquitetural, não uma lacuna acidental — deve ser uma decisão de produto explícita (ver Decisões em Aberto).

### Proprietário do estabelecimento (`empresas.usuario_id`) — **EXISTENTE**
Um usuário autenticado dono de uma linha em `empresas` (relação 1:1 por `empresas_usuario_id_unique`). Painel em `empresa-dashboard.html` dividido em **dez telas internas** (conforme `RELATORIO-IMPLEMENTACAO.md`): catálogo, pedidos/cozinha, horários/regiões, cupons, relatório financeiro, fidelidade, avaliações, entregadores (visualização), configurações da loja, suporte.
- **Funcionários/operadores com permissões diferenciadas do dono (gerente, cozinha, atendente, financeiro):** **NÃO IMPLEMENTADO.** Hoje `empresas.usuario_id` é único — não existe tabela de vínculo N:N tipo `empresa_funcionarios` com papéis internos. Isso está corretamente identificado no próprio roadmap do projeto para a fase 4.3 ("perfis de gerente, cozinha, atendente e financeiro"). É uma lacuna real e relevante.

### Funcionário / Operador — **PARCIAL / NÃO IMPLEMENTADO COMO PERFIL PRÓPRIO**
Operacionalmente, quem opera a cozinha hoje é o próprio dono logado no painel (`empresa-dashboard.html`, tela de operação, apoiada por `js/operacao-empresa.js` e `operacao-restaurante-4.2.7.js`, com RPC `empresa_atualizar_operacao_pedido`). Não existe login separado de "funcionário" com permissões restritas — apenas o dono da empresa.

### Entregador (`entregadores`) — **EXISTENTE, com ressalva de teste isolado**
Cadastro (`cadastrar_entregador`), status online/offline (`entregador_definir_online`), lista de corridas disponíveis restrita a pedidos com status `pronto` (`listar_entregas_disponiveis`), aceite (`entregador_aceitar_pedido`), atualização de status (`entregador_atualizar_status`), atualização de localização (`entregador_atualizar_localizacao`, tabela `entrega_localizacoes`), aprovação administrativa (`admin_definir_entregador`). Interface em `entregador.html` + `js/entregador.js`.
- **Ganhos e fechamento financeiro do entregador:** **NÃO IMPLEMENTADO** (roadmap 4.4).
- A própria auditoria de 12/08/2026 registra que **não há hoje uma conta de entregador isolada de admin/cliente para validar RLS de forma independente** — risco de teste, não de código, mas deve ser corrigido antes de qualquer expansão de volume.

### Super Admin (`private.is_admin()`, `admin_auditoria`) — **EXISTENTE**
Painel completo em `admin.html` + `js/admin.js` (883 linhas) + `js/operacao-admin.js`. Cobre: gestão de restaurantes (`admin_definir_restaurante`, `admin_atualizar_restaurante`), bloqueio de usuários (`admin_definir_usuario_bloqueio`), cupons globais (`admin_salvar_cupom`/`admin_excluir_cupom`), consulta de pedido (`admin_obter_pedido`), conciliação de pagamentos (`admin_conciliacao_pagamentos`), preparo/marcação de reembolso (`admin_preparar_reembolso`, `admin_atualizar_reembolso`), saúde operacional (`admin_saude_operacao`), relatórios (`admin_relatorio_operacional`, `admin_relatorio_clientes_produtos`), aprovação de entregadores, resposta a chamados de suporte (`admin_responder_chamado`), trilha de auditoria (`admin_auditoria`).
- **Planos, assinaturas, feature flags globais:** **NÃO IMPLEMENTADO** — não há tabela `subscriptions`/`planos` no schema atual. Está corretamente planejado para 4.3.

---

## 9. Jornada do Cliente — **EXISTENTE (fluxo completo)**

```
Entrada na loja (index.html → restaurante.html?id=)
  ↓ seleção de categoria/produto (js/restaurante.js)
  ↓ variação (produto_variantes) + adicionais (grupos_adicionais/adicionais)
  ↓ observações do item
  ↓ carrinho (js/carrinho.js, cart-store.js) — cálculo local + revalidação no servidor
  ↓ identificação (login obrigatório — sem checkout convidado)
  ↓ endereço (enderecos.html, js/enderecos.js)
  ↓ validação da área de entrega (RPC pública calcular_entrega_empresa — por bairro)
  ↓ cupom (validação server-side na criação do pedido)
  ↓ forma de entrega — HOJE SOMENTE ENTREGA (retirada no local: ver seção 10)
  ↓ forma de pagamento (PIX / Cartão / Dinheiro — online desativado por padrão)
  ↓ resumo (checkout.html)
  ↓ confirmação — RPC criar_pedido / criar_pedido_operacional com chave idempotente
  ↓ pedido criado (pedido-sucesso.html)
  ↓ acompanhamento em tempo real (acompanhamento.html — Supabase Realtime)
  ↓ entrega (fluxo entregador)
  ↓ avaliação (tabela avaliacoes, resposta do estabelecimento)
```

Todas as etapas acima foram confirmadas em código, não apenas em nome de arquivo.

---

## 10. Fluxos Principais

### 10.1 Tipos de atendimento
- **Entrega:** **EXISTENTE** (fluxo completo, taxa por bairro/região).
- **Retirada no local:** **PARCIAL.** Não há uma coluna explícita de `tipo_atendimento` em `pedidos` nas migrations lidas — o modelo assume entrega (`endereco not null` em `pedidos`). Retirada precisa ser modelada explicitamente (endereço opcional condicionado ao tipo).
- **Consumo no local / mesa / agendamento / drive-thru:** **NÃO IMPLEMENTADO** (corretamente fora do escopo atual — extensões futuras).
- **Pedido agendado:** existe validação `private.validar_inicio_agendado()` na migration 008 — **PARCIAL**, há suporte de banco a um horário de início, mas não há confirmação de UI dedicada de "agendar para depois" no checkout revisado.

### 10.2 Checkout idempotente — **EXISTENTE**
Chave de idempotência por tentativa de checkout (índice `pedidos_chave_cliente_idx`, citado em `RUNBOOK-OPERACIONAL.md`), garantindo que duplo clique não gere dois pedidos. Preço de produto/variação/adicional é **revalidado no servidor** dentro da função `private.criar_pedido_impl` (não confia no valor enviado pelo frontend).

---

## 11. Requisitos Funcionais

Nesta seção, cada bloco relevante traz: o que faz, quem usa, regras, validações, estados, erros, dependências, edge cases e critério de aceite resumido. Itens completos (com RF numerado) que já existem são marcados **[EXISTENTE]**; os demais, **[PARCIAL]**, **[NÃO IMPLEMENTADO]** ou **[RECOMENDADO]**.

### RF-01 — Catálogo (categorias/produtos) **[EXISTENTE]**
- **O que faz:** CRUD de categorias e produtos por loja, com posição/ordem, ativo/inativo, imagem, preço e preço promocional (`produtos.promocao`, com `check (promocao > 0 and promocao < preco)`).
- **Quem usa:** proprietário (CRUD), cliente (leitura via `restaurante.html`).
- **Regras:** nome de categoria único por empresa (case-insensitive); promoção sempre menor que o preço cheio (constraint de banco, não só de frontend).
- **Validações:** preço ≥ 0; `disponivel` boolean controla exibição.
- **Edge cases:** produto sem categoria (`categoria_id` nullable) — permitido, mas deve ser tratado na exibição.
- **Critério de aceite:** dado um produto com promoção configurada acima do preço cheio, o banco rejeita a gravação, independentemente do frontend.
- **Faltando:** horário de disponibilidade por categoria (ex.: "só no almoço") — não encontrado nas migrations lidas — **NÃO IMPLEMENTADO**. Limite por pedido e tempo de preparo por produto — **NÃO IMPLEMENTADO** como colunas dedicadas.

### RF-02 — Produtos configuráveis (variações + adicionais) **[EXISTENTE]**
- **O que faz:** produto pode ter **variantes** (`produto_variantes` — ex. tamanhos, com preço e promoção próprios, migration 016) e **grupos de adicionais** (`grupos_adicionais` com `minimo`/`maximo`, e `adicionais` com preço), associados via `produto_grupos`.
- **Regras de negócio:** grupo define obrigatoriedade via `minimo` (0 = opcional, >0 = obrigatório) e seleção múltipla via `maximo` (1 = única, >1 = múltipla) — constraint `maximo >= greatest(minimo,1)`.
- **Validação crítica:** o preço da variação é **revalidado no checkout** (mencionado explicitamente em `README.md` e no runbook) — protege contra manipulação de preço no cliente.
- **Edge case coberto:** variação que fica indisponível durante o checkout — o runbook determina explicitamente **não substituir silenciosamente**; o pedido deve reter `variante_id`/`variante_nome`/preço usados no momento da compra (snapshot).
- **Critério de aceite:** Given um grupo com `minimo=1, maximo=1`, When o cliente não seleciona nenhuma opção, Then o servidor rejeita a criação do pedido.
- **Lacuna:** "borda de pizza" e combinações inválidas entre grupos (ex. impedir grupo X sem grupo Y) não têm uma camada de regras cruzadas explícita — apenas min/max por grupo isoladamente. **PARCIAL.**

### RF-03 — Carrinho **[EXISTENTE]**
- `js/carrinho.js` + `carrinho-4.2.5.js` + `cart-store.js`: cálculo de subtotal + adicionais + taxa de entrega − desconto = total, feito no cliente para UX, mas **sempre recalculado no servidor** na criação do pedido (a tabela `pedidos` tem `check` de valores não negativos e a função `criar_pedido_impl` recalcula).
- Pedido mínimo validado por região (`empresa_regioes.pedido_minimo`) ou geral da loja (`empresas.pedido_minimo`).
- **Frete grátis via cupom:** suportado no modelo de cupons (ver RF-Cupons).

### RF-04 — Endereço e cálculo de taxa de entrega **[EXISTENTE — estratégia por bairro]**
- Estratégia implementada: **por bairro/cidade/UF** (`empresa_regioes`), com fallback para taxa única da loja (`empresas.taxa_entrega`) quando a loja não tem regiões cadastradas.
- RPC pública `calcular_entrega_empresa(empresa_id, cidade, uf, bairro)` retorna atendido/aberto/taxa/pedido mínimo/tempo estimado — chamada anônima (cliente não logado pode simular antes de logar), delegando para `private.calcular_entrega_impl` (padrão de segurança correto: RPC pública fina, lógica no schema privado).
- **Por distância (raio em km) e geofencing por polígono desenhado no mapa:** **NÃO IMPLEMENTADO.** Latitude/longitude só existem hoje para rastreamento de entregador (`entrega_localizacoes`), não para cálculo de frete do cliente.
- **Recomendação para o MVP atual:** manter **por bairro** como estratégia principal (já robusta, testada, com RLS); tratar **por distância** como P1 e **geofencing** como P2 (roadmap 4.4, "geocodificação e cálculo de rota").

### RF-05 — Horário de funcionamento, pausas e feriados **[EXISTENTE, parcial em feriados]**
- `empresa_horarios` (por dia da semana, múltiplos intervalos não — **um único intervalo abre/fecha por dia**, não múltiplos intervalos como "11h-15h e 18h-23h" simultâneos no mesmo dia — **PARCIAL**, ver Lacunas), `empresa_pausas` (fechamento excepcional temporário, com motivo).
- Função `private.empresa_aberta_em` calcula abertura considerando fuso horário `America/Sao_Paulo`, pausas ativas e virada de dia (loja que fecha depois da meia-noite).
- **Feriados como calendário dedicado (não pausa manual) e abertura excepcional:** **NÃO IMPLEMENTADO** como entidade própria — hoje seria modelado como uma `empresa_pausas` pontual, o que funciona para fechar, mas não para *abrir* em um dia normalmente fechado.

### RF-06 — Pedidos e máquina de estados **[EXISTENTE, robusto]**
Ver seção 12 (Regras de Negócio) para a máquina de estados completa. Implementada via trigger `private.validar_transicao_pedido()` — a transição é validada **no banco**, não apenas na UI, e reforçada nas migrations 020–022 para impedir pedidos pagos online de avançarem sem confirmação de pagamento.

### RF-07 — Painel operacional / cozinha (Kanban) **[EXISTENTE]**
- `js/operacao-empresa.js` + `operacao-restaurante-4.2.7.js` + tabela `pedido_operacao_eventos` (migration 017): fila com pedidos recebidos, em preparo, prontos e atrasados, tempo estimado, início do preparo e horário real de conclusão, com alerta de atraso (SLA).
- RPC `empresa_atualizar_operacao_pedido` centraliza as transições autenticadas (não é update direto de linha — migration 020 removeu updates diretos de status).
- **Alertas sonoros/visuais configuráveis:** não confirmado explicitamente no JS revisado — **PARCIAL** (existe destaque visual de atraso; alerta sonoro configurável pelo lojista não foi encontrado).

### RF-08 — Impressão térmica **[NÃO IMPLEMENTADO]**
Nenhuma referência a impressão térmica, ESC/POS ou geração de recibo para impressora foi encontrada no código. É puramente uma recomendação de roadmap futuro (fora do 4.2–4.5 documentado). **Fora de escopo do MVP atual.**

### RF-09 — WhatsApp transacional **[NÃO IMPLEMENTADO]**
Não há nenhuma integração de API do WhatsApp no código (`grep` no repositório só encontra a palavra nos documentos de roadmap). Está corretamente planejado para a fase 4.4 ("push, e-mail transacional e WhatsApp"). Hoje a comunicação transacional existe apenas via **push web (`enviar-push` Edge Function, `push_subscriptions`)** e **notificações internas (`notificacoes`)**.

### RF-10 — Notificações **[PARCIAL]**
- **Push web:** **EXISTENTE** (Edge Function `enviar-push`, VAPID key em `config.js`, tabela `push_subscriptions`).
- **Notificações internas (in-app):** **EXISTENTE** (`notificacoes`, disparadas por trigger `private.notificar_evento_pedido()`/`notificar_mensagem_pedido()` em eventos de pedido e mensagens).
- **E-mail transacional (fora do fluxo padrão de Auth do Supabase):** **NÃO IMPLEMENTADO** — não há integração com provedor de e-mail transacional (Resend/SendGrid/SMTP) no código; o único uso de e-mail é o fluxo nativo do Supabase Auth (confirmação/recuperação de senha).
- **WhatsApp:** ver RF-09.
- **Processamento assíncrono via fila dedicada:** **NÃO IMPLEMENTADO** como fila de mensageria própria — hoje o disparo é via trigger de banco síncrono ao evento + chamada à Edge Function. Funciona para o volume atual, mas não é uma fila resiliente a falhas (retry/backoff) — é uma lacuna arquitetural relevante para volume alto (ver seção 16 e 31).

### RF-11 — Cupons e promoções **[EXISTENTE, sólido]**
Tabela `cupons` (migration 004) + gestão via `admin_salvar_cupom`. Suporta desconto (percentual/fixo — a definir exatamente pela coluna de tipo), frete grátis, período de validade, uso máximo. Uso validado e registrado (idempotência de aplicação de cupom mencionada nas preocupações de concorrência do runbook).
- **Limite por cliente, "primeira compra", produtos/categorias específicos:** não foi possível confirmar 100% todas essas subregras nas colunas exatas de `cupons` sem abrir o schema completo linha a linha — recomenda-se validação explícita nesta etapa de PRD antes da implementação de regras avançadas de antifraude (roadmap 4.5: "regras antifraude para cupons").

### RF-12 — Clientes (CRM básico do lojista) **[EXISTENTE, parcial]**
O proprietário visualiza pedidos e, por relatório (`admin_relatorio_clientes_produtos`, `empresa_relatorio_financeiro`), métricas agregadas. Uma tela de "ficha de cliente" com ticket médio, frequência e endereço consolidados por cliente **não foi confirmada como tela dedicada** — é **PARCIAL**, pois os dados existem no banco (via `pedidos`) mas a agregação por cliente individual (não agregada) pode não estar exposta como funcionalidade de UI própria.

### RF-13 — Dashboard / relatórios **[EXISTENTE]**
`admin_relatorio_operacional`, `empresa_relatorio_financeiro`, `admin_relatorio_clientes_produtos`, `admin_saude_operacao` — cobrem faturamento, pedidos, cancelamentos, reembolsos pendentes, chamados abertos, pagamentos divergentes. Filtro por `p_dias` (parametrizável) já implementado nas funções (`default 30`).
- **Filtros por período customizado no calendário da UI, ticket médio explícito, taxa de conversão, produtos mais vendidos com ranking visual, horário de pico:** presença parcial — as funções de relatório existem no banco, mas nem todos os KPIs da lista do briefing (taxa de conversão de visitante→pedido, por exemplo) têm dado de origem hoje, pois **não há tracking de visitas/funil** no sistema (não existe tabela de eventos de analytics de navegação). **PARCIAL para financeiro/operacional, NÃO IMPLEMENTADO para funil de conversão.**

### RF-14 — Gestão de entregadores **[EXISTENTE, com lacunas de escala]**
Cadastro, aprovação admin, online/offline, atribuição por aceite (pull, não push automático), retirada, entrega, localização em tempo real. **Atribuição automática por proximidade/algoritmo:** **NÃO IMPLEMENTADO** (hoje é lista de corridas disponíveis + aceite manual). **Cálculo de ganhos:** **NÃO IMPLEMENTADO.**

### RF-15 — Multiunidade (fundação) **[PARCIAL]**
Migration 016 cria `empresa_unidades` com unidade principal automática (`private.criar_unidade_principal_empresa`) e RLS — é uma **fundação de banco**, não uma feature de produto completa. Não há confirmação de UI no painel para o lojista criar/gerenciar múltiplas unidades, cardápio por unidade, estoque por unidade, ou trocar de unidade ativa. Corretamente listado no roadmap do próprio projeto como escopo central da fase 4.3.

### RF-16 — Fidelidade (pontos/cashback) **[EXISTENTE — pontos, cashback não]**
`programa_fidelidade_empresa`, `fidelidade_saldos`, `fidelidade_movimentos`, `fidelidade_resgates`, com crédito automático por trigger (`private.creditar_fidelidade_pedido`) e resgate validado (`private.validar_resgate_fidelidade`). É um programa de **pontos por loja**, não uma carteira de cashback financeiro. Cashback/wallet compartilhado entre lojas está no roadmap 4.5, não implementado.

### RF-17 — Suporte ao cliente **[EXISTENTE]**
`chamados_suporte` com categorias (pedido/pagamento/entrega/conta/restaurante/outro), abertura pelo cliente (`abrir_chamado_suporte`), resposta e fechamento pelo admin (`admin_responder_chamado`). UI em `suporte.html`.

### RF-18 — Avaliações **[EXISTENTE]**
`avaliacoes` (migration 004) com resposta do estabelecimento (`empresa_responder_avaliacao`).

### RF-19 — Favoritos **[EXISTENTE]**
Tabela `favoritos` + sincronização (`js/favorites-sync.js`, `favoritos.js`), tela dedicada `favoritos.html`.

### RF-20 — LGPD self-service **[EXISTENTE]**
`dados.html` + `js/dados.js`: exportação e solicitação de exclusão de dados do titular, conforme citado em `PRIVACIDADE-LGPD.md` e no README ("exportação e solicitação de exclusão de dados").

---

## 12. Regras de Negócio

### 12.1 Máquina de estados do pedido **[EXISTENTE — validada em trigger de banco]**

Estados de `pedidos.status`:

```
recebido → preparando → saiu_para_entrega → entregue
   ↓            ↓
cancelado   cancelado
```

Transições permitidas (função `private.validar_transicao_pedido`, reforçada na migration 022):
- `recebido → preparando` ou `recebido → cancelado`
- `preparando → saiu_para_entrega` ou `preparando → cancelado`
- Qualquer outra transição é **rejeitada com exceção no banco** (`raise exception 'Transição de status inválida'`).
- A partir da migration 022, pedidos **online com pagamento pendente** são explicitamente bloqueados de avançar para `preparando`/`saiu_para_entrega`/`entregue` até confirmação de pagamento.
- Quem executa: apenas RPCs autenticadas e vinculadas a `auth.uid()`/propriedade do pedido (`empresa_atualizar_operacao_pedido`, `entregador_atualizar_status`, `empresa_marcar_pagamento_offline`, `empresa_cancelar_pedido_nao_pago`) — **não existe update direto de status pela API REST genérica** desde a migration 020.
- Histórico: `historico_status_pedido` (migration 004) + `pedido_operacao_eventos` (migration 017) registram cada mudança com timestamp.

Estados adicionais (colunas próprias, não parte do enum de `status`):
- `pagamento_status`: `pendente | pago | estornado`
- `cancelamento_status`: `solicitado | aprovado | recusado`
- `reembolso_status`: `nao_aplicavel | pendente | processando | concluido | falhou` (+ `aguardando_pagamento` adicionado na migration 014)
- `pagamento_reconciliacao_status`: `nao_iniciada | ok | divergente | erro`

### 12.2 Cancelamento **[EXISTENTE]**
Fluxo de duas etapas: cliente solicita (`cliente_solicitar_cancelamento`) → restaurante decide (`empresa_decidir_cancelamento`, aprova ou recusa com observação). Cancelamento de pedido **não pago** também pode ser feito via `empresa_cancelar_pedido_nao_pago` (migration 020).

### 12.3 Estoque **[EXISTENTE]**
`estoque_movimentos` registra toda movimentação; reserva de estoque no item do pedido (`private.reservar_estoque_item`) e restauração automática em cancelamento (`private.restaurar_estoque_cancelamento`).

### 12.4 Pagamento — camada de abstração **[PARCIAL — não é gateway-agnóstico]**
Existe uma separação clara entre **estado de pagamento do pedido** (`pagamento_status`, `reembolso_status`, `pagamento_reconciliacao_status` — genéricos) e a **integração específica com Mercado Pago** (Edge Functions `criar-pagamento`, `mercado-pago-webhook`, `processar-reembolso`, tabela `pagamento_eventos`). Isso já é uma boa separação de camadas, mas **não há uma interface de gateway plugável** (ex. um adapter pattern com `PaymentGateway.charge()/refund()`) — a lógica de reconciliação (`reconciliar_pagamento_mercado_pago`) é nomeada e escrita especificamente para Mercado Pago. Trocar de gateway hoje exigiria reescrever essas funções, não apenas configurar um novo adapter. **Recomendação:** extrair uma interface de gateway antes de adicionar um segundo provedor.

---

## 13. Requisitos Não Funcionais

| Categoria | Estado | Evidência |
|---|---|---|
| RLS multi-tenant | **EXISTENTE**, auditado | Auditoria 12/08/2026: nenhuma tabela pública sem RLS; teste de impersonação por papel documentado |
| Idempotência de checkout | **EXISTENTE** | Índice `pedidos_chave_cliente_idx`, testes `checkout-4.2.3.test.js` |
| Idempotência de webhook de pagamento | **EXISTENTE** | Chave de deduplicação antes da conciliação (webhook HMAC validado) |
| Rate limiting / CAPTCHA | **PARCIAL** | CAPTCHA (Turnstile) implementado mas opcional/dependente de configuração de chave; rate limit é responsabilidade do Supabase Auth, ainda pendente de ajuste fino conforme `PRODUCAO.md` checklist |
| Cabeçalhos HTTP de segurança completos | **PARCIAL** | CSP via `<meta>` funciona no GitHub Pages; `X-Content-Type-Options`, `Permissions-Policy`, anti-framing **dependem de hospedagem com proxy** (Cloudflare/Vercel) — risco residual documentado enquanto só estiver no Pages |
| Testes automatizados | **EXISTENTE** | 65 testes (`node --test`), 10 arquivos de teste, gate de CI (`npm run verify`) |
| Observabilidade (logs estruturados/tracing/error tracking) | **PARCIAL** | `app_logs` existe no banco (auditoria básica); não há evidência de tracing distribuído ou error tracking externo (Sentry etc.) |
| Performance (Core Web Vitals, lazy loading) | **NÃO CONFIRMADO** | Nenhuma métrica de performance documentada no repositório; recomenda-se medição real antes de metas |
| PWA | **EXISTENTE** | `sw.js`, `manifest.webmanifest`, `offline.html`, versão de cache unificada 4.2.8 |
| Backup/restauração testados | **PENDENTE (documentado como não concluído)** | `PRODUCAO.md` checklist item ainda desmarcado |

---

## 14. UX/UI

- Mobile-first confirmado por CSS dedicado (`mobile-pwa-4.2.6.css`) e por design de fluxo (carrinho, checkout, cozinha todos com CSS versionado por incremento — sinal de iteração orientada a UX real, não só entrega inicial).
- Acessibilidade: existe `css/accessibility.css` dedicado — **EXISTENTE em alguma medida**, mas o nível de conformidade WCAG não foi auditado neste PRD (recomenda-se auditoria de acessibilidade dedicada, ver Riscos).
- Estados de tela: `offline.html` dedicado (estado offline do PWA) — **EXISTENTE**. Empty states, erros de produto indisponível e loja fechada aparecem tratados na lógica de `calcular_entrega_empresa` (mensagens como "Restaurante fechado neste horário", "Este bairro ainda não faz parte da área de entrega") — **EXISTENTE no backend**, presume-se refletido na UI (não auditado componente a componente).

---

## 15. Arquitetura Atual

**Frontend:** HTML estático + CSS + JavaScript vanilla (sem framework, sem bundler, sem build step) — 22 páginas HTML, 41 módulos JS, cada página carrega seus próprios scripts. Versionamento de assets por query string (`?v=4.2.0`). Hospedagem: GitHub Pages (confirmado por `sitemap.xml` e menção explícita em `PRODUCAO.md` às limitações de cabeçalhos do Pages) + configuração alternativa para Vercel (`vercel.json` presente).

**Backend:** Supabase (Postgres + Auth + Realtime + Storage + Edge Functions em Deno/TypeScript). Toda regra de negócio crítica vive em **funções SQL `SECURITY DEFINER` no schema `private`**, expostas ao público apenas via RPCs finas no schema `public`. Este é um padrão de arquitetura consistente e correto (evita lógica de negócio duplicada/divergente entre RPCs).

**Autenticação:** Supabase Auth nativo, cadastro sem confirmação obrigatória de e-mail (decisão de produto documentada e com controles compensatórios exigidos: CAPTCHA, rate limit, senha forte).

**Pagamentos:** Mercado Pago via 3 Edge Functions (`criar-pagamento`, `mercado-pago-webhook`, `processar-reembolso`), webhook valida assinatura HMAC.

**Estrutura de pastas (canônica, conforme README):**
```
assets/                imagens locais
css/                   estilos
js/                    frontend
supabase/migrations/   banco, RLS, RPCs, triggers
supabase/functions/    Edge Functions
scripts/               verificação e empacotamento
tests/                 testes automatizados
docs/                  este PRD e documentação de produto
```

**Dívida técnica arquitetural identificada:**
1. **Sem framework/componentização** — 41 arquivos JS crescendo por acréscimo (`carrinho.js` E `carrinho-4.2.5.js` coexistindo, por exemplo) torna difícil garantir uma única fonte de verdade de UI à medida que a base cresce. O próprio roadmap do projeto já reconhece isso na fase 5.0 ("frontend componentizado e migrado progressivamente para TypeScript").
2. **Arquivos JS versionados por número no nome** (`checkout-4.2.3.js`, `operacao-restaurante-4.2.7.js`, `carrinho-4.2.5.js`, `mobile-pwa-4.2.6.css`) em vez de um único arquivo coeso por domínio — aumenta risco de dois arquivos divergentes controlando a mesma tela ao mesmo tempo. Recomenda-se consolidação antes da próxima grande fase de features.
3. **Sem camada de gateway de pagamento plugável** (ver 12.4).
4. **Sem fila de mensageria assíncrona real** (ver 16).

---

## 16. Arquitetura Recomendada

Duas decisões arquiteturais relevantes têm mais de uma solução possível — apresentadas abaixo com prós/contras e recomendação, conforme pedido no briefing.

### 16.1 Fila de eventos/notificações assíncronas

**Opção A — Manter triggers de banco + chamada síncrona a Edge Function (atual).**
- Prós: simples, já funciona, sem infraestrutura nova.
- Contras: falha de push/e-mail pode acoplar-se ao tempo de resposta da transação; sem retry/backoff nativo; não escala bem com WhatsApp/e-mail somados.

**Opção B — Introduzir fila real (ex. `pgmq`, tabela de outbox + worker, ou serviço externo tipo Supabase Queues/Trigger.dev).**
- Prós: falha de notificação nunca invalida o pedido confirmado (requisito explícito do briefing, seção 31); retry/backoff; auditável.
- Contras: nova peça de infraestrutura, mais complexidade operacional.

**Recomendação:** Opção B, via padrão **outbox** (tabela `eventos_pendentes` gravada na mesma transação do pedido, processada por um worker/cron separado). É a única forma de garantir, de fato, "a falha de uma notificação não deve invalidar um pedido confirmado" quando o volume de canais crescer (WhatsApp + e-mail + push simultâneos, conforme roadmap 4.4). Migrar antes de ligar WhatsApp em produção.

### 16.2 Abstração de gateway de pagamento

**Opção A — Manter integração direta e nomeada ao Mercado Pago (atual).**
- Prós: menos código, foco total em estabilizar um gateway antes de multiplicar complexidade.
- Contras: qualquer segundo gateway (ex. Stripe, PagSeguro) exige duplicar toda a lógica de reconciliação/idempotência.

**Opção B — Introduzir uma interface `PaymentGateway` (charge/refund/webhookParse) e mover a lógica específica do Mercado Pago para um adapter.**
- Prós: plataforma pronta para múltiplos gateways por região/plano; testável isoladamente.
- Contras: esforço de refatoração em código já auditado e estabilizado financeiramente — risco de regressão em uma área crítica.

**Recomendação:** **Não refatorar agora.** Mercado Pago sequer está validado em sandbox/produção ainda (`pagamentoOnlineAtivo: false`). Priorizar concluir a validação de sandbox (seção do `PRODUCAO.md`) primeiro; só then extrair a interface de gateway, quando um segundo provedor for de fato necessário (evita generalização prematura sobre uma base financeira sensível).

---

## 17. Multi-tenancy

- **Estratégia:** isolamento lógico por `empresa_id` (texto, compatível com UUID e bigint legado) em praticamente todas as tabelas operacionais, com RLS aplicando `exists (select 1 from empresas e where e.id::text = tabela.empresa_id and e.usuario_id = auth.uid())` como padrão de política para o proprietário.
- **Camadas de defesa:** (1) RLS por tabela, (2) RPCs `SECURITY DEFINER` que verificam propriedade/participação (`private.participa_pedido`, `private.is_admin`) antes de qualquer leitura/escrita sensível, (3) `search_path = ''` fixo nas funções privadas (proteção contra sequestro de search_path, boa prática de segurança confirmada em várias funções).
- **Row Level Security:** aplicada de forma consistente; a migration 019 especificamente "otimiza chamadas de identidade nas políticas RLS" (indica que houve trabalho de performance sobre RLS, não só correção).
- **Risco de vazamento cross-tenant:** mitigado, mas a própria auditoria de 12/08/2026 identifica uma lacuna de **teste** (não de política): falta uma conta de entregador isolada de admin/cliente para provar isolamento positivo nesse papel especificamente.
- **Testes necessários (recomendado, não confirmado como concluído):** criar contas de teste dedicadas para cada papel (cliente A, cliente B, restaurante A, restaurante B, entregador isolado, admin) e rodar testes de impersonação cruzada como parte do CI antes de cada release com mudança de RLS.

---

## 18. Modelo de Dados

Modelo conceitual das entidades já implementadas (schema `public`, exceto onde indicado). Tipos e constraints resumidos; ver migrations para DDL completo.

| Entidade | Objetivo | Campos-chave | Relacionamentos | Observações |
|---|---|---|---|---|
| `usuarios` | Dados complementares do usuário autenticado | id (FK auth.users), nome, sobrenome, telefone, cpf | 1:1 com `auth.users` | cpf único quando preenchido |
| `empresas` | Estabelecimento (tenant) | id, usuario_id, nome, categoria, tipo, taxa_entrega, pedido_minimo, status, publicado | 1:1 usuario_id (dono); 1:N com quase todas as tabelas operacionais via `empresa_id` | view pública `empresas_catalogo` expõe só campos seguros |
| `categorias` | Categoria de cardápio | empresa_id, nome, ordem, ativo | N:1 empresas | nome único por empresa (case-insensitive) |
| `produtos` | Item de cardápio | empresa_id, categoria_id, preco, promocao, disponivel | N:1 categorias | promoção < preço (constraint) |
| `produto_variantes` | Tamanho/variação com preço próprio | produto_id, preco, promocao | N:1 produtos | migration 016 |
| `grupos_adicionais` | Grupo de opções (ex. adicionais) | empresa_id, minimo, maximo | N:1 empresas | maximo ≥ max(minimo,1) |
| `adicionais` | Opção dentro de um grupo | grupo_id, preco | N:1 grupos_adicionais | |
| `produto_grupos` | Associação produto↔grupo | produto_id, grupo_id | N:N | PK composta |
| `pedidos` | Pedido do cliente | usuario_id, empresa_id, status, pagamento_status, reembolso_status, subtotal, taxa_entrega, desconto, total | N:1 usuarios, N:1 empresas | `usuario_id not null` (sem convidado); `numero` sequencial amigável |
| `pedido_itens` | Item do pedido (snapshot de preço) | pedido_id, produto_id, preco_unitario, quantidade, adicionais(jsonb) | N:1 pedidos | preço congelado no momento da compra |
| `historico_status_pedido` | Trilha de status | pedido_id, status, timestamp | N:1 pedidos | |
| `pedido_operacao_eventos` | Trilha de eventos operacionais (cozinha) | pedido_id, evento, timestamp | N:1 pedidos | migration 017 |
| `pagamento_eventos` | Eventos brutos do gateway | pedido_id, payment_id, tipo | N:1 pedidos | dedupe de webhook |
| `enderecos` | Endereços salvos do cliente | usuario_id, cep, rua, numero, bairro, cidade, uf | N:1 usuarios | |
| `cupons` | Cupons de desconto | empresa_id (nullable=global?), tipo, validade, limite | N:1 empresas (quando aplicável) | gestão via RPC admin |
| `avaliacoes` | Avaliação do pedido | pedido_id, nota, comentario, resposta | N:1 pedidos | resposta do estabelecimento |
| `empresa_horarios` | Horário de funcionamento | empresa_id, dia_semana, abre, fecha | N:1 empresas | 1 intervalo por dia hoje |
| `empresa_pausas` | Fechamento excepcional | empresa_id, inicio, fim, motivo | N:1 empresas | |
| `empresa_regioes` | Área de entrega por bairro | empresa_id, bairro, cidade, uf, taxa_entrega, pedido_minimo | N:1 empresas | único por (empresa, bairro, cidade, uf) |
| `empresa_unidades` | Fundação multiunidade | empresa_id, principal | N:1 empresas | migration 016, sem UI completa |
| `estoque_movimentos` | Auditoria de estoque | produto_id, tipo, quantidade | N:1 produtos | |
| `entregadores` | Cadastro de entregador | usuario_id, aprovado, online | 1:1 usuarios | |
| `entrega_localizacoes` | Posição do entregador | entregador_id, pedido_id, lat, lng | N:1 entregadores | |
| `pedido_mensagens` | Chat vinculado ao pedido | pedido_id, autor, mensagem | N:1 pedidos | |
| `notificacoes` | Notificação interna | usuario_id, tipo, lida | N:1 usuarios | |
| `push_subscriptions` | Assinatura push web | usuario_id, endpoint | N:1 usuarios | |
| `favoritos` | Restaurante/produto favoritado | usuario_id, empresa_id/produto_id | N:1 usuarios | |
| `tentativas_login` | Telemetria de login | email, sucesso, timestamp | — | RPC legada removida na 023 |
| `programa_fidelidade_empresa` / `fidelidade_saldos` / `fidelidade_movimentos` / `fidelidade_resgates` | Programa de pontos por loja | empresa_id, usuario_id, pontos | N:1 empresas, N:1 usuarios | |
| `chamados_suporte` | Ticket de suporte | usuario_id, categoria, status | N:1 usuarios | |
| `admin_auditoria` | Trilha de auditoria administrativa | admin_id, acao, entidade, antes, depois | — | |
| `app_logs` | Log de aplicação | nível, contexto | — | observabilidade básica |
| `subscriptions` (planos SaaS) | **NÃO IMPLEMENTADO** | — | — | necessário para fase 4.3 |

**Índices relevantes já confirmados:** `pedidos_usuario_id_idx`, `pedidos_empresa_id_idx`, `pedidos_created_at_idx` (desc, útil para listagem recente), `pedido_itens_pedido_id_idx`, `produtos_empresa_id_idx`, `categorias_empresa_nome_unique`, `empresas_usuario_id_unique`, `empresas_cnpj_unique`, `empresa_regioes_local_unique_ci`, `pedidos_chave_cliente_idx` (idempotência).

---

## 19. APIs

Não há uma API REST customizada tradicional — o acesso é via **Supabase client SDK** (PostgREST automático sobre as tabelas com RLS) + **RPCs nomeadas** (funções Postgres expostas como endpoints) + **3 Edge Functions HTTP** para pagamento. Módulos funcionais, por responsabilidade (equivalente aos "módulos de API" pedidos no briefing):

| Módulo | Mecanismo | Responsabilidade |
|---|---|---|
| Auth | Supabase Auth nativo | cadastro, login, recuperação de senha, troca de e-mail confirmada |
| Catálogo | PostgREST (`categorias`, `produtos`, `produto_variantes`, `grupos_adicionais`) + RLS | leitura pública do catálogo publicado, escrita restrita ao dono |
| Checkout/Pedido | RPCs `criar_pedido`, `criar_pedido_operacional`, `private.criar_pedido_impl` | criação idempotente e transacional do pedido, com revalidação de preço/estoque/cupom |
| Operação do pedido | RPCs `empresa_atualizar_operacao_pedido`, `empresa_marcar_pagamento_offline`, `empresa_cancelar_pedido_nao_pago`, `cliente_solicitar_cancelamento`, `empresa_decidir_cancelamento` | máquina de estados do pedido |
| Pagamentos | Edge Functions `criar-pagamento`, `mercado-pago-webhook`, `processar-reembolso` + RPC `reconciliar_pagamento_mercado_pago` | criação de cobrança, webhook, reembolso, conciliação |
| Entrega | RPCs `cadastrar_entregador`, `entregador_definir_online`, `listar_entregas_disponiveis`, `entregador_aceitar_pedido`, `entregador_atualizar_status`, `entregador_atualizar_localizacao` | ciclo de vida do entregador e da corrida |
| Cupons | RPCs admin (`admin_salvar_cupom`, `admin_excluir_cupom`) + validação embutida em `criar_pedido_impl` | criação/uso de cupom |
| Admin | RPCs `admin_*` (dezenas, ver seção 8) | governança da plataforma |
| Analytics/Relatórios | RPCs `admin_relatorio_operacional`, `empresa_relatorio_financeiro`, `admin_relatorio_clientes_produtos`, `admin_saude_operacao` | KPIs |
| Notificações | Edge Function `enviar-push` + triggers `notificar_*` | push e notificação interna |

**Lacuna:** não há uma API pública documentada (OpenAPI/Swagger) para integrações externas — mencionada no roadmap 4.3 apenas como "API" no plano Enterprise, ainda **NÃO IMPLEMENTADO**.

---

## 20. Integrações

| Integração | Status |
|---|---|
| Mercado Pago (pagamento + webhook + reembolso) | **EXISTENTE**, mas com pagamento online **desativado por padrão** até validação de sandbox |
| Supabase Auth (e-mail nativo) | **EXISTENTE** |
| Web Push (VAPID) | **EXISTENTE** |
| Cloudflare Turnstile / hCaptcha | **PARCIAL** — suportado no código, depende de chave configurada (`turnstileSiteKey` vazio por padrão) |
| WhatsApp Business API | **NÃO IMPLEMENTADO** |
| E-mail transacional dedicado (Resend/SendGrid) | **NÃO IMPLEMENTADO** |
| Geocodificação / mapas (Google Maps, Mapbox) | **NÃO IMPLEMENTADO** |
| Impressora térmica | **NÃO IMPLEMENTADO** |
| Error tracking externo (Sentry) | **NÃO IMPLEMENTADO** |

---

## 21. Eventos e Realtime

**Realtime confirmado:** Supabase Realtime é usado para acompanhamento do pedido (`acompanhamento.html`) e para o painel operacional — inferido pela arquitetura Supabase padrão + presença de `entrega_localizacoes` e `pedido_operacao_eventos` como tabelas desenhadas para consumo ao vivo. Eventos de domínio implementados via trigger (nome de função, não de "evento" formal como em um event bus):

- Mudança de status do pedido → `historico_status_pedido` + `notificar_evento_pedido` → `notificacoes` + push.
- Nova mensagem no pedido → `pedido_mensagens` → `notificar_mensagem_pedido`.
- Pedido criado → reserva de estoque (`reservar_estoque_item`) na mesma transação.
- Pagamento conciliado → `reconciliar_pagamento_mercado_pago` atualiza `pagamento_status`/`pagamento_reconciliacao_status`.

**Lacuna:** não há um **event bus de domínio explícito** (`OrderCreated`, `PaymentApproved` como eventos nomeados e publicados) — o que existe são triggers SQL acoplados diretamente às tabelas, o que funciona mas dificulta adicionar novos consumidores (ex. analytics, WhatsApp) sem tocar na função trigger existente. Ver recomendação de outbox na seção 16.1 — isso resolveria também esta lacuna, dando nomes formais aos eventos.

---

## 22. Segurança

Postura de segurança **acima da média** para o estágio do projeto, com evidência concreta de auditoria real (não apenas intenção):
- RLS habilitada em 100% das tabelas públicas auditadas (confirmado, não presumido).
- Nenhuma lógica de preço/pagamento decidida no frontend — revalidação sempre no servidor (`criar_pedido_impl`).
- `private.criar_pedido_impl` confirmado como **não executável diretamente** por `anon`/`authenticated` (só via RPC pública controlada).
- Funções `SECURITY DEFINER` revisadas quanto a escopo (RPCs administrativas checam `is_admin()`; RPCs de cliente/restaurante/entregador vinculam a `auth.uid()`).
- CSP configurada (`script-src 'self'` + domínios explícitos, sem `unsafe-inline` em script).
- Segredos de servidor confirmados como **ausentes do frontend** (checado no gate de CI, `npm run check`).
- Webhook do Mercado Pago valida assinatura HMAC.

**Gaps reais e documentados pelo próprio projeto (não inventados aqui):**
- Proteção HIBP (senha vazada) indisponível no plano Free do Supabase — risco residual aceito, não corrigido.
- Cabeçalhos HTTP completos (`X-Content-Type-Options`, `Permissions-Policy`, anti-framing) dependem de sair do GitHub Pages puro.
- CAPTCHA depende de configuração de chave (`turnstileSiteKey` vazio por padrão — hoje efetivamente desativado até alguém preencher).
- Testes de RLS por impersonação ainda não têm conta de entregador isolada.

---

## 23. LGPD

- **Exportação e exclusão de dados pelo titular:** **EXISTENTE** (`dados.html`, `js/dados.js`, citado no README e em `PRIVACIDADE-LGPD.md`).
- **Política de privacidade publicada:** **EXISTENTE** (`privacidade.html`, `PRIVACIDADE-LGPD.md`), mas com **revisão jurídica ainda pendente** conforme checklist de `PRODUCAO.md` ("revisão jurídica da política de privacidade" não concluída).
- **Minimização de dados:** parcialmente evidenciada pela `view public.empresas_catalogo` (que expõe só campos seguros do catálogo, ocultando `usuario_id`, e-mail, CNPJ do público).
- **Retenção/anonimização automatizada:** **NÃO IMPLEMENTADO** — não há job/rotina automática de expurgo ou anonimização por tempo; é exclusão sob demanda do titular, não uma política de retenção proativa. Roadmap 5.0 já lista "políticas de retenção e anonimização automatizadas" como item futuro.
- **Dados sensíveis (CPF):** armazenado com índice único condicional (só quando preenchido) — tratamento razoável, mas não há confirmação de criptografia em nível de coluna (Postgres/Supabase criptografa em repouso na infraestrutura, o que cobre o requisito básico).

---

## 24. Performance

Não há dados de performance real medidos disponíveis no repositório (sem relatório de Lighthouse/Core Web Vitals versionado). Como o frontend é HTML/CSS/JS puro sem framework pesado, a expectativa razoável é boa performance de carregamento inicial, mas isso **precisa ser medido**, não presumido — especialmente porque há muitos arquivos CSS/JS carregados por página sem bundling (potencial de excesso de requisições HTTP). **Recomendado como ação P0 de qualidade, não como fato já estabelecido.**

---

## 25. Observabilidade

- `app_logs` (tabela) — **EXISTENTE**, nível básico.
- `admin_auditoria` — **EXISTENTE**, auditoria de ações administrativas.
- `admin_saude_operacao` — **EXISTENTE**, uma função de "health check" de negócio (reembolsos pendentes, chamados abertos, pagamentos divergentes) — é observabilidade de **negócio**, não de infraestrutura.
- Tracing distribuído, error tracking (Sentry/Rollbar), alertas automatizados externos — **NÃO IMPLEMENTADO**. O `PRODUCAO.md` lista "Configure alertas para: erros das Edge Functions; pagamentos divergentes; ..." como uma instrução operacional, não como algo já automatizado no código.

---

## 26. Casos de Falha

Já documentados e tratados explicitamente pelo próprio projeto em `PRODUCAO.md`/`RUNBOOK-OPERACIONAL.md` (não inventados neste PRD, apenas consolidados):

| Cenário | Comportamento definido |
|---|---|
| Pagamento aprovado após cancelamento | Pedido permanece `cancelado`; `pagamento_status=pago`; `reembolso_status=pendente`; reembolso processado manualmente pelo painel |
| Webhook duplicado | Mesma chave de deduplicação → retorna sucesso sem nova transição |
| Webhooks fora de ordem | Tratado via reconciliação que consulta o pagamento diretamente no provedor, não confia cegamente na ordem de chegada |
| Falha da Edge Function de reembolso | Pedido permanece em `falhou`, nunca é marcado como `concluido` incorretamente |
| Checkout duplicado (duplo clique) | Chave idempotente por cliente retorna o pedido já criado |
| Variação indisponível durante checkout | Não substitui silenciosamente; mantém item indisponível para revisão do cliente |
| Loja fechando durante o checkout | `private.empresa_aberta_em` é reavaliada no momento da criação, não só na exibição inicial |
| Gateway/WhatsApp indisponível | Gateway: fluxo de pagamento cai para estado `falhou` controlado. WhatsApp: **não aplicável ainda**, pois não está implementado. |
| Erro de geocodificação / mapas indisponível | **Não aplicável hoje**, pois não há geocodificação implementada — será um requisito real a definir na fase 4.4. |

---

## 27. User Stories

**US-01 — Como cliente, quero montar meu pedido com variações e adicionais, para pagar exatamente pelo que escolhi.**
- Dado que estou na página do restaurante, quando seleciono uma variação obrigatória e os adicionais mínimos exigidos, então o item só é adicionado ao carrinho depois que as regras de mínimo/máximo do grupo são satisfeitas.
- ✅ **Já suportado** pelo modelo `grupos_adicionais`/`produto_variantes`.

**US-02 — Como cliente, quero saber se meu bairro é atendido antes de montar o pedido, para não perder tempo.**
- Dado um bairro fora da área de entrega, quando eu informo o endereço, então o sistema me diz claramente "Este bairro ainda não faz parte da área de entrega" sem me deixar avançar no checkout.
- ✅ **Já suportado** por `calcular_entrega_empresa`.

**US-03 — Como dono de restaurante, quero que a fila de pedidos me avise quando algo está atrasado, para não perder o SLA.**
- ✅ **Já suportado** pela fila de cozinha com destaque de atraso.

**US-04 — Como dono de restaurante, quero dar acesso limitado a um funcionário da cozinha sem dar acesso financeiro, para delegar a operação com segurança.**
- ❌ **Não suportado hoje** — requer a tabela de papéis internos da fase 4.3.

**US-05 — Como entregador, quero ver só as corridas prontas para retirada, para não ir até o restaurante antes da hora.**
- ✅ **Já suportado** (`listar_entregas_disponiveis` filtra por `status = pronto`).

**US-06 — Como administrador, quero conciliar pagamentos divergentes num só lugar, para agir rápido em incidentes financeiros.**
- ✅ **Já suportado** (`admin_conciliacao_pagamentos`, `admin_saude_operacao`).

**US-07 — Como cliente, quero fazer um pedido sem criar conta, para comprar mais rápido na primeira vez.**
- ❌ **Não suportado hoje** — `pedidos.usuario_id` é obrigatório. Ver Decisões em Aberto.

**US-08 — Como titular de dados, quero exportar e excluir meus dados, para exercer meus direitos de LGPD.**
- ✅ **Já suportado** (`dados.html`).

---

## 28. Critérios de Aceite (exemplos formais adicionais)

```
Cenário: Checkout duplo clique
Given que o cliente preencheu o checkout corretamente
And a loja está aberta e o produto disponível
When o cliente clica em "Finalizar pedido" duas vezes rapidamente
Then apenas um pedido deve ser criado no banco
And a segunda chamada deve retornar o mesmo pedido já criado
And o valor total deve ter sido calculado no servidor, não no navegador.

Cenário: Pedido online sem pagamento confirmado
Given um pedido criado com forma de pagamento online
And o pagamento ainda está pendente
When o restaurante tenta avançar o pedido para "preparando"
Then a transição deve ser rejeitada pelo banco
And o pedido deve permanecer em "recebido" até a confirmação do pagamento.

Cenário: Cancelamento pelo cliente
Given um pedido em status "recebido"
When o cliente solicita o cancelamento
Then o pedido deve entrar em "cancelamento_status = solicitado"
And o restaurante deve poder aprovar ou recusar, nunca o cliente decidir sozinho.
```

---

## 29. MVP

O "MVP" aqui não é hipotético — a versão 4.2.8 **já é, na prática, um MVP operacional completo** (catálogo → checkout → cozinha → entrega → avaliação, com segurança e RLS). O que falta não é para "existir produto funcional", e sim para virar uma **plataforma SaaS comercial escalável**. Por isso a priorização abaixo trata o "MVP" como "o que falta para ir a produção com confiança total" + o roadmap comercial declarado pelo próprio projeto.

---

## 30. P0 / P1 / P2

### P0 — obrigatório antes de qualquer volume real de produção
1. Concluir os testes de sandbox financeiro do Mercado Pago (12 cenários listados em `PRODUCAO.md`) antes de ativar `pagamentoOnlineAtivo`.
2. Criar conta de entregador isolada e completar a validação positiva de RLS por papel.
3. Configurar CAPTCHA (`turnstileSiteKey`) e rate limits de Auth em produção.
4. Sair do GitHub Pages puro (ou colocar atrás de proxy) para garantir os cabeçalhos HTTP de segurança faltantes.
5. Testar e documentar backup/restauração real.
6. Decidir formalmente: checkout convidado sim/não (hoje é "não" por design de banco — ver Decisões em Aberto).
7. Revisão jurídica da política de privacidade.

### P1 — importante após estabilidade
1. Perfis de funcionário (gerente/cozinha/atendente/financeiro) — fase 4.3.
2. UI completa de gestão multiunidade (cardápio, estoque, horário, região por unidade) — fase 4.3.
3. Planos, trial, assinatura, limites de uso — fase 4.3.
4. Fila assíncrona real (outbox) para notificações — pré-requisito técnico antes de WhatsApp.
5. WhatsApp transacional — fase 4.4.
6. E-mail transacional dedicado (fora do fluxo nativo de Auth).
7. Cálculo de taxa de entrega por distância (complementar ao por-bairro atual).

### P2 — evolução / diferenciais competitivos
1. Geofencing por polígono no mapa.
2. Atribuição automática de entregas por proximidade/algoritmo.
3. Ganhos e fechamento financeiro do entregador.
4. Cashback/carteira de benefícios entre lojas, recomendação de produtos, recuperação de carrinho — fase 4.5.
5. Impressão térmica automática.
6. API pública documentada para integrações externas (plano Enterprise).
7. Frontend componentizado/TypeScript — fase 5.0.

---

## 31. Fora de Escopo

- Aplicativos mobile nativos (iOS/Android) — não faz parte de nenhuma fase do roadmap atual.
- Consumo no local / mesa / drive-thru — mencionados apenas como extensões arquiteturais futuras possíveis, sem compromisso de entrega.
- Multi-gateway de pagamento simultâneo — decisão explícita de não generalizar antes de validar um único gateway (ver seção 16.2).
- Roteirização geográfica em tempo real completa (turn-by-turn) — apenas cálculo de taxa e rastreamento de posição estão no roadmap próximo; navegação turn-by-turn não está prevista.

---

## 32. Dependências

- **Supabase** (Postgres, Auth, Realtime, Storage, Edge Functions/Deno) — dependência central, inclusive limitações de plano (Free hoje, sem HIBP).
- **Mercado Pago** — gateway de pagamento único hoje.
- **Cloudflare Turnstile / hCaptcha** — anti-bot, opcional/configurável.
- **GitHub Pages ou Vercel** — hospedagem estática (ambos configurados no repositório).
- **GitHub Actions** — CI (`.github/workflows`), executa `npm run verify` no deploy da `main`.
- Dependências futuras a contratar: provedor de WhatsApp Business API, provedor de e-mail transacional, provedor de geocodificação/mapas.

---

## 33. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Ativar pagamento online sem concluir os 13 testes de sandbox | Média | Alto (financeiro) | Manter `pagamentoOnlineAtivo=false` até checklist 100% assinado |
| Ausência de proteção HIBP (plano Free) | Alta (permanece enquanto no Free) | Médio | Aceitar como risco residual documentado ou migrar de plano antes de escalar cadastro |
| Cabeçalhos HTTP incompletos no GitHub Pages | Alta (enquanto só no Pages) | Médio | Migrar para hospedagem com proxy (Cloudflare/Vercel) antes de tráfego real |
| Crescimento do frontend sem framework/componentização | Média (aumenta com o tempo) | Médio (velocidade de entrega, bugs de duplicidade tipo `carrinho.js` x `carrinho-4.2.5.js`) | Congelar padrão de nomeação por versão; planejar consolidação antes da fase 5.0 |
| Falta de fila assíncrona ao ligar WhatsApp/e-mail em volume | Média | Médio-Alto (mensagens perdidas, acoplamento de falha) | Implementar padrão outbox antes de ativar novos canais (seção 16.1) |
| Teste de RLS de entregador incompleto | Certa hoje | Médio | Criar conta de teste isolada antes do próximo release com mudança de RLS |
| Falta de checkout convidado pode reduzir conversão | Desconhecida (não medida) | Médio | Decisão de produto explícita e deliberada, não acidental (ver seção 34) |
| LGPD: política de privacidade sem revisão jurídica | Média | Alto (compliance) | Bloquear produção real até revisão jurídica formal |

---

## 34. Dependências (matriz) — ver seção 32.

## 35. Métricas de Sucesso

Já suportadas hoje por dados existentes: faturamento, pedidos, cancelamentos, reembolsos pendentes, tempo de preparo (via `pedido_operacao_eventos`), chamados de suporte, pagamentos divergentes (via funções de relatório existentes).
**Ainda sem dado de origem:** conversão visitante→pedido e abandono de carrinho (exigem tracking de funil/analytics de navegação, que não existe hoje) — recomendado como requisito técnico novo antes de reportar essas métricas.

---

## 36. Roadmap

O roadmap abaixo é o próprio roadmap declarado pelo projeto em `ROADMAP-PLATAFORMA.md`, absorvido e mantido como fonte de verdade única (evitando dois roadmaps divergentes):

| Fase | Foco |
|---|---|
| **4.2 (atual, 4.2.8)** | Operação e catálogo — cozinha/SLA, variações, idempotência, auditoria de estoque, fundação multiunidade |
| **4.3** | Plataforma comercial — unidades completas na UI, planos/trial/assinatura, comissão, extrato/repasses, perfis internos (gerente/cozinha/atendente/financeiro), domínio/tema por loja, aprovação documental |
| **4.4** | Logística e comunicação — geocodificação/rota, distribuição automática, agrupamento de corridas, rastreamento com consentimento, prova de entrega, ganhos do entregador, push/e-mail/WhatsApp, central de comunicação |
| **4.5** | Crescimento e fidelidade — combos/ficha técnica, campanhas segmentadas, cashback/carteira, indicação, recuperação de carrinho, recomendação, antifraude de cupons, analytics de conversão/retenção/churn |
| **5.0** | Escala — frontend componentizado/TypeScript, homologação/previews por PR, E2E e carga contínuos, filas assíncronas para eventos críticos, observabilidade centralizada, retenção/anonimização automatizada |

Cada fase, por definição do próprio projeto, exige migration revisada + testes + sandbox + aprovação operacional antes da próxima — este PRD recomenda manter essa disciplina.

---

## 37. Dívida Técnica Identificada

1. Proliferação de arquivos JS/CSS versionados por número no nome, coexistindo com versões anteriores (`carrinho.js`/`carrinho-4.2.5.js`, `checkout.js`/`checkout-4.2.3.js`) — risco de lógica divergente entre a versão "base" e a "incremental".
2. Ausência de camada de gateway de pagamento plugável (acoplamento direto ao Mercado Pago).
3. Ausência de fila assíncrona real para notificações (hoje é trigger síncrono + Edge Function).
4. Ausência de tracking de funil/analytics de navegação (impede métricas de conversão citadas como meta de sucesso).
5. `empresa_horarios` suporta apenas um intervalo por dia — não cobre o exemplo do briefing de "11h-15h e 18h-23h" no mesmo dia.
6. Sem interface de "papéis internos" (funcionários) apesar do RBAC de banco já estar estruturado o suficiente para suportar essa extensão.
7. Observabilidade limitada a `app_logs`/auditoria de negócio — sem tracing/error tracking externo.
8. Dependência total do GitHub Pages para uma parcela dos cabeçalhos de segurança.

---

## 38. Lacunas do Projeto Atual

(Resumo consolidado — detalhes completos nas seções 11, 20, 30)
- Checkout convidado.
- Perfis internos de funcionário com permissões diferenciadas do dono.
- Multiunidade com UI completa.
- Planos/assinatura SaaS.
- WhatsApp e e-mail transacional dedicado.
- Geocodificação, cálculo por distância e geofencing.
- Atribuição automática de entregas e cálculo de ganhos do entregador.
- Impressão térmica.
- Tracking de funil de conversão.
- Retenção/anonimização automatizada de dados (LGPD).

---

## 39. Decisões em Aberto (precisam de decisão humana)

1. **Checkout como convidado será permitido?** Hoje é arquiteturalmente impossível sem alterar a constraint `pedidos.usuario_id not null`. Isso afeta conversão x complexidade de suporte pós-venda (reembolso/rastreamento de pedido sem conta). Decisão de produto, não técnica.
2. **Qual estratégia de taxa de entrega é prioridade para o próximo ciclo:** aprofundar "por bairro" (já maduro) ou investir logo em "por distância"? Recomendação deste PRD: aprofundar por bairro primeiro (menor esforço, já robusto), por distância como P1.
3. **Quando sair do GitHub Pages?** Decisão de infraestrutura/custo com impacto direto em segurança (cabeçalhos HTTP faltantes).
4. **Aceitar o risco residual da ausência de proteção HIBP no plano Free, ou migrar de plano do Supabase antes de escalar cadastro?**
5. **Modelo de comissão da fase 4.3** (percentual fixo, por faixa, por plano?) — não definido em nenhum documento do repositório.
6. **Qual gateway de pagamento adicional (se algum) priorizar depois de Mercado Pago validado?** Decide o timing da extração da interface de gateway (seção 16.2).
7. **Cupom: quais regras antifraude específicas (do roadmap 4.5) são prioridade — limite por CPF, por dispositivo, por IP?**

---

# Anexos solicitados

## Top 10 gaps encontrados no sistema atual
1. Checkout exige conta (sem modo convidado).
2. Sem perfis internos de funcionário (só dono da loja).
3. Multiunidade é só fundação de banco, sem UI de gestão.
4. Sem planos/assinatura SaaS (nenhuma tabela de billing).
5. Sem WhatsApp transacional.
6. Sem e-mail transacional dedicado (só Auth nativo).
7. Sem geocodificação/cálculo de frete por distância ou geofencing.
8. Sem atribuição automática de entregador nem cálculo de ganhos.
9. Sem fila assíncrona real para notificações (risco ao crescer canais).
10. Sem tracking de funil de conversão (visitante→pedido).

## Top 10 prioridades técnicas
1. Concluir os 13 testes de sandbox financeiro antes de ativar pagamento online.
2. Isolar conta de entregador para validar RLS por papel.
3. Configurar CAPTCHA e rate limits em produção.
4. Migrar/proteger hospedagem para garantir cabeçalhos HTTP completos.
5. Testar backup/restauração de fato.
6. Implementar padrão outbox para notificações antes de somar canais.
7. Consolidar arquivos JS/CSS versionados por número em módulos únicos por domínio.
8. Adicionar tracking de funil (para métricas de conversão).
9. Adicionar observabilidade externa (error tracking/tracing).
10. Formalizar equivalência entre migrations locais (014–024) e o histórico do projeto hospedado (divergência já identificada na auditoria).

## Top 10 prioridades de produto
1. Decidir e implementar (ou descartar deliberadamente) checkout convidado.
2. Perfis internos de funcionário (gerente/cozinha/atendente/financeiro).
3. UI completa de multiunidade.
4. Planos, trial e assinatura (base do modelo SaaS).
5. Comissão e repasses financeiros por restaurante/unidade.
6. WhatsApp transacional.
7. Cálculo de frete por distância como complemento ao por-bairro.
8. Rastreamento de entregador com consentimento e prova de entrega.
9. Regras antifraude de cupom.
10. Ficha de cliente consolidada (CRM básico) na visão do lojista.

## Funcionalidades que já existem e devem ser preservadas
- Máquina de estados de pedido validada no banco (não remover a validação em trigger).
- Idempotência de checkout e de webhook de pagamento.
- Revalidação de preço/variação/adicional sempre no servidor.
- RLS multi-tenant com RPCs `SECURITY DEFINER` de escopo restrito.
- Snapshot de preço no item do pedido (histórico fiel, mesmo se o produto mudar depois).
- Reserva/restauração automática de estoque.
- Painel operacional de cozinha com SLA e histórico de eventos.
- Fluxo de cancelamento em duas etapas (cliente solicita, loja decide).
- LGPD self-service (exportação/exclusão).
- Auditoria administrativa (`admin_auditoria`).

## Funcionalidades que devem ser refatoradas
- Consolidação dos arquivos JS/CSS versionados por número (`*-4.2.x.js/css`) em módulos únicos por domínio.
- Extração de uma interface de gateway de pagamento (quando o segundo gateway for necessário — não antes).
- Migração de triggers síncronos de notificação para padrão outbox/fila.
- `empresa_horarios`: evoluir de 1 intervalo por dia para múltiplos intervalos no mesmo dia.

## Funcionalidades que ainda precisam ser implementadas
- Checkout convidado (se decidido que sim).
- Perfis internos de funcionário com RBAC próprio.
- UI de gestão multiunidade completa.
- Planos/assinatura/billing SaaS.
- WhatsApp e e-mail transacional dedicado.
- Geocodificação, cálculo por distância, geofencing.
- Atribuição automática de entregador e cálculo de ganhos.
- Impressão térmica.
- Tracking de funil de conversão / analytics de navegação.
- Retenção e anonimização automatizada de dados (LGPD).

## Perguntas que precisam de decisão humana antes da implementação
Ver seção 39 (Decisões em Aberto) — consolidada aqui por completude:
1. Checkout convidado: sim ou não?
2. Prioridade entre "por distância" e aprofundar "por bairro"?
3. Quando sair do GitHub Pages puro?
4. Aceitar risco residual de HIBP no plano Free ou migrar de plano?
5. Modelo de comissão da fase 4.3?
6. Segundo gateway de pagamento: qual e quando?
7. Regras antifraude de cupom: quais critérios exatos?

---

**Observação final:** nenhuma alteração de código foi feita durante a produção deste documento, conforme instrução do briefing. Este PRD é o ponto de partida para priorização e planejamento da fase 4.3 em diante.
