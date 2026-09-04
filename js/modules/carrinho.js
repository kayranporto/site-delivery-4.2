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
const quantidadeResumo = document.getElementById("carrinhoQuantidadeResumo");
const restauranteResumo = document.getElementById("carrinhoRestaurante");
const previsaoResumo = document.getElementById("carrinhoPrevisao");
const minimoBloco = document.getElementById("carrinhoMinimo");
const minimoTexto = document.getElementById("carrinhoMinimoTexto");
const minimoValor = document.getElementById("carrinhoMinimoValor");
const minimoBarra = minimoBloco?.querySelector(".carrinho-minimo-barra");
const checkoutTexto = document.getElementById("btnCheckoutTexto");
const checkoutTotal = document.getElementById("btnCheckoutTotal");
const continuarComprando = document.getElementById("continuarComprando");
const limparCarrinhoBtn = document.getElementById("limparCarrinhoBtn");
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
    document.body.classList.add("cart-drawer-open");
    document.body.style.overflow = "hidden";
    fecharBtn?.focus();
}

function fecharCarrinho() {
    if (!drawer || !overlay) return;
    drawer.classList.remove("aberto");
    overlay.classList.remove("aberto");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
    document.body.classList.remove("cart-drawer-open");
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
    const tituloLinha = document.createElement("div");
    tituloLinha.className = "item-carrinho-titulo";
    const titulo = document.createElement("h4");
    titulo.textContent = item.nome;
    const valor = document.createElement("strong");
    valor.className = "item-carrinho-total";
    valor.textContent = App.dinheiro(valorUnitario(item) * item.quantidade);
    tituloLinha.append(titulo, valor);
    info.append(tituloLinha);

    if (item.variante_nome) {
        const variante = document.createElement("small");
        variante.className = "adicionais";
        variante.textContent = `Opção: ${item.variante_nome}`;
        info.append(variante);
    }

    if (item.adicionais.length) {
        const adicionais = document.createElement("small");
        adicionais.className = "adicionais";
        adicionais.textContent = `Adicionais: ${item.adicionais.map((adicional) => adicional.nome).filter(Boolean).join(", ")}`;
        info.append(adicionais);
    }

    if (item.observacao) {
        const observacao = document.createElement("small");
        observacao.className = "observacao";
        observacao.textContent = `Obs: ${item.observacao}`;
        info.append(observacao);
    }

    const unitario = document.createElement("small");
    unitario.className = "item-carrinho-unitario";
    unitario.textContent = `${App.dinheiro(valorUnitario(item))} por unidade`;
    info.append(unitario);

    const quantidade = document.createElement("div");
    quantidade.className = "quantidade";
    const menos = document.createElement("button");
    menos.type = "button";
    menos.dataset.action = "menos";
    menos.textContent = "−";
    menos.disabled = item.quantidade <= 1;
    menos.setAttribute("aria-label", `Diminuir ${item.nome}`);
    const numero = document.createElement("span");
    numero.className = "quantidade-valor";
    numero.textContent = String(item.quantidade);
    numero.setAttribute("aria-live", "polite");
    numero.setAttribute("role", "spinbutton");
    numero.setAttribute("aria-label", `Quantidade de ${item.nome}`);
    numero.setAttribute("aria-valuemin", "1");
    numero.setAttribute("aria-valuemax", "99");
    numero.setAttribute("aria-valuenow", String(item.quantidade));
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
    excluir.textContent = "Remover";
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
        texto.textContent = "Escolha seus favoritos no cardápio para começar o pedido.";
        const explorar = document.createElement("button");
        explorar.type = "button";
        explorar.dataset.action = "continuar";
        explorar.textContent = "Explorar cardápio";
        vazio.append(titulo, texto, explorar);
        listaItens.append(vazio);
    } else {
        carrinho.forEach((item) => listaItens.append(criarItem(item)));
    }

    const subtotal = calcularSubtotal();
    const taxa = carrinho.length ? Number(carrinhoMeta?.taxa_entrega || 0) : 0;
    const total = subtotal + taxa;
    const quantidadeTotal = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
    const minimo = Number(carrinhoMeta?.pedido_minimo || 0);
    if (subtotalElemento) subtotalElemento.textContent = App.dinheiro(subtotal);
    if (taxaElemento) taxaElemento.textContent = carrinho.length && taxa === 0 ? "Grátis" : App.dinheiro(taxa);
    if (totalElemento) totalElemento.textContent = App.dinheiro(total);
    if (contadorTopo) contadorTopo.textContent = String(quantidadeTotal);
    if (quantidadeResumo) quantidadeResumo.textContent = `${quantidadeTotal} ${quantidadeTotal === 1 ? "item" : "itens"}`;
    if (restauranteResumo) restauranteResumo.textContent = carrinhoMeta?.empresa_nome || "Revise os itens antes de continuar";
    if (checkoutTexto) checkoutTexto.textContent = "Finalizar pedido";
    if (checkoutTotal) checkoutTotal.textContent = App.dinheiro(total);
    if (previsaoResumo) {
        const tempoMin = Number(carrinhoMeta?.tempo_estimado_min || 0);
        const tempoMax = Number(carrinhoMeta?.tempo_estimado_max || 0);
        previsaoResumo.hidden = !carrinho.length || tempoMin <= 0 || tempoMax <= 0;
        previsaoResumo.textContent = previsaoResumo.hidden ? "" : `Entrega estimada: ${tempoMin}–${tempoMax} min`;
    }
    if (cartButton) cartButton.setAttribute("aria-label", quantidadeTotal ? `Abrir carrinho, ${quantidadeTotal} ${quantidadeTotal === 1 ? "item" : "itens"}` : "Abrir carrinho vazio");
    drawer?.classList.toggle("carrinho-sem-itens", !carrinho.length);
    if (limparCarrinhoBtn) limparCarrinhoBtn.hidden = !carrinho.length;
    if (minimoBloco) {
        minimoBloco.hidden = !carrinho.length || minimo <= 0;
        if (carrinho.length && minimo > 0) {
            const falta = Math.max(0, minimo - subtotal);
            const progresso = Math.min(100, Math.round((subtotal / minimo) * 100));
            minimoTexto.textContent = falta > 0 ? "Falta para o pedido mínimo" : "Pedido mínimo atingido";
            minimoValor.textContent = falta > 0 ? App.dinheiro(falta) : "Tudo certo";
            minimoBarra?.setAttribute("aria-valuenow", String(progresso));
            minimoBarra?.classList.toggle("concluido", falta === 0);
            minimoBarra?.querySelector("span")?.style.setProperty("width", `${progresso}%`);
        }
    }
    if (btnCheckout) btnCheckout.disabled = !carrinho.length;
}

