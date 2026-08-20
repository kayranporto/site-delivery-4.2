"use strict";
(() => {

let carrinho = window.CartStore?.ler() || App.lerJSON("carrinho", []);
let carrinhoMeta = window.CartStore?.meta() || App.lerJSON("carrinhoMeta", null);
if (!carrinhoMeta || typeof carrinhoMeta !== "object" || Array.isArray(carrinhoMeta)) carrinhoMeta = null;

const drawer = document.getElementById("carrinho");
const overlay = document.getElementById("overlay");
const fecharBtn = document.getElementById("fecharCarrinho");
const listaItens = document.querySelector(".carrinho-itens");
const subtotalElemento = document.getElementById("subtotal");
const taxaElemento = document.getElementById("taxaEntrega");
const totalElemento = document.getElementById("total");
const contadorTopo = document.querySelector(".cart span");
const cartButton = document.querySelector(".cart");
const btnCheckout = document.getElementById("btnCheckout");
let focoAnteriorCarrinho = null;

function focaveisCarrinho() {
    return [...(drawer?.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])") || [])];
}

function normalizarCarrinho() {
    carrinho = (Array.isArray(carrinho) ? carrinho : [])
        .map((item) => {
            const quantidade = Math.min(99, Math.max(1, Number.parseInt(item?.quantidade, 10) || 1));
            const adicionais = (Array.isArray(item?.adicionais) ? item.adicionais : [])
                .map((adicional) => ({
                    id: String(adicional?.id || ""),
                    nome: String(adicional?.nome || "Adicional"),
                    preco: Number(adicional?.preco || 0)
                }))
                .filter((adicional) => adicional.id && Number.isFinite(adicional.preco) && adicional.preco >= 0);
            const produto = {
                id: String(item?.id || ""),
                nome: String(item?.nome || "Produto").slice(0, 150),
                imagem: String(item?.imagem || "../assets/produto-padrao.svg"),
                preco: Number(item?.preco || 0),
                variante_id: item?.variante_id ? String(item.variante_id) : null,
                variante_nome: item?.variante_nome ? String(item.variante_nome).slice(0, 100) : null,
                quantidade,
                adicionais,
                observacao: String(item?.observacao || "").trim().slice(0, 300),
                empresa_id: item?.empresa_id ? String(item.empresa_id) : null
            };
            produto.chave = chaveProduto(produto);
            return produto;
        })
        .filter((item) => item.id && Number.isFinite(item.preco) && item.preco >= 0);

    if (!carrinho.length) carrinhoMeta = null;
}

function metaAtual() {
    const valor = App.lerJSON("empresaAtual", null);
    return valor && valor.empresa_id ? valor : null;
}

function salvarCarrinho() {
    if (window.CartStore) window.CartStore.salvar(carrinho, carrinhoMeta);
    else {
        App.salvarJSON("carrinho", carrinho);
        if (carrinhoMeta) App.salvarJSON("carrinhoMeta", carrinhoMeta);
        else localStorage.removeItem("carrinhoMeta");
    }
}

function avisarCarrinho(mensagem, tipo = "error") {
    if (window.AppToast) window.AppToast("Carrinho", mensagem, tipo);
    else alert(mensagem);
}

function abrirCarrinho() {
    if (!drawer || !overlay) return;
    drawer.classList.add("aberto");
    overlay.classList.add("aberto");
    focoAnteriorCarrinho = document.activeElement;
    drawer.removeAttribute("inert");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    fecharBtn?.focus();
}

function fecharCarrinho() {
    if (!drawer || !overlay) return;
    drawer.classList.remove("aberto");
    overlay.classList.remove("aberto");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
    document.body.style.overflow = "";
    (focoAnteriorCarrinho || cartButton)?.focus?.();
}

function chaveProduto(produto) {
    const adicionais = (produto.adicionais || []).map((item) => String(item.id)).sort().join("-");
    return `${produto.id}|${produto.variante_id || "sem-variante"}|${adicionais}|${produto.observacao || ""}`;
}

async function adicionarAoCarrinho(produto) {
    const atual = metaAtual();
    if (!atual) return avisarCarrinho("Não foi possível identificar o restaurante. Atualize a página e tente novamente.");
    if (atual.status === false) return avisarCarrinho("Este restaurante está fechado e não está recebendo pedidos agora.");

    const empresaDoCarrinho = carrinhoMeta?.empresa_id || carrinho[0]?.empresa_id;
    if (carrinho.length && (!empresaDoCarrinho || String(empresaDoCarrinho) !== String(atual.empresa_id))) {
        const nomeAnterior = carrinhoMeta?.empresa_nome || "outro restaurante";
        const nomeAtual = atual.empresa_nome || "este restaurante";
        const trocar = window.AppConfirm
            ? await window.AppConfirm({ titulo: "Trocar de restaurante?", mensagem: `Seu carrinho contém itens de ${nomeAnterior}. Para pedir de ${nomeAtual}, os itens anteriores serão removidos.`, confirmar: "Trocar restaurante", perigoso: true })
            : confirm(`Seu carrinho contém itens de ${nomeAnterior}. Deseja limpar o carrinho e pedir de ${nomeAtual}?`);
        if (!trocar) return;
        carrinho = [];
    }

    const quantidade = Math.min(99, Math.max(1, Number.parseInt(produto.quantidade, 10) || 1));
    const itemNovo = {
        id: String(produto.id || ""),
        nome: String(produto.nome || "Produto").slice(0, 150),
        imagem: String(produto.imagem || "../assets/produto-padrao.svg"),
        preco: Number(produto.preco || 0),
        variante_id: produto.variante_id ? String(produto.variante_id) : null,
        variante_nome: produto.variante_nome ? String(produto.variante_nome).slice(0, 100) : null,
        quantidade,
        observacao: String(produto.observacao || "").trim().slice(0, 300),
        adicionais: (Array.isArray(produto.adicionais) ? produto.adicionais : []).filter((adicional) =>
            adicional?.id && Number.isFinite(Number(adicional.preco)) && Number(adicional.preco) >= 0
        ),
        empresa_id: String(atual.empresa_id)
    };
    if (!itemNovo.id || !Number.isFinite(itemNovo.preco) || itemNovo.preco < 0) {
        avisarCarrinho("Este produto possui dados inválidos e não pôde ser adicionado.");
        return;
    }
    itemNovo.chave = chaveProduto(itemNovo);
    carrinhoMeta = atual;

    const existente = carrinho.find((item) => item.chave === itemNovo.chave);
    if (existente) existente.quantidade = Math.min(99, existente.quantidade + quantidade);
    else carrinho.push(itemNovo);

    salvarCarrinho();
    atualizarCarrinho();
    abrirCarrinho();
}

function alterarQuantidade(chave, delta) {
    const item = carrinho.find((produto) => produto.chave === chave);
    if (!item) return;
    item.quantidade = Math.min(99, item.quantidade + delta);
    if (item.quantidade <= 0) carrinho = carrinho.filter((produto) => produto.chave !== chave);
    if (!carrinho.length) carrinhoMeta = null;
    salvarCarrinho();
    atualizarCarrinho();
}

function remover(chave) {
    carrinho = carrinho.filter((item) => item.chave !== chave);
    if (!carrinho.length) carrinhoMeta = null;
    salvarCarrinho();
    atualizarCarrinho();
}

function limparCarrinho() {
    carrinho = [];
    carrinhoMeta = null;
    salvarCarrinho();
    atualizarCarrinho();
}

function valorUnitario(item) {
    return Number(item.preco || 0) + (item.adicionais || []).reduce((soma, adicional) => soma + Number(adicional.preco || 0), 0);
}

function calcularSubtotal() {
    return carrinho.reduce((total, item) => total + valorUnitario(item) * item.quantidade, 0);
}

function criarItem(item) {
    const container = document.createElement("article");
    container.className = "item-carrinho";
    container.dataset.chave = item.chave;

    const imagem = document.createElement("img");
    imagem.src = item.imagem || "../assets/produto-padrao.svg";
    imagem.alt = item.nome;
    imagem.loading = "lazy";
    imagem.addEventListener("error", () => { imagem.src = "../assets/produto-padrao.svg"; }, { once: true });

    const info = document.createElement("div");
    info.className = "info-item";
    const titulo = document.createElement("h4");
    titulo.textContent = item.nome;
    info.append(titulo);

    if (item.variante_nome) {
        const variante = document.createElement("small");
        variante.className = "adicionais";
        variante.textContent = item.variante_nome;
        info.append(variante);
    }

    if (item.adicionais.length) {
        const adicionais = document.createElement("small");
        adicionais.className = "adicionais";
        adicionais.textContent = item.adicionais.map((adicional) => adicional.nome).filter(Boolean).join(", ");
        info.append(adicionais);
    }

    if (item.observacao) {
        const observacao = document.createElement("small");
        observacao.className = "observacao";
        observacao.textContent = `Obs: ${item.observacao}`;
        info.append(observacao);
    }

    const valor = document.createElement("strong");
    valor.textContent = App.dinheiro(valorUnitario(item) * item.quantidade);
    info.append(valor);

    const quantidade = document.createElement("div");
    quantidade.className = "quantidade";
    const menos = document.createElement("button");
    menos.type = "button";
    menos.dataset.action = "menos";
    menos.textContent = "−";
    menos.setAttribute("aria-label", `Diminuir ${item.nome}`);
    const numero = document.createElement("span");
    numero.textContent = String(item.quantidade);
    numero.setAttribute("aria-live", "polite");
    const mais = document.createElement("button");
    mais.type = "button";
    mais.dataset.action = "mais";
    mais.textContent = "+";
    mais.disabled = item.quantidade >= 99;
    mais.setAttribute("aria-label", `Aumentar ${item.nome}`);
    const excluir = document.createElement("button");
    excluir.type = "button";
    excluir.className = "remover-item";
    excluir.dataset.action = "remover";
    excluir.textContent = "🗑";
    excluir.setAttribute("aria-label", `Remover ${item.nome}`);
    quantidade.append(menos, numero, mais, excluir);

    info.append(quantidade);
    container.append(imagem, info);
    return container;
}

function atualizarCarrinho() {
    if (!listaItens) return;
    listaItens.replaceChildren();

    if (!carrinho.length) {
        const vazio = document.createElement("div");
        vazio.className = "carrinho-vazio";
        const titulo = document.createElement("h3");
        titulo.textContent = "Seu carrinho está vazio.";
        const texto = document.createElement("p");
        texto.textContent = "Adicione alguns produtos.";
        vazio.append(titulo, texto);
        listaItens.append(vazio);
    } else {
        carrinho.forEach((item) => listaItens.append(criarItem(item)));
    }

    const subtotal = calcularSubtotal();
    const taxa = carrinho.length ? Number(carrinhoMeta?.taxa_entrega || 0) : 0;
    if (subtotalElemento) subtotalElemento.textContent = App.dinheiro(subtotal);
    if (taxaElemento) taxaElemento.textContent = App.dinheiro(taxa);
    if (totalElemento) totalElemento.textContent = App.dinheiro(subtotal + taxa);
    if (contadorTopo) contadorTopo.textContent = String(carrinho.reduce((soma, item) => soma + item.quantidade, 0));
    if (btnCheckout) btnCheckout.disabled = !carrinho.length;
}

listaItens?.addEventListener("click", (event) => {
    const item = event.target.closest(".item-carrinho");
    const acao = event.target.closest("button")?.dataset.action;
    if (!item || !acao) return;
    if (acao === "mais") alterarQuantidade(item.dataset.chave, 1);
    if (acao === "menos") alterarQuantidade(item.dataset.chave, -1);
    if (acao === "remover") remover(item.dataset.chave);
});

cartButton?.addEventListener("click", abrirCarrinho);
cartButton?.setAttribute("aria-label", "Abrir carrinho");
fecharBtn?.addEventListener("click", fecharCarrinho);
overlay?.addEventListener("click", fecharCarrinho);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer?.classList.contains("aberto")) fecharCarrinho();
    if (event.key === "Tab" && drawer?.classList.contains("aberto")) {
        const elementos = focaveisCarrinho();
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

btnCheckout?.addEventListener("click", () => {
    const subtotal = calcularSubtotal();
    const minimo = Number(carrinhoMeta?.pedido_minimo || 0);
    if (!carrinho.length) return avisarCarrinho("Seu carrinho está vazio.", "info");
    if (subtotal < minimo) return avisarCarrinho(`O pedido mínimo deste restaurante é ${App.dinheiro(minimo)}.`);
    window.location.href = "checkout.html";
});

normalizarCarrinho();
salvarCarrinho();
window.addEventListener("empresa-carregada", atualizarCarrinho);
window.addEventListener("carrinho-sincronizar", () => {
    carrinho = window.CartStore?.ler() || [];
    carrinhoMeta = window.CartStore?.meta() || null;
    normalizarCarrinho(); atualizarCarrinho();
});
window.abrirCarrinho = abrirCarrinho;
window.adicionarAoCarrinho = adicionarAoCarrinho;
window.limparCarrinho = limparCarrinho;
atualizarCarrinho();
})();
