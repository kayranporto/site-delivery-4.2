"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ignored = new Set([".git", "node_modules", "release"]);
const failures = [];

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (ignored.has(entry.name)) return [];
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
    });
}

const files = walk(root);
for (const file of files.filter((item) => item.endsWith(".js"))) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    const relative = path.relative(root, file);
    if (result.error) {
        failures.push(`Não foi possível validar o JavaScript: ${relative} — ${result.error.message}`);
    } else if (result.status !== 0) {
        failures.push(`JavaScript inválido: ${relative}\n${result.stderr || "Falha sem saída de erro."}`);
    }
}
for (const file of files.filter((item) => item.endsWith(".json") || item.endsWith(".webmanifest"))) {
    try { JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) { failures.push(`JSON inválido: ${path.relative(root, file)} — ${error.message}`); }
}

for (const file of files.filter((item) => item.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const tag of html.matchAll(/<([a-zA-Z][^<>]*?)>/g)) {
        const attributes = [...tag[0].matchAll(/\s([:\w-]+)\s*=/g)].map((match) => match[1].toLowerCase());
        const duplicated = [...new Set(attributes.filter((name, index) => attributes.indexOf(name) !== index))];
        if (duplicated.length) failures.push(`Atributo HTML duplicado em ${path.relative(root, file)}: ${duplicated.join(", ")}`);
    }
    const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
    const idsDuplicados = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (idsDuplicados.length) failures.push(`IDs HTML duplicados em ${path.relative(root, file)}: ${idsDuplicados.join(", ")}`);
    for (const match of html.matchAll(/(?:href|src)=["']([^"'#?]+)(?:\?[^"'#]*)?["']/g)) {
        const reference = match[1];
        if (/^(?:https?:|mailto:|tel:|data:)/.test(reference)) continue;
        // Skip Vercel-provided scripts that only exist in production
        if (reference.startsWith("/_vercel/")) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), reference))) {
            failures.push(`Referência ausente: ${path.relative(root, file)} → ${reference}`);
        }
    }
}

const publicFiles = files.filter((file) => !file.includes(`${path.sep}supabase${path.sep}`) && !file.includes(`${path.sep}tests${path.sep}`) && !file.includes(`${path.sep}scripts${path.sep}`) && !file.includes(`${path.sep}.github${path.sep}`) && !file.endsWith(".md"));
for (const file of publicFiles) {
    const content = fs.readFileSync(file, "utf8");
    if (/SUPABASE_SERVICE_ROLE_KEY|MERCADO_PAGO_ACCESS_TOKEN|MERCADO_PAGO_WEBHOOK_SECRET/.test(content)) {
        failures.push(`Nome de segredo inesperado no artefato público: ${path.relative(root, file)}`);
    }
}

const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260801001400_producao_financeira.sql"), "utf8");
if ((migration.match(/\$\$/g) || []).length % 2 !== 0) failures.push("Migração 014 possui delimitadores $$ desbalanceados.");
if (!/^begin;[\s\S]*commit;\s*$/im.test(migration)) failures.push("Migração 014 não está delimitada por BEGIN/COMMIT.");

const authMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260801001500_auth_sem_confirmacao_e_hardening.sql"), "utf8");
if (!/^begin;[\s\S]*commit;\s*$/im.test(authMigration)) failures.push("Migração 015 não está delimitada por BEGIN/COMMIT.");
if (!authMigration.includes("drop function if exists public.registrar_tentativa_login")) failures.push("Migração 015 não remove a RPC legada de login.");

const operationMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260801001600_operacao_catalogo_e_escala.sql"), "utf8");
if (!/^begin;[\s\S]*commit;\s*$/im.test(operationMigration)) failures.push("Migração 016 não está delimitada por BEGIN/COMMIT.");
if ((operationMigration.match(/\$\$/g) || []).length % 2 !== 0) failures.push("Migração 016 possui delimitadores $$ desbalanceados.");
for (const required of ["produto_variantes", "empresa_unidades", "estoque_movimentos", "pedidos_chave_cliente_idx", "empresa_atualizar_operacao_pedido"]) {
    if (!operationMigration.includes(required)) failures.push(`Migração 016 não contém ${required}.`);
}

if (failures.length) {
    console.error(failures.join("\n\n"));
    process.exit(1);
}
console.log(`Verificação concluída: ${files.length} arquivos analisados.`);
