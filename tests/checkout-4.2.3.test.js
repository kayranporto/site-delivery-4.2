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

test("checkout rápido recolhe opcionais e reaproveita preferências", () => {
    const html = ler("checkout.html");
    const core = ler("js/pages/checkout.js");
    const ux = ler("js/modules/checkout-4.2.3.js");
    for (const id of ["checkoutFastLane", "checkoutFastStatus", "observacoesDetalhes", "cupomDetalhes", "finalizarPedidoTexto"]) {
        assert.match(html, new RegExp(`id=["']${id}["']`), `checkout sem ${id}`);
    }
    assert.match(html, /<details class="checkout-card checkout-optional"/);
    assert.match(ux, /checkoutPreferencias/);
    assert.match(ux, /restaurarPagamentoPreferido/);
    assert.match(core, /await finalizarPedido\(\)/);
    assert.match(core, /checkout-envio-finalizado/);
    assert.match(core, /checkoutInicializado/);
    assert.match(core, /checkout-inicializado/);
});

test("checkout bloqueia pagamento e oculta valores finais quando o endereço não é atendido", () => {
    const ux = ler("js/modules/checkout-4.2.3.js");
    const css = ler("css/modules/checkout-4.2.3.css");
    assert.match(ux, /checked:not\(:disabled\)/);
    assert.match(ux, /bloquearPagamento\(!enderecoValido\)/);
    assert.match(ux, /dados\?\.regiao_atendida !== false/);
    assert.match(ux, /Entrega indisponível neste endereço/);
    assert.match(ux, /marcarValorPendente\(taxa, totalPendente/);
    assert.match(ux, /marcarValorPendente\(total, totalPendente/);
    assert.match(ux, /marcarValorPendente\(footerTotal, totalPendente/);
    assert.match(ux, /stepPagamento\.dataset\.estado = enderecoValido/);
    assert.match(css, /data-checkout-bloqueado/);
    assert.match(css, /#total\[data-pendente="true"\]/);
    assert.match(css, /checkout-fast-lane\[data-estado="erro"\]/);
});
