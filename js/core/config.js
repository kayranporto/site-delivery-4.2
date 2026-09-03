"use strict";

// Configurações públicas opcionais. Nunca coloque Access Token, service_role
// ou qualquer segredo neste arquivo.
window.DELIVERY_CONFIG = Object.freeze({
    appVersion: "4.4.6",
    // Ative somente depois de validar os segredos e o fluxo completo do
    // Mercado Pago no sandbox. O padrão seguro impede novos pedidos online
    // enquanto o gateway não estiver pronto.
    pagamentoOnlineAtivo: false,
    // Chave pública Web Push. A chave privada correspondente fica somente no Supabase Vault.
    vapidPublicKey: "BGez1MdTc2wS7PQFv4d237o-XIrN2Eal9_eSq3U-ABn_iUBu-JGWHVc0IXyQWrpvggIlukxndFajZ-P_bMjywZY",
    // Preencha com a Site Key pública do Cloudflare Turnstile.
    // Quando vazia, o componente anti-robô permanece desativado.
    turnstileSiteKey: ""
});
