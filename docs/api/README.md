# API pública do Multi Delivery

Esta é a API HTTP versionada e somente de leitura para integrações externas de catálogo. A especificação completa está em [`../../supabase/functions/api-publica/openapi.json`](../../supabase/functions/api-publica/openapi.json) e é servida em `/openapi.json`.

**Estado:** versão 1 publicada e validada no Supabase em 01/09/2026.

## Base URL

```text
https://wzxsjxdbxonrmlmzufpv.supabase.co/functions/v1/api-publica
```

## Endpoints v1

- `GET /v1/status` — disponibilidade e versão da API;
- `GET /openapi.json` — contrato OpenAPI 3.1 legível por Swagger UI e geradores de clientes;
- `GET /v1/restaurantes` — restaurantes publicados e ativos, com paginação e filtros exatos por categoria/cidade;
- `GET /v1/restaurantes/{id}/cardapio` — categorias, produtos, variações e adicionais públicos.

## Autenticação do gateway

Envie a chave publicável do projeto no cabeçalho `apikey`. Essa chave identifica o projeto e pode ser usada em clientes públicos; ela não substitui autenticação de usuário e não ignora RLS.

Exemplo:

```bash
curl \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  "https://wzxsjxdbxonrmlmzufpv.supabase.co/functions/v1/api-publica/v1/restaurantes?limite=20&offset=0"
```

## Segurança e privacidade

- O gateway exige `apikey`; a função usa exclusivamente a chave pública do projeto e continua limitada pelas políticas RLS do papel `anon`.
- A função não lê `service_role`, tabelas de clientes, pedidos, pagamentos ou campos administrativos de restaurantes.
- Somente métodos `GET`, `HEAD` e `OPTIONS` são aceitos.
- `limite` é restrito a 50 itens e `offset` a 10.000.
- As respostas incluem `X-Request-Id`, `X-API-Version`, `Cache-Control` e `X-Content-Type-Options: nosniff`.
- CORS respeita `ALLOWED_ORIGINS`/`SITE_URL`. Chamadas servidor-servidor não dependem de CORS.

O catálogo já é público no site. Se futuramente forem adicionados pedidos, webhooks de parceiros ou dados privados, esses endpoints deverão usar credenciais individuais, autorização por escopo, rotação/revogação e rate limit persistente — não devem reutilizar este acesso anônimo.

## Republicação e teste remoto

```bash
supabase functions deploy api-publica
$env:API_PUBLICA_URL="https://wzxsjxdbxonrmlmzufpv.supabase.co/functions/v1/api-publica"
$env:API_PUBLICA_KEY="sb_publishable_..."
npm run test:e2e -- e2e/api.spec.js
```

A ausência de `API_PUBLICA_URL` ou `API_PUBLICA_KEY` faz o smoke remoto ser ignorado no desenvolvimento local; o gate unitário continua validando contrato, segurança e OpenAPI.
