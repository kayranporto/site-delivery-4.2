"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("cardápio do restaurante neutraliza a grade global de .produtos", () => {
  const css = read("css/modules/restaurante-4.2.2.css");
  assert.match(css, /\.produtos\{display:block;/);
  assert.match(css, /\.lista-produtos\{display:grid;width:100%;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("cards do restaurante ocupam a largura da coluna sem herdar linhas da Home", () => {
  const css = read("css/modules/restaurante-4.2.2.css");
  assert.match(css, /\.produto-card\{position:relative;display:grid;width:100%;grid-template-columns:145px minmax\(0,1fr\);grid-template-rows:1fr;/);
  assert.match(css, /@media\(max-width:900px\).*\.lista-produtos\{grid-template-columns:1fr\}/s);
});

test("cabeçalho mantém nome abaixo do banner e limita a sobreposição ao logo", () => {
  const css = read("css/modules/restaurante-4.2.2.css");
  const html = read("html/restaurante.html");
  const sw = read("sw.js");
  assert.match(css, /\.banner-restaurante\{width:calc\(100% - 32px\);height:clamp\(230px,20vw,280px\)/);
  assert.match(css, /\.banner-restaurante img\{[^}]*object-fit:contain/);
  assert.match(css, /\.info-restaurante\{[^}]*margin:-38px auto 18px[^}]*align-items:flex-start/);
  assert.match(css, /\.info-restaurante>div\{min-width:0;padding-top:42px\}/);
  assert.match(css, /\.info-restaurante h1\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /@media\(max-width:680px\).*\.banner-restaurante\{height:clamp\(170px,55vw,240px\)\}.*\.info-restaurante\{[^}]*margin-top:-32px/s);
  assert.match(html, /restaurante-4\.2\.2\.css\?v=4\.5\.2/);
  assert.match(sw, /restaurante-4\.2\.2\.css\?v=4\.5\.2/);
});
