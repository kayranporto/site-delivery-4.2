"use strict";

const form = document.getElementById("recuperarForm");

function avisarRecuperacao(titulo, mensagem, tipo = "info", campo = null, tempo = 5000) {
    window.AppToast?.(titulo, mensagem, tipo, tempo);
    campo?.focus?.();
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailCampo = document.getElementById("email");
    const email = emailCampo.value.trim().toLowerCase();
    const botao = form.querySelector("button[type='submit']");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        avisarRecuperacao("E-mail inválido", "Informe um endereço de e-mail válido para recuperar a senha.", "error", emailCampo);
        return;
    }
    if (!window.DeliveryCaptcha?.validar()) return;
    App.definirCarregando(botao, true, "Enviando...");
    try {
        const redirectTo = new URL("nova-senha.html", window.location.href).href;
        const captchaToken = window.DeliveryCaptcha?.getToken() || undefined;
        const options = { redirectTo };
        if (captchaToken) options.captchaToken = captchaToken;
        const { error } = await window.db.auth.resetPasswordForEmail(email, options);
        if (error) throw error;
        avisarRecuperacao(
            "Confira seu e-mail",
            "Se este endereço estiver cadastrado, enviaremos um link para criar uma nova senha.",
            "success",
            null,
            6000
        );
        setTimeout(() => window.location.replace("login.html"), 900);
    } catch (erro) {
        avisarRecuperacao("Não foi possível enviar o link", App.mensagemErro(erro, "erro desconhecido"), "error");
    } finally {
        window.DeliveryCaptcha?.reset();
        App.definirCarregando(botao, false);
    }
});
