const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const ler = (arquivo) => {
    const direto = path.join(raiz, arquivo);
    return fs.readFileSync(fs.existsSync(direto) ? direto : path.join(raiz, "html", arquivo), "utf8");
};

test("checkout 4.2.3 inclui navegação de etapas e feedbacks", () => {
    const html = ler("checkout.html");
    assert.match(html, /css\/modules\/checkout-4\.2\.3\.css/);
    assert.match(html, /js\/modules\/checkout-4\.2\.3\.js/);
    for (const id of ["stepEndereco", "stepPagamento", "stepRevisao", "enderecoStatus", "pagamentoSelecionadoResumo", "cupomFeedback", "summaryContext", "checkoutSubmitStatus"]) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
    }
});

test("checkout 4.2.3 mantém idempotência no envio e adiciona bloqueio visual", () => {
    const core = ler("js/pages/checkout.js");
    const ux = ler("js/modules/checkout-4.2.3.js");
    assert.match(core, /p_chave_cliente:\s*chaveIdempotenciaCheckout\(\)/);
    assert.match(core, /crypto\.randomUUID\(\)/);
    assert.match(ux, /cliqueProtegido/);
    assert.match(ux, /stopImmediatePropagation\(\)/);
    assert.match(ux, /data-checkout-lock|checkoutLock/);
});

test("checkout 4.2.3 preserva as regras do fluxo existente", () => {
    const core = ler("js/pages/checkout.js");
    assert.match(core, /calcular_entrega_empresa/);
    assert.match(core, /criar_pedido_operacional/);
    assert.match(core, /pedido_definir_pagamento_online/);
    assert.match(core, /functions\.invoke\("criar-pagamento"/);
});
