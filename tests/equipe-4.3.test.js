"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = "supabase/migrations/20260814004156_equipe_permissoes_4_3.sql";

test("4.3 mantém autorização da equipe no banco", () => {
  const sql = read(migration);
  for (const trecho of ["private.papel_empresa_atual", "private.tem_permissao_empresa", "'cozinha_operar'", "'atendimento_operar'", "'financeiro_leitura'"]) assert.ok(sql.includes(trecho));
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/im);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
  assert.match(sql, /revoke all on function private\.tem_permissao_empresa/);
});

test("cozinha recebe PII e valores redigidos no backend", () => {
  const sql = read(migration);
  for (const campo of ["cliente_nome", "cliente_telefone", "endereco", "pagamento", "pagamento_status", "subtotal", "total", "preco_unitario"]) {
    assert.match(sql, new RegExp(`'${campo}',\\s*case when v_cozinha then null else`, "i"), campo);
  }
  assert.match(sql, /p\.status in \('recebido', 'preparando'\)/);
});

test("ações críticas verificam permissão antes da escrita", () => {
  const sql = read(migration);
  assert.match(sql, /private\.tem_permissao_empresa\(v_pedido\.empresa_id::text, v_permissao\)/);
  assert.match(sql, /private\.tem_permissao_empresa\(v_pedido\.empresa_id::text, 'atendimento_operar'\)/);
  assert.match(sql, /private\.tem_permissao_empresa\(v_pedido\.empresa_id::text, 'cancelamento_decidir'\)/);
  assert.match(sql, /pagamento_status is distinct from 'pago'/);
});

test("login separa proprietário e colaborador", () => {
  const login = read("js/pages/empresa-login.js");
  assert.match(login, /rpc\("empresa_meu_acesso"\)/);
  assert.match(login, /empresa-dashboard\.html/);
  assert.match(login, /empresa-colaborador\.html/);
});

test("interfaces usam RPCs e colaborador não escreve tabelas diretamente", () => {
  const equipe = read("js/pages/empresa-equipe.js");
  const colaborador = read("js/pages/empresa-colaborador.js");
  assert.match(equipe, /empresa_listar_funcionarios/);
  assert.match(equipe, /empresa_salvar_funcionario/);
  assert.match(equipe, /empresa_remover_funcionario/);
  assert.match(colaborador, /empresa_operador_pedidos/);
  assert.match(colaborador, /empresa_relatorio_financeiro_acesso/);
  assert.doesNotMatch(colaborador, /window\.db\.from\(/);
});
