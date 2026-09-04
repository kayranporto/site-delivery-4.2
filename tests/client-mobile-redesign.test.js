"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("fundação mobile fica restrita às rotas do cliente", () => {
  const js = read("js/core/client-mobile-4.5.js");
  for (const route of ["index.html", "restaurante.html", "checkout.html", "meus-pedidos.html", "favoritos.html", "perfil.html"]) {
    assert.match(js, new RegExp(`"${route.replace(".", "\\.")}"`));
  }
  assert.doesNotMatch(js.match(/const CLIENT_PAGES[\s\S]*?\]\);/)?.[0] || "", /admin\.html|empresa-dashboard\.html|entregador\.html/);
});

test("navegação inferior possui as cinco áreas e respeita safe area", () => {
  const js = read("js/core/client-mobile-4.5.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const label of ["Início", "Buscar", "Pedidos", "Favoritos", "Perfil"]) assert.match(js, new RegExp(`label: "${label}"`));
  assert.match(css, /grid-template-columns:\s*repeat\(5/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*58px/);
});

test("checkout e fluxos focados não recebem navegação inferior", () => {
  const js = read("js/core/client-mobile-4.5.js");
  const navPages = js.match(/const CLIENT_NAV_PAGES[\s\S]*?\]\);/)?.[0] || "";
  assert.doesNotMatch(navPages, /checkout\.html|restaurante\.html|pedido-sucesso\.html/);
});

test("camada mobile possui JavaScript e CSS próprios", () => {
  const shared = read("js/core/site-enhancements.js");
  assert.doesNotMatch(shared, /CLIENT_NAV_PAGES|client-bottom-nav|navItems/);
  assert.match(read("sw.js"), /client-mobile-4\.5\.js\?v=4\.5\.0/);
  assert.match(read("sw.js"), /client-mobile-4\.5\.css\?v=4\.5\.2/);
});

test("assets mobile são carregados somente nas páginas do cliente", () => {
  const clientPages = [
    "index.html",
    "html/restaurante.html",
    "html/checkout.html",
    "html/pedido-sucesso.html",
    "html/meus-pedidos.html",
    "html/acompanhamento.html",
    "html/favoritos.html",
    "html/perfil.html",
    "html/enderecos.html",
    "html/dados.html",
    "html/suporte.html",
    "html/privacidade.html"
  ];
  for (const page of clientPages) {
    const html = read(page);
    assert.match(html, /client-mobile-4\.5\.css\?v=4\.5\.2/, `${page} deve carregar o CSS mobile`);
    assert.match(html, /client-mobile-4\.5\.js\?v=4\.5\.0/, `${page} deve carregar o JS mobile`);
    assert.ok(html.indexOf("client-mobile-4.5.js") < html.indexOf("site-enhancements.js"), `${page} deve preparar o tema antes da camada compartilhada`);
  }

  for (const page of ["html/admin.html", "html/empresa-dashboard.html", "html/entregador.html"]) {
    assert.doesNotMatch(read(page), /client-mobile-4\.5\.(?:css|js)/, `${page} não deve carregar a área mobile do cliente`);
  }
});

test("home mobile usa dados reais para saudação, favoritos e repetição de pedido", () => {
  const home = read("index.html");
  const js = read("js/pages/home.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const id of ["saudacaoCliente", "pedirNovamente", "favoritosInicio"]) assert.match(home, new RegExp(`id="${id}"`));
  assert.match(js, /from\("pedidos"\)/);
  assert.match(js, /from\("produtos"\)/);
  assert.match(js, /FavoritesSync/);
  assert.match(js, /PosPedido\?\.pedirNovamente/);
  assert.match(css, /\.client-repeat-list/);
  assert.match(css, /\.client-favorites-list/);
  assert.match(css, /scroll-snap-type:\s*x/);
});

test("restaurante mobile mantém catálogo real e adição rápida segura", () => {
  const html = read("html/restaurante.html");
  const js = read("js/pages/restaurante.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const id of ["favoritarRestaurante", "resumoTotalCarrinho", "pesquisaProduto", "categorias", "listaProdutos"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /favorites-sync\.js/);
  assert.match(js, /from\("produto_grupos"\)/);
  assert.match(js, /from\("grupos_adicionais"\)/);
  assert.match(js, /requer_configuracao/);
  assert.match(js, /window\.adicionarAoCarrinho/);
  assert.match(css, /data-client-page="restaurante"/);
  assert.match(css, /\.pesquisa-produtos\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.restaurant-actions\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /min-height:\s*44px/);
});

test("produto mobile não oferece escolha de tamanho", () => {
  const restaurante = read("js/pages/restaurante.js");
  const modal = read("js/modules/modal.js");
  const html = read("html/restaurante.html");
  assert.match(restaurante, /varianteRepresentaTamanho/);
  assert.match(modal, /varianteRepresentaTamanho/);
  assert.match(restaurante, /filter\(\(variante\) => !varianteRepresentaTamanho\(variante\)\)/);
  assert.match(modal, /filter\(\(variante\) => !varianteRepresentaTamanho\(variante\)\)/);
  assert.match(html, /modal\.js\?v=4\.5\.3/);
});
