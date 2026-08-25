"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("exclusão definitiva de restaurante é administrativa e confirmada", () => {
  const sql = read("supabase/migrations/20260825190547_exclusao_definitiva_restaurante.sql");
  assert.match(sql, /create or replace function public\.admin_excluir_restaurante/);
  assert.match(sql, /if not private\.is_admin\(\)/);
  assert.match(sql, /lower\(trim\(coalesce\(p_nome_confirmacao/);
  assert.match(sql, /for update/);
  assert.doesNotMatch(sql, /status not in \('entregue', 'cancelado'\)/);
  assert.match(sql, /delete from public\.empresas/);
  assert.match(sql, /revoke all on function public\.admin_excluir_restaurante\(uuid, text\)/);
  assert.match(sql, /grant execute on function public\.admin_excluir_restaurante\(uuid, text\)\s+to authenticated/);
});

test("exclusão remove dados diretos, dependências e arquivos", () => {
  const sql = read("supabase/migrations/20260825190547_exclusao_definitiva_restaurante.sql");
  const travaStorage = read("supabase/migrations/20260825191009_exige_catalogo_limpo_antes_exclusao.sql");
  for (const trecho of [
    "pagamento_eventos", "notificacoes", "entrega_localizacoes", "entrega_ofertas",
    "historico_status_pedido", "pedido_mensagens", "pedido_itens", "produto_variantes",
    "produto_grupos", "adicionais", "empresa_unidades", "admin_auditoria", "empresas"
  ]) assert.match(sql, new RegExp(`delete from public\\.${trecho}`));
  assert.match(sql, /a\.attname = 'empresa_id'/);
  assert.match(sql, /create policy "admin remove midia catalogo"/);
  assert.doesNotMatch(sql, /update public\.(empresas|pedidos|produtos)/);
  assert.match(travaStorage, /before delete on public\.empresas/);
  assert.match(travaStorage, /storage\.foldername\(o\.name\)/);
  assert.match(travaStorage, /Remova os arquivos do catálogo antes de apagar a loja/);
});

test("painel exige o nome da loja e chama somente a RPC protegida", () => {
  const js = read("js/pages/admin.js");
  assert.match(js, /function confirmarExclusaoRestaurante/);
  assert.match(js, /Digite “\$\{empresa\.nome\}” para confirmar/);
  assert.match(js, /confirmar\.disabled = true/);
  assert.match(js, /db\.rpc\("admin_excluir_restaurante"/);
  assert.match(js, /p_nome_confirmacao: nomeConfirmacao/);
  assert.match(js, /db\.storage\.from\("catalogo"\)\.remove/);
  assert.match(js, /await apagarMidiasRestaurante\(empresa\)/);
  assert.match(js, /Todos os dados e arquivos da loja foram removidos permanentemente/);
  assert.match(js, /consulta\.is\("excluida_em", null\)/);
  assert.doesNotMatch(js, /from\("empresas"\)\.delete/);
  assert.match(read("html/admin.html"), /admin\.js\?v=4\.4\.5\.1/);
});
