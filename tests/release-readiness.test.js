"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if ([".git", "node_modules", "release"].includes(entry.name)) return [];
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
    });
}

test("release possui uma única árvore canônica e o empacotamento exclui metadados Git", () => {
    const packageScript = read("scripts/package-release.sh");
    assert.match(packageScript, /\.git/);
    assert.match(packageScript, /node_modules/);
    assert.equal(fs.existsSync(path.join(root, "site-delivery-3.5-main")), false);
    assert.ok(fs.existsSync(path.join(root, "supabase/migrations/014_producao_financeira.sql")));
    assert.equal(JSON.parse(read("package.json")).version, "4.2.0");
});

test("dependências Supabase estão fixadas em versão exata", () => {
    const html = [...fs.readdirSync(root).filter((name) => name.endsWith(".html"))]
        .map((name) => read(name)).join("\n");
    assert.doesNotMatch(html, /@supabase\/supabase-js@2(?:["'/?<])/);
    assert.match(html, /@supabase\/supabase-js@2\.111\.0/);

    for (const name of ["criar-pagamento", "mercado-pago-webhook", "processar-reembolso", "enviar-push"]) {
        const config = JSON.parse(read(`supabase/functions/${name}/deno.json`));
        assert.equal(config.imports.supabase, "npm:@supabase/supabase-js@2.111.0");
    }
});

test("migração 014 contém reconciliação idempotente e snapshot atômico", () => {
    const sql = read("supabase/migrations/014_producao_financeira.sql");
    for (const trecho of [
        "create table if not exists public.pagamento_eventos",
        "unique(provider, dedupe_key)",
        "for update",
        "for share",
        "v_itens_normalizados",
        "reconciliar_pagamento_mercado_pago",
        "registrar_preferencia_pagamento",
        "admin_preparar_reembolso",
        "aguardando_pagamento",
        "pagamento_reconciliacao_status",
        "auth.jwt() ->> 'role'"
    ]) assert.ok(sql.includes(trecho), `migração 014 sem ${trecho}`);
    assert.doesNotMatch(sql, /auth\.role\(\)/);
    assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
    assert.match(sql, /^begin;[\s\S]*commit;\s*$/im);
});

test("webhook valida assinatura e reconcilia valor, moeda e idempotência no banco", () => {
    const webhook = read("supabase/functions/mercado-pago-webhook/index.ts");
    for (const trecho of [
        "x-signature", "x-request-id", "HMAC", "MERCADO_PAGO_COLLECTOR_ID",
        "transaction_amount", "currency_id", "dedupeKey", "reconciliar_pagamento_mercado_pago"
    ]) assert.ok(webhook.includes(trecho), `webhook sem ${trecho}`);
    assert.doesNotMatch(webhook, /\.from\(["']pedidos["']\)\s*\.update/);
});

test("reembolso usa endpoint do provedor e chave de idempotência", () => {
    const edge = read("supabase/functions/processar-reembolso/index.ts");
    assert.match(edge, /\/v1\/payments\/\$\{encodeURIComponent\(paymentId\)\}\/refunds/);
    assert.match(edge, /X-Idempotency-Key/);
    assert.match(edge, /admin_preparar_reembolso/);
    assert.match(edge, /servico_marcar_falha_reembolso/);
    assert.match(edge, /reconciliar_pagamento_mercado_pago/);

    const admin = read("js/operacao-admin.js");
    assert.match(admin, /functions\.invoke\("processar-reembolso"/);
    assert.doesNotMatch(admin, /admin_atualizar_reembolso/);
});

test("frontend não contém segredos de servidor", () => {
    const publicFiles = walk(root).filter((file) => !file.includes(`${path.sep}supabase${path.sep}`) && !file.includes(`${path.sep}tests${path.sep}`) && !file.includes(`${path.sep}scripts${path.sep}`) && !file.includes(`${path.sep}.github${path.sep}`) && !file.endsWith(".md"));
    for (const file of publicFiles) {
        const content = fs.readFileSync(file, "utf8");
        assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY|MERCADO_PAGO_ACCESS_TOKEN|MERCADO_PAGO_WEBHOOK_SECRET/, path.relative(root, file));
    }
});

test("todas as páginas têm CSP, política de referência e nenhum script executável inline", () => {
    for (const name of fs.readdirSync(root).filter((file) => file.endsWith(".html"))) {
        const html = read(name);
        assert.match(html, /http-equiv=["']Content-Security-Policy["']/i, `${name} sem CSP`);
        assert.match(html, /name=["']referrer["']/i, `${name} sem referrer policy`);
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${name} possui event handler inline`);
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            const attrs = match[1].toLowerCase();
            const body = match[2].trim();
            const permitido = attrs.includes("src=") || attrs.includes("application/ld+json") || body === "";
            assert.equal(permitido, true, `${name} possui script executável inline`);
        }
    }
});

test("versão de assets e caches é consistente", () => {
    const sources = [read("sw.js"), read("js/site-enhancements.js"), ...fs.readdirSync(root)
        .filter((name) => name.endsWith(".html")).map(read)];
    const joined = sources.join("\n");
    assert.doesNotMatch(joined, /\?v=(?:2\.|3\.)/);
    assert.match(read("sw.js"), /const VERSION = "4\.2\.6"/);
    assert.match(read("js/site-enhancements.js"), /sw\.js\?v=4\.2\.6/);
});

test("ajustes básicos de acessibilidade estão presentes", () => {
    const admin = read("admin.html");
    assert.match(admin, /<label[^>]*for=["']periodoRelatorio["']/i);
    const entregador = read("entregador.html");
    assert.equal((entregador.match(/<h1\b/gi) || []).length, 1);
    assert.match(entregador, /class=["']driver-title["']/);
});

test("painel oferece conciliação financeira e monitoramento correlacionado", () => {
    const admin = read("admin.html");
    assert.match(admin, /id=["']adminConciliacao["']/);
    assert.match(admin, /id=["']opsPagamentos["']/);
    const operation = read("js/operacao-admin.js");
    assert.match(operation, /admin_conciliacao_pagamentos/);
    const monitoring = read("js/monitoring.js");
    assert.match(monitoring, /correlation_id/);
    assert.match(monitoring, /app_version/);
});
