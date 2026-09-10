"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin mobile usa a navegação inferior aprovada", () => {
  const html = read("html/admin.html");
  for (const target of ["#overview", "#pedidos", "#restaurantes", "#usuarios"]) {
    assert.match(html, new RegExp(`href="${target}"[^>]*data-admin-mobile-link`));
  }
  assert.match(html, /id="adminMobileMore"/);
  assert.match(html, /admin-mobile-approved\.css\?v=4\.9\.0/);
  assert.match(html, /admin\.js\?v=4\.9\.0/);
});

test("admin mobile preserva o desktop e aplica a direção escura aprovada", () => {
  const css = read("css/pages/admin-mobile-approved.css");
  assert.match(css, /\.admin-mobile-nav\{display:none\}/);
  assert.match(css, /\.admin-mobile-nav\[hidden\]\{display:none!important\}/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /--admin-mobile-bg:#0b0908/);
  assert.match(css, /--admin-mobile-accent:#ff641a/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("tabelas administrativas viram cartões legíveis no celular", () => {
  const css = read("css/pages/admin-mobile-approved.css");
  assert.match(css, /\.admin-table-wrap thead\{display:none\}/);
  assert.match(css, /#pedidos td:nth-child\(1\)::before\{content:"Pedido"\}/);
  assert.match(css, /#restaurantes td:nth-child\(1\)::before\{content:"Restaurante"\}/);
  assert.match(css, /#usuarios td:nth-child\(1\)::before\{content:"Usuário"\}/);
  assert.match(css, /min-height:48px/);
});

test("navegação mobile e menu lateral permanecem sincronizados", () => {
  const js = read("js/pages/admin.js");
  assert.match(js, /\[data-admin-mobile-link\]/);
  assert.match(js, /const todosLinks = \[\.\.\.links, \.\.\.linksMobile\]/);
  assert.match(js, /document\.querySelectorAll\("\[data-admin-view\]"\)/);
  assert.match(js, /view\.hidden = !ativa/);
  assert.match(js, /adminMobileMore/);
  assert.match(js, /adminMobileNav/);
  assert.match(js, /pendentesMobileMenu/);
  assert.match(js, /pedidosMobileMenu/);
});
