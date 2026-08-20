"use strict";

const form = document.getElementById("empresaLoginForm");
const email = document.getElementById("email");
const senha = document.getElementById("senha");
const submitButton = form?.querySelector("button[type='submit']");
const statusSeguranca = document.getElementById("loginSecurityStatus");
const CHAVE_TENTATIVAS = "login_empresa_tentativas_4_1";

function mensagemLogin(texto, erro = false) {
    if (statusSeguranca) { statusSeguranca.hidden = !texto; statusSeguranca.textContent = texto || ""; statusSeguranca.classList.toggle("error", erro); }
    if (texto) window.AppToast?.(erro ? "Acesso não realizado" : "Acesso", texto, erro ? "error" : "info");
}
function estadoLogin(emailAtual) {
    const salvo = App.lerJSON(CHAVE_TENTATIVAS, {}) || {};
    return salvo.email === emailAtual ? salvo : { email: emailAtual, falhas: 0, bloqueadoAte: 0 };
}
async function obterOuCriarEmpresa(user) {
    let { data: empresa, error } = await window.db.from("empresas").select("*").eq("usuario_id", user.id).maybeSingle();
    if (error) throw error;
    if (empresa) return empresa;
    const metadata = user.user_metadata || {};
    if (metadata.tipo_conta !== "restaurante") return null;
    const cnpj = App.somenteNumeros(metadata.cnpj);
    if (!metadata.nome || !App.validarCNPJ(cnpj)) throw new Error("Os dados do restaurante estão incompletos. Procure o suporte.");
    const resposta = await window.db.from("empresas").insert({
        usuario_id: user.id, nome: String(metadata.nome).trim(), email: user.email,
        telefone: String(metadata.telefone || "").trim(), cnpj, status: false, taxa_entrega: 0, pedido_minimo: 0
    }).select("*").single();
    if (resposta.error) throw resposta.error;
    return resposta.data;
}

async function resolverAcessoEmpresa(user) {
    const { data: acessos, error: erroAcessos } = await window.db.rpc("empresa_meu_acesso");
    if (erroAcessos) throw erroAcessos;
    const lista = Array.isArray(acessos) ? acessos : [];
    const proprietario = lista.find((item) => item.proprietario === true);

    if (proprietario) {
        const { data: empresa, error } = await window.db.from("empresas").select("*").eq("id", proprietario.empresa_id).single();
        if (error || !empresa) throw error || new Error("Restaurante não encontrado.");
        return { destino: "empresa-dashboard.html", empresa, acesso: proprietario };
    }

    const colaborador = lista.find((item) => item.proprietario !== true);
    if (colaborador) {
        return { destino: "empresa-colaborador.html", empresa: null, acesso: colaborador };
    }

    const empresa = await obterOuCriarEmpresa(user);
    if (!empresa) return null;
    return {
        destino: "empresa-dashboard.html",
        empresa,
        acesso: { empresa_id: String(empresa.id), empresa_nome: empresa.nome, papel: "proprietario", proprietario: true }
    };
}

if (!form || !email || !senha || !submitButton) {
    console.error("Formulário de login da empresa não encontrado.");
} else {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const emailDigitado = email.value.trim().toLowerCase();
        const senhaDigitada = senha.value;
        const estado = estadoLogin(emailDigitado);
        const espera = Math.max(0, Math.ceil((Number(estado.bloqueadoAte || 0) - Date.now()) / 1000));
        if (espera) return mensagemLogin(`Aguarde ${espera} segundos antes de tentar novamente.`, true);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDigitado)) return mensagemLogin("Informe um e-mail válido.", true);
        if (!senhaDigitada) return mensagemLogin("Informe sua senha.", true);
        if (!window.DeliveryCaptcha?.validar()) return;

        App.definirCarregando(submitButton, true, "Entrando...");
        let autenticado = false;
        try {
            const captchaToken = window.DeliveryCaptcha?.getToken() || undefined;
            const credentials = { email: emailDigitado, password: senhaDigitada };
            if (captchaToken) credentials.options = { captchaToken };
            const { data, error } = await window.db.auth.signInWithPassword(credentials);
            if (error) throw error;
            if (!data?.user) throw new Error("Usuário não encontrado.");
            autenticado = true;
            App.salvarJSON(CHAVE_TENTATIVAS, { email: emailDigitado, falhas: 0, bloqueadoAte: 0 });

            const resolvido = await resolverAcessoEmpresa(data.user);
            if (!resolvido) {
                await window.db.auth.signOut();
                throw new Error("Esta conta não possui acesso a um restaurante ou equipe.");
            }

            App.vincularUsuarioLocal(data.user.id);
            App.salvarJSON("empresaAcesso", resolvido.acesso);
            if (resolvido.empresa) App.salvarJSON("empresaLogada", resolvido.empresa);
            else localStorage.removeItem("empresaLogada");
            window.location.replace(resolvido.destino);
        } catch (erro) {
            console.error("Erro no login da empresa:", erro);
            if (autenticado && /não possui acesso|incompletos|Restaurante não encontrado/i.test(String(erro?.message || ""))) {
                mensagemLogin(App.mensagemErro(erro), true);
                return;
            }
            estado.falhas = Number(estado.falhas || 0) + 1;
            if (estado.falhas >= 5) estado.bloqueadoAte = Date.now() + 60000;
            App.salvarJSON(CHAVE_TENTATIVAS, estado);
            const texto = estado.bloqueadoAte > Date.now()
                ? "Muitas tentativas incorretas. Aguarde 60 segundos."
                : `Confira o e-mail e a senha. ${Math.max(0, 5 - estado.falhas)} tentativa(s) antes da pausa local.`;
            mensagemLogin(texto, true);
        } finally {
            window.DeliveryCaptcha?.reset(); App.definirCarregando(submitButton, false);
        }
    });
    [email, senha].forEach((campo) => campo.addEventListener("input", () => mensagemLogin("")));
}
