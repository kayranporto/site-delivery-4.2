"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("gestão mobile usa a navegação inferior aprovada", () => {
  const html = read("html/empresa-dashboard.html");
  for (const target of ["#visaoGeral", "#pedidos", "#cardapio", "#operacao"]) {
    assert.match(html, new RegExp(`href="${target}"[^>]*data-dashboard-link`));
  }
  assert.match(html, /id="maisDashboard"/);
  assert.match(html, /empresa-dashboard\.css\?v=4\.6\.0/);
  assert.match(html, /empresa-dashboard\.js\?v=4\.6\.0/);
});

test("navegação rápida usa o mesmo controlador das seções do painel", () => {
  const js = read("js/pages/empresa-dashboard.js");
  assert.match(js, /\[data-dashboard-link\]\[href\^="#"\]/);
  assert.match(js, /dashboardLinks\.forEach/);
  assert.match(js, /mostrarSecaoPainel\(link\.hash/);
});

test("gestão mobile mantém dados financeiros e comerciais reais", () => {
  const html = read("html/empresa-dashboard.html");
  const operation = read("js/modules/operacao-empresa.js");
  const dashboard = read("js/pages/empresa-dashboard.js");
  for (const id of ["financeBruto", "financeTaxa", "financeLiquido", "financePendente", "financeReembolsos", "financeEntregues"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(operation, /empresa_relatorio_financeiro/);
  assert.match(dashboard, /cuponsEmpresa/);
  assert.match(dashboard, /avaliacoesEmpresa/);
});

test("gestão mobile possui leitura confortável e alvos de toque", () => {
  const css = read("css/pages/empresa-dashboard.css");
  assert.match(css, /\.restaurant-management-mobile\{position:fixed;inset:auto 0 0/);
  assert.match(css, /grid-template-columns:repeat\(5,1fr\)/);
  assert.match(css, /#promocoes form>\.btn\{width:100%;min-height:50px/);
  assert.match(css, /#avaliacoes \.review-response-form input\{min-height:48px;font-size:14px/);
  assert.match(css, /#financeiro \.finance-grid\{grid-template-columns:repeat\(2/);
  assert.match(css, /body\{--ink:#f7f7f8;--ink-2:#e8e9eb/);
  assert.match(css, /\.variants-card\{display:none\}/);
});

test("pedidos mobile usam abas de status e uma coluna por vez", () => {
  const html = read("html/empresa-dashboard.html");
  const js = read("js/pages/empresa-dashboard.js");
  const css = read("css/pages/empresa-dashboard.css");
  for (const status of ["recebido", "preparando", "pronto", "finalizados"]) {
    assert.match(html, new RegExp(`data-order-mobile-filter="${status}"`));
  }
  assert.match(js, /aplicarFiltroPedidosMobile/);
  assert.match(css, /\.kanban-column\.mobile-column-active\{display:block\}/);
});
