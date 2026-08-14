"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260814004217_corrige_prioridade_operacional_4_3.sql"), "utf8");

test("prioridade 0..3 não passa pela validação de minutos", () => {
  assert.match(sql, /p_acao <> 'definir_prioridade'[\s\S]{0,120}p_preparo_estimado < 5/);
  assert.match(sql, /when 'definir_prioridade'[\s\S]{0,220}p_preparo_estimado < 0[\s\S]{0,120}p_preparo_estimado > 3/);
  assert.match(sql, /A prioridade deve ficar entre 0 e 3\./);
});

test("evento de prioridade não registra o nível como minutos de preparo", () => {
  assert.match(sql, /case when p_acao = 'definir_prioridade' then null else p_preparo_estimado end/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/im);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
});
