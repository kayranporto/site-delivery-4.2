"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("home exibe apenas o carrinho principal do cabeçalho", () => {
  assert.match(html, /id="abrirCarrinho"/);
  assert.doesNotMatch(html, /id="floatingCart"/);
  assert.doesNotMatch(html, /class="floating-cart"/);
  const botoesCarrinho = html.match(/aria-label="Abrir carrinho"/g) || [];
  assert.equal(botoesCarrinho.length, 1);
});
