"use strict";
(() => {

const modal = document.getElementById("produtoModal");
const fecharModal = document.querySelector(".fechar-modal");
const modalImagem = document.getElementById("modalImagem");
const modalNome = document.getElementById("modalNome");
const modalDescricao = document.getElementById("modalDescricao");
const listaAdicionais = document.getElementById("listaAdicionais");
const blocoVariantes = document.getElementById("blocoVariantes");
const listaVariantes = document.getElementById("listaVariantes");
const observacao = document.getElementById("observacao");
const menosQtd = document.getElementById("menosQtd");
const maisQtd = document.getElementById("maisQtd");
const quantidadeSpan = document.getElementById("quantidade");
const precoFinal = document.getElementById("precoFinal");
const confirmarProduto = document.getElementById("confirmarProduto");

let produtoAtual = null;
let quantidade = 1;
let gruposAtuais = [];
let variantesAtuais = [];
let varianteSelecionada = null;
let elementoFocoAnterior = null;
let adicionaisCarregados = false;
let solicitacaoModal = 0;

function avisarModal(titulo, mensagem) {
    if (window.AppToast) {
        window.AppToast(titulo, mensagem, "error");
        return;
    }
    listaAdicionais.querySelector(".modal-feedback")?.remove();
    const aviso = document.createElement("p");
    aviso.className = "modal-feedback";
    aviso.setAttribute("role", "alert");
    aviso.textContent = mensagem;
    listaAdicionais.prepend(aviso);
}

function elementosFocaveisModal() {
    return [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]")];
}

function precoProduto(produto) {
    const promocao = Number(produto?.promocao || 0);
    return promocao > 0 ? promocao : Number(produto?.preco || 0);
}

function precoVariante(variante) {
    const promocao = Number(variante?.promocao || 0);
    return promocao > 0 ? promocao : Number(variante?.preco || 0);
}

function precoBaseAtual() {
    return varianteSelecionada ? precoVariante(varianteSelecionada) : precoProduto(produtoAtual);
}

function fechar() {
    if (!modal.classList.contains("aberto")) return;
    solicitacaoModal += 1;
    modal.classList.remove("aberto");
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("inert", "");
    document.body.style.overflow = "";
    elementoFocoAnterior?.focus();
}

async function carregarVariantes(produtoId, solicitacao) {
    variantesAtuais = [];
    varianteSelecionada = null;
    blocoVariantes.hidden = true;
    listaVariantes.replaceChildren();
    const { data, error } = await window.db.from("produto_variantes")
        .select("id,nome,preco,promocao,ordem,ativo")
        .eq("produto_id", produtoId)
        .eq("ativo", true)
        .order("ordem")
        .order("nome");
    if (error) throw error;
    if (solicitacao !== solicitacaoModal) return false;
    variantesAtuais = data || [];
    if (!variantesAtuais.length) return true;

    blocoVariantes.hidden = false;
    listaVariantes.className = "lista-variantes";
    variantesAtuais.forEach((variante, indice) => {
        const label = document.createElement("label");
        label.className = "variante-opcao";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "produto-variante";
        input.value = String(variante.id);
        input.checked = indice === 0;
        const texto = document.createElement("span");
        texto.textContent = variante.nome || "Opção";
        const preco = document.createElement("small");
        preco.textContent = App.dinheiro(precoVariante(variante));
        label.append(input, texto, preco);
        listaVariantes.append(label);
    });
    varianteSelecionada = variantesAtuais[0] || null;
    return true;
}

async function carregarAdicionais(produtoId, solicitacao) {
    listaAdicionais.replaceChildren();
    const carregando = document.createElement("p");
    carregando.textContent = "Carregando adicionais...";
    listaAdicionais.append(carregando);

    const { data: vinculos, error } = await window.db
        .from("produto_grupos")
        .select("grupo_id")
        .eq("produto_id", produtoId);
    if (error) throw error;
    if (solicitacao !== solicitacaoModal) return false;

    const grupoIds = [...new Set((vinculos || []).map((item) => String(item.grupo_id)).filter(Boolean))];
    if (!grupoIds.length) {
        gruposAtuais = [];
    } else {
        const { data: grupos, error: erroGrupos } = await window.db
            .from("grupos_adicionais")
            .select("id,nome,minimo,maximo,ativo")
            .in("id", grupoIds)
            .eq("ativo", true);
        if (erroGrupos) throw erroGrupos;
        gruposAtuais = (grupos || []).map((grupo) => ({
            ...grupo,
            id: String(grupo.id),
            minimo: Math.max(0, Number(grupo.minimo || 0)),
            maximo: Math.max(Number(grupo.maximo || 0), Number(grupo.minimo || 0), 1)
        }));
    }

    const resultados = await Promise.all(gruposAtuais.map(async (grupo) => {
        const { data, error: erroAdicionais } = await window.db
            .from("adicionais")
            .select("id,nome,preco,ativo")
            .eq("grupo_id", grupo.id)
            .eq("ativo", true)
            .order("nome");
        if (erroAdicionais) throw erroAdicionais;
        return { grupo, adicionais: data || [] };
    }));
    if (solicitacao !== solicitacaoModal) return false;

    listaAdicionais.replaceChildren();
    if (!resultados.length) {
        const vazio = document.createElement("p");
        vazio.textContent = "Este produto não possui adicionais.";
        listaAdicionais.append(vazio);
        adicionaisCarregados = true;
        return true;
    }

    resultados.forEach(({ grupo, adicionais }) => {
        const bloco = document.createElement("fieldset");
        bloco.className = "grupo-adicional";
        bloco.dataset.grupoId = grupo.id;

        const titulo = document.createElement("legend");
        titulo.textContent = grupo.nome || "Adicionais";
        bloco.append(titulo);

        const regra = document.createElement("small");
        regra.textContent = grupo.minimo > 0
            ? (grupo.maximo === grupo.minimo ? `Escolha ${grupo.minimo}` : `Escolha de ${grupo.minimo} até ${grupo.maximo}`)
            : `Escolha até ${grupo.maximo}`;
        bloco.append(regra);

        if (!adicionais.length) {
            const indisponivel = document.createElement("p");
            indisponivel.textContent = "Nenhuma opção disponível neste grupo.";
            bloco.append(indisponivel);
        }

        adicionais.forEach((adicional) => {
            const label = document.createElement("label");
            label.className = "adicional";
            const input = document.createElement("input");
            input.type = grupo.maximo === 1 && grupo.minimo > 0 ? "radio" : "checkbox";
            input.name = `grupo-${grupo.id}`;
            input.value = String(adicional.id);
            input.dataset.grupoId = grupo.id;
            input.dataset.preco = String(Number(adicional.preco || 0));
            input.dataset.nome = adicional.nome || "Adicional";
            const texto = document.createElement("span");
            texto.textContent = `${adicional.nome || "Adicional"} (+ ${App.dinheiro(adicional.preco)})`;
            label.append(input, texto);
            bloco.append(label);
        });

        listaAdicionais.append(bloco);
    });

    adicionaisCarregados = true;
    return true;
}

async function abrirModalProduto(produto) {
    const solicitacao = ++solicitacaoModal;
    produtoAtual = produto;
    quantidade = 1;
    gruposAtuais = [];
    variantesAtuais = [];
    varianteSelecionada = null;
    adicionaisCarregados = false;
    elementoFocoAnterior = document.activeElement;
    observacao.value = "";
    modalImagem.src = produto.imagem || "../assets/produto-padrao.svg";
    modalImagem.addEventListener("error", () => { modalImagem.src = "../assets/produto-padrao.svg"; }, { once: true });
    modalNome.textContent = produto.nome || "Produto";
    modalDescricao.textContent = produto.descricao || "";
    quantidadeSpan.textContent = "1";
    menosQtd.disabled = true;
    maisQtd.disabled = false;
    confirmarProduto.disabled = true;
    modal.removeAttribute("inert");
    modal.classList.add("aberto");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    atualizarPreco();

    try {
        const [variantesCarregadas, adicionaisCarregadosOk] = await Promise.all([
            carregarVariantes(produto.id, solicitacao),
            carregarAdicionais(produto.id, solicitacao)
        ]);
        if (solicitacao !== solicitacaoModal || !modal.classList.contains("aberto")) return;
        if (!variantesCarregadas || !adicionaisCarregadosOk) return;
        atualizarPreco();
        confirmarProduto.disabled = false;
    } catch (error) {
        console.error("Erro ao carregar adicionais:", error);
        listaAdicionais.replaceChildren();
        const aviso = document.createElement("p");
        aviso.textContent = "Não foi possível carregar os adicionais. Tente novamente.";
        listaAdicionais.append(aviso);
        confirmarProduto.disabled = true;
    } finally {
        if (solicitacao === solicitacaoModal && modal.classList.contains("aberto")) fecharModal.focus();
    }
}

function atualizarPreco() {
    if (!produtoAtual) return;
    let total = precoBaseAtual();
    listaAdicionais.querySelectorAll("input:checked").forEach((input) => {
        total += Number(input.dataset.preco || 0);
    });
    precoFinal.textContent = App.dinheiro(total * quantidade);
}

function validarGrupos() {
    if (!adicionaisCarregados) return false;
    for (const grupo of gruposAtuais) {
        const seletor = `input[data-grupo-id="${CSS.escape(grupo.id)}"]:checked`;
        const quantidadeSelecionada = listaAdicionais.querySelectorAll(seletor).length;
        if (quantidadeSelecionada < grupo.minimo) {
            avisarModal("Escolha obrigatória", `No grupo “${grupo.nome}”, escolha pelo menos ${grupo.minimo} opção(ões).`);
            return false;
        }
        if (quantidadeSelecionada > grupo.maximo) {
            avisarModal("Limite de opções", `No grupo “${grupo.nome}”, escolha no máximo ${grupo.maximo} opção(ões).`);
            return false;
        }
    }
    return true;
}

listaVariantes.addEventListener("change", (event) => {
    const input = event.target.closest("input[name='produto-variante']");
    if (!input) return;
    varianteSelecionada = variantesAtuais.find((item) => String(item.id) === input.value) || null;
    atualizarPreco();
});

listaAdicionais.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-grupo-id]");
    if (!input) return;
    const grupo = gruposAtuais.find((item) => item.id === input.dataset.grupoId);
    if (grupo && input.type === "checkbox") {
        const selecionados = listaAdicionais.querySelectorAll(`input[data-grupo-id="${CSS.escape(grupo.id)}"]:checked`);
        if (selecionados.length > grupo.maximo) {
            input.checked = false;
            avisarModal("Limite de opções", `Você pode escolher no máximo ${grupo.maximo} opção(ões) em “${grupo.nome}”.`);
        }
    }
    atualizarPreco();
});

