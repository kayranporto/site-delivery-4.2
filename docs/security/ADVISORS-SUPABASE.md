# Triagem dos Advisors Supabase

**Projeto:** Multi Delivery  
**Revisão:** 31/08/2026

Este documento registra a triagem formal dos avisos do Security Advisor e do Performance Advisor. O objetivo não é zerar o linter a qualquer custo: avisos intencionais são documentados e mantidos sob teste de regressão, enquanto achados corrigíveis são tratados por migration.

## 1. Security Advisor

### 1.1 `planos_plataforma` e `empresa_assinaturas` com RLS sem policy

**Status:** aceito / intencional.

As duas tabelas permanecem com RLS habilitada e sem policies diretas. A auditoria de 31/08/2026 confirmou que `anon` e `authenticated` não possuem privilégios diretos nessas tabelas. O acesso é feito por RPCs específicas que aplicam autorização no servidor.

Não adicionar policy permissiva apenas para remover o aviso do Advisor.

### 1.2 `pg_net` no schema `public`

**Status:** allowlist técnica.

`pg_net` é usado pelo fluxo de Web Push em `private.encaminhar_push_notificacao()`, que chama a Edge Function `enviar-push`. No projeto hospedado, a extensão está marcada como não relocável (`extrelocatable = false`), portanto não deve ser movida de schema por uma alteração ad-hoc.

Mitigações atuais:

- a chamada HTTP fica em função privada de trigger;
- a função privada não concede `EXECUTE` aos papéis da API;
- segredos são obtidos do Vault, não do frontend;
- falhas de push não interrompem a transação principal do pedido/notificação.

Reavaliar somente se o Supabase passar a suportar uma instalação/relocação segura da extensão sem quebrar dependências.

### 1.3 RPCs `SECURITY DEFINER`

**Status:** allowlist arquitetural com testes obrigatórios.

O Advisor reporta funções `SECURITY DEFINER` acessíveis a `anon` ou `authenticated`. Isso é esperado para RPCs que compõem a API do sistema, mas cada função deve manter autorização interna explícita.

Critérios para permanecer na allowlist:

1. RPC pública anônima expõe somente dados de catálogo, disponibilidade ou cálculo necessários antes do login.
2. RPC autenticada vincula a operação a `auth.uid()`, à empresa do usuário, ao entregador atribuído ou a `private.is_admin()`.
3. Helpers privilegiados permanecem em schema privado e sem `EXECUTE` para `anon`/`authenticated`.
4. Alterações em RLS/RPCs exigem os testes de isolamento por cliente, restaurante, entregador e administrador antes do deploy.
5. Não revogar em massa `EXECUTE` das RPCs públicas sem substituir o caminho usado pelo frontend.

### 1.4 Leaked Password Protection / HIBP

**Status:** bloqueio externo.

A proteção contra senhas vazadas permanece desativada enquanto a organização estiver no plano Free e o recurso não estiver disponível. Não marcar como resolvido no código. Ao migrar para plano compatível, ativar HIBP e repetir os testes de autenticação.

## 2. Performance Advisor

### 2.1 Foreign keys sem índice de cobertura

**Status:** corrigido em 31/08/2026.

A migration `20260831220634_indexa_fks_multiunidade_4_4_6.sql` adiciona índices para as FKs sinalizadas em:

- `categorias(unidade_id, empresa_id)`;
- `empresa_funcionarios(criado_por)`;
- `empresa_horarios(unidade_id, empresa_id)`;
- `empresa_pausas(unidade_id, empresa_id)`;
- `empresa_regioes(unidade_id, empresa_id)`;
- `pedidos(unidade_id, empresa_id)`;
- `produtos(unidade_id, empresa_id)`.

O índice composto de `empresa_horarios` também cobre a FK isolada de `unidade_id`. A migration foi testada no projeto de restauração antes de ser aplicada em produção. Após a aplicação, o Performance Advisor deixou de reportar `unindexed_foreign_keys`.

### 2.2 Índices ainda sem uso

**Status:** observar; não remover automaticamente.

O banco ainda possui índices reportados como nunca usados. O volume atual é pequeno e vários índices foram criados para caminhos críticos ou recentes. Não remover apenas com base no contador atual de uso.

Critério para remoção futura:

- observar tráfego real por período representativo;
- confirmar que o índice não cobre FK, unicidade, consulta operacional ou caminho de incidente;
- comparar plano de execução antes/depois;
- remover por migration reversível e repetir o Advisor.

### 2.3 Múltiplas policies permissivas de SELECT

**Status:** dívida de performance documentada.

Há tabelas com mais de uma policy permissiva de `SELECT` para `authenticated`, geralmente porque cliente, restaurante, entregador e administrador possuem regras distintas. Consolidar essas policies pode reduzir custo por consulta, mas altera a superfície de autorização e tem risco de regressão de acesso.

Prioridade atual: segurança e correção acima da redução cosmética de warnings. Consolidar somente em uma migration dedicada, com teste de RLS para todos os papéis e rollback preparado.

## 3. Gate para alterações futuras

Depois de qualquer migration que altere RLS, funções, grants, FKs ou índices:

1. executar Security Advisor;
2. executar Performance Advisor;
3. rodar `npm run verify`;
4. executar os testes SQL de RLS aplicáveis;
5. documentar novos avisos nesta allowlist antes de produção.

A existência de um aviso na allowlist não autoriza novas funções ou policies semelhantes automaticamente; cada novo caso deve ser revisado individualmente.
