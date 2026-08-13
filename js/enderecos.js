"use strict";

const form = document.getElementById("enderecoForm");
const lista = document.getElementById("listaEnderecos");
const voltar = document.getElementById("voltarEndereco");
const continuar = document.getElementById("continuarEndereco");
const paramsEndereco = new URLSearchParams(window.location.search);
const destino = App.destinoInterno(paramsEndereco.get("redirect"), "perfil.html");

let usuarioAtual = null;
let enderecos = [];

if (voltar) voltar.href = destino;
if (continuar && destino !== "perfil.html") {
    continuar.href = destino;
    continuar.hidden = false;
}

function avisarEndereco(titulo, mensagem, tipo = "info") {
    if (window.AppToast) window.AppToast(titulo, mensagem, tipo);
}

function normalizarCep(valor) {
    const numeros = App.somenteNumeros(valor).slice(0, 8);
    return numeros.length > 5 ? `${numeros.slice(0, 5)}-${numeros.slice(5)}` : numeros;
}

function textoEndereco(endereco) {
    const base = App.formatarEndereco(endereco);
    return endereco.referencia ? `${base} — Ref.: ${endereco.referencia}` : base;
}

async function tornarPrincipal(id) {
    if (!usuarioAtual) return;
    const { error: erroLimpar } = await window.db.from("enderecos")
        .update({ principal: false })
        .eq("usuario_id", usuarioAtual.id)
        .eq("principal", true);
    if (erroLimpar) throw erroLimpar;

    const { error } = await window.db.from("enderecos")
        .update({ principal: true })
        .eq("id", id)
        .eq("usuario_id", usuarioAtual.id);
    if (error) throw error;
}

function renderizar() {
    lista.replaceChildren();
    if (!enderecos.length) {
        const vazio = document.createElement("div");
        vazio.className = "empty";
        vazio.textContent = "Nenhum endereço cadastrado.";
        lista.append(vazio);
        return;
    }

    enderecos.forEach((endereco) => {
        const item = document.createElement("article");
        item.className = "item-card";

        const info = document.createElement("div");
        const titulo = document.createElement("h3");
        titulo.textContent = `${endereco.apelido || "Endereço"}${endereco.principal ? " • Principal" : ""}`;
        const texto = document.createElement("p");
        texto.textContent = textoEndereco(endereco);
        info.append(titulo, texto);

        const actions = document.createElement("div");
        actions.className = "actions";

        const usar = document.createElement("button");
        usar.className = "btn secundario";
        usar.type = "button";
        usar.textContent = endereco.principal ? "Em uso" : "Usar este";
        usar.disabled = endereco.principal;
        usar.addEventListener("click", async () => {
            usar.disabled = true;
            try {
                await tornarPrincipal(endereco.id);
                await carregar();
                avisarEndereco("Endereço selecionado", "O próximo pedido usará este endereço.", "success");
            } catch (erro) {
                usar.disabled = false;
                avisarEndereco("Não foi possível selecionar", App.mensagemErro(erro), "error");
            }
        });

        const remover = document.createElement("button");
        remover.className = "btn perigo";
        remover.type = "button";
        remover.textContent = "Remover";
        remover.addEventListener("click", async () => {
            const nome = endereco.apelido || "Endereço";
            const confirmado = window.AppConfirm
                ? await window.AppConfirm({
                    titulo: `Remover ${nome}?`,
                    mensagem: "Este endereço deixará de aparecer nas opções de entrega da sua conta.",
                    confirmar: "Remover endereço",
                    cancelar: "Manter endereço",
                    perigoso: true,
                    icone: "⌖",
                    etiqueta: "Endereço",
                    nota: endereco.principal ? "Como este é o endereço principal, outro endereço será selecionado automaticamente quando possível." : "Você poderá cadastrar este endereço novamente depois."
                })
                : false;
            if (!confirmado) return;

            remover.disabled = true;
            const { error } = await window.db.from("enderecos")
                .delete()
                .eq("id", endereco.id)
                .eq("usuario_id", usuarioAtual.id);
            if (error) {
                remover.disabled = false;
                avisarEndereco("Não foi possível remover", App.mensagemErro(error), "error");
                return;
            }
            enderecos = enderecos.filter((itemEndereco) => itemEndereco.id !== endereco.id);
            if (endereco.principal && enderecos[0]) {
                try { await tornarPrincipal(enderecos[0].id); } catch (erro) { console.error(erro); }
            }
            await carregar();
            avisarEndereco("Endereço removido", `${nome} foi removido da sua conta.`, "success");
        });

        actions.append(usar, remover);
        item.append(info, actions);
        lista.append(item);
    });
}

