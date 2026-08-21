"use strict";

const projectRef = process.env.PROJECT_REF || "wzxsjxdbxonrmlmzufpv";
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const authConfigUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const expected = Object.freeze({
    mfa_totp_enroll_enabled: true,
    mfa_totp_verify_enabled: true,
    mailer_otp_length: 8
});

if (!accessToken) {
    console.error("Defina SUPABASE_ACCESS_TOKEN no ambiente. O token não será salvo nem exibido.");
    process.exit(1);
}

async function request(method, body) {
    const response = await fetch(authConfigUrl, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Supabase Management API respondeu HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
}

function snapshot(config) {
    return Object.fromEntries(Object.keys(expected).map((field) => [field, config[field]]));
}

function isExpected(config) {
    return Object.entries(expected).every(([field, value]) => config[field] === value);
}

async function main() {
    const before = await request("GET");
    if (!isExpected(before)) await request("PATCH", expected);

    const after = await request("GET");
    if (!isExpected(after)) {
        throw new Error(`Verificação falhou: ${JSON.stringify(snapshot(after))}`);
    }

    console.log(JSON.stringify(snapshot(after), null, 2));
    console.log("MFA TOTP e OTP de 8 dígitos confirmados no Supabase.");
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
