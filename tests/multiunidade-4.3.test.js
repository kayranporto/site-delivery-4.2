"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("dashboard carrega os módulos multiunidade 4.3", () => {
  const enhancements = read("js/site-enhancements.js");
  assert.match(enhancements, /empresa-unidades-4\.3\.js/);
  assert.match(enhancements, /operacao-unidades-4\.3\.js/);
  assert.match(enhancements, /empresa-dashboard\\\.html/);
});

test("multiunidade filtra pedidos e catálogo pela unidade selecionada", () => {
  const source = read("js/empresa-unidades-4.3.js");
  for (const tabela of ["pedidos", "produtos", "categorias"]) {
    assert.match(source, new RegExp(`from\\(\\"${tabela}\\"\\)[\\s\\S]{0,260}eq\\(\\"unidade_id\\", unidadeAtivaId\\)`));
  }
});

test("novas categorias e produtos recebem unidade_id explicitamente", () => {
  const source = read("js/empresa-unidades-4.3.js");
  assert.match(source, /from\("categorias"\)\.insert\(\{[\s\S]{0,180}unidade_id: unidadeAtivaId/);
  assert.match(source, /const payload = \{[\s\S]{0,180}unidade_id: unidadeAtivaId/);
});

test("unidade principal não pode ser desativada pela interface", () => {
  const source = read("js/empresa-unidades-4.3.js");
  assert.match(source, /if \(unidade\.principal && unidade\.ativa\)/);
  assert.match(source, /unidade principal não pode ser desativada/i);
});

test("restaurante público carrega somente catálogo da unidade escolhida", () => {
  const source = read("js/restaurante-unidades-4.3.js");
  assert.match(source, /rpc\("empresa_unidades_publicas"/);
  assert.match(source, /from\("categorias"\)[\s\S]{0,240}eq\("unidade_id", unidadeAtiva\.id\)/);
  assert.match(source, /from\("produtos"\)[\s\S]{0,240}eq\("unidade_id", unidadeAtiva\.id\)/);
  assert.match(source, /unidade_id: String\(unidade\.id\)/);
  assert.match(source, /Trocar e limpar carrinho/);
});

test("status público acompanha a unidade selecionada", () => {
  const source = read("js/restaurante-status-unidade-4.3.js");
  assert.match(source, /empresa_disponibilidade_unidade/);
  assert.match(source, /unidade_aberta: aberto/);
  assert.match(source, /empresa-carregada/);
});

test("checkout roteia cálculo, disponibilidade e criação pela unidade", () => {
  const source = read("js/checkout-unidade-4.3.js");
  assert.match(source, /nome === "calcular_entrega_empresa"/);
  assert.match(source, /calcular_entrega_unidade/);
  assert.match(source, /nome === "empresa_disponibilidade"/);
  assert.match(source, /empresa_disponibilidade_unidade/);
  assert.match(source, /nome === "criar_pedido_operacional"/);
  assert.match(source, /criar_pedido_operacional_unidade/);
  assert.match(source, /p_unidade_id: String\(meta\.unidade_id\)/);
});

test("migration pública valida unidade e rejeita produto de outra unidade", () => {
  const sql = read("supabase/migrations/029_multiunidade_publica_4_3.sql");
  assert.match(sql, /create or replace function public\.empresa_unidades_publicas/);
  assert.match(sql, /create or replace function public\.criar_pedido_operacional_unidade/);
  assert.match(sql, /p\.unidade_id is distinct from p_unidade_id/);
  assert.match(sql, /O carrinho contém produto indisponível ou de outra unidade/);
  assert.match(sql, /grant execute on function public\.criar_pedido_operacional_unidade[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.criar_pedido_operacional_unidade[\s\S]*to anon/);
});

test("operação 4.3 filtra horários, pausas e regiões por unidade", () => {
  const source = read("js/operacao-unidades-4.3.js");
  for (const tabela of ["empresa_horarios", "empresa_pausas", "empresa_regioes"]) {
    assert.match(source, new RegExp(`from\\(\\"${tabela}\\"\\)[\\s\\S]{0,220}eq\\(\\"unidade_id\\", unidadeId\\)`));
  }
  assert.match(source, /onConflict: "empresa_id,unidade_id,dia_semana"/);
  assert.match(source, /empresa_disponibilidade_unidade/);
});

test("migration 030 move operação para unidade e mantém fallback principal", () => {
  const sql = read("supabase/migrations/030_operacao_por_unidade_4_3.sql");
  for (const tabela of ["empresa_horarios", "empresa_pausas", "empresa_regioes"]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela}[\\s\\S]{0,120}add column if not exists unidade_id`));
  }
  assert.match(sql, /primary key \(empresa_id, unidade_id, dia_semana\)/);
  assert.match(sql, /private\.empresa_aberta_unidade_em/);
  assert.match(sql, /private\.calcular_entrega_unidade_impl/);
  assert.match(sql, /public\.empresa_disponibilidade_unidade/);
  assert.match(sql, /public\.calcular_entrega_unidade/);
  assert.match(sql, /where u\.empresa_id::text = p_empresa_id::text and u\.principal and u\.ativa/);
});

test("migration 031 impede unidade de outra empresa", () => {
  const sql = read("supabase/migrations/031_integridade_empresa_unidade_4_3.sql");
  assert.match(sql, /unique \(id, empresa_id\)/);
  for (const tabela of ["produtos", "categorias", "pedidos", "empresa_horarios", "empresa_pausas", "empresa_regioes"]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela}[\\s\\S]{0,180}foreign key \\(unidade_id, empresa_id\\)`));
  }
});
