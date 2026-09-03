"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("fundação mobile fica restrita às rotas do cliente", () => {
  const js = read("js/core/site-enhancements.js");
  for (const route of ["index.html", "restaurante.html", "checkout.html", "meus-pedidos.html", "favoritos.html", "perfil.html"]) {
    assert.match(js, new RegExp(`"${route.replace(".", "\\.")}"`));
  }
  assert.doesNotMatch(js.match(/const CLIENT_PAGES[\s\S]*?\]\);/)?.[0] || "", /admin\.html|empresa-dashboard\.html|entregador\.html/);
});

test("navegação inferior possui as cinco áreas e respeita safe area", () => {
  const js = read("js/core/site-enhancements.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const label of ["Início", "Buscar", "Pedidos", "Favoritos", "Perfil"]) assert.match(js, new RegExp(`label: "${label}"`));
  assert.match(css, /grid-template-columns:\s*repeat\(5/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*58px/);
});

test("checkout e fluxos focados não recebem navegação inferior", () => {
  const js = read("js/core/site-enhancements.js");
  const navPages = js.match(/const CLIENT_NAV_PAGES[\s\S]*?\]\);/)?.[0] || "";
  assert.doesNotMatch(navPages, /checkout\.html|restaurante\.html|pedido-sucesso\.html/);
});
