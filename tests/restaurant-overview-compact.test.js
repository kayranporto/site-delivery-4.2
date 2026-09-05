"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
test("overview compacto mantém indicadores e ícones acessíveis", () => {
  const html = fs.readFileSync(path.join(root, "html/empresa-dashboard.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/pages/empresa-overview-mobile.css"), "utf8");
  assert.match(html, /empresa-overview-mobile\.css\?v=4\.6\.4/);
  assert.equal((html.match(/class="metric-icon" aria-hidden="true"><svg/g) || []).length, 5);
  for (const id of ["totalPedidos", "pedidosAtivos", "faturamento", "ticketMedio", "totalProdutos", "produtosDisponiveis"]) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /sales-chart svg\{min-width:0\}/);
  assert.match(css, /store-switch\{min-height:44px/);
});
