"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = "supabase/migrations/032_planos_assinaturas_limites_4_3.sql";

test("4.3 cria planos e assinaturas sem inventar preço comercial", () => {
  const sql = read(migration);
  assert.match(sql, /create table if not exists public\.planos_plataforma/);
  assert.match(sql, /create table if not exists public\.empresa_assinaturas/);
  assert.match(sql, /'legado','Legado'/);
  assert.match(sql, /true,true,true,null,0,null,null,null,null/);
  assert.match(sql, /on conflict \(empresa_id\) do nothing/);
});

test("trial e limites são configuráveis e protegidos no banco", () => {
  const sql = read(migration);
  for (const trecho of [
    "trial_dias integer not null default 0",
    "limite_unidades integer",
    "limite_produtos integer",
    "limite_funcionarios integer",
    "limite_pedidos_mes integer",
    "private.empresa_pode_consumir_recurso",
    "validar_plano_unidades",
    "validar_plano_produtos",
    "validar_plano_funcionarios",
    "validar_plano_pedidos"
  ]) assert.ok(sql.includes(trecho), `Planos 4.3 sem ${trecho}`);
});

test("nova empresa recebe assinatura padrão antes de consumir limites", () => {
  const base = read(migration);
  const hardening = read("supabase/migrations/033_hardening_limites_planos_4_3.sql");
  assert.match(base, /create or replace function private\.criar_assinatura_padrao_empresa/);
  assert.match(hardening, /create trigger aa_criar_assinatura_padrao_empresa/);
  assert.match(hardening, /if tg_op='INSERT' then[\s\S]{0,100}v_validar := new\.ativa=true/);
  assert.doesNotMatch(hardening, /tg_op='INSERT' or old\./);
});

test("tabelas de assinatura não ficam expostas diretamente ao cliente", () => {
  const sql = read(migration);
  assert.match(sql, /alter table public\.planos_plataforma enable row level security/);
  assert.match(sql, /alter table public\.empresa_assinaturas enable row level security/);
  assert.match(sql, /revoke all on table public\.planos_plataforma from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.empresa_assinaturas from public, anon, authenticated/);
});

test("proprietário lê seu plano e admin gerencia configuração por RPC", () => {
  const sql = read(migration);
  assert.match(sql, /create or replace function public\.empresa_meu_plano\(\)/);
  assert.match(sql, /where e\.usuario_id=auth\.uid\(\)/);
  for (const rpc of ["admin_planos_listar", "admin_plano_salvar", "admin_assinatura_definir"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`));
  }
  const guardas = sql.match(/not coalesce\(private\.is_admin\(\),false\)/g) || [];
  assert.ok(guardas.length >= 3, "RPCs administrativas sem guarda de admin suficiente");
});

test("RPCs públicas de plano exigem autenticação e grants explícitos", () => {
  const sql = read(migration);
  assert.match(sql, /revoke all on function public\.empresa_meu_plano\(\) from public,anon,authenticated,service_role/);
  assert.match(sql, /grant execute on function public\.empresa_meu_plano\(\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.empresa_meu_plano\(\) to anon/);
});

test("admin lista assinaturas por RPC protegida", () => {
  const sql = read("supabase/migrations/034_admin_assinaturas_listar_4_3.sql");
  assert.match(sql, /create or replace function public\.admin_assinaturas_listar\(\)/);
  assert.match(sql, /not coalesce\(private\.is_admin\(\),false\)/);
  assert.match(sql, /grant execute on function public\.admin_assinaturas_listar\(\)[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.admin_assinaturas_listar\(\)[\s\S]*to anon/);
});

test("dashboard mostra Meu plano sem escrita direta nas tabelas de assinatura", () => {
  const source = read("js/empresa-plano-4.3.js");
  const loader = read("js/site-enhancements.js");
  assert.match(loader, /empresa-plano-4\.3\.js/);
  assert.match(source, /rpc\("empresa_meu_plano"\)/);
  assert.doesNotMatch(source, /from\("(?:planos_plataforma|empresa_assinaturas)"\)/);
  for (const chave of ["unidades", "produtos", "funcionarios", "pedidos_mes"]) {
    assert.ok(source.includes(`renderUso("${chave}"`), `Meu plano sem uso de ${chave}`);
  }
});

test("admin de planos usa apenas RPCs protegidas para plano e assinatura", () => {
  const source = read("js/admin-planos-4.3.js");
  const loader = read("js/site-enhancements.js");
  assert.match(loader, /admin-planos-4\.3\.js/);
  for (const rpc of ["admin_planos_listar", "admin_assinaturas_listar", "admin_plano_salvar", "admin_assinatura_definir"]) {
    assert.ok(source.includes(`"${rpc}"`), `Admin 4.3 sem ${rpc}`);
  }
  assert.doesNotMatch(source, /from\("(?:planos_plataforma|empresa_assinaturas)"\)/);
});
