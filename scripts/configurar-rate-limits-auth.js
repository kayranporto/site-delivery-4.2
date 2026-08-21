"use strict";

const projectRef = process.env.PROJECT_REF || "wzxsjxdbxonrmlmzufpv";
const authConfigUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const mode = process.argv[2] || "--check";

const environmentFields = {
    AUTH_RATE_LIMIT_ANONYMOUS_USERS: "rate_limit_anonymous_users",
    AUTH_RATE_LIMIT_EMAIL_SENT: "rate_limit_email_sent",
    AUTH_RATE_LIMIT_OTP: "rate_limit_otp",
    AUTH_RATE_LIMIT_SMS_SENT: "rate_limit_sms_sent",
    AUTH_RATE_LIMIT_TOKEN_REFRESH: "rate_limit_token_refresh",
    AUTH_RATE_LIMIT_VERIFY: "rate_limit_verify",
    AUTH_RATE_LIMIT_WEB3: "rate_limit_web3"
};

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

function rateLimitConfig(config) {
    return Object.fromEntries(
        Object.values(environmentFields).map((field) => [field, config[field] ?? null])
    );
}

function readRateLimits() {
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
    if (Object.keys(values).length === 0) {
        throw new Error("Defina pelo menos um AUTH_RATE_LIMIT_* antes de usar --apply.");
    }
    return values;
}

async function main() {
    if (!["--check", "--apply"].includes(mode)) {
        throw new Error("Uso: node scripts/configurar-rate-limits-auth.js [--check|--apply]");
    }

    const accessToken = required("SUPABASE_ACCESS_TOKEN");
    if (mode === "--check") {
        console.log(JSON.stringify(rateLimitConfig(await requestAuth(accessToken)), null, 2));
        return;
    }

    const updated = await requestAuth(accessToken, {
        method: "PATCH",
        body: JSON.stringify(readRateLimits())
    });
    console.log(JSON.stringify(rateLimitConfig(updated), null, 2));
    console.log("\nRate limits do Supabase Auth atualizados.");
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
