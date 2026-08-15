"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("home mantém somente o carrinho do cabeçalho visível", () => {
  const html = read("index.html");
  const css = read("css/home-4.2.1.css");

  assert.match(html, /id="abrirCarrinho"/);
  assert.match(css, /\.home-page \.floating-cart\{display:none!important\}/);
});
