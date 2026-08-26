"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("perfil destaca acoes principais e o acesso ao restaurante", () => {
    const css = read("css/pages/perfil.css");
    assert.match(css, /\.restaurante-menu-item\s*\{/);
    assert.match(css, /\.pedido-acao:hover/);
    assert.match(css, /\.menu-item:focus-visible/);
});

test("perfil mantem editar conta e alvos confortaveis no celular", () => {
    const css = read("css/pages/perfil.css");
    assert.match(css, /\.editar-perfil\s*\{[\s\S]*?display:\s*inline-flex/);
    assert.match(css, /\.menu-item\s*\{\s*min-height:\s*68px/);
    assert.match(read("html/perfil.html"), /perfil\.css\?v=4\.2\.0\.1/);
});