listaItens?.addEventListener("click", (event) => {
    const acaoGeral = event.target.closest("button")?.dataset.action;
    if (acaoGeral === "continuar") {
        fecharCarrinho();
        document.getElementById("pesquisaProduto")?.focus();
        return;
    }
    const item = event.target.closest(".item-carrinho");
    const acao = acaoGeral;
    if (!item || !acao) return;
    if (acao === "mais") alterarQuantidade(item.dataset.chave, 1);
    if (acao === "menos") alterarQuantidade(item.dataset.chave, -1);
    if (acao === "remover") remover(item.dataset.chave);
});

cartButton?.addEventListener("click", abrirCarrinho);
cartButton?.setAttribute("aria-label", "Abrir carrinho");
fecharBtn?.addEventListener("click", fecharCarrinho);
overlay?.addEventListener("click", fecharCarrinho);
continuarComprando?.addEventListener("click", () => {
    fecharCarrinho();
    document.getElementById("pesquisaProduto")?.focus();
});
limparCarrinhoBtn?.addEventListener("click", async () => {
    const confirmar = window.AppConfirm
        ? await window.AppConfirm({ titulo: "Limpar carrinho?", mensagem: "Todos os itens deste pedido serão removidos.", confirmar: "Limpar carrinho", cancelar: "Manter itens", perigoso: true })
        : confirm("Deseja remover todos os itens do carrinho?");
    if (confirmar) limparCarrinho();
});
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
