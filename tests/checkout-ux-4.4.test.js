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
  assert.match(source, /btnFinalizar\.disabled !== desabilitado/);
  assert.match(source, /dataset\.checkoutReady !== checkoutReady/);
  assert.match(source, /Pedido mínimo não atingido/);
  assert.match(source, /Restaurante fechado/);
  assert.match(source, /Endereço não atendido/);
});

test("observer do checkout não reescreve disabled indefinidamente", () => {
  const source = read("js/checkout-4.2.3.js");
  assert.match(source, /if \(btnFinalizar\.disabled !== desabilitado\) btnFinalizar\.disabled = desabilitado/);
  assert.doesNotMatch(source, /atualizandoBotao/);
  assert.match(source, /attributeFilter: \["disabled"\]/);
});

test("checkout publica cache-buster novo para a camada de UX", () => {
  const html = read("checkout.html");
  assert.match(html, /checkout-4\.2\.3\.js\?v=4\.2\.5/);
  assert.match(html, /site-enhancements\.js\?v=4\.4\.1/);
});
