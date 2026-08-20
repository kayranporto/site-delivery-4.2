"use strict";

const projectRef = process.env.PROJECT_REF || "wzxsjxdbxonrmlmzufpv";
const publicSiteUrl = process.env.PUBLIC_SITE_URL || "https://kayranporto.github.io/site-delivery-4.2";
const authConfigUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const mode = process.argv[2] || "--apply";

function required(name) {
    const value = String(process.env[name] || "").trim();
    if (!value) throw new Error(`Defina ${name} no ambiente.`);
    return value;
}

async function requestAuth(accessToken, options = {}) {
    const response = await fetch(authConfigUrl, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Supabase Management API respondeu HTTP ${response.status}: ${body.slice(0, 500)}`);
    return JSON.parse(body);
}

function protectionConfig(config) {
    const fields = [
        "security_captcha_enabled",
        "security_captcha_provider",
        "rate_limit_anonymous_users",
        "rate_limit_email_sent",
        "rate_limit_otp",
        "rate_limit_sms_sent",
        "rate_limit_token_refresh",
        "rate_limit_verify",
        "rate_limit_web3"
    ];
    const output = Object.fromEntries(fields.map((field) => [field, config[field] ?? null]));
    output.security_captcha_secret = config.security_captcha_secret ? "[configurado]" : "[ausente]";
    return output;
}

function readOptionalRateLimits() {
    const environmentFields = {
        AUTH_RATE_LIMIT_ANONYMOUS_USERS: "rate_limit_anonymous_users",
        AUTH_RATE_LIMIT_EMAIL_SENT: "rate_limit_email_sent",
        AUTH_RATE_LIMIT_OTP: "rate_limit_otp",
        AUTH_RATE_LIMIT_SMS_SENT: "rate_limit_sms_sent",
        AUTH_RATE_LIMIT_TOKEN_REFRESH: "rate_limit_token_refresh",
        AUTH_RATE_LIMIT_VERIFY: "rate_limit_verify",
        AUTH_RATE_LIMIT_WEB3: "rate_limit_web3"
    };
    const values = {};
    for (const [environmentName, field] of Object.entries(environmentFields)) {
        const raw = process.env[environmentName];
        if (raw === undefined || raw === "") continue;
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
            throw new Error(`${environmentName} deve ser um inteiro entre 1 e 2147483647.`);
        }
        values[field] = value;
    }
    return values;
}

function validateTurnstileKey(name, value) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(value)) {
        throw new Error(`${name} possui formato inesperado.`);
    }
}

async function main() {
    if (!['--check', '--apply'].includes(mode)) {
        throw new Error("Uso: node scripts/configurar-protecao-auth.js [--check|--apply]");
    }

    const accessToken = required("SUPABASE_ACCESS_TOKEN");
    if (mode === "--check") {
        console.log(JSON.stringify(protectionConfig(await requestAuth(accessToken)), null, 2));
        return;
    }

    const turnstileSiteKey = required("TURNSTILE_SITE_KEY");
    const turnstileSecretKey = required("TURNSTILE_SECRET_KEY");
    validateTurnstileKey("TURNSTILE_SITE_KEY", turnstileSiteKey);
    validateTurnstileKey("TURNSTILE_SECRET_KEY", turnstileSecretKey);

    // Habilitar o backend antes de publicar a Site Key bloquearia todos os
    // fluxos de login, cadastro e recuperacao. Confirme primeiro o frontend live.
    const publicConfigUrl = `${publicSiteUrl.replace(/\/$/, "")}/js/core/config.js`;
    const publicConfigResponse = await fetch(publicConfigUrl, { cache: "no-store" });
    if (!publicConfigResponse.ok) {
        throw new Error(`Nao foi possivel validar o frontend publicado: HTTP ${publicConfigResponse.status}.`);
    }
    const publicConfig = await publicConfigResponse.text();
    const expectedSiteKey = `turnstileSiteKey: "${turnstileSiteKey}"`;
    if (!publicConfig.includes(expectedSiteKey)) {
        throw new Error("A Site Key informada ainda nao esta publicada no frontend. Publique-a antes de ativar o CAPTCHA no Supabase.");
    }

    const payload = {
        security_captcha_enabled: true,
        security_captcha_provider: "turnstile",
        security_captcha_secret: turnstileSecretKey,
        ...readOptionalRateLimits()
    };
    const updated = await requestAuth(accessToken, {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
    console.log(JSON.stringify(protectionConfig(updated), null, 2));
    console.log("\nProtecao do Supabase Auth atualizada sem expor as chaves no repositorio.");
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
