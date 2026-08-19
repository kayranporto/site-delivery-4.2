"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260819003047_entrega_propria_hibrida_4_4_5.sql");
const migrationIndice = read("supabase/migrations/20260819011044_index_empresa_entregadores_criado_por_4_4_5.sql");
const dashboard = read("js/empresa-entrega-propria-4.4.5.js");

test("migração 4.4.5 cria modalidades e vínculo por unidade", () => {
  for (const trecho of [
    "entrega_modalidade text not null default 'plataforma'",
    "entrega_hibrida_fallback_minutos smallint not null default 5",
    "check (entrega_modalidade in ('propria', 'plataforma', 'hibrida'))",
    "create table if not exists public.empresa_entregadores",
    "unique (unidade_id, entregador_id)",
    "entrega_ofertas_origem_check"
  ]) assert.ok(migration.includes(trecho), `migração sem ${trecho}`);
});

test("vínculos próprios usam RLS, privilégios mínimos e índices", () => {
  assert.match(migration, /alter table public\.empresa_entregadores enable row level security/);
  assert.match(migration, /entregador_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /e\.usuario_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on table public\.empresa_entregadores from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.empresa_entregadores to authenticated, service_role/);
  assert.match(migration, /empresa_entregadores_empresa_unidade_ativo_idx/);
  assert.match(migration, /empresa_entregadores_entregador_ativo_idx/);
  assert.match(migrationIndice, /empresa_entregadores_criado_por_idx/);
});

test("modo híbrido prioriza próprios e só libera a plataforma após o prazo", () => {
  assert.match(migration, /v_modalidade = 'plataforma'[\s\S]*v_modalidade = 'hibrida'[\s\S]*make_interval\(mins => v_fallback_minutos\)/);
  assert.match(migration, /v_modalidade in \('propria', 'hibrida'\)[\s\S]*from public\.empresa_entregadores ve/);
  assert.match(migration, /partition by c\.proprio/);
  assert.match(migration, /order by r\.proprio desc/);
  assert.match(migration, /case when r\.proprio then 'propria'::text else 'plataforma'::text end/);
});

test("troca de modalidade encerra ofertas antigas e redistribui com a nova origem", () => {
  assert.match(migration, /update public\.entrega_ofertas o[\s\S]*o\.status = 'disponivel'/);
  assert.match(migration, /on conflict \(pedido_id,entregador_id\) do update[\s\S]*where entrega_ofertas\.status = 'encerrada'/);
  assert.match(migration, /perform private\.redistribuir_entregas_pendentes\(100\)/);
});

test("atribuição direta é autorizada, atômica e impede duas corridas", () => {
  assert.match(migration, /create unique index if not exists pedidos_entregador_corrida_ativa_uniq/);
  assert.match(migration, /private\.tem_permissao_empresa\(v_empresa_id, 'atendimento_operar'\)/);
  assert.match(migration, /from public\.entregadores d[\s\S]*for update/);
  assert.match(migration, /from public\.pedidos p[\s\S]*for update/);
  assert.match(migration, /v\.unidade_id = v_unidade_id[\s\S]*v\.ativo = true/);
  assert.match(migration, /Entrega atribuída pela sua equipe/);
  assert.match(migration, /exception when unique_violation/);
});

test("funções privilegiadas fecham search_path e restringem execução", () => {
  const funcoesPublicas = [
    "empresa_unidade_configurar_entrega(uuid,text,integer)",
    "empresa_listar_entregadores_proprios(uuid)",
    "empresa_salvar_entregador_proprio(uuid,text)",
    "empresa_remover_entregador_proprio(uuid,uuid)",
    "empresa_atribuir_entregador_proprio(uuid,uuid)"
  ];
  assert.equal((migration.match(/security definer/g) || []).length >= 8, true);
  assert.equal((migration.match(/set search_path = ''/g) || []).length >= 8, true);
  for (const assinatura of funcoesPublicas) {
    assert.ok(migration.includes(`revoke all on function public.${assinatura}`), `sem revoke de ${assinatura}`);
    assert.ok(migration.includes(`grant execute on function public.${assinatura} to authenticated`), `sem grant de ${assinatura}`);
  }
});

test("painel configura equipe somente por RPC e permite atribuição em pedidos prontos", () => {
  for (const rpc of [
    "empresa_unidade_configurar_entrega",
    "empresa_listar_entregadores_proprios",
    "empresa_salvar_entregador_proprio",
    "empresa_remover_entregador_proprio",
    "empresa_atribuir_entregador_proprio"
  ]) assert.ok(dashboard.includes(rpc), `painel sem RPC ${rpc}`);
  assert.doesNotMatch(dashboard, /from\(["']empresa_entregadores["']\)\.(?:insert|update|delete)/);
  assert.match(read("js/empresa-dashboard.js"), /dataset\.entregaPronta/);
  assert.match(dashboard, /data-entrega-pronta="true"/);
  assert.match(dashboard, /Nenhum próprio disponível/);
});

test("assets do painel e identificação da oferta própria estão publicados", () => {
  const loader = read("js/site-enhancements.js");
  const entregador = read("js/entregador-logistica-4.4.js");
  assert.match(loader, /empresa-entrega-propria-4\.4\.5\.css\?v=4\.4\.5/);
  assert.match(loader, /empresa-entrega-propria-4\.4\.5\.js\?v=4\.4\.5/);
  assert.match(entregador, /item\.oferta_origem === "propria"/);
  assert.match(entregador, /Equipe própria/);
  assert.match(read("css/entregador-push-4.4.3.css"), /delivery-status\.own-team/);
  assert.match(read("sw.js"), /"entrega_disponivel", "entrega_atribuida"/);
});
