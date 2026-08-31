"use strict";

const { test, expect } = require("@playwright/test");

function observarErrosFatais(page) {
    const erros = [];
    page.on("pageerror", (erro) => erros.push(erro.message));
    return () => expect(erros, "A página não deve gerar exceções JavaScript não tratadas").toEqual([]);
}

async function abrir(page, rota) {
    const response = await page.goto(rota, { waitUntil: "domcontentloaded" });
    expect(response, `A rota ${rota} deve responder`).not.toBeNull();
    expect(response.status(), `A rota ${rota} deve responder HTTP 2xx`).toBeGreaterThanOrEqual(200);
    expect(response.status(), `A rota ${rota} deve responder HTTP 2xx`).toBeLessThan(300);
}

test("Home carrega, oferece busca e filtros acessíveis", async ({ page }) => {
    const semErroFatal = observarErrosFatais(page);
    await abrir(page, "/");

    await expect(page).toHaveTitle(/Multi Delivery/i);
    await expect(page.getByRole("heading", { level: 1, name: /Sua comida/i })).toBeVisible();
    const busca = page.getByRole("textbox", { name: /Buscar restaurante ou comida/i });
    await expect(busca).toBeVisible();

    await page.keyboard.press("Control+K");
    await expect(busca).toBeFocused();

    const pizza = page.getByRole("button", { name: "Pizza" });
    await pizza.click();
    await expect(pizza).toHaveAttribute("aria-pressed", "true");

    const abertoAgora = page.getByRole("button", { name: "Aberto agora" });
    await abertoAgora.click();
    await expect(abertoAgora).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Abrir carrinho" })).toBeVisible();

    semErroFatal();
});

test("Rotas públicas essenciais entregam uma página utilizável", async ({ page }) => {
    const rotas = [
        "/html/login.html",
        "/html/cadastro.html",
        "/html/empresa-login.html",
        "/html/empresa-cadastro.html",
        "/html/suporte.html",
        "/html/privacidade.html"
    ];

    for (const rota of rotas) {
        const semErroFatal = observarErrosFatais(page);
        await abrir(page, rota);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("h1").first(), `${rota} deve possuir um título principal`).toBeVisible();
        await expect(page).not.toHaveTitle(/^\s*$/);
        semErroFatal();
    }
});

test("Navegação principal leva ao login e à central de ajuda", async ({ page }) => {
    await abrir(page, "/");

    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/html\/login\.html$/);
    await expect(page.getByRole("heading", { level: 1, name: /Entre na sua conta/i })).toBeVisible();

    await abrir(page, "/");
    await page.getByRole("link", { name: "Ajuda" }).click();
    await expect(page).toHaveURL(/\/html\/suporte\.html$/);
    await expect(page.locator("h1").first()).toBeVisible();
});

test("Página de restaurante sem id volta para a Home", async ({ page }) => {
    const semErroFatal = observarErrosFatais(page);
    await abrir(page, "/html/restaurante.html");
    await expect(page).toHaveURL(/\/$/, { timeout: 12000 });
    await expect(page.getByRole("heading", { level: 1, name: /Sua comida/i })).toBeVisible();
    semErroFatal();
});

test("Página protegida de perfil exige autenticação", async ({ page }) => {
    const semErroFatal = observarErrosFatais(page);
    await abrir(page, "/html/perfil.html");
    await expect(page).toHaveURL(/\/html\/login\.html$/, { timeout: 12000 });
    await expect(page.getByRole("heading", { level: 1, name: /Entre na sua conta/i })).toBeVisible();
    semErroFatal();
});

test("Páginas principais não criam overflow horizontal no viewport", async ({ page }) => {
    for (const rota of ["/", "/html/login.html", "/html/cadastro.html", "/html/suporte.html"]) {
        await abrir(page, rota);
        const largura = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            conteudo: document.documentElement.scrollWidth
        }));
        expect(
            largura.conteudo,
            `${rota} não deve ultrapassar a largura do viewport (${largura.viewport}px)`
        ).toBeLessThanOrEqual(largura.viewport + 1);
    }
});
