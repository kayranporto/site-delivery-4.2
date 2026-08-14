"use strict";

(() => {
  if (!/restaurante\.html$/i.test(location.pathname)) return;

  const params = new URLSearchParams(location.search);
  const empresaId = params.get("id");
  if (!empresaId) return;

  let unidades = [];
  let unidadeAtiva = null;
  let produtosUnidade = [];
  let categoriaAtiva = "";
  let inicializado = false;

  const toast = (titulo, mensagem, tipo = "info") => window.AppToast?.(titulo, mensagem, tipo);
  const dinheiro = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const normalizar = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function metaRestaurante() {
    const meta = App.lerJSON("empresaAtual", null);
    return meta && String(meta.empresa_id) === String(empresaId) ? meta : null;
  }

  function carrinhoAtual() {
    return window.CartStore?.ler?.() || App.lerJSON("carrinho", []) || [];
  }

  function metaCarrinho() {
    return window.CartStore?.meta?.() || App.lerJSON("carrinhoMeta", null) || null;
  }

  function salvarMetaUnidade(unidade) {
    const meta = metaRestaurante();
    if (!meta || !unidade) return;
    const atualizado = {
      ...meta,
      unidade_id: String(unidade.id),
      unidade_nome: unidade.nome,
      unidade_cidade: unidade.cidade || null,
      unidade_uf: unidade.uf || null
    };
    App.salvarJSON("empresaAtual", atualizado);
    window.dispatchEvent(new CustomEvent("empresa-carregada", { detail: atualizado }));
  }

  function injetarEstilos() {
    if (document.getElementById("restauranteUnidades43Styles")) return;
    const style = document.createElement("style");
    style.id = "restauranteUnidades43Styles";
    style.textContent = `
      .public-unit-picker{display:flex;align-items:center;gap:12px;margin:0 auto 18px;padding:13px 16px;max-width:1120px;border:1px solid #e6e8ec;border-radius:16px;background:#fff;box-shadow:0 10px 28px rgba(20,24,33,.05)}
      .public-unit-picker>span{display:grid;width:38px;height:38px;flex:0 0 38px;place-items:center;border-radius:12px;background:#fff0f1;color:#d71928;font-weight:800}
      .public-unit-picker label{display:grid;gap:3px;min-width:0;flex:1}.public-unit-picker small{color:#767d89;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .public-unit-picker select{width:100%;min-width:0;border:0;background:transparent;color:#171b25;font:700 13px Poppins,system-ui,sans-serif;outline:0;cursor:pointer}
      .public-unit-picker em{color:#6d7480;font-size:10px;font-style:normal;text-align:right}
      @media(max-width:700px){.public-unit-picker{margin:0 14px 16px}.public-unit-picker em{display:none}}
    `;
    document.head.append(style);
  }

  function montarSeletor() {
    if (unidades.length < 2 || document.getElementById("unidadePublica43")) return;
    const referencia = document.querySelector(".pesquisa-produtos");
    if (!referencia) return;
    const box = document.createElement("section");
    box.className = "public-unit-picker";
    box.setAttribute("aria-label", "Escolher unidade do restaurante");
    box.innerHTML = `
      <span aria-hidden="true">⌂</span>
      <label>
        <small>Você está pedindo de</small>
        <select id="unidadePublica43"></select>
      </label>
      <em id="unidadeLocal43"></em>`;
    referencia.parentNode.insertBefore(box, referencia);
    const select = box.querySelector("select");
    select.addEventListener("change", async (event) => {
      const anterior = unidadeAtiva;
      const proxima = unidades.find((item) => String(item.id) === String(event.target.value));
      if (!proxima || String(proxima.id) === String(anterior?.id)) return;
      const ok = await trocarUnidade(proxima, true);
      if (!ok && anterior) select.value = String(anterior.id);
    });
    preencherSeletor();
  }

  function preencherSeletor() {
    const select = document.getElementById("unidadePublica43");
    if (!select) return;
    select.replaceChildren();
    unidades.forEach((unidade) => {
      const option = document.createElement("option");
      option.value = unidade.id;
      option.textContent = `${unidade.nome}${unidade.principal ? " • Principal" : ""}`;
      select.append(option);
    });
    if (unidadeAtiva) select.value = String(unidadeAtiva.id);
    const local = document.getElementById("unidadeLocal43");
    if (local) local.textContent = [unidadeAtiva?.cidade, unidadeAtiva?.uf].filter(Boolean).join("/");
  }

  async function confirmarTrocaSeNecessario(proxima) {
    const itens = carrinhoAtual();
    if (!itens.length) return true;
    const meta = metaCarrinho();
    if (!meta || String(meta.empresa_id) !== String(empresaId)) return true;
    const principal = unidades.find((item) => item.principal);
    const unidadeCarrinho = meta.unidade_id || principal?.id || null;
    if (!unidadeCarrinho || String(unidadeCarrinho) === String(proxima.id)) return true;

    const confirmou = window.AppConfirm ? await window.AppConfirm({
      titulo: "Trocar de unidade?",
      mensagem: `Seu carrinho possui itens de ${meta.unidade_nome || "outra unidade"}. Para pedir de ${proxima.nome}, os itens atuais precisam ser removidos.`,
      confirmar: "Trocar e limpar carrinho",
      cancelar: "Manter carrinho",
      perigoso: true,
      icone: "↔",
      etiqueta: "Multiunidade"
    }) : false;
    if (!confirmou) return false;
    window.CartStore?.limpar?.();
    return true;
  }

  function atualizarUrl(unidade) {
    const url = new URL(location.href);
    url.searchParams.set("unidade", String(unidade.id));
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function trocarUnidade(proxima, interativa = false) {
    if (!proxima) return false;
    if (interativa && !(await confirmarTrocaSeNecessario(proxima))) return false;
    unidadeAtiva = proxima;
    categoriaAtiva = "";
    salvarMetaUnidade(proxima);
    atualizarUrl(proxima);
    preencherSeletor();
    await carregarCatalogoUnidade();
    if (interativa) toast("Unidade alterada", `Agora você está vendo o cardápio de ${proxima.nome}.`, "success");
    return true;
  }

  function criarCard(produto) {
    const precoPromocional = Number(produto.promocao || 0);
    const precosVariantes = (produto.variantes || [])
      .map((variante) => Number(variante.promocao || 0) > 0 ? Number(variante.promocao) : Number(variante.preco || 0))
      .filter(Number.isFinite);
    const preco = precosVariantes.length
      ? Math.min(...precosVariantes)
      : (precoPromocional > 0 ? precoPromocional : Number(produto.preco || 0));

    const card = document.createElement("article");
    card.className = "produto-card";
    card.dataset.id = String(produto.id);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Personalizar ${produto.nome}`);

    const imagem = document.createElement("img");
    imagem.src = produto.imagem || "assets/produto-padrao.svg";
    imagem.alt = produto.nome || "Produto";
    imagem.loading = "lazy";
    imagem.addEventListener("error", () => { imagem.src = "assets/produto-padrao.svg"; }, { once: true });

    const info = document.createElement("div");
    info.className = "produto-info";
    const titulo = document.createElement("h3"); titulo.textContent = produto.nome || "Produto";
    const descricao = document.createElement("p"); descricao.textContent = produto.descricao || "";
    info.append(titulo, descricao);
    if (!precosVariantes.length && precoPromocional > 0) {
      const antigo = document.createElement("small"); antigo.style.textDecoration = "line-through"; antigo.textContent = dinheiro(produto.preco);
      info.append(antigo, document.createElement("br"));
    }
    const valor = document.createElement("strong"); valor.textContent = `${precosVariantes.length ? "A partir de " : ""}${dinheiro(preco)}`;
    info.append(valor);
    card.append(imagem, info);
    return card;
  }

  function renderizarProdutosSelecionados() {
    const lista = document.getElementById("listaProdutos");
    if (!lista) return;
    const busca = normalizar(document.getElementById("pesquisaProduto")?.value);
    const filtrados = produtosUnidade.filter((produto) => {
      const categoriaOk = !categoriaAtiva || String(produto.categoria_id) === String(categoriaAtiva);
      const buscaOk = !busca || normalizar(`${produto.nome} ${produto.descricao || ""}`).includes(busca);
      return categoriaOk && buscaOk;
    });
    lista.replaceChildren();
    if (!filtrados.length) {
      const vazio = document.createElement("p"); vazio.className = "sem-produtos"; vazio.textContent = "Nenhum produto encontrado nesta unidade."; lista.append(vazio); return;
    }
    filtrados.forEach((produto) => lista.append(criarCard(produto)));
  }

  function montarCategorias(categorias) {
    const container = document.getElementById("categorias");
    if (!container) return;
    container.replaceChildren();
    const todos = document.createElement("button"); todos.type = "button"; todos.className = "ativo"; todos.dataset.id = ""; todos.textContent = "Todos"; container.append(todos);
    categorias.forEach((categoria) => {
      const botao = document.createElement("button"); botao.type = "button"; botao.dataset.id = String(categoria.id); botao.textContent = categoria.nome || "Categoria"; container.append(botao);
    });
  }

  async function carregarCatalogoUnidade() {
    if (!unidadeAtiva) return;
    const lista = document.getElementById("listaProdutos");
    if (lista) lista.innerHTML = '<p class="sem-produtos">Carregando cardápio da unidade...</p>';

    const [resCategorias, resProdutos] = await Promise.all([
      window.db.from("categorias").select("id,nome,ordem,ativo,unidade_id").eq("empresa_id", empresaId).eq("unidade_id", unidadeAtiva.id).eq("ativo", true).order("ordem").order("nome"),
      window.db.from("produtos").select("id,nome,descricao,imagem,preco,promocao,categoria_id,unidade_id,disponivel").eq("empresa_id", empresaId).eq("unidade_id", unidadeAtiva.id).eq("disponivel", true).order("nome")
    ]);
    const erro = resCategorias.error || resProdutos.error;
    if (erro) {
      toast("Não foi possível carregar a unidade", erro.message || "Tente novamente.", "error");
      return;
    }

    produtosUnidade = resProdutos.data || [];
    const ids = produtosUnidade.map((produto) => String(produto.id));
    if (ids.length) {
      const { data: variantes, error: erroVariantes } = await window.db.from("produto_variantes")
        .select("id,produto_id,nome,preco,promocao,ordem")
        .in("produto_id", ids)
        .eq("ativo", true)
        .order("ordem");
      if (!erroVariantes) {
        const porProduto = new Map();
        (variantes || []).forEach((variante) => {
          const chave = String(variante.produto_id);
          if (!porProduto.has(chave)) porProduto.set(chave, []);
          porProduto.get(chave).push(variante);
        });
        produtosUnidade = produtosUnidade.map((produto) => ({ ...produto, variantes: porProduto.get(String(produto.id)) || [] }));
      }
    }
    montarCategorias(resCategorias.data || []);
    renderizarProdutosSelecionados();
  }

  function interceptarFiltros() {
    const categorias = document.getElementById("categorias");
    const busca = document.getElementById("pesquisaProduto");
    categorias?.addEventListener("click", (event) => {
      const botao = event.target.closest("button");
      if (!botao) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      categorias.querySelectorAll("button").forEach((item) => item.classList.toggle("ativo", item === botao));
      categoriaAtiva = botao.dataset.id || "";
      renderizarProdutosSelecionados();
    }, true);
    busca?.addEventListener("input", (event) => {
      event.stopImmediatePropagation();
      renderizarProdutosSelecionados();
    }, true);
  }

  async function esperarEmpresa() {
    for (let i = 0; i < 100; i += 1) {
      const meta = metaRestaurante();
      if (meta) return meta;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return null;
  }

  async function iniciar() {
    if (inicializado) return;
    const meta = await esperarEmpresa();
    if (!meta) return;
    inicializado = true;

    const { data, error } = await window.db.rpc("empresa_unidades_publicas", { p_empresa_id: String(empresaId) });
    if (error || !data?.length) {
      if (error) console.warn("Multiunidade pública:", error);
      return;
    }
    unidades = data;

    const solicitada = params.get("unidade");
    const metaCarrinhoAtual = metaCarrinho();
    const itens = carrinhoAtual();
    const principal = unidades.find((item) => item.principal) || unidades[0];
    const doCarrinho = itens.length && String(metaCarrinhoAtual?.empresa_id) === String(empresaId)
      ? unidades.find((item) => String(item.id) === String(metaCarrinhoAtual?.unidade_id || principal?.id))
      : null;
    const daUrl = unidades.find((item) => String(item.id) === String(solicitada));
    unidadeAtiva = doCarrinho || daUrl || principal;

    injetarEstilos();
    montarSeletor();
    interceptarFiltros();
    salvarMetaUnidade(unidadeAtiva);
    atualizarUrl(unidadeAtiva);
    preencherSeletor();
    await carregarCatalogoUnidade();
  }

  iniciar().catch((erro) => {
    console.error("Multiunidade pública 4.3:", erro);
    toast("Falha ao carregar unidades", erro?.message || "Tente novamente.", "error");
  });
})();
