"use strict";

const { test, expect } = require("@playwright/test");

const apiUrl = String(process.env.API_PUBLICA_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.API_PUBLICA_KEY || "");

test.describe("API pública publicada", () => {
    test.skip(!apiUrl || !apiKey, "Defina API_PUBLICA_URL e API_PUBLICA_KEY para executar o smoke remoto.");

    test("status responde com contrato e cabeçalhos versionados", async ({ request }) => {
        const response = await request.get(`${apiUrl}/v1/status`, { headers: { apikey: apiKey } });
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("application/json");
        expect(response.headers()["x-api-version"]).toBe("1.0.0");
        expect(response.headers()["x-content-type-options"]).toBe("nosniff");

        const body = await response.json();
        expect(body.data).toMatchObject({
            status: "ok",
            servico: "multi-delivery-api",
            versao: "1.0.0"
        });
        expect(body.request_id).toEqual(expect.any(String));
    });

    test("catálogo limita a página e não revela campos administrativos", async ({ request }) => {
        const response = await request.get(`${apiUrl}/v1/restaurantes?limite=1&offset=0`, {
            headers: { apikey: apiKey }
        });
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.data.length).toBeLessThanOrEqual(1);
        expect(body.meta).toMatchObject({ limite: 1, offset: 0 });
        for (const restaurant of body.data) {
            expect(restaurant).not.toHaveProperty("usuario_id");
            expect(restaurant).not.toHaveProperty("cnpj");
            expect(restaurant).not.toHaveProperty("email");
            expect(restaurant).not.toHaveProperty("telefone");
        }
    });

    test("cardápio entrega somente dados públicos relacionados", async ({ request }) => {
        const listResponse = await request.get(`${apiUrl}/v1/restaurantes?limite=1`, {
            headers: { apikey: apiKey }
        });
        expect(listResponse.status()).toBe(200);
        const listBody = await listResponse.json();
        test.skip(!listBody.data.length, "Não há restaurante publicado para validar o cardápio.");

        const restaurantId = listBody.data[0].id;
        const response = await request.get(`${apiUrl}/v1/restaurantes/${encodeURIComponent(restaurantId)}/cardapio`, {
            headers: { apikey: apiKey }
        });
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.data.restaurante.id).toBe(restaurantId);
        expect(body.data.categorias).toEqual(expect.any(Array));
        expect(body.data.produtos).toEqual(expect.any(Array));
        expect(body.data.grupos_adicionais).toEqual(expect.any(Array));

        const serialized = JSON.stringify(body);
        for (const field of ["usuario_id", "cnpj", "email", "telefone"]) {
            expect(serialized).not.toContain(`"${field}"`);
        }
    });
});
