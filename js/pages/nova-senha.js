"use strict";

const formNovaSenha = document.getElementById("novaSenhaForm");
const statusRecuperacao = document.getElementById("statusRecuperacao");
const novoLink = document.getElementById("novoLinkRecuperacao");

function avisarNovaSenha(titulo, mensagem, tipo = "info", campo = null, tempo = 5000) {
    window.AppToast?.(titulo, mensagem, tipo, tempo);
    campo?.focus?.();
}

function senhaValida(senha) {
    return senha.length >= 8 && /[A-Za-zÀ-ÿ]/.test(senha) && /\d/.test(senha);
}

async function verificarRecuperacao() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error || !session) {
        statusRecuperacao.textContent = "Este link é inválido ou expirou. Solicite uma nova recuperação.";
        novoLink.hidden = false;
        return;
    }
    statusRecuperacao.textContent = "Digite e confirme sua nova senha.";
    formNovaSenha.hidden = false;
}

formNovaSenha.addEventListener("submit", async (event) => {
    event.preventDefault();
    const senhaCampo = document.getElementById("novaSenha");
    const confirmacaoCampo = document.getElementById("confirmarSenha");
    const senha = senhaCampo.value;
    const confirmacao = confirmacaoCampo.value;

    if (!senhaValida(senha)) {
        avisarNovaSenha("Senha fraca", "Use pelo menos 8 caracteres, incluindo uma letra e um número.", "error", senhaCampo);
        return;
    }
    if (senha !== confirmacao) {
        avisarNovaSenha("Senhas diferentes", "A confirmação precisa ser igual à nova senha.", "error", confirmacaoCampo);
        return;
    }

    const botao = event.currentTarget.querySelector("button");
    App.definirCarregando(botao, true, "Atualizando...");
    try {
        const { error } = await db.auth.updateUser({ password: senha });
        if (error) throw error;
        await db.auth.signOut();
        App.limparDadosPrivados();
        statusRecuperacao.textContent = "Senha atualizada. Redirecionando para o login...";
        avisarNovaSenha("Senha atualizada", "Entre novamente usando sua nova senha.", "success", null, 6000);
        setTimeout(() => location.replace("login.html"), 900);
    } catch (error) {
        avisarNovaSenha("Não foi possível atualizar a senha", App.mensagemErro(error), "error");
    } finally {
        App.definirCarregando(botao, false);
    }
});

verificarRecuperacao();
