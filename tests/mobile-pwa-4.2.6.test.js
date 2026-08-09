"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("PWA 4.2.6 versiona caches e remove caches antigos", () => {
  const sw = read("sw.js");
  assert.match(sw, /const VERSION = "4\.2\.6"/);
  assert.match(sw, /multi-delivery-v\$\{VERSION\}/);
  assert.match(sw, /key\.startsWith\("multi-delivery-"\)/);
  assert.match(sw, /SKIP_WAITING/);
});

test("PWA 4.2.6 registra service worker sem cache de atualização", () => {
  const js = read("js/site-enhancements.js");
  assert.match(js, /sw\.js\?v=4\.2\.6/);
  assert.match(js, /updateViaCache:"none"/);
  assert.match(js, /controllerchange/);
  assert.match(js, /Nova versão disponível/);
});

test("PWA 4.2.6 injeta camada mobile global", () => {
  const js = read("js/site-enhancements.js");
  const css = read("css/mobile-pwa-4.2.6.css");
  assert.match(js, /mobile-pwa-4\.2\.6\.css\?v=4\.2\.6/);
  for (const width of ["700px", "430px", "370px"]) assert.ok(css.includes(width), `CSS mobile sem breakpoint ${width}`);
  for (const trecho of ["#carrinho", ".modal-content", ".checkout-container", ".track-main", ".container-header"]) {
    assert.ok(css.includes(trecho), `CSS mobile sem ${trecho}`);
  }
});

test("manifesto 4.2.6 identifica Multi Delivery e modo standalone", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "Multi Delivery");
  assert.equal(manifest.short_name, "Multi Delivery");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "./");
  assert.match(manifest.start_url, /source=pwa/);
});

test("shell do service worker inclui assets das versões recentes", () => {
  const sw = read("sw.js");
  for (const arquivo of [
    "home-4.2.1.css",
    "restaurante-4.2.2.css",
    "carrinho-4.2.5.css",
    "checkout-4.2.3.css",
    "carrinho-4.2.5.js",
    "checkout-4.2.3.js",
    "site-enhancements.js?v=4.2.6"
  ]) assert.ok(sw.includes(arquivo), `shell sem ${arquivo}`);
});
