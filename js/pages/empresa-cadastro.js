"use strict";

const form = document.getElementById("empresaCadastroForm");
const submitButton = form?.querySelector("button[type='submit']");

function avisarEmpresaCadastro(titulo, mensagem, tipo = "info", campo = null) {
    window.AppToast?.(titulo, mensagem, tipo);
    campo?.focus?.();
}

if (!form || !submitButton) {
    console.error("Formulário de cadastro da empresa não encontrado.");
} else {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const nomeCampo = document.getElementById("nome");
        const emailCampo = document.getElementById("email");
        const telefoneCampo = document.getElementById("telefone");
        const cnpjCampo = document.getElementById("cnpj");
        const senhaCampo = document.getElementById("senha");
        const confirmarSenhaCampo = document.getElementById("confirmarSenha");

        const nome = nomeCampo.value.trim();
        const email = emailCampo.value.trim().toLowerCase();
        const telefone = telefoneCampo.value.trim();
        const cnpj = App.normalizarCNPJ(cnpjCampo.value);
        const senha = senhaCampo.value;
        const confirmarSenha = confirmarSenhaCampo.value;

        const obrigatorios = [
            [nomeCampo, nome],
            [emailCampo, email],
            [telefoneCampo, telefone],
            [cnpjCampo, cnpj],
            [senhaCampo, senha],
            [confirmarSenhaCampo, confirmarSenha]
        ];
        const faltando = obrigatorios.find(([, valor]) => !valor);
        if (faltando) {
            avisarEmpresaCadastro("Revise o cadastro", "Preencha todos os campos obrigatórios antes de continuar.", "warning", faltando[0]);
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            avisarEmpresaCadastro("E-mail inválido", "Informe um endereço de e-mail válido.", "error", emailCampo);
            return;
        }
        if (!App.validarTelefone(telefone)) {
            avisarEmpresaCadastro("Telefone inválido", "Informe um telefone com DDD e 10 ou 11 números.", "error", telefoneCampo);
            return;
        }
        if (!App.validarCNPJ(cnpj)) {
            avisarEmpresaCadastro("CNPJ inválido", "Informe um CNPJ válido.", "error", cnpjCampo);
            return;
        }
        const politica = window.AuthPolicy?.validar(senha);
        if (!politica?.valida) {
            avisarEmpresaCadastro("Senha não atende aos requisitos", politica?.mensagem || "Informe uma senha segura.", "error", senhaCampo);
            return;
        }
        if (senha !== confirmarSenha) {
            avisarEmpresaCadastro("Senhas diferentes", "A confirmação precisa ser igual à senha informada.", "error", confirmarSenhaCampo);
            return;
        }
        if (!window.DeliveryCaptcha?.validar()) return;

        App.definirCarregando(submitButton, true, "Criando restaurante...");
        try {
            const captchaToken = window.DeliveryCaptcha?.getToken() || undefined;
            const options = { data: { tipo_conta: "restaurante", nome, telefone, cnpj } };
            if (captchaToken) options.captchaToken = captchaToken;
            const { data, error } = await window.db.auth.signUp({ email, password: senha, options });
            if (error) throw error;

            const user = data?.user;
            if (!user) throw new Error("O Supabase não retornou o usuário criado.");
            if (Array.isArray(user.identities) && user.identities.length === 0) {
                throw new Error("Este e-mail já possui uma conta. Entre na área do restaurante ou use outro e-mail.");
            }
            if (!data.session) {
                throw new Error("A confirmação de e-mail ainda está habilitada no Supabase. Desative Confirm email em Auth > Providers > Email para permitir acesso imediato.");
            }

            let { data: empresa, error: erroEmpresa } = await window.db.from("empresas")
                .select("*").eq("usuario_id", user.id).maybeSingle();
            if (erroEmpresa) throw erroEmpresa;
            if (!empresa) {
                const resposta = await window.db.from("empresas").insert({
                    usuario_id: user.id, nome, email, telefone, cnpj, status: false, taxa_entrega: 0, pedido_minimo: 0
                }).select("*").single();
                if (resposta.error) throw resposta.error;
                empresa = resposta.data;
            }

            App.vincularUsuarioLocal(user.id);
            App.salvarJSON("empresaLogada", empresa);
            window.AppToast?.("Restaurante cadastrado", "Complete a loja no painel. A publicação depende da aprovação administrativa.", "success");
            window.location.replace("empresa-dashboard.html#configuracoes");
        } catch (erro) {
            console.error("Erro no cadastro da empresa:", erro);
            const mensagem = App.mensagemErro(erro, "Não foi possível concluir o cadastro. Tente novamente.");
            const normalizada = mensagem.toLowerCase();
            if (/empresas_cnpj.*unique|duplicate key.*cnpj|já existe.*cnpj/.test(normalizada)) {
                avisarEmpresaCadastro("CNPJ já cadastrado", "Este CNPJ já está vinculado a outro restaurante.", "error", cnpjCampo);
            } else if (/already registered|user already registered|email.*exist|já possui uma conta/.test(normalizada)) {
                avisarEmpresaCadastro("E-mail já cadastrado", "Entre na Área do Restaurante ou use outro e-mail.", "error", emailCampo);
            } else {
                avisarEmpresaCadastro("Não foi possível cadastrar o restaurante", mensagem, "error");
            }
        } finally {
            window.DeliveryCaptcha?.reset();
            App.definirCarregando(submitButton, false);
        }
    });
}
