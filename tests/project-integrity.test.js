"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("referências locais das páginas existem", () => {
    const faltantes = [];
    for (const arquivo of fs.readdirSync(root).filter((nome) => nome.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(root, arquivo), "utf8");
        for (const match of html.matchAll(/(?:href|src)=["']([^"'#?]+)(?:\?[^"'#]*)?["']/g)) {
            const referencia = match[1];
            if (/^(?:https?:|mailto:|tel:|data:)/.test(referencia)) continue;
            if (!fs.existsSync(path.resolve(root, referencia))) faltantes.push(`${arquivo}: ${referencia}`);
        }
    }
    assert.deepEqual(faltantes, []);
});

test("migração 008 contém RLS e funções críticas", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801000800_entregas_tempo_real.sql"), "utf8");
    for (const trecho of ["enable row level security", "entregador_aceitar_pedido", "pedido_mensagens", "admin_relatorio_operacional", "proteger_pagamento_online"]) {
        assert.ok(sql.includes(trecho), `migração sem ${trecho}`);
    }
});

test("hotfix 009 recupera a coluna de modalidade de pagamento", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801000900_hotfix_painel_admin.sql"), "utf8");
    assert.match(sql, /add column if not exists pagamento_modalidade/i);
    assert.match(sql, /notify pgrst, 'reload schema'/i);
    const admin = fs.readFileSync(path.join(root, "js/admin.js"), "utf8");
    assert.match(admin, /consultarPedidosAdmin/);
    assert.match(admin, /adminMigrationWarning/);
});

test("administração 3.2 possui funções protegidas e interface completa", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801001000_admin_avancado.sql"), "utf8");
    for (const trecho of ["private.is_admin()", "admin_salvar_cupom", "admin_excluir_cupom", "admin_atualizar_restaurante", "admin_obter_pedido", "admin_auditoria"]) {
        assert.ok(sql.includes(trecho), `migração 010 sem ${trecho}`);
    }
    const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
    const js = fs.readFileSync(path.join(root, "js/admin.js"), "utf8");
    for (const match of js.matchAll(/getElementById\(["']([^"']+)["']\)/g)) {
        const existeEstatico = new RegExp(`id=["']${match[1]}["']`).test(html);
        const existeDinamico = new RegExp(`\\.id\\s*=\\s*["']${match[1]}["']`).test(js);
        assert.ok(existeEstatico || existeDinamico, `interface administrativa sem #${match[1]}`);
    }
    for (const id of ["adminPedidos", "novoCupom", "adminFontSize", "adminModal", "auditoriaAdmin"]) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
    }
});

test("módulos do restaurante convivem sem colisões globais", () => {
    const arquivos = ["restaurante.js", "carrinho.js", "modal.js", "site-enhancements.js"];
    const codigo = arquivos.map((arquivo) => fs.readFileSync(path.join(root, "js", arquivo), "utf8")).join("\n");
    assert.doesNotThrow(() => new vm.Script(codigo));
    const carrinho = fs.readFileSync(path.join(root, "js/carrinho.js"), "utf8");
    assert.match(carrinho, /window\.adicionarAoCarrinho\s*=\s*adicionarAoCarrinho/);
    assert.match(carrinho, /^"use strict";\s*\(\(\) => \{/);
});

test("carrinho inicializa e adiciona produto no armazenamento", () => {
    const armazenamento = {
        empresaAtual: { empresa_id: "empresa-1", empresa_nome: "Restaurante", taxa_entrega: 5, pedido_minimo: 0, status: true }
    };
    const contexto = {
        document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {}, body: { style: {} } },
        localStorage: { removeItem: (chave) => { delete armazenamento[chave]; } },
        App: {
            lerJSON: (chave, fallback) => armazenamento[chave] ?? fallback,
            salvarJSON: (chave, valor) => { armazenamento[chave] = JSON.parse(JSON.stringify(valor)); },
            dinheiro: (valor) => String(valor)
        },
        addEventListener: () => {},
        alert: () => { throw new Error("alerta inesperado"); },
        confirm: () => true
    };
    contexto.window = contexto;
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/carrinho.js"), "utf8"), contexto);
    assert.equal(typeof contexto.adicionarAoCarrinho, "function");
    contexto.adicionarAoCarrinho({ id: "produto-1", nome: "Produto", preco: 12, quantidade: 2, adicionais: [] });
    assert.equal(armazenamento.carrinho.length, 1);
    assert.equal(armazenamento.carrinho[0].quantidade, 2);
    assert.equal(armazenamento.carrinhoMeta.empresa_id, "empresa-1");
});

test("foto de perfil possui bucket protegido e interface de upload", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801001100_foto_perfil.sql"), "utf8");
    for (const trecho of ["avatar_url", "storage.buckets", "file_size_limit", "allowed_mime_types", "storage.foldername(name)", "auth.uid()::text", "for insert", "for update", "for delete"]) {
        assert.ok(sql.includes(trecho), `migração 011 sem ${trecho}`);
    }
    const dados = fs.readFileSync(path.join(root, "js/dados.js"), "utf8");
    for (const trecho of ["otimizarFoto", "512", "image/webp", ".storage.from(\"avatars\")", "getPublicUrl", "avatar_url"]) {
        assert.ok(dados.includes(trecho), `upload de avatar sem ${trecho}`);
    }
    const perfil = fs.readFileSync(path.join(root, "js/perfil.js"), "utf8");
    assert.match(perfil, /renderizarAvatar/);
    assert.match(perfil, /avatar_url/);
});

