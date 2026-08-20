# Runbook operacional

## Pagamento aprovado e pedido pendente

1. Abra **Administração → Conciliação de pagamentos**.
2. Confirme o `payment_id`, valor, moeda e referência externa no Mercado Pago.
3. Verifique os registros em `pagamento_eventos`.
4. Reenvie a notificação pelo painel do provedor ou execute reconciliação controlada pelo backend.
5. Não altere diretamente o status financeiro pelo navegador.

## Pagamento aprovado após cancelamento

O estado esperado é:

```text
pedido.status = cancelado
pagamento_status = pago
reembolso_status = pendente
```

Processe o reembolso pelo painel. Se a Edge Function falhar, o pedido deve permanecer em `falhou`, nunca em `concluido`.

## Webhook repetido

Eventos com a mesma chave devem retornar sucesso sem produzir uma segunda transição. Investigue apenas se o evento aparece com `erro` ou se o pedido permanece divergente.

## Reembolso ambíguo

Antes de tentar novamente:

1. consulte o pagamento no Mercado Pago;
2. confirme se já consta como `refunded` ou `charged_back`;
3. só então repita a operação, preservando a mesma chave de idempotência.

## Estoque divergente

1. pause temporariamente o produto;
2. compare `pedido_itens`, histórico do pedido e estoque atual;
3. verifique cancelamentos e devoluções;
4. corrija com operação administrativa auditada;
5. registre causa e impacto.

## Incidente de segurança

1. preserve logs e evidências;
2. revogue ou rotacione os segredos afetados;
3. invalide sessões quando necessário;
4. limite ou suspenda a funcionalidade comprometida;
5. avalie obrigação de comunicação a titulares e autoridades;
6. documente linha do tempo, causa, contenção e correção.

## Rotina

Diariamente:

- conciliação de pagamentos;
- reembolsos com falha;
- chamados urgentes;
- erros das Edge Functions.

Semanalmente:

- contas administrativas;
- produtos com estoque baixo;
- dependências e alertas de segurança;
- restauração de amostra do backup em ambiente isolado.

Antes de cada release:

- `npm run verify`;
- teste de sandbox financeiro;
- revisão de migration;
- validação dos cabeçalhos HTTP;
- registro do commit e da versão publicada.

## Pedido atrasado na cozinha

1. Abra **Restaurante → Cozinha**.
2. Verifique o horário de início e o tempo estimado.
3. Ajuste a prioridade somente quando houver justificativa operacional.
4. Avise o cliente quando a previsão sofrer alteração relevante.
5. Não marque como pronto antes da conclusão física do pedido.

## Pedido pronto com entregador atribuído

O restaurante deve aguardar o entregador confirmar a retirada. Não altere manualmente o pedido para entregue. Se o entregador não comparecer, remova ou troque a atribuição por um fluxo administrativo auditado.

## Checkout duplicado

A mesma chave de checkout deve retornar o pedido já criado. Se houver dois pedidos diferentes para a mesma tentativa, preserve os logs, suspenda o pagamento do duplicado e investigue a migration 016 e o índice `pedidos_chave_cliente_idx`.

## Variação indisponível

1. não substitua silenciosamente por outra variação;
2. mantenha o item indisponível no carrinho;
3. peça ao cliente para revisar a escolha;
4. confirme que o pedido armazenou `variante_id`, `variante_nome` e o preço usado.
