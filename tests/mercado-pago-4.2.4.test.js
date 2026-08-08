"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

test("Mercado Pago 4.2.4 usa sandbox como ambiente seguro padrão", () => {
    const code = ler("supabase/functions/criar-pagamento/index.ts");
    assert.match(code, /MERCADO_PAGO_ENVIRONMENT/);
    assert.match(code, /\|\|\s*"sandbox"/);
    assert.match(code, /accessToken\.startsWith\("TEST-"\)/);
    assert.match(code, /mode === "sandbox" \? preference\.sandbox_init_point : preference\.init_point/);
    assert.match(code, /X-Idempotency-Key/);
});

test("Mercado Pago 4.2.4 rejeita mistura entre sandbox e produção", () => {
    const code = ler("supabase/functions/criar-pagamento/index.ts");
    assert.match(code, /Credencial do Mercado Pago incompatível com o ambiente configurado/);
    assert.match(code, /A preferência existente pertence a outro ambiente de pagamento/);
    assert.match(code, /URL de checkout incompatível com o ambiente/);
});

test("webhook Mercado Pago valida assinatura e reconcilia com idempotência", () => {
    const code = ler("supabase/functions/mercado-pago-webhook/index.ts");
    assert.match(code, /x-signature/);
    assert.match(code, /x-request-id/);
    assert.match(code, /HMAC/);
    assert.match(code, /MERCADO_PAGO_WEBHOOK_SECRET/);
    assert.match(code, /reconciliar_pagamento_mercado_pago/);
    assert.match(code, /dedupeKey/);
    assert.match(code, /transaction_amount/);
    assert.match(code, /currency_id/);
});
