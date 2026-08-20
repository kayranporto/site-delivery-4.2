"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "html/entregador.html"), "utf8");
const js = fs.readFileSync(path.join(raiz, "js/modules/entregador-onboarding-4.4.4.js"), "utf8");
const css = fs.readFileSync(path.join(raiz, "css/modules/entregador-onboarding-4.4.4.css"), "utf8");

test("painel carrega onboarding 4.4.4", () => {
  assert.match(html, /entregador-onboarding-4\.4\.4\.css\?v=4\.4\.4/);
  assert.match(html, /entregador-onboarding-4\.4\.4\.js\?v=4\.4\.4/);
});

test("onboarding orienta os tres passos operacionais", () => {
  assert.match(js, /Localização/);
  assert.match(js, /Notificações/);
  assert.match(js, /Ficar online/);
  assert.match(js, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(js, /window\.AtivarPushNotificacoes/);
  assert.match(js, /controle\.click\(\)/);
});

test("onboarding nao duplica regras de negocio", () => {
  assert.doesNotMatch(js, /\.rpc\s*\(/);
  assert.doesNotMatch(js, /\.from\s*\(/);
  assert.match(js, /entregadorOnline/);
  assert.match(js, /multi-delivery:push-state/);
});

test("conclusao fica registrada por entregador", () => {
  assert.match(js, /STORAGE_PREFIX/);
  assert.match(js, /usuarioId/);
  assert.match(js, /localStorage\.setItem\(chaveConcluido\(\), "1"\)/);
  assert.match(css, /driver-onboarding\.is-complete/);
});
