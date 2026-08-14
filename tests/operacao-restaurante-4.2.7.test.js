"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("4.2.7 cria histórico operacional protegido", () => {
  const sql = read("supabase/migrations/20260810141127_operacao_restaurante_4_2_7.sql");
  for (const trecho of [
    "create table if not exists public.pedido_operacao_eventos",
    "enable row level security",
    "restaurante le historico operacional",
    "revoke insert, update, delete",
    "empresa_atualizar_operacao_pedido"
  ]) assert.ok(sql.includes(trecho), `migration 017 sem ${trecho}`);
});

test("4.2.7 aceita pedido com tempo e registra recusa transacional", () => {
  const sql = read("supabase/migrations/20260810141127_operacao_restaurante_4_2_7.sql");
  assert.match(sql, /when 'iniciar_preparo'/);
  assert.match(sql, /preparo_estimado_minutos = coalesce\(p_preparo_estimado/);
  assert.match(sql, /when 'recusar_pedido'/);
  assert.match(sql, /Pedido pago deve seguir o fluxo de cancelamento e reembolso/);
  assert.match(sql, /insert into public\.pedido_operacao_eventos/);
});

test("painel 4.2.7 oferece aceite, recusa, SLA e indicadores do dia", () => {
  const js = read("js/operacao-restaurante-4.2.7.js");
  for (const trecho of [
    "Aceitar pedido",
    "recusar_pedido",
    "Tempo estimado de preparo",
    "op427Atrasados",
    "pedidoAtrasado",
    "pedido_operacao_eventos"
  ]) assert.ok(js.includes(trecho), `operação 4.2.7 sem ${trecho}`);
});

test("site carrega os assets 4.2.7 somente no painel do restaurante", () => {
  const loader = read("js/site-enhancements.js");
  assert.match(loader, /empresa-dashboard\\\.html/);
  assert.match(loader, /css\/operacao-restaurante-4\.2\.7\.css\?v=4\.2\.7/);
  assert.match(loader, /js\/operacao-restaurante-4\.2\.7\.js\?v=4\.2\.7/);
});

test("CSS 4.2.7 contempla painel, SLA e mobile", () => {
  const css = read("css/operacao-restaurante-4.2.7.css");
  for (const trecho of [
    ".operacao-427-resumo",
    ".op427-aceite",
    ".op427-sla",
    ".op427-recusar"
  ]) assert.ok(css.includes(trecho), `CSS 4.2.7 sem ${trecho}`);
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
});
