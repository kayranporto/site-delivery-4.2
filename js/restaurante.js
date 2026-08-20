"use strict";
(() => {

const banner = document.getElementById("bannerRestaurante");
const logo = document.getElementById("logoRestaurante");
const nome = document.getElementById("nomeRestaurante");
const descricao = document.getElementById("descricaoRestaurante");
const infoEntrega = document.getElementById("infoEntrega");
const listaProdutos = document.getElementById("listaProdutos");
const pesquisaProduto = document.getElementById("pesquisaProduto");
const categoriasContainer = document.getElementById("categorias");
const btnVerCarrinho = document.getElementById("btnVerCarrinho");
const contadorCarrinho = document.getElementById("contadorCarrinho");
const statusBadge = document.getElementById("statusBadge");
const avaliacaoRestaurante = document.getElementById("avaliacaoRestaurante");
const tempoEntrega = document.getElementById("tempoEntrega");
const pedidoMinimo = document.getElementById("pedidoMinimo");
const cartButton = document.querySelector(".cart");

const params = new URLSearchParams(window.location.search);
const empresaId = params.get("id");
let produtos = [];
let categoriaSelecionada = "";

function dinheiro(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizar(valor) {
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function criarImagem(src, alt, fallback) {
    const imagem = document.createElement("img");
    imagem.src = src || fallback;
    imagem.alt = alt || "Imagem";
    imagem.loading = "lazy";
    imagem.addEventListener("error", () => { imagem.src = fallback; }, { once: true });
    return imagem;
}

function atualizarCarrinhoTopo() {
    const carrinho = App.lerJSON("carrinho", []);
    const quantidade = Array.isArray(carrinho) ? carrinho.reduce((total, item) => total + (Number(item?.quantidade) || 0), 0) : 0;
    contadorCarrinho && (contadorCarrinho.textContent = String(quantidade));
    document.querySelectorAll(".cart span").forEach((span) => { span.textContent = String(quantidade); });
}

window.addEventListener("carrinho-atualizado", atualizarCarrinhoTopo);
window.addEventListener("carrinho-sincronizar", atualizarCarrinhoTopo);

async function carregarAvaliacaoRestaurante() {
    if (!avaliacaoRestaurante || !empresaId) return;
    const { data, error } = await window.db.from("avaliacoes_resumo")
        .select("nota_media,quantidade_avaliacoes")
        .eq("empresa_id", String(empresaId))
        .maybeSingle();
    if (!error && data) {
        const quantidade = Number(data.quantidade_avaliacoes || 0);
        avaliacaoRestaurante.textContent = quantidade
            ? `⭐ ${Number(data.nota_media || 0).toFixed(1)} • ${quantidade} ${quantidade === 1 ? "avaliação" : "avaliações"}`
            : "☆ Novo";
        return;
    }

    const { data: avaliacoes, error: erroFallback } = await window.db.from("avaliacoes")
        .select("nota")
        .eq("empresa_id", String(empresaId))
        .limit(5000);
    if (erroFallback || !avaliacoes?.length) {
        avaliacaoRestaurante.textContent = "☆ Novo";
        return;
    }
    const media = avaliacoes.reduce((soma, item) => soma + Number(item.nota || 0), 0) / avaliacoes.length;
    avaliacaoRestaurante.textContent = `⭐ ${media.toFixed(1)} • ${avaliacoes.length} ${avaliacoes.length === 1 ? "avaliação" : "avaliações"}`;
}

async function carregarAvaliacoesPublicas() {
    const box = document.getElementById("avaliacoesPublicas");
    const { data, error } = await window.db.from("avaliacoes")
        .select("nota,comentario,resposta,autor_nome,autor_avatar_url,created_at")
        .eq("empresa_id", String(empresaId))
        .order("created_at", { ascending: false })
        .limit(9);
    if (error || !data?.length) return;
    box.replaceChildren(); document.getElementById("avaliacoesContagem").textContent = `${data.length} avaliações recentes`;
    data.forEach((avaliacao) => {
        const card = document.createElement("article"); card.className = "avaliacao-publica";
        const autor = document.createElement("div"); autor.className = "avaliacao-autor";
        if (avaliacao.autor_avatar_url) { const foto = document.createElement("img"); foto.src = avaliacao.autor_avatar_url; foto.alt = ""; autor.append(foto); }
        else { const iniciais = document.createElement("span"); iniciais.textContent = (avaliacao.autor_nome || "Cliente").trim().charAt(0).toUpperCase(); autor.append(iniciais); }
        const nomeAutor = document.createElement("strong"); nomeAutor.textContent = avaliacao.autor_nome || "Cliente verificado"; autor.append(nomeAutor);
        const estrelas = document.createElement("span"); estrelas.className = "estrelas"; estrelas.textContent = "★".repeat(avaliacao.nota) + "☆".repeat(5 - avaliacao.nota);
        const comentario = document.createElement("p"); comentario.textContent = avaliacao.comentario || "Cliente deixou apenas a nota.";
        const dataAvaliacao = document.createElement("time"); dataAvaliacao.dateTime = avaliacao.created_at; dataAvaliacao.textContent = new Date(avaliacao.created_at).toLocaleDateString("pt-BR");
        card.append(autor, estrelas, comentario, dataAvaliacao);
        if (avaliacao.resposta) { const resposta = document.createElement("div"); resposta.className = "resposta-publica"; const titulo = document.createElement("strong"); titulo.textContent = "RESPOSTA DO RESTAURANTE"; const texto = document.createElement("p"); texto.textContent = avaliacao.resposta; resposta.append(titulo, texto); card.append(resposta); }
        box.append(card);
    });
}

async function carregarEmpresa() {
    const { data, error } = await window.db.from("empresas_catalogo").select("id,nome,descricao,categoria,tipo,logo,banner,taxa_entrega,pedido_minimo,status,cidade_atendimento,uf_atendimento,bairros_atendidos,tempo_estimado_min,tempo_estimado_max").eq("id", empresaId).single();

    if (error || !data) throw new Error(error?.message || "Empresa não encontrada.");

    banner.src = data.banner || "../assets/banner-padrao.svg";
    banner.onerror = () => { banner.src = "../assets/banner-padrao.svg"; };
    logo.src = data.logo || "../assets/logo-restaurante.svg";
    logo.onerror = () => { logo.src = "../assets/logo-restaurante.svg"; };
    nome.textContent = data.nome || "Restaurante";
    descricao.textContent = data.descricao || "Confira nosso cardápio.";
    let aberta = data.status !== false;
    if (aberta) {
        const disponibilidade = await window.db.rpc("empresa_disponibilidade", { p_empresa_id: String(data.id), p_quando: new Date().toISOString() });
        if (!disponibilidade.error) aberta = disponibilidade.data?.aberto === true;
    }
    const tempoMin = Number(data.tempo_estimado_min || 25);
    const tempoMax = Number(data.tempo_estimado_max || 45);
    infoEntrega.textContent = `🚚 Entrega ${dinheiro(data.taxa_entrega)} • ${tempoMin}–${tempoMax} min • Pedido mínimo ${dinheiro(data.pedido_minimo)} • ${aberta ? "Aberto" : "Fechado"}`;
    document.title = `${data.nome || "Restaurante"} | Delivery`;
    statusBadge.textContent = aberta ? "Aberto agora" : "Fechado";
    statusBadge.classList.toggle("fechado", !aberta);
    statusBadge.classList.toggle("aberta", aberta);
    tempoEntrega.textContent = `${tempoMin}–${tempoMax} min`;
    pedidoMinimo.textContent = `Pedido mínimo ${dinheiro(data.pedido_minimo)}`;

    const meta = {
        empresa_id: String(data.id),
        empresa_nome: data.nome || "Restaurante",
        taxa_entrega: Number(data.taxa_entrega || 0),
        pedido_minimo: Number(data.pedido_minimo || 0),
        status: aberta,
        cidade_atendimento: data.cidade_atendimento || null,
        uf_atendimento: data.uf_atendimento || null,
        bairros_atendidos: Array.isArray(data.bairros_atendidos) ? data.bairros_atendidos : [],
        tempo_estimado_min: tempoMin,
        tempo_estimado_max: tempoMax
    };
    App.salvarJSON("empresaAtual", meta);
    localStorage.setItem("ultimaPaginaRestaurante", `restaurante.html?id=${encodeURIComponent(data.id)}`);
    window.dispatchEvent(new CustomEvent("empresa-carregada", { detail: meta }));
    atualizarCarrinhoTopo();
}

btnVerCarrinho?.addEventListener("click", () => {
    if (typeof window.abrirCarrinho === "function") {
        window.abrirCarrinho();
        return;
    }
    cartButton?.click();
});

async function carregarCategorias() {
    const { data, error } = await window.db
        .from("categorias")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("ordem");

    if (error) {
        console.error("Erro ao carregar categorias:", error);
        return;
    }

    categoriasContainer.replaceChildren();
    const todas = document.createElement("button");
    todas.type = "button";
    todas.className = "ativo";
    todas.dataset.id = "";
    todas.textContent = "Todos";
    categoriasContainer.append(todas);

    (data || []).forEach((categoria) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.dataset.id = String(categoria.id);
        botao.textContent = categoria.nome || "Categoria";
        categoriasContainer.append(botao);
    });
}

async function carregarProdutos() {
    listaProdutos.innerHTML = '<p class="sem-produtos">Carregando produtos...</p>';
    const { data, error } = await window.db
        .from("produtos")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("disponivel", true)
        .order("nome");

    if (error) throw new Error(error.message);
    produtos = Array.isArray(data) ? data : [];
    const ids = produtos.map((produto) => String(produto.id));
    if (ids.length) {
        const { data: variantes, error: erroVariantes } = await window.db.from("produto_variantes")
            .select("id,produto_id,nome,preco,promocao,ordem")
            .in("produto_id", ids)
            .eq("ativo", true)
            .order("ordem");
        if (erroVariantes) throw new Error(erroVariantes.message);
        const porProduto = new Map();
        (variantes || []).forEach((variante) => {
            const chave = String(variante.produto_id);
            if (!porProduto.has(chave)) porProduto.set(chave, []);
            porProduto.get(chave).push(variante);
        });
        produtos = produtos.map((produto) => ({ ...produto, variantes: porProduto.get(String(produto.id)) || [] }));
    }
    renderizarProdutos(produtos);
}

function renderizarProdutos(lista) {
    listaProdutos.replaceChildren();

    if (!lista.length) {
        const vazio = document.createElement("p");
        vazio.className = "sem-produtos";
        vazio.textContent = "Nenhum produto encontrado.";
        listaProdutos.append(vazio);
        return;
    }

    const fragmento = document.createDocumentFragment();
    lista.forEach((produto) => {
        const precoPromocional = Number(produto.promocao || 0);
        const precosVariantes = (produto.variantes || []).map((variante) => Number(variante.promocao || 0) > 0 ? Number(variante.promocao) : Number(variante.preco || 0)).filter(Number.isFinite);
        const preco = precosVariantes.length ? Math.min(...precosVariantes) : (precoPromocional > 0 ? precoPromocional : Number(produto.preco || 0));
        const card = document.createElement("article");
        card.className = "produto-card";
        card.dataset.id = String(produto.id);
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Personalizar ${produto.nome}`);
        card.append(criarImagem(produto.imagem, produto.nome, "../assets/produto-padrao.svg"));

        const info = document.createElement("div");
        info.className = "produto-info";
        const titulo = document.createElement("h3");
        titulo.textContent = produto.nome || "Produto";
        const texto = document.createElement("p");
        texto.textContent = produto.descricao || "";
        info.append(titulo, texto);

        if (!precosVariantes.length && precoPromocional > 0) {
            const antigo = document.createElement("small");
            antigo.style.textDecoration = "line-through";
            antigo.textContent = dinheiro(produto.preco);
            info.append(antigo, document.createElement("br"));
        }

        const valor = document.createElement("strong");
        valor.textContent = `${precosVariantes.length ? "A partir de " : ""}${dinheiro(preco)}`;
        info.append(valor);
        card.append(info);
        fragmento.append(card);
    });
    listaProdutos.append(fragmento);
}

function filtrarProdutos() {
    const texto = normalizar(pesquisaProduto.value);
    const lista = produtos.filter((produto) => {
        const categoriaOk = !categoriaSelecionada || String(produto.categoria_id) === categoriaSelecionada;
        const textoOk = !texto || normalizar(`${produto.nome} ${produto.descricao}`).includes(texto);
        return categoriaOk && textoOk;
    });
    renderizarProdutos(lista);
}

function abrirCard(card) {
    const produto = produtos.find((item) => String(item.id) === String(card?.dataset.id));
    if (produto && typeof window.abrirModalProduto === "function") window.abrirModalProduto(produto);
}

pesquisaProduto.addEventListener("input", filtrarProdutos);
categoriasContainer.addEventListener("click", (event) => {
    const botao = event.target.closest("button");
    if (!botao) return;
    categoriasContainer.querySelectorAll("button").forEach((item) => item.classList.remove("ativo"));
    botao.classList.add("ativo");
    categoriaSelecionada = botao.dataset.id || "";
    filtrarProdutos();
});
listaProdutos.addEventListener("click", (event) => abrirCard(event.target.closest(".produto-card")));
listaProdutos.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        abrirCard(event.target.closest(".produto-card"));
    }
});

(async function iniciar() {
    if (!empresaId) {
        localStorage.removeItem("empresaAtual");
        window.location.replace("../index.html");
        return;
    }

    try {
        localStorage.removeItem("empresaAtual");
        await carregarEmpresa();
        await Promise.all([carregarCategorias(), carregarProdutos(), carregarAvaliacaoRestaurante(), carregarAvaliacoesPublicas()]);
    } catch (error) {
        console.error(error);
        localStorage.removeItem("empresaAtual");
        listaProdutos.replaceChildren();
        const aviso = document.createElement("p");
        aviso.className = "sem-produtos";
        aviso.textContent = "Não foi possível carregar o restaurante. Verifique a conexão e as permissões do Supabase.";
        listaProdutos.append(aviso);
    }
})();
})();
