"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("checkout reconhece endereço fora do raio como inválido", () => {
  const source = read("js/checkout-4.2.3.js");
  assert.match(source, /regiao_atendida === false/);
  assert.match(source, /fora da área\|fora do raio\|raio máximo\|não atend/i);
  assert.match(source, /fora da área ou do raio de entrega/i);
});

test("botão final só habilita quando o checkout está pronto", () => {
  const source = read("js/checkout-4.2.3.js");
  assert.match(source, /const pronto = quantidade > 0 && enderecoValido && formaPagamento && minimoValido && !fechado/);
  assert.match(source, /btnFinalizar\.disabled = !habilitado/);
  assert.match(source, /dataset\.checkoutReady = habilitado \? "true" : "false"/);
  assert.match(source, /Pedido mínimo não atingido/);
  assert.match(source, /Restaurante fechado/);
  assert.match(source, /Endereço não atendido/);
});

test("checkout publica cache-buster novo para a camada de UX", () => {
  const html = read("checkout.html");
  assert.match(html, /checkout-4\.2\.3\.js\?v=4\.2\.4/);
  assert.match(html, /site-enhancements\.js\?v=4\.4\.1/);
});
