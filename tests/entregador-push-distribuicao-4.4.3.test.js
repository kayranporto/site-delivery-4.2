"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(raiz, "supabase/migrations/20260817232136_entregador_push_distribuicao_proximidade_4_4_3.sql"), "utf8");
const config = fs.readFileSync(path.join(raiz, "js/config.js"), "utf8");
const notifications = fs.readFileSync(path.join(raiz, "js/notifications.js"), "utf8");
const logistica = fs.readFileSync(path.join(raiz, "js/entregador-logistica-4.4.js"), "utf8");
const sw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8");
const html = fs.readFileSync(path.join(raiz, "entregador.html"), "utf8");

 test("distribuição automática expande 4, 8 e 15 km", () => {
  assert.match(migration, /v_raio\s*:=\s*4/);
  assert.match(migration, /v_raio\s*:=\s*8/);
  assert.match(migration, /v_raio\s*:=\s*15/);
  assert.match(migration, /multi-delivery-redistribuir-entregas/);
  assert.match(migration, /\* \* \* \* \*/);
});

test("ofertas são individuais e impedem dupla corrida ativa", () => {
  assert.match(migration, /unique \(pedido_id, entregador_id\)/);
  assert.match(migration, /status in \('preparando','saiu_para_entrega'\)/);
  assert.match(migration, /Conclua sua entrega atual antes de aceitar outra/);
  assert.match(migration, /entregador_valor=v_oferta\.valor_oferta/);
});

test("push não grava segredo privado no repositório", () => {
  assert.doesNotMatch(migration, /vault\.create_secret\s*\(/);
  assert.match(migration, /push_runtime_config/);
  assert.match(migration, /grant execute on function public\.push_runtime_config\(\) to service_role/);
  assert.match(config, /vapidPublicKey:\s*"[A-Za-z0-9_-]{80,}"/);
});

test("notificação abre a oferta do entregador", () => {
  assert.match(migration, /entregador\.html\?oferta=/);
  assert.match(notifications, /item\?\.destino/);
  assert.match(notifications, /pushManager\.subscribe/);
  assert.match(notifications, /sw\.js\?v=4\.4\.5/);
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /requireInteraction: entrega/);
});

test("painel mostra ganho e não confirma corrida perdida", () => {
  assert.match(logistica, /ganho_entregador/);
  assert.match(logistica, /data !== true/);
  assert.match(logistica, /ofertaFoco/);
  assert.match(html, /entregador-push-4\.4\.3\.css\?v=4\.4\.5/);
  assert.match(html, /entregador-push-4\.4\.3\.js\?v=4\.4\.3/);
});
