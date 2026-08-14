"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = () => read("supabase/migrations/037_frete_distancia_unidade_4_4.sql");

test("frete por distância nasce desligado e sem preços comerciais inventados", () => {
  const sql = migration();
  assert.match(sql, /frete_distancia_ativo boolean not null default false/);
  assert.match(sql, /frete_taxa_base numeric\(10,2\)/);
  assert.match(sql, /frete_valor_km numeric\(10,2\)/);
  assert.match(sql, /frete_raio_max_km numeric\(10,2\)/);
  assert.doesNotMatch(sql, /frete_taxa_base numeric\(10,2\)\s+default/i);
  assert.doesNotMatch(sql, /frete_valor_km numeric\(10,2\)\s+default/i);
  assert.doesNotMatch(sql, /frete_raio_max_km numeric\(10,2\)\s+default/i);
});

test("ativação exige configuração completa e GPS da unidade", () => {
  const sql = migration();
  assert.match(sql, /empresa_unidades_frete_distancia_config_check/);
  assert.match(sql, /frete_distancia_ativo = false[\s\S]*frete_taxa_base is not null[\s\S]*frete_valor_km is not null[\s\S]*frete_raio_max_km is not null[\s\S]*latitude is not null[\s\S]*longitude is not null/);
  assert.match(sql, /Defina o GPS da unidade antes de ativar o frete por distância/);
});

test("configuração do frete é owner-only e exposta somente a authenticated", () => {
  const sql = migration();
  const inicio = sql.indexOf("create or replace function public.empresa_unidade_configurar_frete_distancia");
  assert.ok(inicio >= 0);
  const trecho = sql.slice(inicio);
  assert.match(trecho, /e\.usuario_id = auth\.uid\(\)/);
  assert.match(trecho, /grant execute on function public\.empresa_unidade_configurar_frete_distancia[\s\S]*to authenticated/);
  assert.doesNotMatch(trecho, /grant execute on function public\.empresa_unidade_configurar_frete_distancia[\s\S]*to anon/);
});

test("cálculo usa endereço autenticado, distância, taxa base e raio máximo", () => {
  const sql = migration();
  assert.match(sql, /private\.calcular_entrega_unidade_endereco_impl/);
  assert.match(sql, /e\.id = p_endereco_id[\s\S]*e\.usuario_id = p_usuario_id/);
  assert.match(sql, /private\.distancia_km\(/);
  assert.match(sql, /v_unidade\.frete_taxa_base \+ \(v_unidade\.frete_valor_km \* v_distancia\)/);
  assert.match(sql, /v_distancia > v_unidade\.frete_raio_max_km/);
  assert.match(sql, /Endereço fora do raio máximo de entrega desta unidade/);
});

test("sem modo distância ou sem GPS do endereço mantém fallback por região", () => {
  const sql = migration();
  const chamadas = sql.match(/private\.calcular_entrega_unidade_impl\(/g) || [];
  assert.ok(chamadas.length >= 2);
  assert.match(sql, /'modo_frete', 'regiao'/);
  assert.match(sql, /'modo_frete', 'regiao_fallback_sem_gps'/);
});

test("preview público exige login e não aceita coordenadas arbitrárias", () => {
  const sql = migration();
  const inicio = sql.indexOf("create or replace function public.calcular_entrega_unidade_endereco");
  assert.ok(inicio >= 0);
  const fim = sql.indexOf("create or replace function public.empresa_unidade_configurar_frete_distancia", inicio);
  const trecho = sql.slice(inicio, fim);
  assert.match(trecho, /auth\.uid\(\) is null/);
  assert.match(trecho, /auth\.uid\(\)/);
  assert.match(trecho, /p_endereco_id uuid/);
  assert.doesNotMatch(trecho, /p_latitude|p_longitude/);
});

test("finalização do pedido usa o mesmo helper de endereço e preserva cupom de frete", () => {
  const sql = migration();
  const inicio = sql.indexOf("create or replace function public.criar_pedido_operacional_unidade");
  assert.ok(inicio >= 0);
  const trecho = sql.slice(inicio);
  assert.match(trecho, /private\.calcular_entrega_unidade_endereco_impl\(/);
  assert.match(trecho, /when 'frete' then v_taxa/);
  assert.match(trecho, /taxa_entrega=v_taxa/);
  assert.match(trecho, /distancia_km/);
});

test("checkout resolve endereco_id autenticado para o preview e mantém fallback legado", () => {
  const source = read("js/checkout-unidade-4.3.js");
  assert.match(source, /resolverEnderecoId/);
  assert.match(source, /\.eq\("usuario_id", user\.id\)/);
  assert.match(source, /calcular_entrega_unidade_endereco/);
  assert.match(source, /p_endereco_id: enderecoId/);
  assert.match(source, /calcular_entrega_unidade/);
});

test("dashboard configura distância pela RPC e o carregador limita o módulo ao painel", () => {
  const source = read("js/frete-distancia-unidade-4.4.js");
  const loader = read("js/site-enhancements.js");
  assert.match(source, /Frete por distância/);
  assert.match(source, /empresa_unidade_configurar_frete_distancia/);
  assert.match(source, /freteTaxaBase44/);
  assert.match(source, /freteValorKm44/);
  assert.match(source, /freteRaioMax44/);
  assert.match(source, /form\.addEventListener\("submit", salvar\)/);
  assert.match(loader, /empresa-dashboard\\\.html/);
  assert.match(loader, /frete-distancia-unidade-4\.4\.js/);
});
