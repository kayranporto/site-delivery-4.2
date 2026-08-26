"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const htmlFiles = [path.join(root, "index.html"), ...fs.readdirSync(path.join(root, "html")).filter((name) => name.endsWith(".html")).map((name) => path.join(root, "html", name))];

test("scripts externos não bloqueiam a renderização das páginas", () => {
    for (const file of htmlFiles) {
        const html = fs.readFileSync(file, "utf8");
        for (const match of html.matchAll(/<script\b([^>]*)\bsrc=["'][^"']+["']([^>]*)>/gi)) {
            const atributos = `${match[1]} ${match[2]}`;
            assert.match(atributos, /\b(?:defer|async)\b/i, `${path.relative(root, file)} possui script externo bloqueante`);
        }
    }
});

test("home inicia conteúdo em paralelo e evita consultas de sessão duplicadas", () => {
    const home = read("js/pages/home.js");
    assert.match(home, /Promise\.all\(\[\s*window\.db[\s\S]*carregarResumoAvaliacoes\(\)/);
    assert.match(home, /Promise\.allSettled\(\[carregarEmpresas\(\), carregarDestaques\(\)\]\)/);
    assert.equal((home.match(/auth\.getUser\(\)/g) || []).length, 1);
    assert.match(read("js/core/favorites-sync.js"), /ready: async \(usuarioInicial = undefined\)/);
});

test("imagens e seções fora da primeira tela usam carregamento econômico", () => {
    const index = read("index.html");
    const css = read("css/pages/home-4.2.1.css");
    assert.match(index, /fetchpriority="high"[^>]+banner1\.svg/);
    assert.match(index, /loading="lazy"[^>]+promo\.svg/);
    assert.match(read("js/pages/home.js"), /img\.decoding = "async"/);
    assert.match(read("js/pages/restaurante.js"), /imagem\.decoding = "async"/);
    assert.match(css, /content-visibility:auto/);
    assert.match(css, /contain-intrinsic-size:auto 620px/);
});

test("assets versionados usam cache rápido e o service worker sempre atualiza", () => {
    const sw = read("sw.js");
    const vercel = JSON.parse(read("vercel.json"));
    assert.match(sw, /destination === "style" \|\| destination === "script"[\s\S]*cachePrimeiro\(event\.request\)/);
    assert.match(sw, /restaurante-4\.2\.2\.css\?v=4\.2\.2/);
    const headers = new Map(vercel.headers.map((entry) => [entry.source, entry.headers]));
    assert.match(headers.get("/css/(.*)")?.[0]?.value || "", /immutable/);
    assert.match(headers.get("/js/(.*)")?.[0]?.value || "", /immutable/);
    assert.match(headers.get("/sw.js")?.[0]?.value || "", /no-cache/);
});