async function carregar() {
    const { data, error } = await window.db.from("enderecos")
        .select("*")
        .eq("usuario_id", usuarioAtual.id)
        .order("principal", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) throw error;
    enderecos = data || [];
    renderizar();
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!usuarioAtual) return;

    const botao = form.querySelector("button[type='submit']");
    const cep = normalizarCep(document.getElementById("cep").value);
    const uf = document.getElementById("uf").value.trim().toUpperCase();
    if (!/^\d{5}-\d{3}$/.test(cep)) {
        avisarEndereco("CEP inválido", "Informe um CEP no formato 00000-000.", "error");
        document.getElementById("cep").focus();
        return;
    }
    if (!/^[A-Z]{2}$/.test(uf)) {
        avisarEndereco("UF inválida", "Informe a sigla do estado com duas letras.", "error");
        document.getElementById("uf").focus();
        return;
    }

    const payload = {
        usuario_id: usuarioAtual.id,
        apelido: document.getElementById("apelido").value.trim(),
        cep,
        logradouro: document.getElementById("logradouro").value.trim(),
        numero: document.getElementById("numero").value.trim(),
        complemento: document.getElementById("complemento").value.trim() || null,
        bairro: document.getElementById("bairro").value.trim(),
        cidade: document.getElementById("cidade").value.trim(),
        uf,
        referencia: document.getElementById("referencia").value.trim() || null,
        principal: document.getElementById("principal").checked || enderecos.length === 0
    };

    App.definirCarregando(botao, true, "Salvando...");
    try {
        if (payload.principal && enderecos.some((endereco) => endereco.principal)) {
            const { error } = await window.db.from("enderecos")
                .update({ principal: false })
                .eq("usuario_id", usuarioAtual.id)
                .eq("principal", true);
            if (error) throw error;
        }

        const { error } = await window.db.from("enderecos").insert(payload);
        if (error) throw error;
        form.reset();
        document.getElementById("apelido").value = "Casa";
        document.getElementById("principal").checked = true;
        await carregar();
        avisarEndereco("Endereço salvo", "O endereço já pode ser usado no checkout.", "success");
    } catch (erro) {
        avisarEndereco("Não foi possível salvar o endereço", App.mensagemErro(erro), "error");
    } finally {
        App.definirCarregando(botao, false);
    }
});

document.getElementById("cep").addEventListener("input", (event) => {
    event.target.value = normalizarCep(event.target.value);
});
document.getElementById("uf").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
});

(async function iniciarEnderecos() {
    const { data: { user }, error } = await window.db.auth.getUser();
    if (error || !user) {
        localStorage.setItem("redirect", `enderecos.html?redirect=${encodeURIComponent(destino)}`);
        window.location.replace("login.html");
        return;
    }
    usuarioAtual = user;
    App.vincularUsuarioLocal(user.id);
    localStorage.removeItem("endereco");
    localStorage.removeItem("enderecos");
    try {
        await carregar();
    } catch (erroCarregar) {
        App.mostrarErroPagina(`Não foi possível carregar os endereços: ${App.mensagemErro(erroCarregar)}`);
    }
})();