test("versão 3.4 integra mídia, favoritos, segurança e inteligência", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801001200_experiencia_completa.sql"), "utf8");
    for (const trecho of ["create table if not exists public.favoritos", "bucket_id = 'catalogo'", "storage.foldername(name)", "tentativas_login", "registrar_tentativa_login", "admin_relatorio_clientes_produtos", "sincronizar_identidade_social_usuario"]) {
        assert.ok(sql.includes(trecho), `migração 012 sem ${trecho}`);
    }
    const painel = fs.readFileSync(path.join(root, "empresa-dashboard.html"), "utf8");
    assert.match(painel, /media-uploader\.js/);
    assert.match(painel, /produtoImagemArquivo/);
    assert.match(painel, /lojaBannerArquivo/);
    const checkout = fs.readFileSync(path.join(root, "checkout.html"), "utf8");
    for (const trecho of ["cart-store.js", "dialogs.js", "checkoutResumo", "abrirMapaEndereco"]) assert.ok(checkout.includes(trecho));
    const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
    for (const id of ["topProdutosAdmin", "clientesRecorrentesAdmin", "segurancaLoginAdmin"]) assert.match(admin, new RegExp(`id=["']${id}["']`));
});

test("versão 3.5 integra operação, estoque, regiões, fidelidade e suporte", () => {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801001300_operacao_real.sql"), "utf8");
    for (const trecho of ["empresa_horarios", "empresa_regioes", "reservar_estoque_item", "criar_pedido_operacional", "cliente_solicitar_cancelamento", "programa_fidelidade_empresa", "resgatar_beneficio_fidelidade", "empresa_relatorio_financeiro", "chamados_suporte", "admin_saude_operacao", "admin_atualizar_reembolso", "enable row level security"]) {
        assert.ok(sql.includes(trecho), `migração 013 sem ${trecho}`);
    }
    const painel = fs.readFileSync(path.join(root, "empresa-dashboard.html"), "utf8");
    for (const id of ["horariosForm", "regiaoForm", "fidelidadeForm", "financeiroResumo", "cancelamentosEmpresa", "produtoControlaEstoque"]) assert.match(painel, new RegExp(`id=["']${id}["']`));
    const checkout = fs.readFileSync(path.join(root, "js/checkout.js"), "utf8");
    assert.match(checkout, /calcular_entrega_empresa/);
    assert.match(checkout, /criar_pedido_operacional/);
    const suporte = fs.readFileSync(path.join(root, "suporte.html"), "utf8");
    assert.match(suporte, /suporteForm/);
    const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
    assert.match(admin, /adminChamados/);
    assert.match(admin, /adminReembolsos/);
});
