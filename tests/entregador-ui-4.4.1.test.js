"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "html/entregador.html"), "utf8");
const js = fs.readFileSync(path.join(raiz, "js/modules/entregador-ui-4.4.1.js"), "utf8");
const css = fs.readFileSync(path.join(raiz, "css/modules/entregador-4.4.1.css"), "utf8");

test("painel do entregador carrega a camada operacional 4.4.1", () => {
  assert.match(html, /css\/modules\/entregador-4\.4\.1\.css\?v=4\.4\.1/);
  assert.match(html, /js\/modules\/entregador-ui-4\.4\.1\.js\?v=4\.4\.1/);
});

test("camada 4.4.1 permanece somente de apresentação", () => {
  assert.doesNotMatch(js, /\.rpc\s*\(/);
  assert.doesNotMatch(js, /\.from\s*\(/);
  assert.match(js, /driver-livebar/);
  assert.match(js, /delivery-card--active/);
  assert.match(js, /delivery-card--available/);
  assert.match(css, /data-driver-online/);
  assert.match(css, /delivery-distance/);
});

test("ações críticas continuam pertencendo ao fluxo base", () => {
  assert.match(html, /js\/pages\/entregador\.js\?v=4\.2\.0/);
  assert.match(html, /js\/modules\/entregador-logistica-4\.4\.js\?v=4\.4\.5/);
});
