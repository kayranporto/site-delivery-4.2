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
        remover.className = "btn secundario";
        remover.type = "button";
        remover.textContent = "Remover";
        remover.addEventListener("click", async () => {
            try {
                if (window.FavoritesSync) await window.FavoritesSync.toggle(empresa.id);
                ids = ids.filter((id) => id !== String(empresa.id));
                if (!window.FavoritesSync) App.salvarJSON("favoritos", ids);
                card.remove();
                if (!container.querySelector(".item-card")) renderizar([]);
            } catch (erro) {
                window.AppToast?.("Não foi possível remover", App.mensagemErro(erro), "error");
            }
        });

        actions.append(link, remover);
        card.append(imagem, info, actions);
        container.append(card);
    });
}

(async () => {
    const salvos = window.FavoritesSync
        ? await window.FavoritesSync.ready()
        : (App.lerJSON("favoritos", []) || []);
    ids = [...new Set((Array.isArray(salvos) ? salvos : []).map(String).filter(Boolean))].slice(0, 200);
    if (!ids.length) {
        renderizar([]);
        return;
    }

    const { data, error } = await window.db.from("empresas_catalogo").select("id,nome,descricao,logo,status").in("id", ids);
    if (error) {
        console.error("Erro ao carregar favoritos:", error);
        container.replaceChildren();
        const aviso = document.createElement("div");
        aviso.className = "empty";
        aviso.textContent = "Não foi possível carregar seus favoritos agora.";
        container.append(aviso);
        return;
    }

    const mapa = new Map((data || []).map((empresa) => [String(empresa.id), empresa]));
    renderizar(ids.map((id) => mapa.get(id)).filter(Boolean));
})();
