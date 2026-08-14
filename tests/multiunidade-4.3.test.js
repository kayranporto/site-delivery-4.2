"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("dashboard carrega o módulo multiunidade 4.3", () => {
  const enhancements = read("js/site-enhancements.js");
  assert.match(enhancements, /empresa-unidades-4\.3\.js/);
  assert.match(enhancements, /empresa-dashboard\\\.html/);
});

test("multiunidade filtra operação e catálogo pela unidade selecionada", () => {
  const source = read("js/empresa-unidades-4.3.js");
  for (const tabela of ["pedidos", "produtos", "categorias"]) {
    assert.match(source, new RegExp(`from\\(\\"${tabela}\\"\\)[\\s\\S]{0,260}eq\\(\\"unidade_id\\", unidadeAtivaId\\)`));
  }
});

test("novas categorias e produtos recebem unidade_id explicitamente", () => {
  const source = read("js/empresa-unidades-4.3.js");
  assert.match(source, /from\("categorias"\)\.insert\(\{[\s\S]{0,180}unidade_id: unidadeAtivaId/);
  assert.match(source, /const payload = \{[\s\S]{0,180}unidade_id: unidadeAtivaId/);
});

test("unidade principal não pode ser desativada pela interface", () => {
  const source = read("js/empresa-unidades-4.3.js");
  assert.match(source, /if \(unidade\.principal && unidade\.ativa\)/);
  assert.match(source, /unidade principal não pode ser desativada/i);
});
