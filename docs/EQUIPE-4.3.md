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

A migration `025_funcionarios_rbac_4_3.sql` já é a fundação de vínculos. A migration `026_equipe_permissoes_4_3.sql` deve ser aplicada somente após revisão, CI verde e aprovação operacional deste PR.
