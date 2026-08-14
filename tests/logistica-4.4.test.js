"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = () => read("supabase/migrations/20260814013639_logistica_distancia_proximidade_4_4.sql");

test("4.4 adiciona coordenadas opcionais e distância sem tarifa por km", () => {
  const sql = migration();
  for (const tabela of ["empresa_unidades", "enderecos", "entregadores"]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela}[\\s\\S]{0,220}latitude double precision[\\s\\S]{0,120}longitude double precision`));
  }
  assert.match(sql, /alter table public\.pedidos[\s\S]{0,100}distancia_km numeric/);
  assert.match(sql, /private\.distancia_km/);
  assert.match(sql, /private\.preencher_distancia_pedido/);
  assert.doesNotMatch(sql, /valor_km|preco_km|taxa_por_km|taxa_km/i);
});

test("hardening exige par de coordenadas e limita Haversine", () => {
  const sql = read("supabase/migrations/20260814013655_hardening_coordenadas_distancia_4_4.sql");
  for (const tabela of ["empresa_unidades", "enderecos", "entregadores"]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela}[\\s\\S]{0,260}latitude is not null and longitude is not null`));
  }
  assert.match(sql, /least\(1\.0::double precision/);
});

test("atualização de GPS exige autenticação e ownership adequado", () => {
  const sql = migration();
  assert.match(sql, /create or replace function public\.empresa_unidade_atualizar_localizacao/);
  assert.match(sql, /e\.usuario_id=auth\.uid\(\)/);
  assert.match(sql, /create or replace function public\.endereco_atualizar_localizacao/);
  assert.match(sql, /usuario_id=auth\.uid\(\)/);
  assert.match(sql, /create or replace function public\.entregador_atualizar_posicao/);
  assert.match(sql, /id=auth\.uid\(\) and aprovado=true and online=true/);
  assert.match(sql, /grant execute on function public\.entregador_atualizar_posicao[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.entregador_atualizar_posicao[\s\S]*to anon/);
});

test("fila por proximidade não expõe telefone nem endereço completo antes da aceitação", () => {
  const sql = migration();
  const inicio = sql.indexOf("create or replace function public.listar_entregas_disponiveis_proximidade");
  assert.ok(inicio >= 0);
  const trecho = sql.slice(inicio);
  assert.match(trecho, /distancia_coleta_km/);
  assert.match(trecho, /Região protegida/);
  assert.doesNotMatch(trecho, /cliente_telefone|cliente_nome/);
  assert.doesNotMatch(trecho, /'endereco'\s*,\s*p\.endereco/);
  assert.match(trecho, /grant execute on function public\.listar_entregas_disponiveis_proximidade\(\)[\s\S]*to authenticated/);
  assert.doesNotMatch(trecho, /grant execute on function public\.listar_entregas_disponiveis_proximidade\(\)[\s\S]*to anon/);
});

test("endereço e unidade usam GPS somente por ação explícita do usuário", () => {
  const enderecos = read("js/localizacao-enderecos-4.4.js");
  const unidade = read("js/localizacao-unidade-4.4.js");
  assert.match(enderecos, /Usar GPS deste local/);
  assert.match(enderecos, /getCurrentPosition/);
  assert.match(enderecos, /endereco_atualizar_localizacao/);
  assert.doesNotMatch(enderecos, /watchPosition/);
  assert.match(unidade, /Definir GPS da unidade/);
  assert.match(unidade, /empresa_unidade_atualizar_localizacao/);
});

test("entregador online atualiza posição e usa fila de proximidade", () => {
  const source = read("js/entregador-logistica-4.4.js");
  const html = read("entregador.html");
  assert.match(html, /entregador-logistica-4\.4\.js/);
  assert.match(source, /entregador_atualizar_posicao/);
  assert.match(source, /listar_entregas_disponiveis_proximidade/);
  assert.match(source, /30000/);
  assert.match(source, /km até a coleta/);
});

test("WhatsApp é apenas contato manual com mensagem pré-preenchida", () => {
  const entregador = read("js/entregador-logistica-4.4.js");
  const cliente = read("js/acompanhamento-whatsapp-4.4.js");
  const loader = read("js/site-enhancements.js");
  assert.match(entregador, /https:\/\/wa\.me\//);
  assert.match(cliente, /https:\/\/wa\.me\//);
  assert.match(entregador, /target = "_blank"/);
  assert.match(cliente, /target = "_blank"/);
  assert.match(loader, /acompanhamento-whatsapp-4\.4\.js/);
  assert.doesNotMatch(`${entregador}\n${cliente}`, /fetch\([^)]*wa\.me|supabase\.functions|edge-function/i);
});

test("carregador mantém detecção PWA standalone válida", () => {
  const loader = read("js/site-enhancements.js");
  assert.match(loader, /matchMedia\("\(display-mode: standalone\)"\)/);
});
