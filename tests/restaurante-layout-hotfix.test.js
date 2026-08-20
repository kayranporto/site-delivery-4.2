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
  assert.match(css, /\.produto-card\{display:grid;width:100%;grid-template-columns:145px minmax\(0,1fr\);grid-template-rows:1fr;/);
  assert.match(css, /@media\(max-width:900px\).*\.lista-produtos\{grid-template-columns:1fr\}/s);
});
