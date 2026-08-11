"use strict";

// Configurações públicas opcionais. Nunca coloque Access Token, service_role
// ou qualquer segredo neste arquivo.
window.DELIVERY_CONFIG = Object.freeze({
    appVersion: "4.2.8",
    // Ative somente depois de validar os segredos e o fluxo completo do
    // Mercado Pago no sandbox. O padrão seguro impede novos pedidos online
    // enquanto o gateway não estiver pronto.
    pagamentoOnlineAtivo: false,
    vapidPublicKey: "",
    // Preencha com a Site Key pública do Cloudflare Turnstile.
    // Quando vazia, o componente anti-robô permanece desativado.
    turnstileSiteKey: ""
});
