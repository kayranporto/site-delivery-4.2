"use strict";

const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const senha = document.getElementById("senha");
const botao = form.querySelector("button[type='submit']");
const statusSeguranca = document.getElementById("loginSecurityStatus");
const CHAVE_TENTATIVAS = "login_tentativas_4_1";

function estadoTentativas(emailAtual) {
    const estado = App.lerJSON(CHAVE_TENTATIVAS, {}) || {};
    return estado.email === emailAtual ? estado : { email: emailAtual, falhas: 0, bloqueadoAte: 0 };
}
function salvarTentativas(estado) { App.salvarJSON(CHAVE_TENTATIVAS, estado); }
function exibirStatus(mensagem, erro = false) {
    statusSeguranca.hidden = !mensagem; statusSeguranca.textContent = mensagem || ""; statusSeguranca.classList.toggle("error", erro);
}
function segundosRestantes(estado) { return Math.max(0, Math.ceil((Number(estado.bloqueadoAte || 0) - Date.now()) / 1000)); }
function mostrarErro(campo, mensagem) {
    campo.setAttribute("aria-invalid", "true"); campo.focus(); exibirStatus(mensagem, true); window.AppToast?.("Verifique os dados", mensagem, "error");
}
function limparErros() { email.removeAttribute("aria-invalid"); senha.removeAttribute("aria-invalid"); }

form.addEventListener("submit", async (event) => {
    event.preventDefault(); limparErros();
    const emailDigitado = email.value.trim().toLowerCase();
    const senhaDigitada = senha.value;
    const estado = estadoTentativas(emailDigitado);
    const espera = segundosRestantes(estado);
    if (espera > 0) return exibirStatus(`Aguarde ${espera} segundos antes de tentar novamente neste dispositivo.`, true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDigitado)) return mostrarErro(email, "Informe um e-mail válido.");
    if (!senhaDigitada) return mostrarErro(senha, "Informe sua senha.");
    if (!window.DeliveryCaptcha?.validar()) return;

    App.definirCarregando(botao, true, "Entrando...");
    try {
        const captchaToken = window.DeliveryCaptcha?.getToken() || undefined;
        const credentials = { email: emailDigitado, password: senhaDigitada };
        if (captchaToken) credentials.options = { captchaToken };
        const { data, error } = await window.db.auth.signInWithPassword(credentials);
        if (error) throw error;
        if (!data?.user) throw new Error("Usuário não encontrado.");
        salvarTentativas({ email: emailDigitado, falhas: 0, bloqueadoAte: 0 });
        App.vincularUsuarioLocal(data.user.id);
        const solicitado = localStorage.getItem("redirect"); localStorage.removeItem("redirect");
        window.location.replace(App.destinoInterno(solicitado, "perfil.html"));
    } catch (erro) {
        console.error("Erro ao fazer login:", erro);
        estado.falhas = Number(estado.falhas || 0) + 1;
        if (estado.falhas >= 5) estado.bloqueadoAte = Date.now() + 60000;
        salvarTentativas(estado);
        const mensagem = estado.bloqueadoAte > Date.now()
            ? "Muitas tentativas incorretas. Aguarde 60 segundos neste dispositivo."
            : `Não foi possível entrar. Confira e-mail e senha. ${Math.max(0, 5 - estado.falhas)} tentativa(s) antes da pausa local.`;
        exibirStatus(mensagem, true); window.AppToast?.("Acesso não realizado", mensagem, "error");
    } finally {
        window.DeliveryCaptcha?.reset(); App.definirCarregando(botao, false);
    }
});
[email, senha].forEach((campo) => campo.addEventListener("input", () => exibirStatus("")));
