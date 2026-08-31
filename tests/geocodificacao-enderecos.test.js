"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Edge Function de geocodificação exige JWT e não expõe segredo no cliente", () => {
  const config = read("supabase/config.toml");
  const edge = read("supabase/functions/geocodificar-endereco/index.ts");
  const frontend = read("js/pages/enderecos.js");

  assert.match(config, /\[functions\.geocodificar-endereco\][\s\S]{0,80}verify_jwt\s*=\s*true/);
  assert.doesNotMatch(frontend, /nominatim\.openstreetmap\.org|GEOCODING_BASE_URL|GEOCODING_USER_AGENT/);
  assert.doesNotMatch(edge, /SERVICE_ROLE|secret[_-]?key|api[_-]?key/i);
});

test("geocodificação usa OpenStreetMap de forma limitada e identificada", () => {
  const edge = read("supabase/functions/geocodificar-endereco/index.ts");

  assert.match(edge, /https:\/\/nominatim\.openstreetmap\.org\/search/);
  assert.match(edge, /User-Agent/);
  assert.match(edge, /countrycodes["'),\s]+["']br/);
  assert.match(edge, /limit["'),\s]+["']1/);
  assert.match(edge, /1100/);
  assert.match(edge, /AbortController/);
});

test("salvar endereço tenta geocodificar uma vez e mantém fallback sem coordenadas", () => {
  const frontend = read("js/pages/enderecos.js");
  const submit = frontend.indexOf('form.addEventListener("submit"');
  const geocode = frontend.indexOf("geocodificarEndereco(payload)", submit);
  const insert = frontend.indexOf('.from("enderecos").insert(payload)', submit);

  assert.ok(submit >= 0 && geocode > submit, "geocodificação deve acontecer no submit");
  assert.ok(insert > geocode, "endereço deve ser inserido mesmo após a tentativa de geocodificação");
  assert.match(frontend, /if \(coordenadas\)[\s\S]{0,180}payload\.latitude[\s\S]{0,100}payload\.longitude/);
  assert.match(frontend, /localizacaoAutomatica[\s\S]{0,600}O endereço foi salvo/);
  assert.doesNotMatch(frontend, /addEventListener\("input"[\s\S]{0,250}geocodificarEndereco/);
});

test("página atribui OpenStreetMap e mantém GPS como opção de maior precisão", () => {
  const html = read("html/enderecos.html");

  assert.match(html, /© OpenStreetMap contributors/);
  assert.match(html, /openstreetmap\.org\/copyright/);
  assert.match(html, /GPS continua disponível para maior precisão/);
  assert.match(html, /enderecos\.js\?v=4\.4\.5\.1/);
});
