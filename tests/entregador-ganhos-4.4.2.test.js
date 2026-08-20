"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(raiz, "supabase/migrations/20260817224905_entregador_historico_ganhos_4_4_2.sql"), "utf8");
const entregadorHtml = fs.readFileSync(path.join(raiz, "html/entregador.html"), "utf8");
const entregadorJs = fs.readFileSync(path.join(raiz, "js/modules/entregador-financeiro-4.4.2.js"), "utf8");
const adminJs = fs.readFileSync(path.join(raiz, "js/modules/admin-entregadores-financeiro-4.4.2.js"), "utf8");
const enhancements = fs.readFileSync(path.join(raiz, "js/core/site-enhancements.js"), "utf8");

 test("ganho do entregador tem tarifa própria e snapshot no aceite", () => {
  assert.match(migration, /valor_por_entrega numeric\(10,2\) not null default 0/i);
  assert.match(migration, /entregador_valor numeric\(10,2\) not null default 0/i);
  assert.match(migration, /entregador_valor = coalesce\(v_valor, 0\)/i);
  assert.doesNotMatch(entregadorJs, /taxa_entrega/i);
});

test("somente pedidos entregues entram no resumo e histórico", () => {
  assert.match(migration, /p\.status = 'entregue'/i);
  assert.match(migration, /entregador_meu_resumo_ganhos/i);
  assert.match(migration, /entregador_meu_historico_ganhos/i);
  assert.match(migration, /p\.entregador_id = auth\.uid\(\)/i);
});

test("histórico financeiro não consulta endereço ou telefone do cliente", () => {
  assert.doesNotMatch(entregadorJs, /cliente_telefone|endereco\b/i);
  assert.doesNotMatch(entregadorJs, /\.from\s*\(\s*["']pedidos["']\s*\)/i);
  assert.match(entregadorJs, /entregador_meu_historico_ganhos/);
});

test("tarifa é configurada por RPC administrativo auditado", () => {
  assert.match(migration, /admin_definir_valor_entregador/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /entregador_valor_por_entrega/);
  assert.match(adminJs, /admin_definir_valor_entregador/);
  assert.doesNotMatch(adminJs, /\.update\s*\(/);
});

test("interfaces 4.4.2 estão conectadas", () => {
  assert.match(entregadorHtml, /css\/modules\/entregador-financeiro-4\.4\.2\.css\?v=4\.4\.2/);
  assert.match(entregadorHtml, /js\/modules\/entregador-financeiro-4\.4\.2\.js\?v=4\.4\.2/);
  assert.match(enhancements, /js\/modules\/admin-entregadores-financeiro-4\.4\.2\.js\?v=4\.4\.2/);
  assert.match(enhancements, /css\/modules\/entregador-financeiro-4\.4\.2\.css\?v=4\.4\.2/);
});
