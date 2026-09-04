"use strict";

const { test, expect } = require("@playwright/test");

// Dados locais: exercita os renderizadores reais sem depender do catálogo de produção.
async function prepararPagina(page) {
    await page.route("https://**/*", (route) => route.abort());
    await page.addInitScript(() => {
        const empresa = { id: "tema-loja", nome: "Restaurante de teste", status: true, taxa_entrega: 2.5, pedido_minimo: 15 };
        const produto = { id: "tema-produto", empresa_id: empresa.id, nome: "Lanche de teste", descricao: "Descrição do produto", preco: 24.9, disponivel: true };
        const tabelas = { empresas_catalogo: [empresa], produtos: [produto] };
        window.db = {
            from(tabela) {
                let unico = false;
                const consulta = new Proxy({}, {
                    get(_alvo, metodo) {
                        if (metodo === "then") return (resolve) => Promise.resolve({
                            data: unico ? (tabelas[tabela]?.[0] || null) : (tabelas[tabela] || []), error: null
                        }).then(resolve);
                        return () => { if (metodo === "single" || metodo === "maybeSingle") unico = true; return consulta; };
                    }
                });
                return consulta;
            },
            rpc: async (nome) => ({ data: nome === "empresa_disponibilidade" ? { aberto: true } : null, error: null }),
            auth: {
                getUser: async () => ({ data: { user: null }, error: null }),
                getSession: async () => ({ data: { session: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
            }
        };
    });
}

async function ativarEscuro(page) {
    const temaAtual = await page.locator("html").getAttribute("data-theme");
    if (temaAtual !== "dark") {
        await page.getByRole("button", { name: "Ativar modo escuro", exact: true }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

// Calcula o contraste sobre o fundo efetivo, incluindo superfícies translúcidas.
async function contraste(locator) {
    return locator.evaluate((elemento) => {
        const rgb = (valor) => valor.match(/[\d.]+/g).map(Number);
        const misturar = (frente, fundo) => frente.slice(0, 3).map((v, i) => v * (frente[3] ?? 1) + fundo[i] * (1 - (frente[3] ?? 1)));
        const camadas = [];
        for (let atual = elemento; atual; atual = atual.parentElement) camadas.push(rgb(getComputedStyle(atual).backgroundColor));
        const fundo = camadas.reverse().reduce((cor, camada) => misturar(camada, cor), [255, 255, 255]);
        const texto = misturar(rgb(getComputedStyle(elemento).color), fundo);
        const luminancia = (cor) => cor.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
            .reduce((soma, v, i) => soma + v * [.2126, .7152, .0722][i], 0);
        const a = luminancia(texto), b = luminancia(fundo);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
}

async function legivel(page, seletor) {
    const elementos = page.locator(seletor).filter({ visible: true });
    await expect(elementos.first()).toBeVisible();
    for (const elemento of await elementos.all()) {
        await expect(elemento).toBeVisible();
        await expect.poll(() => contraste(elemento), { message: `Contraste insuficiente: ${seletor}` }).toBeGreaterThanOrEqual(4.5);
    }
}

test.beforeEach(async ({ page }) => prepararPagina(page));

test("tema persiste ao recarregar e navegar, e volta ao modo claro", async ({ page }) => {
    await page.goto("/html/login.html");
    const campo = page.locator("#email");
    const fundoClaro = await campo.evaluate((el) => getComputedStyle(el).backgroundColor);
    await ativarEscuro(page);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("link", { name: /Criar conta/i }).click();
    await expect(page).toHaveURL(/cadastro\.html$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Ativar modo claro", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#email")).toHaveCSS("background-color", fundoClaro);
});

test("login e cadastros mantêm rótulos e consentimentos legíveis", async ({ page }) => {
    await page.goto("/html/login.html");
    await ativarEscuro(page);
    for (const rota of ["login", "cadastro", "empresa-login", "empresa-cadastro"]) {
        await page.goto(`/html/${rota}.html`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await legivel(page, ".auth-field label, .auth-check, .auth-role-switch a.active");
        await page.locator("#email").focus();
        await legivel(page, "#email");
        await expect(page.locator(".auth-role-switch a.active")).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
    }
});

test("cardápio, carrinho vazio, modal e carrinho preenchido respeitam o tema", async ({ page }) => {
    const layoutMobile = (await page.viewportSize())?.width <= 768;
    await page.goto("/html/restaurante.html?id=tema-loja");
    await ativarEscuro(page);
    await expect(page.getByRole("button", { name: "Personalizar Lanche de teste" })).toBeVisible();
    await legivel(page, "#infoEntrega, .produto-card .produto-info strong, .produto-card .produto-info p");
    await page.getByRole("button", { name: "Abrir carrinho vazio" }).click();
    await expect(page.locator("#carrinho")).toHaveCSS("background-color", layoutMobile ? "rgb(9, 11, 13)" : "rgb(25, 30, 39)");
    await legivel(page, ".carrinho-vazio h3, .carrinho-vazio p");
    await page.getByRole("button", { name: "Fechar carrinho" }).click();
    await page.getByRole("button", { name: "Personalizar Lanche de teste" }).click();
    await expect(page.getByRole("dialog", { name: "Lanche de teste" })).toBeVisible();
    await legivel(page, "#modalNome, #modalDescricao");
    await page.getByRole("textbox", { name: "Observações do produto" }).fill("Sem cebola");
    await legivel(page, "#observacao");
    await page.locator("#confirmarProduto").click();
    await expect(page.locator(".item-carrinho")).toBeVisible();
    await legivel(page, ".item-carrinho-titulo h4, .item-carrinho-total, .item-carrinho .observacao, .carrinho-footer .linha strong");
});

test("checkout mantém endereço, pagamento, campos e rodapé legíveis", async ({ page }) => {
    const layoutMobile = (await page.viewportSize())?.width <= 768;
    await page.goto("/html/checkout.html");
    await ativarEscuro(page);
    await legivel(page, "#enderecoEntrega, #pagamentoNota, #enderecoStatus");
    if (!layoutMobile) await legivel(page, ".footer-total span, .footer-total strong");
    await expect(page.locator(".checkout-footer")).toHaveCSS("background-color", layoutMobile ? "rgba(15, 17, 20, 0.97)" : "rgb(32, 38, 49)");
    const dinheiro = page.getByRole("radio", { name: /Dinheiro/ });
    if (await dinheiro.isEnabled()) {
        await dinheiro.check();
        await expect(page.locator("#trocoPara")).toBeVisible();
        await page.locator("#trocoPara").fill("50");
        await legivel(page, ".troco-field label, #trocoPara, .payment-option strong, #pagamentoSelecionadoResumo");
    } else {
        await legivel(page, ".payment-option strong, #pagamentoSelecionadoResumo");
    }
    await page.locator("#stepPagamento strong").scrollIntoViewIfNeeded();
    await legivel(page, "#stepPagamento strong, .linha.discount strong");
});
