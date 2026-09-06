# Área mobile dos clientes — 4.7.1

Atualizado em 06/09/2026.

A versão 4.7.0 aplicou a paleta aprovada (#191614, #27211D, #FFF4E6 e #E87936) ao início, busca, restaurante, produto, carrinho, checkout e acompanhamento.

Esta etapa conclui Favoritos, Notificações e Perfil:

- Favoritos: contador, cards, remoção com estado de espera e recuperação de falhas.
- Notificações: painel rolável, fechamento por botão ou Escape, foco restaurado e nova tentativa de carregamento; avisos disponíveis mesmo sem suporte a push.
- Perfil: atalhos legíveis, dados pessoais, saída da conta e benefícios reais por restaurante acessíveis no celular.
- Cache dos assets atualizado para 4.7.1, sem mudanças nas regras do banco ou dos pagamentos.

Verificação: `npm run package` e os workflows CI e E2E do repositório. Os testes usam dados simulados e não enviam pedidos nem notificações reais.

Próxima etapa do plano: estados de erro e carregamento e acessibilidade nas demais telas do cliente. Depois: performance e refinamentos.
