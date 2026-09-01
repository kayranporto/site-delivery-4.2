"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("API pública expõe somente catálogo anônimo com limites explícitos", () => {
    const source = read("supabase/functions/api-publica/index.ts");
    const config = read("supabase/config.toml");

    assert.match(config, /\[functions\.api-publica\]\s*verify_jwt = true/);
    assert.match(source, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(source, /SUPABASE_ANON_KEY/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
    assert.match(source, /\.from\("empresas_catalogo"\)/);
    assert.match(source, /\.eq\("status", true\)/);
    assert.match(source, /integerParam\(url\.searchParams\.get\("limite"\), 20, 1, 50\)/);
    assert.match(source, /request\.method !== "GET" && request\.method !== "HEAD"/);
});

test("OpenAPI documenta os endpoints implementados da versão 1", () => {
    const specification = JSON.parse(read("supabase/functions/api-publica/openapi.json"));

    assert.equal(specification.openapi, "3.1.0");
    assert.equal(specification.info.version, "1.0.0");
    assert.ok(specification.paths["/v1/status"].get);
    assert.ok(specification.paths["/v1/restaurantes"].get);
    assert.ok(specification.paths["/v1/restaurantes/{restauranteId}/cardapio"].get);
    assert.ok(specification.paths["/openapi.json"].get);
    assert.equal(specification.components.securitySchemes.SupabasePublishableKey.name, "apikey");
});

test("API pública não referencia domínios privados do delivery", () => {
    const source = read("supabase/functions/api-publica/index.ts");

    for (const protectedResource of [
        "pedidos",
        "pedido_itens",
        "usuarios",
        "enderecos",
        "pagamento_eventos",
        "admin_auditoria",
    ]) {
        assert.doesNotMatch(source, new RegExp(`\\.from\\(\\"${protectedResource}\\"\\)`));
    }
});
