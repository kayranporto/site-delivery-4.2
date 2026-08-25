"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("exclusão de restaurante é administrativa, confirmada e auditada", () => {
  const sql = read("supabase/migrations/20260825180445_exclusao_segura_restaurante.sql");
  assert.match(sql, /create or replace function public\.admin_excluir_restaurante/);
  assert.match(sql, /if not private\.is_admin\(\)/);
  assert.match(sql, /lower\(trim\(coalesce\(p_nome_confirmacao/);
  assert.match(sql, /for update/);
  assert.match(sql, /status not in \('entregue', 'cancelado'\)/);
  assert.match(sql, /usuario_id = null/);
  assert.match(sql, /'restaurante_excluido'/);
  assert.match(sql, /revoke all on function public\.admin_excluir_restaurante\(uuid, text\)/);
  assert.match(sql, /grant execute on function public\.admin_excluir_restaurante\(uuid, text\)\s+to authenticated/);
});

test("exclusão preserva histórico e desativa recursos operacionais", () => {
  const sql = read("supabase/migrations/20260825180445_exclusao_segura_restaurante.sql");
  for (const trecho of [
    "empresa_funcionarios", "empresa_entregadores", "empresa_unidades",
    "empresa_horarios", "empresa_regioes", "categorias", "produtos",
    "grupos_adicionais", "cupons", "empresa_assinaturas"
  ]) assert.match(sql, new RegExp(`update public\\.${trecho}`));
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(pedidos|pedido_itens|admin_auditoria)/i);
  assert.match(sql, /pedidos_preservados/);
});

test("painel exige o nome da loja e chama somente a RPC protegida", () => {
  const js = read("js/pages/admin.js");
  assert.match(js, /function confirmarExclusaoRestaurante/);
  assert.match(js, /Digite “\$\{empresa\.nome\}” para confirmar/);
  assert.match(js, /confirmar\.disabled = true/);
  assert.match(js, /db\.rpc\("admin_excluir_restaurante"/);
  assert.match(js, /p_nome_confirmacao: nomeConfirmacao/);
  assert.match(js, /consulta\.is\("excluida_em", null\)/);
  assert.doesNotMatch(js, /from\("empresas"\)\.delete/);
});
