# Edge Functions — Multi Delivery 4.0

## Dependências

Cada função possui `deno.json` próprio e usa versão exata das dependências. Não substitua por tags abertas como `@2`.

## Segredos

```bash
supabase secrets set MERCADO_PAGO_ACCESS_TOKEN="..."
supabase secrets set MERCADO_PAGO_WEBHOOK_SECRET="..."
supabase secrets set MERCADO_PAGO_COLLECTOR_ID="..."
supabase secrets set SITE_URL="https://seu-dominio.example"
supabase secrets set ALLOWED_ORIGINS="https://seu-dominio.example,https://homologacao.example"
```

Push opcional:

```bash
supabase secrets set VAPID_PUBLIC_KEY="..."
supabase secrets set VAPID_PRIVATE_KEY="..."
supabase secrets set VAPID_SUBJECT="mailto:privacidade@seu-dominio.example"
supabase secrets set PUSH_WEBHOOK_SECRET="..."
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizados pelo ambiente das Edge Functions. A chave de serviço nunca deve sair do backend.

## Publicação

```bash
supabase functions deploy criar-pagamento
supabase functions deploy mercado-pago-webhook --no-verify-jwt
supabase functions deploy processar-reembolso
supabase functions deploy enviar-push --no-verify-jwt
```

A configuração JWT também está declarada em `supabase/config.toml`.

## Webhook do Mercado Pago

Cadastre o evento de pagamentos em:

```text
https://SEU-PROJETO.supabase.co/functions/v1/mercado-pago-webhook
```

O webhook:

1. valida `x-signature` e `x-request-id`;
2. consulta o pagamento diretamente na API do Mercado Pago;
3. opcionalmente valida o `collector_id` esperado;
4. envia somente dados sanitizados para a RPC;
5. valida referência externa, valor e moeda;
6. processa eventos repetidos de forma idempotente;
7. não rebaixa um pagamento já confirmado por evento antigo;
8. abre reembolso automaticamente quando o pagamento chega após o cancelamento.

## Reembolso

O painel administrativo chama `processar-reembolso`. A função prepara o pedido sob lock, solicita o reembolso integral com chave de idempotência, consulta o pagamento em caso de resposta ambígua e reconcilia o resultado no banco.

Nunca permita que o frontend altere diretamente `pagamento_status` ou marque um reembolso como concluído.

## Push

1. Copie apenas `VAPID_PUBLIC_KEY` para `js/core/config.js`.
2. Crie webhook de `INSERT` em `public.notificacoes` para `enviar-push`.
3. Envie `x-delivery-webhook-secret` com o segredo configurado.
4. Remova inscrições que retornarem 404 ou 410.
