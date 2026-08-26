"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("acabamento compartilhado cobre foco, toque e carregamento", () => {
    const css = read("css/core/enhancements.css");
    assert.match(css, /input,select,textarea\):focus-visible/);
    assert.match(css, /@media\(pointer:coarse\)/);
    assert.match(css, /appLoadingSweep/);
});

test("fluxo do cliente recebeu refinamentos nas telas principais", () => {
    assert.match(read("css/pages/restaurante.css"), /Cardapio mais claro/);
    assert.match(read("css/pages/checkout.css"), /Checkout com estados/);
    assert.match(read("css/pages/meus-pedidos.css"), /Historico de pedidos/);
    assert.match(read("css/pages/acompanhamento.css"), /Acompanhamento mais legivel/);
});

test("autenticacao e painel do restaurante possuem alvos moveis maiores", () => {
    assert.match(read("css/core/auth.css"), /\.auth-button\{min-height:52px\}/);
    assert.match(read("css/pages/empresa-dashboard.css"), /Painel operacional com leitura/);
});

test("convites PWA nao disputam espaco sobre as acoes no celular", () => {
    assert.match(read("js/core/site-enhancements.js"), /install\.textContent="Instalar app"/);
    assert.match(read("css/modules/mobile-pwa-4.2.6.css"), /\.pwa-update\.show~\.install-app\{display:none!important\}/);
});
