"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("fundação mobile fica restrita às rotas do cliente", () => {
  const js = read("js/core/client-mobile-4.5.js");
  for (const route of ["index.html", "restaurante.html", "checkout.html", "meus-pedidos.html", "favoritos.html", "perfil.html"]) {
    assert.match(js, new RegExp(`"${route.replace(".", "\\.")}"`));
  }
  assert.doesNotMatch(js.match(/const CLIENT_PAGES[\s\S]*?\]\);/)?.[0] || "", /admin\.html|empresa-dashboard\.html|entregador\.html/);
});

test("navegação inferior possui as cinco áreas e respeita safe area", () => {
  const js = read("js/core/client-mobile-4.5.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const label of ["Início", "Buscar", "Pedidos", "Favoritos", "Perfil"]) assert.match(js, new RegExp(`label: "${label}"`));
  assert.match(css, /grid-template-columns:\s*repeat\(5/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height:\s*58px/);
});

test("checkout e fluxos focados não recebem navegação inferior", () => {
  const js = read("js/core/client-mobile-4.5.js");
  const navPages = js.match(/const CLIENT_NAV_PAGES[\s\S]*?\]\);/)?.[0] || "";
  assert.doesNotMatch(navPages, /checkout\.html|restaurante\.html|pedido-sucesso\.html/);
});

test("camada mobile possui JavaScript e CSS próprios", () => {
  const shared = read("js/core/site-enhancements.js");
  assert.doesNotMatch(shared, /CLIENT_NAV_PAGES|client-bottom-nav|navItems/);
  assert.match(read("sw.js"), /client-mobile-4\.5\.js\?v=4\.6\.0/);
  assert.match(read("sw.js"), /client-mobile-4\.5\.css\?v=4\.6\.4/);
});

test("assets mobile são carregados somente nas páginas do cliente", () => {
  const clientPages = [
    "index.html",
    "html/restaurante.html",
    "html/checkout.html",
    "html/pedido-sucesso.html",
    "html/meus-pedidos.html",
    "html/acompanhamento.html",
    "html/favoritos.html",
    "html/perfil.html",
    "html/enderecos.html",
    "html/dados.html",
    "html/suporte.html",
    "html/privacidade.html"
  ];
  for (const page of clientPages) {
    const html = read(page);
    assert.match(html, /client-mobile-4\.5\.css\?v=4\.6\.4/, `${page} deve carregar o CSS mobile`);
    assert.match(html, /client-mobile-4\.5\.js\?v=4\.6\.0/, `${page} deve carregar o JS mobile`);
    assert.ok(html.indexOf("client-mobile-4.5.js") < html.indexOf("site-enhancements.js"), `${page} deve preparar o tema antes da camada compartilhada`);
  }

  for (const page of ["html/admin.html", "html/empresa-dashboard.html", "html/entregador.html"]) {
    assert.doesNotMatch(read(page), /client-mobile-4\.5\.(?:css|js)/, `${page} não deve carregar a área mobile do cliente`);
  }
});