maisQtd.addEventListener("click", () => {
    quantidade = Math.min(99, quantidade + 1);
    quantidadeSpan.textContent = String(quantidade);
    menosQtd.disabled = quantidade <= 1;
    maisQtd.disabled = quantidade >= 99;
    atualizarPreco();
});

menosQtd.addEventListener("click", () => {
    quantidade = Math.max(1, quantidade - 1);
    quantidadeSpan.textContent = String(quantidade);
    menosQtd.disabled = quantidade <= 1;
    maisQtd.disabled = quantidade >= 99;
    atualizarPreco();
});

confirmarProduto.addEventListener("click", () => {
    if (!produtoAtual || !validarGrupos()) return;
    const adicionais = [...listaAdicionais.querySelectorAll("input:checked")].map((input) => ({
        id: input.value,
        nome: input.dataset.nome,
        preco: Number(input.dataset.preco || 0)
    }));

    if (typeof window.adicionarAoCarrinho !== "function") {
        avisarModal("Carrinho indisponível", "Não foi possível iniciar o carrinho. Recarregue a página e tente novamente.");
        return;
    }

    window.adicionarAoCarrinho({
        id: String(produtoAtual.id),
        nome: produtoAtual.nome,
        imagem: produtoAtual.imagem || "../assets/produto-padrao.svg",
        preco: precoBaseAtual(),
        variante_id: varianteSelecionada ? String(varianteSelecionada.id) : null,
        variante_nome: varianteSelecionada?.nome || null,
        quantidade,
        observacao: observacao.value.trim().slice(0, 300),
        adicionais
    });
    fechar();
});

fecharModal.addEventListener("click", fechar);
modal.addEventListener("click", (event) => { if (event.target === modal) fechar(); });
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("aberto")) fechar();
    if (event.key === "Tab" && modal.classList.contains("aberto")) {
        const elementos = elementosFocaveisModal();
        if (!elementos.length) return;
        const primeiro = elementos[0];
        const ultimo = elementos[elementos.length - 1];
        if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault();
            ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primeiro.focus();
        }
    }
});

modal.setAttribute("role", "dialog");
modal.setAttribute("aria-modal", "true");
modal.setAttribute("aria-labelledby", "modalNome");
modal.setAttribute("aria-hidden", "true");
fecharModal.setAttribute("aria-label", "Fechar personalização do produto");
menosQtd.setAttribute("aria-label", "Diminuir quantidade");
maisQtd.setAttribute("aria-label", "Aumentar quantidade");
window.abrirModalProduto = abrirModalProduto;
})();
