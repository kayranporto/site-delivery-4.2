"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("páginas do cliente carregam a identidade desktop aprovada", () => {
  const pages = [
    "index.html", "html/restaurante.html", "html/checkout.html", "html/favoritos.html",
    "html/meus-pedidos.html", "html/acompanhamento.html", "html/perfil.html",
    "html/login.html", "html/cadastro.html", "html/empresa-login.html", "html/empresa-cadastro.html",
    "html/recuperar-senha.html", "html/nova-senha.html"
  ];
  for (const page of pages) assert.match(read(page), /client-desktop-approved-5\.0\.css\?v=5\.0\.0/, page);

  const css = read("css/modules/client-desktop-approved-5.0.css");
  assert.match(css, /@media \(min-width: 769px\)/);
  assert.match(css, /--desktop-bg: #090807/);
  assert.match(css, /--desktop-orange: #ff5a1f/);
  assert.match(css, /client-food-atlas\.png/);
});

test("checkout usa o rótulo aprovado Cartão", () => {
  const html = read("html/checkout.html");
  const js = read("js/modules/checkout-4.2.3.js");
  assert.match(html, /<strong>Cartão<\/strong>/);
  assert.match(js, /"Cartão": "Cartão"/);
  assert.doesNotMatch(`${html}\n${js}`, /Cartão na entrega/);
});

test("painel do restaurante expõe as áreas desktop aprovadas", () => {
  const html = read("html/empresa-dashboard.html");
  for (const target of ["#visaoGeral", "#pedidos", "#cardapio", "#categorias", "#promocoes", "#avaliacoes", "#financeiro", "#relatorios", "#configuracoes"]) {
    assert.match(html, new RegExp(`href="${target}"`));
  }
  assert.match(html, /empresa-desktop-approved\.css\?v=5\.0\.0/);
  assert.equal((html.match(/id="logoutEmpresa"/g) || []).length, 1);
});

test("admin desktop mantém acesso protegido, navegação aprovada e somente um logout", () => {
  const html = read("html/admin.html");
  const js = read("js/pages/admin.js");
  for (const label of ["Início", "Pedidos", "Restaurantes", "Usuários", "Relatórios", "Configurações", "Meu perfil"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /admin-desktop-approved\.css\?v=5\.0\.0/);
  assert.match(js, /db\.rpc\("usuario_eh_admin"\)/);
  assert.equal((html.match(/id="adminLogout"/g) || []).length, 1);
});

test("perfil continua mostrando o acesso administrativo somente após checagem de função", () => {
  const html = read("html/perfil.html");
  const js = read("js/pages/perfil.js");
  assert.match(html, /id="adminLink"[^>]*hidden/);
  assert.match(js, /rpc\("usuario_eh_admin"\)/);
  assert.equal((html.match(/id="logout"/g) || []).length, 1);
});
