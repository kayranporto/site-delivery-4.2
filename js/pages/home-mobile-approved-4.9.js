"use strict";

(() => {
  const mobile = matchMedia("(max-width: 768px)");
  if (!mobile.matches || !document.body.classList.contains("home-page")) return;

  const main = document.querySelector("main");
  const hero = main?.querySelector(".client-approved-hero");
  const categorias = main?.querySelector(".categorias");
  const restaurantes = document.getElementById("restaurantes");
  const listaRestaurantes = document.getElementById("listaRestaurantes");
  const destaques = document.getElementById("destaques");
  const listaProdutos = document.getElementById("listaProdutos");
  if (!main || !hero || !categorias || !restaurantes || !listaRestaurantes) return;

  document.body.classList.add("client-home-rebuilt-4-9");

  const dinheiro = (valor) => Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  function imagem(src, alt, fallback = "assets/produto-padrao.svg") {
    const img = document.createElement("img");
    img.src = src || fallback;
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      if (!img.src.endsWith(fallback)) img.src = fallback;
    }, { once: true });
    return img;
  }

  function cabecalhoSecao(titulo, href, textoLink = "Ver todos") {
    const header = document.createElement("div");
    header.className = "client-home-v2-heading";
    const h2 = document.createElement("h2");
    h2.textContent = titulo;
    header.append(h2);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = `${textoLink} ›`;
      header.append(link);
    }
    return header;
  }

  function prepararMarca() {
    const logo = document.querySelector(".container-header .logo");
    if (!logo || logo.dataset.homeApproved === "4.9") return;
    logo.dataset.homeApproved = "4.9";
    logo.setAttribute("aria-label", "MultiDelivery — página inicial");
    logo.replaceChildren();
    const seta = document.createElement("span");
    seta.className = "client-home-brand-mark";
    seta.setAttribute("aria-hidden", "true");
    const nome = document.createElement("span");
    nome.className = "client-home-brand-name";
    nome.append(document.createTextNode("Multi"));
    const delivery = document.createElement("span");
    delivery.textContent = "Delivery";
    nome.append(delivery);
    logo.append(seta, nome);
  }

  function prepararCategorias() {
    const mapa = [
      ["Todos", "Todos"],
      ["Hambúrguer", "Lanches"],
      ["Pizza", "Pizza"],
      ["Sushi", "Japonesa"],
      ["Churrasco", "Brasileira"],
      ["Doces", "Doces"]
    ];
    const botoes = [...categorias.querySelectorAll(".categoria")];
    mapa.forEach(([valor, rotulo]) => {
      const botao = botoes.find((item) => (item.dataset.categoria || "Todos") === valor);
      const span = botao?.querySelector("span");
      if (span) span.textContent = rotulo;
    });
  }

  const ofertas = document.createElement("section");
  ofertas.className = "client-home-v2-section client-home-v2-offers";
  ofertas.id = "ofertasMobileAprovadas";
  ofertas.append(cabecalhoSecao("Ofertas especiais", "#destaques", "Ver todas"));
  const ofertasLista = document.createElement("div");
  ofertasLista.className = "client-home-v2-offers-list";
  const ofertasStatus = document.createElement("p");
  ofertasStatus.className = "client-home-v2-empty";
  ofertasStatus.textContent = "Carregando ofertas disponíveis...";
  ofertasLista.append(ofertasStatus);
  ofertas.append(ofertasLista);

  const cozinhas = document.createElement("section");
  cozinhas.className = "client-home-v2-section client-home-v2-cuisines";
  cozinhas.append(cabecalhoSecao("Cozinhas mais pedidas", "#categoriasTitulo", "Ver todas"));
  const cozinhasLista = document.createElement("div");
  cozinhasLista.className = "client-home-v2-cuisines-list";
  [...categorias.querySelectorAll(".categoria")].slice(1, 5).forEach((origem) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "client-home-v2-cuisine";
    botao.innerHTML = `<span class="client-home-v2-cuisine-art" data-food="${origem.dataset.food || ""}">${origem.querySelector("div")?.textContent || "🍽️"}</span><strong>${origem.querySelector("span")?.textContent || "Cozinha"}</strong><small>Ver mais ›</small>`;
    botao.addEventListener("click", () => origem.click());
    cozinhasLista.append(botao);
  });
  cozinhas.append(cozinhasLista);

  const proximos = document.createElement("section");
  proximos.className = "client-home-v2-section client-home-v2-nearby";
  proximos.append(cabecalhoSecao("Restaurantes próximos", "#restaurantes", "Ver todos"));
  const proximosLista = document.createElement("div");
  proximosLista.className = "client-home-v2-nearby-list";
  proximos.append(proximosLista);

  prepararMarca();
  prepararCategorias();

  hero.after(categorias);
  categorias.after(ofertas);
  ofertas.after(restaurantes);
  restaurantes.after(cozinhas);
  cozinhas.after(proximos);
  if (destaques) proximos.after(destaques);

  const tituloRestaurantes = document.getElementById("restaurantesTitulo");
  if (tituloRestaurantes) tituloRestaurantes.textContent = "Restaurantes em destaque";
  const eyebrowRestaurantes = restaurantes.querySelector(".section-title .eyebrow");
  if (eyebrowRestaurantes) eyebrowRestaurantes.textContent = "Escolhas para agora";

  const tituloDestaques = document.getElementById("destaquesTitulo");
  if (tituloDestaques) tituloDestaques.textContent = "Mais pedidos";

  async function carregarOfertasReais() {
    if (!window.db) return;
    try {
      const { data, error } = await window.db
        .from("produtos")
        .select("id,nome,imagem,preco,promocao,empresa_id")
        .eq("disponivel", true)
        .gt("promocao", 0)
        .limit(8);
      if (error) throw error;
      ofertasLista.replaceChildren();
      const produtos = Array.isArray(data) ? data.filter((item) => Number(item.promocao) > 0) : [];
      if (!produtos.length) {
        const vazio = document.createElement("p");
        vazio.className = "client-home-v2-empty";
        vazio.textContent = "Nenhuma oferta ativa neste momento.";
        ofertasLista.append(vazio);
        return;
      }
      produtos.slice(0, 6).forEach((produto) => {
        const link = document.createElement("a");
        link.className = "client-home-v2-offer-card";
        link.href = `html/restaurante.html?id=${encodeURIComponent(produto.empresa_id)}`;
        link.append(imagem(produto.imagem, produto.nome));
        const preco = Number(produto.preco || 0);
        const promocao = Number(produto.promocao || 0);
        const percentual = preco > promocao && preco > 0 ? Math.round((1 - (promocao / preco)) * 100) : 0;
        const badge = document.createElement("span");
        badge.className = "client-home-v2-offer-badge";
        badge.textContent = percentual > 0 ? `${percentual}% OFF` : "Oferta";
        const corpo = document.createElement("div");
        corpo.className = "client-home-v2-offer-copy";
        const nome = document.createElement("strong");
        nome.textContent = produto.nome || "Oferta";
        const valor = document.createElement("span");
        valor.textContent = dinheiro(promocao);
        corpo.append(nome, valor);
        link.append(badge, corpo);
        ofertasLista.append(link);
      });
    } catch (erro) {
      console.warn("Home mobile: ofertas indisponíveis", erro);
      ofertasLista.replaceChildren();
      const vazio = document.createElement("p");
      vazio.className = "client-home-v2-empty";
      vazio.textContent = "As ofertas aparecerão aqui quando estiverem disponíveis.";
      ofertasLista.append(vazio);
    }
  }

  const produtosDecorados = new Set();
  async function adicionarProdutosAoRestaurante(card) {
    const id = String(card.dataset.id || "");
    if (!id || produtosDecorados.has(id) || card.querySelector(".client-home-v2-product-strip")) return;
    produtosDecorados.add(id);
    if (!window.db) return;
    try {
      const { data, error } = await window.db
        .from("produtos")
        .select("id,nome,imagem,preco,promocao,empresa_id")
        .eq("empresa_id", id)
        .eq("disponivel", true)
        .limit(3);
      if (error || !Array.isArray(data) || !data.length) return;
      const strip = document.createElement("div");
      strip.className = "client-home-v2-product-strip";
      data.forEach((produto) => {
        const link = document.createElement("a");
        link.href = `html/restaurante.html?id=${encodeURIComponent(id)}`;
        link.setAttribute("aria-label", `Ver ${produto.nome || "produto"} no cardápio`);
        link.append(imagem(produto.imagem, produto.nome));
        const nome = document.createElement("span");
        nome.textContent = produto.nome || "Produto";
        const preco = document.createElement("strong");
        preco.textContent = dinheiro(Number(produto.promocao || 0) > 0 ? produto.promocao : produto.preco);
        link.append(nome, preco);
        strip.append(link);
      });
      card.append(strip);
    } catch (erro) {
      console.warn("Home mobile: produtos do restaurante indisponíveis", erro);
    }
  }

  function encaminharFavorito(clone) {
    clone.querySelectorAll("[data-favorite-id]").forEach((botao) => {
      botao.addEventListener("click", (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        const id = botao.dataset.favoriteId;
        const original = listaRestaurantes.querySelector(`[data-favorite-id="${CSS.escape(id)}"]`);
        original?.click();
        requestAnimationFrame(() => {
          botao.textContent = original?.textContent || botao.textContent;
          botao.setAttribute("aria-pressed", original?.getAttribute("aria-pressed") || "false");
        });
      });
    });
  }

  let sincronizando = false;
  function sincronizarRestaurantes() {
    if (sincronizando) return;
    sincronizando = true;
    const cards = [...listaRestaurantes.querySelectorAll(":scope > .card")];
    cards.slice(0, 3).forEach((card) => {
      card.classList.add("client-home-v2-featured-card");
      adicionarProdutosAoRestaurante(card);
    });
    cards.slice(3).forEach((card) => card.classList.remove("client-home-v2-featured-card"));

    proximosLista.replaceChildren();
    const proximosCards = (cards.length > 3 ? cards.slice(3, 7) : cards.slice(0, 4));
    proximosCards.forEach((card) => {
      const clone = card.cloneNode(true);
      clone.classList.add("client-home-v2-nearby-card");
      clone.querySelector(".client-home-v2-product-strip")?.remove();
      encaminharFavorito(clone);
      proximosLista.append(clone);
    });
    sincronizando = false;
  }

  const observerRestaurantes = new MutationObserver(() => {
    if (!sincronizando) requestAnimationFrame(sincronizarRestaurantes);
  });
  observerRestaurantes.observe(listaRestaurantes, { childList: true });
  sincronizarRestaurantes();

  if (listaProdutos && destaques) {
    const observerProdutos = new MutationObserver(() => {
      destaques.classList.toggle("client-home-v2-products-ready", listaProdutos.children.length > 0);
    });
    observerProdutos.observe(listaProdutos, { childList: true });
    destaques.classList.toggle("client-home-v2-products-ready", listaProdutos.children.length > 0);
  }

  const repetir = document.getElementById("pedirNovamente");
  const favoritos = document.getElementById("favoritosInicio");
  if (repetir) main.append(repetir);
  if (favoritos) main.append(favoritos);

  carregarOfertasReais();
})();
