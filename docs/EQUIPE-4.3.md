# Equipe e permissões — 4.3

Esta etapa implementa o primeiro fluxo utilizável de funcionários por estabelecimento.

## Matriz

| Papel | Pedidos | Cozinha | Atendimento operacional | Decisão de cancelamento | Financeiro |
| --- | --- | --- | --- | --- | --- |
| Proprietário | Sim | Sim | Sim | Sim | Sim |
| Gerente | Sim | Sim | Sim | Sim | Não |
| Cozinha | Fila ativa com dados redigidos | Sim | Não | Não | Não |
| Atendente | Sim | Não | Sim | Não | Não |
| Financeiro | Não | Não | Não | Não | Indicadores agregados |

A autorização é feita nas funções SQL. Esconder ou exibir controles no frontend não concede acesso.

## Privacidade da cozinha

A RPC `empresa_operador_pedidos` remove telefone, endereço, valores, pagamento e preços unitários quando o papel atual é `cozinha`. O papel recebe somente os dados necessários para produção, incluindo itens, quantidades, adicionais sem preço, observações e SLA.

## Fluxo de login

O Portal do parceiro usa `empresa_meu_acesso()` após autenticação. Proprietários seguem para `empresa-dashboard.html`; funcionários ativos seguem para `empresa-colaborador.html`. Papéis não são lidos de `user_metadata` para autorização.

## Deploy

As migrations `025_funcionarios_rbac_4_3.sql`, `026_equipe_permissoes_4_3.sql` e `027_corrige_prioridade_operacional_4_3.sql` já estão aplicadas no projeto Supabase de produção.

A matriz implantada foi validada diretamente no banco: grants para `authenticated`, bloqueio de `anon`, redaction de telefone/endereço/valores/pagamento para cozinha e prioridade operacional limitada a `0..3`.

## Validação end-to-end

O banco ainda não possui funcionários vinculados. O teste completo de login de `gerente`, `cozinha`, `atendente` e `financeiro` deve ser executado quando existirem contas Supabase Auth reais vinculadas pela tela de Equipe. Até lá, os contratos SQL e permissões implantadas permanecem cobertos pelos testes automatizados e pela validação do schema de produção.
