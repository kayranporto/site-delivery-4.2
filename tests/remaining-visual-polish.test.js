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

test("modo escuro global respeita o sistema e salva a escolha", () => {
    const css = read("css/core/enhancements.css");
    const js = read("js/core/site-enhancements.js");
    assert.match(css, /html\[data-theme="dark"\]/);
    assert.match(css, /\.theme-toggle/);
    assert.match(css, /data-theme="dark"\] \.cupom-box/);
    assert.match(css, /\.hero-deal-card,.hero-rating-card,.hero-time-card/);
    assert.match(js, /prefers-color-scheme: dark/);
    assert.match(js, /multi-delivery-theme/);
    assert.match(js, /localStorage\.setItem\(THEME_STORAGE_KEY/);
    assert.match(js, /aria-pressed/);
});

test("modo escuro cobre as superficies das paginas operacionais", () => {
    const css = read("css/core/enhancements.css");
    for (const seletor of [
        ".checkout-card",
        ".team-card",
        ".driver-section",
        ".order-filters",
        ".admin-filters",
        ".banner-restaurante",
        ".pending-card"
    ]) assert.ok(css.includes(seletor), `faltou cobertura escura para ${seletor}`);
});

test("camada do tema vem depois dos estilos especificos", () => {
    for (const file of ["index.html", "html/restaurante.html", "html/empresa-equipe.html", "html/empresa-colaborador.html"]) {
        const html = read(file);
        const theme = html.indexOf("css/core/enhancements.css");
        const lastPageCss = Math.max(html.lastIndexOf("css/pages/"), html.lastIndexOf("css/modules/"));
        assert.ok(theme > lastPageCss, `${file} pode sobrescrever o modo escuro`);
    }
});

test("todas as paginas carregam a camada visual compartilhada", () => {
    const htmlFiles = ["index.html", "offline.html", "404.html", ...fs.readdirSync(path.join(root, "html")).filter((file) => file.endsWith(".html")).map((file) => `html/${file}`)];
    for (const file of htmlFiles) {
        assert.match(read(file), /css\/core\/enhancements\.css/, `${file} sem enhancements.css`);
        assert.match(read(file), /js\/core\/site-enhancements\.js/, `${file} sem site-enhancements.js`);
    }
});
