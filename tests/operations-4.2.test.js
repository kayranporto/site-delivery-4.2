"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => {
    const direct = path.join(root, file);
    return fs.readFileSync(fs.existsSync(direct) ? direct : path.join(root, "html", file), "utf8");
};

test("migração 016 cria fundação multiunidade com RLS", () => {
    const sql = read("supabase/migrations/20260801001600_operacao_catalogo_e_escala.sql");
    for (const trecho of [
        "create table if not exists public.empresa_unidades",
        "alter table public.empresa_unidades enable row level security",
        "empresa_unidades_principal_idx",
        "add column if not exists unidade_id",
        "criar_unidade_principal_empresa",
        "atribuir_unidade_principal"
    ]) assert.ok(sql.includes(trecho), `migração 016 sem ${trecho}`);
});

test("catálogo 4.2 suporta variações com snapshot no pedido", () => {
    const sql = read("supabase/migrations/20260801001600_operacao_catalogo_e_escala.sql");
    for (const trecho of [
        "create table if not exists public.produto_variantes",
        "variante_id", "variante_nome", "v_preco_unitario",
        "for share", "v_itens_normalizados"
    ]) assert.ok(sql.includes(trecho), `variações sem ${trecho}`);
    const modal = read("js/modules/modal.js");
    assert.match(modal, /produto_variantes/);
    assert.match(modal, /varianteSelecionada/);
    assert.match(modal, /variante_id/);
    const checkout = read("js/pages/checkout.js");
    assert.match(checkout, /variante_id/);
    assert.match(checkout, /produto_variantes/);
});

test("checkout usa chave idempotente persistida durante a tentativa", () => {
    const checkout = read("js/pages/checkout.js");
    assert.match(checkout, /crypto\.randomUUID/);
    assert.match(checkout, /sessionStorage/);
    assert.match(checkout, /p_chave_cliente/);
    const sql = read("supabase/migrations/20260801001600_operacao_catalogo_e_escala.sql");
    assert.match(sql, /pedidos_chave_cliente_idx/);
    assert.match(sql, /exception when unique_violation/);
    assert.match(sql, /'reutilizado', true/);
});

test("cozinha possui fila, SLA e ações transacionais", () => {
    const html = read("empresa-dashboard.html");
    const js = read("js/pages/empresa-dashboard.js");
    const sql = read("supabase/migrations/20260801001600_operacao_catalogo_e_escala.sql");
    assert.match(html, /id="cozinha"/);
    assert.match(html, /id="filaCozinha"/);
    assert.match(js, /empresa_atualizar_operacao_pedido/);
    assert.match(js, /pedidoAtrasado/);
    assert.match(js, /marcar_pronto/);
    assert.match(sql, /preparo_estimado_minutos/);
    assert.match(sql, /pronto_em/);
    assert.match(sql, /confirmar_entrega/);
    assert.match(sql, /O entregador atribuído deve confirmar/);
});

test("painel mantém pedidos ativos visíveis fora do período selecionado", () => {
    const html = read("empresa-dashboard.html");
    const js = read("js/pages/empresa-dashboard.js");
    assert.match(js, /const ativo = !\["entregue", "cancelado"\]\.includes\(pedido\.status\)/);
    assert.match(js, /const noPeriodo = ativo \|\| filtroPeriodo === "todos"/);
    assert.match(html, /empresa-dashboard\.js\?v=4\.4\.5\.2/);
});

test("estoque mantém trilha de auditoria protegida", () => {
    const sql = read("supabase/migrations/20260801001600_operacao_catalogo_e_escala.sql");
    assert.match(sql, /create table if not exists public\.estoque_movimentos/);
    assert.match(sql, /alter table public\.estoque_movimentos enable row level security/);
    assert.match(sql, /registrar_movimento_estoque/);
    assert.match(sql, /revoke all on function private\.registrar_movimento_estoque/);
    assert.match(read("empresa-dashboard.html"), /id="estoqueMovimentos"/);
});

test("release 4.4.5 está versionado de forma consistente", () => {
    assert.equal(JSON.parse(read("package.json")).version, "4.4.5");
    assert.equal(JSON.parse(read("package-lock.json")).version, "4.4.5");
    assert.match(read("sw.js"), /const VERSION = "4\.4\.5"/);
    assert.match(read("js/core/site-enhancements.js"), /sw\.js\?v=4\.4\.5/);
});
