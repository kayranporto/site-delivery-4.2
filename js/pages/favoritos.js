"use strict";

const container = document.getElementById("listaFavoritos");
let ids = [];

function criarEstadoVazio() {
    const vazio = document.createElement("div");
    vazio.className = "empty";

    const titulo = document.createElement("h2");
    titulo.textContent = "Sem favoritos";
    const texto = document.createElement("p");
    texto.textContent = "Use o coração de um restaurante para salvá-lo aqui.";
    const link = document.createElement("a");
    link.className = "btn";
    link.href = "../index.html";
    link.textContent = "Explorar restaurantes";

    vazio.append(titulo, texto, link);
    return vazio;
}

function renderizar(lista) {
    container.replaceChildren();
    container.setAttribute("aria-busy", "false");
    document.getElementById("resumoFavoritos").textContent = lista.length
        ? `${lista.length} ${lista.length === 1 ? "restaurante salvo" : "restaurantes salvos"}`
        : "Seus restaurantes preferidos ficam aqui";
    if (!lista.length) {
        container.append(criarEstadoVazio());
        return;
    }

    lista.forEach((empresa) => {
        const card = document.createElement("article");
        card.className = "item-card restaurant-row";

        const imagem = document.createElement("img");
        imagem.src = empresa.logo || "../assets/logo-restaurante.svg";
        imagem.alt = empresa.nome || "Restaurante";
        imagem.loading = "lazy";
        imagem.addEventListener("error", () => {
            imagem.src = "../assets/logo-restaurante.svg";
        }, { once: true });

        const info = document.createElement("div");
        info.className = "favorite-info";
        info.style.flex = "1";
        const titulo = document.createElement("h3");
        titulo.textContent = empresa.nome || "Restaurante";
        const descricao = document.createElement("p");
        descricao.textContent = empresa.descricao || "Confira o cardápio deste restaurante.";
        info.append(titulo, descricao);

        const actions = document.createElement("div");
        actions.className = "actions";
        const link = document.createElement("a");
        link.className = "btn";
        link.href = `restaurante.html?id=${encodeURIComponent(empresa.id)}`;
        link.textContent = "Ver cardápio";

        const remover = document.createElement("button");
        remover.className = "btn secundario favorite-remove";
        remover.type = "button";
        remover.textContent = "Remover";
        remover.setAttribute("aria-label", `Remover ${empresa.nome || "restaurante"} dos favoritos`);
        remover.addEventListener("click", async () => {
            if (remover.disabled) return;
            remover.disabled = true;
            remover.setAttribute("aria-busy", "true");
            try {
                if (window.FavoritesSync) await window.FavoritesSync.toggle(empresa.id);
                ids = ids.filter((id) => id !== String(empresa.id));
                if (!window.FavoritesSync) App.salvarJSON("favoritos", ids);
                const proximo = card.nextElementSibling || card.previousElementSibling;
                card.remove();
                const quantidade = container.querySelectorAll(".item-card").length;
                document.getElementById("resumoFavoritos").textContent = `${quantidade} ${quantidade === 1 ? "restaurante salvo" : "restaurantes salvos"}`;
                if (!quantidade) renderizar([]);
                (proximo?.querySelector("a") || container.querySelector("a"))?.focus();
            } catch (erro) {
                window.AppToast?.("Não foi possível remover", App.mensagemErro(erro), "error");
            } finally {
                remover.disabled = false;
                remover.removeAttribute("aria-busy");
            }
        });

        actions.append(link, remover);
        card.append(imagem, info, actions);
        container.append(card);
    });
}

async function carregarFavoritos() {
    container.setAttribute("aria-busy", "true");
    try {
        const salvos = window.FavoritesSync
            ? await window.FavoritesSync.ready()
            : (App.lerJSON("favoritos", []) || []);
        ids = [...new Set((Array.isArray(salvos) ? salvos : []).map(String).filter(Boolean))].slice(0, 200);
        if (!ids.length) {
            renderizar([]);
            return;
        }

        const { data, error } = await window.db.from("empresas_catalogo").select("id,nome,descricao,logo,status").in("id", ids);
        if (error) throw error;

        const mapa = new Map((data || []).map((empresa) => [String(empresa.id), empresa]));
        renderizar(ids.map((id) => mapa.get(id)).filter(Boolean));
    } catch (erro) {
        console.error("Erro ao carregar favoritos:", erro);
        container.replaceChildren();
        const aviso = document.createElement("div");
        aviso.className = "empty";
        const texto = document.createElement("p");
        texto.setAttribute("role", "alert");
        texto.textContent = "Não foi possível carregar seus favoritos agora.";
        const tentar = document.createElement("button");
        tentar.className = "btn";
        tentar.type = "button";
        tentar.textContent = "Tentar novamente";
        tentar.addEventListener("click", async () => {
            tentar.disabled = true;
            tentar.textContent = "Carregando...";
            await carregarFavoritos();
            container.querySelector("a, button")?.focus();
        });
        aviso.append(texto, tentar);
        container.append(aviso);
    } finally {
        container.setAttribute("aria-busy", "false");
    }
}

carregarFavoritos();
