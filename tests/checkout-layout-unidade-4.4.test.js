"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("aviso da unidade fica dentro do fluxo e não quebra a grid principal do checkout", () => {
  const source = read("js/checkout-unidade-4.3.js");
  assert.match(source, /const alvo = document\.querySelector\("\.checkout-flow"\)/);
  assert.match(source, /alvo\.prepend\(aviso\)/);
  assert.doesNotMatch(source, /\.checkout-summary, #listaResumo/);
});