test("home mobile usa dados reais para saudação, favoritos e repetição de pedido", () => {
  const home = read("index.html");
  const js = read("js/pages/home.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const id of ["saudacaoCliente", "pedirNovamente", "favoritosInicio"]) assert.match(home, new RegExp(`id="${id}"`));
  assert.match(js, /from\("pedidos"\)/);
  assert.match(js, /from\("produtos"\)/);
  assert.match(js, /FavoritesSync/);
  assert.match(js, /PosPedido\?\.pedirNovamente/);
  assert.match(css, /\.client-repeat-list/);
  assert.match(css, /\.client-favorites-list/);
  assert.match(css, /scroll-snap-type:\s*x/);
});

test("restaurante mobile mantém catálogo real e adição rápida segura", () => {
  const html = read("html/restaurante.html");
  const js = read("js/pages/restaurante.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const id of ["favoritarRestaurante", "resumoTotalCarrinho", "pesquisaProduto", "categorias", "listaProdutos"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /favorites-sync\.js/);
  assert.match(js, /from\("produto_grupos"\)/);
  assert.match(js, /from\("grupos_adicionais"\)/);
  assert.match(js, /requer_configuracao/);
  assert.match(js, /window\.adicionarAoCarrinho/);
  assert.match(css, /data-client-page="restaurante"/);
  assert.match(css, /\.pesquisa-produtos\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.restaurant-actions\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /min-height:\s*44px/);
});

test("produto mobile não oferece escolha de tamanho", () => {
  const restaurante = read("js/pages/restaurante.js");
  const modal = read("js/modules/modal.js");
  const html = read("html/restaurante.html");
  assert.match(restaurante, /varianteRepresentaTamanho/);
  assert.match(modal, /varianteRepresentaTamanho/);
  assert.match(restaurante, /filter\(\(variante\) => !varianteRepresentaTamanho\(variante\)\)/);
  assert.match(modal, /filter\(\(variante\) => !varianteRepresentaTamanho\(variante\)\)/);
  assert.match(html, /modal\.js\?v=4\.5\.4/);
});

test("produto mobile destaca adicionais, quantidade e total sem inventar opções", () => {
  const html = read("html/restaurante.html");
  const modal = read("js/modules/modal.js");
  const css = read("css/modules/restaurante-4.2.2.css");
  for (const id of ["modalPrecoBase", "listaAdicionais", "observacaoContador", "menosQtd", "maisQtd", "precoFinal"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(modal, /grupo\.minimo > 0/);
  assert.match(modal, /grupo\.maximo/);
  assert.match(modal, /atualizarEstadoDosGrupos/);
  assert.match(modal, /Sem acréscimo/);
  assert.match(modal, /observacao\.value\.length/);
  assert.match(css, /\.produto-modal-rodape\{position:sticky/);
  assert.match(css, /\.adicional:has\(input:checked\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.doesNotMatch(html, /Escolha o tamanho/i);
});

test("carrinho mobile preserva o pedido e mantém a finalização acessível", () => {
  const html = read("html/restaurante.html");
  const cart = read("js/modules/carrinho.js");
  const store = read("js/core/cart-store.js");
  const css = read("css/modules/carrinho-4.2.5.css");
  for (const id of ["carrinhoRestaurante", "carrinhoPrevisao", "carrinhoMinimo", "subtotal", "taxaEntrega", "total", "btnCheckout"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Finalizar pedido/);
  assert.match(cart, /Trocar de restaurante\?/);
  assert.match(cart, /tempo_estimado_min/);
  assert.match(store, /carrinhoBackup/);
  assert.match(css, /#carrinho\{z-index:999;width:100%;max-width:100%;height:100dvh/);
  assert.match(css, /\.carrinho-footer\{position:relative/);
  assert.match(css, /\.quantidade button\{width:44px;height:44px/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("checkout mobile concentra entrega, pagamento, revisão e envio", () => {
  const html = read("html/checkout.html");
  const core = read("js/pages/checkout.js");
  const ux = read("js/modules/checkout-4.2.3.js");
  const css = read("css/modules/checkout-4.2.3.css");
  for (const anchor of ["#checkoutEndereco", "#checkoutPagamento", "#checkoutResumo"]) {
    assert.match(html, new RegExp(`href="${anchor}"`));
  }
  assert.match(html, /id="finalizarPedidoTotal"/);
  assert.match(core, /finalizarTotalElemento\.textContent = App\.dinheiro\(calcularTotal\(\)\)/);
  assert.match(ux, /"Fazer pedido"/);
  assert.match(css, /body\[data-client-page="checkout"\][^{]*\{[^}]*padding-bottom:calc\(94px \+ env\(safe-area-inset-bottom\)\)/s);
  assert.match(css, /\.payment-options\{grid-template-columns:1fr/);
  assert.match(css, /#finalizarPedido\{width:100%;max-width:none;min-height:56px/);
});

test("confirmação mobile leva diretamente ao acompanhamento real", () => {
  const html = read("html/pedido-sucesso.html");
  const js = read("js/pages/pedido-sucesso.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const id of ["tituloSucesso", "numeroPedido", "previsaoPedido", "acompanharPedido"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(js, /acompanhamento\.html\?id=/);
  assert.match(js, /encodeURIComponent\(pedido\.id\)/);
  assert.match(css, /data-client-page="pedido-sucesso"/);
  assert.match(css, /\.success-steps/);
  assert.match(read("sw.js"), /pedido-sucesso\.js\?v=4\.6\.1/);
});

test("pedidos e acompanhamento mobile preservam dados reais e ações", () => {
  const pedidos = read("js/pages/meus-pedidos.js");
  const acompanhamento = read("js/pages/acompanhamento.js");
  const css = read("css/modules/client-mobile-4.5.css");
  assert.match(pedidos, /from\("pedidos"\)/);
  assert.match(pedidos, /cliente_solicitar_cancelamento/);
  assert.match(pedidos, /PosPedido\?\.pedirNovamente/);
  assert.match(acompanhamento, /postgres_changes/);
  assert.match(acompanhamento, /pedido_mensagens/);
  assert.match(acompanhamento, /avaliacoes/);
  assert.match(css, /data-client-page="meus-pedidos"/);
  assert.match(css, /data-client-page="acompanhamento"/);
  assert.match(css, /\.order-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2/s);
});

test("favoritos, perfil, endereços, dados e suporte recebem acabamento mobile", () => {
  const css = read("css/modules/client-mobile-4.5.css");
  for (const page of ["favoritos", "perfil", "enderecos", "dados", "suporte", "privacidade"]) {
    assert.match(css, new RegExp(`data-client-page="${page}"`), `CSS mobile sem ${page}`);
  }
  assert.match(read("js/pages/favoritos.js"), /empresas_catalogo/);
  assert.match(read("js/pages/perfil.js"), /totalPontosPerfil/);
  assert.match(read("js/pages/enderecos.js"), /from\("enderecos"\)/);
  assert.match(read("js/pages/dados.js"), /storage\.from\("avatars"\)/);
  assert.match(read("js/pages/suporte.js"), /abrir_chamado_suporte/);
  assert.match(css, /min-height:\s*50px/);
});

test("busca mobile dedicada possui histórico, sugestões e filtros reais", () => {
  const home = read("index.html");
  const js = read("js/pages/home.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const id of ["buscaMobile", "campoBuscaMobile", "historicoBuscaMobile", "listaBuscaMobile", "toggleGratis", "ordenarTempo"]) {
    assert.match(home, new RegExp(`id="${id}"`));
  }
  assert.match(js, /multi-delivery-buscas-recentes/);
  assert.match(js, /entregaGratis/);
  assert.match(js, /ordenarPorTempo/);
  assert.match(js, /buscaDedicada \? pesquisaMobile : busca/);
  assert.match(css, /\.client-search-view/);
  assert.match(css, /\.client-search-suggestions/);
});

test("confirmação apresenta itens e totais reais do pedido", () => {
  const html = read("html/pedido-sucesso.html");
  const js = read("js/pages/pedido-sucesso.js");
  for (const id of ["resumoPedidoSucesso", "itensPedidoSucesso", "subtotalPedidoSucesso", "taxaPedidoSucesso", "totalPedidoSucesso"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /pedido\.pedido_itens/);
  assert.match(js, /App\.dinheiro\(pedido\.total\)/);
});

test("acompanhamento mostra entregador e avaliação por categoria", () => {
  const html = read("html/acompanhamento.html");
  const js = read("js/pages/acompanhamento.js");
  const css = read("css/modules/client-mobile-4.5.css");
  for (const label of ["Comida", "Entrega", "Embalagem"]) assert.match(html, new RegExp(label));
  assert.match(html, /id="cartaoEntregador"/);
  assert.match(js, /notasAvaliacao/);
  assert.match(js, /\[Notas: Comida/);
  assert.match(css, /\.courier-card/);
  assert.match(css, /\.rating-category/);
});
