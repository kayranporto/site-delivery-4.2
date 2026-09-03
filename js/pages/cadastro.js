"use strict";

const form = document.getElementById("cadastroForm");
const submitButton = form.querySelector("button[type='submit']");

function avisarCadastro(titulo, mensagem, tipo = "info", campo = null) {
    window.AppToast?.(titulo, mensagem, tipo);
    campo?.focus?.();
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nomeCampo = document.getElementById("nome");
    const sobrenomeCampo = document.getElementById("sobrenome");
    const telefoneCampo = document.getElementById("telefone");
    const emailCampo = document.getElementById("email");
    const cpfCampo = document.getElementById("cpf");
    const senhaCampo = document.getElementById("senha");
    const confirmarSenhaCampo = document.getElementById("confirmarSenha");

    const nome = nomeCampo.value.trim();
    const sobrenome = sobrenomeCampo.value.trim();
    const telefone = telefoneCampo.value.trim();
    const email = emailCampo.value.trim().toLowerCase();
    const cpf = App.somenteNumeros(cpfCampo.value);
    const senha = senhaCampo.value;
    const confirmarSenha = confirmarSenhaCampo.value;

    const obrigatorios = [
        [nomeCampo, nome],
        [sobrenomeCampo, sobrenome],
        [telefoneCampo, telefone],
        [emailCampo, email],
        [senhaCampo, senha],
        [confirmarSenhaCampo, confirmarSenha]
    ];
    const faltando = obrigatorios.find(([, valor]) => !valor);
    if (faltando) {
        avisarCadastro("Revise seu cadastro", "Preencha todos os campos obrigatórios antes de continuar.", "warning", faltando[0]);
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        avisarCadastro("E-mail inválido", "Informe um endereço de e-mail válido.", "error", emailCampo);
        return;
    }
    const politica = window.AuthPolicy?.validar(senha);
    if (!politica?.valida) {
        avisarCadastro("Senha não atende aos requisitos", politica?.mensagem || "Informe uma senha segura.", "error", senhaCampo);
        return;
    }
    if (senha !== confirmarSenha) {
        avisarCadastro("Senhas diferentes", "A confirmação precisa ser igual à senha informada.", "error", confirmarSenhaCampo);
        return;
    }
    if (!App.validarTelefone(telefone)) {
        avisarCadastro("Telefone inválido", "Informe um telefone com DDD e 10 ou 11 números.", "error", telefoneCampo);
        return;
    }
    if (cpf && !App.validarCPF(cpf)) {
        avisarCadastro("CPF inválido", "Informe um CPF válido ou deixe o campo vazio.", "error", cpfCampo);
        return;
    }
    if (!window.DeliveryCaptcha?.validar()) return;

    App.definirCarregando(submitButton, true, "Criando conta...");
    try {
        const captchaToken = window.DeliveryCaptcha?.getToken() || undefined;
        const options = { data: { nome, sobrenome, telefone, cpf: cpf || null, tipo_conta: "cliente" } };
        if (captchaToken) options.captchaToken = captchaToken;
        const { data, error } = await window.db.auth.signUp({ email, password: senha, options });
        if (error) throw error;
        if (!data?.user) throw new Error("Não foi possível criar o usuário.");
        if (!data.session) {
            throw new Error("A confirmação de e-mail ainda está habilitada no Supabase. Desative Confirm email em Auth > Providers > Email para permitir acesso imediato.");
        }

        const { error: erroUsuario } = await window.db.from("usuarios").upsert({
            id: data.user.id, nome, sobrenome, telefone, cpf: cpf || null
        }, { onConflict: "id" });
        if (erroUsuario) throw erroUsuario;

        const solicitado = localStorage.getItem("redirect");
        localStorage.removeItem("redirect");
        App.vincularUsuarioLocal(data.user.id);
        window.AppToast?.("Conta criada", "Seu acesso já está liberado.", "success");
        window.location.replace(App.destinoInterno(solicitado, "../index.html#restaurantes"));
    } catch (erro) {
        console.error("Erro ao criar conta:", erro);
        avisarCadastro("Não foi possível criar a conta", App.mensagemErro(erro, "erro desconhecido"), "error");
    } finally {
        window.DeliveryCaptcha?.reset();
        App.definirCarregando(submitButton, false);
    }
});
