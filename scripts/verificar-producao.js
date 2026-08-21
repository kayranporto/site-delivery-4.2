"use strict";

const baseUrl = String(
    process.env.PUBLIC_SITE_URL || "https://site-delivery-42.vercel.app"
).replace(/\/$/, "");

const routes = [
    ["/", "text/html"],
    ["/html/login.html", "text/html"],
    ["/html/cadastro.html", "text/html"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/sw.js", "application/javascript"]
];

const expectedHeaders = {
    "content-security-policy": ["default-src 'self'", "frame-ancestors 'none'"],
    "strict-transport-security": ["max-age=63072000"],
    "x-content-type-options": ["nosniff"],
    "x-frame-options": ["DENY"],
    "referrer-policy": ["strict-origin-when-cross-origin"],
    "permissions-policy": ["camera=()", "geolocation=(self)"],
    "cross-origin-opener-policy": ["same-origin"],
    "cross-origin-resource-policy": ["same-site"]
};

async function request(pathname) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        redirect: "follow",
        headers: { "User-Agent": "multi-delivery-production-check/1.0" }
    });
    if (!response.ok) throw new Error(`${pathname} respondeu HTTP ${response.status}.`);
    return response;
}

async function main() {
    for (const [pathname, expectedType] of routes) {
        const response = await request(pathname);
        const actualType = response.headers.get("content-type") || "";
        if (!actualType.toLowerCase().includes(expectedType)) {
            throw new Error(`${pathname} retornou Content-Type inesperado: ${actualType || "ausente"}.`);
        }
        console.log(`OK ${response.status} ${pathname} (${actualType})`);
    }

    const response = await request("/");
    for (const [header, fragments] of Object.entries(expectedHeaders)) {
        const value = response.headers.get(header) || "";
        for (const fragment of fragments) {
            if (!value.includes(fragment)) {
                throw new Error(`Cabeçalho ${header} não contém ${fragment}.`);
            }
        }
        console.log(`OK header ${header}`);
    }

    console.log(`\nProdução validada em ${baseUrl}.`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
