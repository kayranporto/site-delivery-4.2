"use strict";

const { test, expect } = require("@playwright/test");

function observarErrosFatais(page) {
    const erros = [];
    const aoFalhar = (erro) => erros.push(erro.message);
    page.on("pageerror", aoFalhar);
    return () => {
        page.off("pageerror", aoFalhar);
        expect(erros, "A página não deve gerar exceções JavaScript não tratadas").toEqual([]);
    };
}

async function abrir(page, rota) {
    const response = await page.goto(rota, { waitUntil: "domcontentloaded" });
    expect(response, `A rota ${rota} deve responder`).not.toBeNull();
    expect(response.status(), `A rota ${rota} deve responder HTTP 2xx`).toBeGreaterThanOrEqual(200);
    expect(response.status(), `A rota ${rota} deve responder HTTP 2xx`).toBeLessThan(300);
}

test("Home carrega, oferece busca e filtros acessíveis", async ({ page, isMobile }) => {
    const semErroFatal = observarErrosFatais(page);
    await abrir(page, "/");

    await expect(page).toHaveTitle(/Multi Delivery/i);
    await expect(page.getByRole("heading", { level: 2, name: "Restaurantes perto de você" })).toBeVisible();
    const busca = isMobile
        ? page.locator("#campoBuscaMobile")
        : page.getByRole("textbox", { name: /Buscar restaurante ou comida/i });
    if (isMobile) await page.goto("/#buscar");
    await expect(busca).toBeVisible();

    await page.keyboard.press("Control+K");
    await expect(busca).toBeFocused();

    if (isMobile) {
        await page.getByRole("button", { name: "Voltar para o início" }).click();
        await expect(page.locator("#buscaMobile")).toBeHidden();
    }

    const pizza = page.locator('.categoria[data-categoria="Pizza"]');
    await pizza.click();
    await expect(pizza).toHaveAttribute("aria-pressed", "true");

    const abertoAgora = page.locator("#toggleAberto");
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

test("Navegação principal leva ao login e protege a central de ajuda", async ({ page, isMobile }) => {
    await abrir(page, "/");

    await page.getByRole("link", { name: isMobile ? "Perfil" : "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/html\/login\.html$/);
    await expect(page.getByRole("heading", { level: 1, name: /Entre na sua conta/i })).toBeVisible();

    if (isMobile) {
        await abrir(page, "/html/suporte.html");
    } else {
        await abrir(page, "/");
        await page.getByRole("link", { name: "Ajuda" }).click();
    }
    await expect(page).toHaveURL(/\/html\/login\.html$/, { timeout: 12000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem("redirect"))).toBe("suporte.html");
});

test("Página de restaurante sem id volta para a Home", async ({ page }) => {
    const semErroFatal = observarErrosFatais(page);
    await abrir(page, "/html/restaurante.html");
    await expect(page).toHaveURL(/\/(?:index\.html)?$/, { timeout: 12000 });
    await expect(page.getByRole("heading", { level: 2, name: "Restaurantes perto de você" })).toBeVisible();
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
    for (const rota of ["/", "/html/login.html", "/html/cadastro.html", "/html/privacidade.html"]) {
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
