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

test("painel do restaurante exibe apenas a seção escolhida", () => {
    const html = read("empresa-dashboard.html");
    const js = read("js/pages/empresa-dashboard.js");
    const css = read("css/pages/empresa-dashboard.css");
    assert.equal((html.match(/data-dashboard-view/g) || []).length, 10);
    assert.match(html, /id="visaoGeral"[^>]*data-dashboard-view/);
    assert.match(html, /id="pedidos"[^>]*data-dashboard-view[^>]*hidden/);
    assert.match(js, /function mostrarSecaoPainel/);
    assert.match(js, /history\.pushState/);
    assert.match(js, /addEventListener\("hashchange"/);
    assert.match(css, /\.dashboard-view\[hidden\]\{display:none!important\}/);
});

test("cadastros exigem sessão imediata e não instruem confirmação de e-mail", () => {
    const client = read("js/pages/cadastro.js");
    const company = read("js/pages/empresa-cadastro.js");
    for (const code of [client, company]) {
        assert.match(code, /if \(!data\.session\)/);
        assert.match(code, /confirmação de e-mail ainda está habilitada/);
        assert.doesNotMatch(code, /Verifique seu e-mail para confirmar|Confirme o e-mail antes de entrar/);
        assert.match(code, /AuthPolicy/);
        assert.match(code, /captchaToken/);
    }
    assert.match(read("supabase/config.toml"), /enable_confirmations = false/);
});

test("autenticação usa publishable key, senha forte e CAPTCHA opcional", () => {
    const supabase = read("js/core/supabase.js");
    assert.match(supabase, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(supabase, /sb_publishable_/);
    assert.doesNotMatch(supabase, /SUPABASE_ANON_KEY/);
    const ui = read("js/core/auth-ui.js");
    assert.match(ui, /minLength: 8/);
    assert.match(ui, /letra/);
    assert.match(ui, /numero/);
    const captcha = read("js/core/captcha.js");
    assert.match(captcha, /challenges\.cloudflare\.com\/turnstile/);
    assert.match(captcha, /DeliveryCaptcha/);
    for (const name of ["cadastro.html", "empresa-cadastro.html", "login.html", "empresa-login.html", "recuperar-senha.html"]) {
        assert.match(read(name), /data-turnstile/, `${name} sem Turnstile`);
        assert.match(read(name), /js\/core\/captcha\.js\?v=4\.2\.0/, `${name} sem captcha.js`);
    }
});

test("login não chama telemetria controlada pelo cliente", () => {
    for (const name of ["js/pages/login.js", "js/pages/empresa-login.js"]) {
        assert.doesNotMatch(read(name), /registrar_tentativa_login/);
        assert.match(read(name), /pausa local/);
    }
    const migration = read("supabase/migrations/20260801001500_auth_sem_confirmacao_e_hardening.sql");
    assert.match(migration, /drop function if exists public\.registrar_tentativa_login/);
    assert.match(migration, /revoke all on function public\.admin_atualizar_reembolso/);
});

test("configuração de produção inclui automação sem confirmação", () => {
    const script = read("scripts/configurar-auth-sem-confirmacao.sh");
    assert.match(script, /mailer_autoconfirm/);
    assert.match(script, /password_hibp_enabled/);
    assert.match(script, /password_min_length/);
    assert.doesNotMatch(script, /Bearer [A-Za-z0-9_-]{20,}/);
});

test("protecao do Auth so ativa CAPTCHA depois da publicacao da Site Key", () => {
    const script = read("scripts/configurar-protecao-auth.js");
    const packageJson = JSON.parse(read("package.json"));
    assert.equal(packageJson.scripts["configure:auth:protection"], "node scripts/configurar-protecao-auth.js");
    assert.match(script, /security_captcha_enabled: true/);
    assert.match(script, /security_captcha_provider: "turnstile"/);
    assert.match(script, /PUBLIC_SITE_URL/);
    assert.match(script, /Site Key informada ainda nao esta publicada/);
    assert.match(script, /AUTH_RATE_LIMIT_EMAIL_SENT/);
    assert.match(script, /AUTH_RATE_LIMIT_TOKEN_REFRESH/);
    assert.doesNotMatch(script, /Bearer [A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(script, /TURNSTILE_SECRET_KEY=[A-Za-z0-9_-]{10,}/);
});
