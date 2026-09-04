"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => {
    const direct = path.join(root, file);
    return fs.readFileSync(fs.existsSync(direct) ? direct : path.join(root, "html", file), "utf8");
};

test("carrinho 4.2.5 injeta edição sem alterar o fluxo base", () => {
    const js = read("js/modules/carrinho-4.2.5.js");
    assert.match(js, /editar-item-425/);
    assert.match(js, /abrirEdicao/);
    assert.match(js, /contextoEdicao/);
    assert.match(js, /window\.editarItemCarrinho/);
});

test("edição reaproveita variante, adicionais, observação e quantidade", () => {
    const js = read("js/modules/carrinho-4.2.5.js");
    for (const trecho of [
        "produto-variante",
        "#listaAdicionais input:checked",
        "observacao",
        "quantidade",
        "mesclarEdicao"
    ]) assert.ok(js.includes(trecho), `carrinho 4.2.5 sem ${trecho}`);
});

test("carrinho sincroniza catálogo e bloqueia checkout com item indisponível", () => {
    const js = read("js/modules/carrinho-4.2.5.js");
    assert.match(js, /sincronizarCatalogo/);
    assert.match(js, /produto_variantes/);
    assert.match(js, /adicionais/);
    assert.match(js, /indisponiveis/);
    assert.match(js, /stopImmediatePropagation/);
});

test("restaurante carrega assets versionados do carrinho 4.2.5 depois do modal base", () => {
    const html = read("restaurante.html");
    assert.match(html, /css\/modules\/carrinho-4\.2\.5\.css\?v=4\.2\.6/);
    assert.match(html, /js\/modules\/carrinho-4\.2\.5\.js\?v=4\.2\.6/);
    assert.ok(html.indexOf("js/modules/modal.js?v=4.5.3") < html.indexOf("js/modules/carrinho-4.2.5.js?v=4.2.6"));
});

test("carrinho apresenta resumo, pedido mínimo e ações claras", () => {
    const html = read("restaurante.html");
    const js = read("js/modules/carrinho.js");
    for (const trecho of ["carrinhoQuantidadeResumo", "carrinhoMinimo", "btnCheckoutTotal", "continuarComprando", "limparCarrinhoBtn"]) {
        assert.ok(html.includes(trecho), `restaurante sem ${trecho}`);
    }
    for (const trecho of ["Falta para o pedido mínimo", "Pedido mínimo atingido", "Explorar cardápio", "por unidade", "aria-valuenow"]) {
        assert.ok(js.includes(trecho), `carrinho sem ${trecho}`);
    }
});
