"use strict";

const cards = document.getElementById("listaRestaurantes");
const pesquisa = document.getElementById("campoBusca");
const categorias = document.querySelectorAll(".categoria");
const menuUsuario = document.getElementById("menuUsuario");
const locationBox = document.querySelector(".location");
const locationText = locationBox?.querySelector("strong");
const cupomButton = document.getElementById("copiarCupom");
const verTodos = document.getElementById("verTodosRestaurantes");
const filtroAberto = document.getElementById("toggleAberto");
const filtroGratis = document.getElementById("toggleGratis");
const ordenarTempo = document.getElementById("ordenarTempo");
const ordenarTaxa = document.getElementById("ordenarTaxa");
const resumoResultado = document.getElementById("resultadoResumo");
const carts = document.querySelectorAll("#abrirCarrinho, #floatingCart");
const topbar = document.querySelector(".topbar");
const topbarClose = document.getElementById("fecharTopbar");
const saudacaoCliente = document.getElementById("saudacaoCliente");
const secaoPedirNovamente = document.getElementById("pedirNovamente");
const listaPedirNovamente = document.getElementById("listaPedirNovamente");
const secaoFavoritosInicio = document.getElementById("favoritosInicio");
const listaFavoritosInicio = document.getElementById("listaFavoritosInicio");
const buscaMobile = document.getElementById("buscaMobile");
const pesquisaMobile = document.getElementById("campoBuscaMobile");
const listaBuscaMobile = document.getElementById("listaBuscaMobile");
const descobertaBuscaMobile = document.getElementById("descobertaBuscaMobile");
const resultadosBuscaMobile = document.getElementById("resultadosBuscaMobile");
const totalBuscaMobile = document.getElementById("totalBuscaMobile");
const historicoBuscaMobile = document.getElementById("historicoBuscaMobile");
const BUSCAS_STORAGE_KEY = "multi-delivery-buscas-recentes";
const TOPBAR_STORAGE_KEY = "multi-delivery-topbar-hidden";

if (topbar) {
    try {
        if (localStorage.getItem(TOPBAR_STORAGE_KEY) === "1") topbar.hidden = true;
    } catch (error) {
        console.warn("Aviso: preferência local indisponível", error);
    }
}

topbarClose?.addEventListener("click", () => {
    topbar.hidden = true;
    try {
        localStorage.setItem(TOPBAR_STORAGE_KEY, "1");
    } catch (error) {
        console.warn("Aviso: não foi possível salvar a preferência", error);
    }
});

const filtros = {
    abertoAgora: false,
    entregaGratis: false,
    ordenarPorTempo: false,
    ordenarPorTaxa: false
};

// Microanimações de entrada e acessibilidade sem alterar o fluxo de dados.
function iniciarAnimacoes() {
    const elementos = document.querySelectorAll(".cupom, .categorias, .restaurantes, .destaques, .beneficios");
    if (!elementos.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
        elementos.forEach((elemento) => {
            elemento.style.opacity = "1";
            elemento.style.transform = "none";
        });
        return;
    }

    elementos.forEach((elemento, index) => {
        elemento.style.opacity = "0";
        elemento.style.transform = "translateY(18px)";
        elemento.style.transition = `opacity .65s cubic-bezier(.2,.8,.2,1) ${Math.min(index * 70, 280)}ms, transform .65s cubic-bezier(.2,.8,.2,1) ${Math.min(index * 70, 280)}ms`;
    });

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -30px" });

    elementos.forEach((elemento) => observer.observe(elemento));
}

// Profundidade sutil no destaque principal para mouse e trackpad.
function iniciarHeroInterativo() {
    const visual = document.querySelector(".hero-visual");
    if (!visual
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        || window.matchMedia("(pointer: coarse)").matches) return;

    let quadro = 0;
    visual.addEventListener("pointermove", (evento) => {
        if (quadro) cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(() => {
            const area = visual.getBoundingClientRect();
            const horizontal = ((evento.clientX - area.left) / area.width) - .5;
            const vertical = ((evento.clientY - area.top) / area.height) - .5;
            visual.style.setProperty("--tilt-x", `${(-vertical * 4).toFixed(2)}deg`);
            visual.style.setProperty("--tilt-y", `${(horizontal * 5).toFixed(2)}deg`);
        });
    });

    visual.addEventListener("pointerleave", () => {
        if (quadro) cancelAnimationFrame(quadro);
        visual.style.setProperty("--tilt-x", "0deg");
        visual.style.setProperty("--tilt-y", "0deg");
    });
}

let empresas = [];
let produtosDestaque = [];
let categoriaSelecionada = "";
const favoritos = new Set();

function normalizar(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function dinheiro(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function periodoDoDia() {
    const hora = new Date().getHours();
    if (hora < 12) return "Bom dia";
    if (hora < 18) return "Boa tarde";
    return "Boa noite";
}

async function atualizarSaudacao(user) {
    if (!saudacaoCliente) return;
    let nome = "";
    if (user) {
        const { data } = await window.db.from("usuarios").select("nome").eq("id", user.id).maybeSingle();
        nome = String(data?.nome || user.user_metadata?.nome || "").trim().split(/\s+/)[0];
    }
    saudacaoCliente.firstChild.textContent = `${periodoDoDia()}${nome ? `, ${nome}` : ""} `;
}

function criarTexto(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    elemento.textContent = texto;
    return elemento;
}

function imagemComFallback(src, alt, fallback = "assets/logo-restaurante.svg") {
    const img = document.createElement("img");
    img.src = src || fallback;
    img.alt = alt || "Restaurante";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
        if (!img.src.endsWith(fallback)) img.src = fallback;
    }, { once: true });
    return img;
}

async function carregarResumoAvaliacoes() {
    const { data, error } = await window.db
        .from("avaliacoes_resumo")
        .select("empresa_id,quantidade_avaliacoes,nota_media");

    if (!error) {
        return new Map((data || []).map((item) => [String(item.empresa_id), {
            quantidade: Number(item.quantidade_avaliacoes || 0),
            media: Number(item.nota_media || 0)
        }]));
    }

    // Compatibilidade durante a publicação: a tabela já existe desde a
    // migração 004, enquanto a view resumida é criada pela migração 006.
    const { data: avaliacoesBrutas, error: erroFallback } = await window.db
        .from("avaliacoes")
        .select("empresa_id,nota")
        .limit(5000);
    if (erroFallback) {
        console.warn("Não foi possível carregar as avaliações:", erroFallback);
        return new Map();
    }

    const totais = new Map();
    (avaliacoesBrutas || []).forEach((avaliacao) => {
        const id = String(avaliacao.empresa_id);
        const atual = totais.get(id) || { quantidade: 0, soma: 0 };
        atual.quantidade += 1;
        atual.soma += Number(avaliacao.nota || 0);
        totais.set(id, atual);
    });
    return new Map([...totais].map(([id, item]) => [id, {
        quantidade: item.quantidade,
        media: item.quantidade ? item.soma / item.quantidade : 0
    }]));
}

async function carregarDisponibilidadeEmpresas(lista) {
    const momento = new Date().toISOString();
    return Promise.all(lista.map(async (empresa) => {
        if (empresa.status === false) return { ...empresa, abertaAgora: false };
        try {
            const { data, error } = await window.db.rpc("empresa_disponibilidade", {
                p_empresa_id: String(empresa.id),
                p_quando: momento
            });
            if (error) {
                console.warn(`Disponibilidade de ${empresa.nome || empresa.id}:`, error);
                return { ...empresa, abertaAgora: true };
            }
            return { ...empresa, abertaAgora: data?.aberto === true };
        } catch (erro) {
            console.warn(`Disponibilidade de ${empresa.nome || empresa.id}:`, erro);
            return { ...empresa, abertaAgora: true };
        }
    }));
}

function renderizarEmpresas(lista) {
    cards.replaceChildren();

    if (!lista.length) {
        cards.append(criarTexto("p", "sem-restaurantes", "Nenhum restaurante encontrado."));
        atualizarResumo(0);
        renderizarResultadoBuscaMobile([]);
        return;
    }

    const fragmento = document.createDocumentFragment();

    lista.forEach((empresa) => {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.id = empresa.id;

        const link = document.createElement("a");
        link.className = "card-link";
        link.href = `html/restaurante.html?id=${encodeURIComponent(empresa.id)}`;
        link.setAttribute("aria-label", `Abrir cardápio de ${empresa.nome}`);

        link.append(imagemComFallback(empresa.banner || empresa.logo, empresa.nome));

        const body = document.createElement("div");
        body.className = "card-body";

        const header = document.createElement("div");
        header.className = "card-header";
        header.append(criarTexto("h3", "", empresa.nome || "Restaurante"));

        const favorite = document.createElement("button");
        favorite.type = "button";
        favorite.className = "favorite";
        favorite.dataset.favoriteId = empresa.id;
        const favoritado = favoritos.has(String(empresa.id));
        favorite.textContent = favoritado ? "❤️" : "🤍";
        favorite.setAttribute("aria-label", favoritado ? `Remover ${empresa.nome} dos favoritos` : `Adicionar ${empresa.nome} aos favoritos`);
        favorite.setAttribute("aria-pressed", String(favoritado));
        body.append(header);

        const info = document.createElement("div");
        info.className = "info";
        if (empresa.quantidade_avaliacoes > 0) {
            info.append(criarTexto("span", "rating-info", `⭐ ${Number(empresa.nota_media).toFixed(1)} (${empresa.quantidade_avaliacoes})`));
        } else {
            info.append(criarTexto("span", "rating-info rating-new", "☆ Novo"));
        }
        info.append(criarTexto("span", "", `🚚 ${dinheiro(empresa.taxa_entrega)}`));
        info.append(criarTexto("span", "", `Pedido mínimo ${dinheiro(empresa.pedido_minimo)}`));
        const minimo = Number(empresa.tempo_estimado_min || 25);
        const maximo = Number(empresa.tempo_estimado_max || 45);
        info.append(criarTexto("span", "", `⏱ ${minimo}–${maximo} min`));
        if (empresa.cidade_atendimento) {
            info.append(criarTexto("span", "", `📍 ${empresa.cidade_atendimento}${empresa.uf_atendimento ? `/${empresa.uf_atendimento}` : ""}`));
        }
        body.append(info);

        const aberta = empresa.abertaAgora ?? (empresa.status !== false);
        const status = criarTexto("span", `status ${aberta ? "aberto" : "fechado"}`, aberta ? "Aberto" : "Fechado");
        body.append(status);
        link.append(body);
        card.append(link, favorite);
        fragmento.append(card);
    });

    cards.append(fragmento);
    atualizarResumo(lista.length);
    renderizarResultadoBuscaMobile(lista);
}

function renderizarResultadoBuscaMobile(lista) {
    if (!listaBuscaMobile) return;
    listaBuscaMobile.replaceChildren(...Array.from(cards.children).map((item) => item.cloneNode(true)));
    if (totalBuscaMobile) totalBuscaMobile.textContent = `${lista.length} ${lista.length === 1 ? "resultado" : "resultados"}`;
    const temConsulta = Boolean(String(pesquisaMobile?.value || "").trim());
    const temFiltro = filtros.abertoAgora || filtros.entregaGratis || filtros.ordenarPorTempo || filtros.ordenarPorTaxa;
    if (descobertaBuscaMobile) descobertaBuscaMobile.hidden = temConsulta || temFiltro;
    if (resultadosBuscaMobile) resultadosBuscaMobile.hidden = !temConsulta && !temFiltro;
}

function atualizarResumo(total) {
    if (!resumoResultado) return;
    if (total === 0) {
        resumoResultado.textContent = "Nenhum restaurante corresponde aos filtros atuais.";
        return;
    }

    const plural = total === 1 ? "restaurante" : "restaurantes";
    if (filtros.abertoAgora && filtros.ordenarPorTaxa) {
        resumoResultado.textContent = `Mostrando ${total} ${plural} abertos agora, ordenados pela menor taxa.`;
        return;
    }
    if (filtros.abertoAgora) {
        resumoResultado.textContent = `Mostrando ${total} ${plural} abertos agora.`;
        return;
    }
    if (filtros.ordenarPorTaxa) {
        resumoResultado.textContent = `Mostrando ${total} ${plural}, ordenados pela menor taxa de entrega.`;
        return;
    }
    resumoResultado.textContent = `Mostrando ${total} ${plural} disponíveis para você.`;
}

function aplicarFiltros() {
    const buscaDedicadaAberta = location.hash === "#buscar" && buscaMobile && !buscaMobile.hidden;
    const texto = normalizar(buscaDedicadaAberta ? pesquisaMobile?.value : pesquisa?.value);
    const categoria = normalizar(categoriaSelecionada);

    const resultado = empresas.filter((empresa) => {
        const conteudo = normalizar([
            empresa.nome,
            empresa.descricao,
            empresa.categoria,
            empresa.tipo
        ].join(" "));

        return (!texto || conteudo.includes(texto)) &&
            (!categoria || conteudo.includes(categoria)) &&
            (!filtros.abertoAgora || empresa.abertaAgora === true) &&
            (!filtros.entregaGratis || Number(empresa.taxa_entrega || 0) === 0);
    });

    if (filtros.ordenarPorTempo) {
        resultado.sort((a, b) => (Number(a?.tempo_estimado_min) || 999) - (Number(b?.tempo_estimado_min) || 999));
    } else if (filtros.ordenarPorTaxa) {
        resultado.sort((a, b) => (Number(a?.taxa_entrega) || 0) - (Number(b?.taxa_entrega) || 0));
    }

    renderizarEmpresas(resultado);
    aplicarBuscaProdutos(texto);
}

async function carregarEmpresas() {
    cards.innerHTML = '<div class="loading">Carregando restaurantes...</div>';

    const [empresasResposta, resumoAvaliacoes] = await Promise.all([
        window.db
            .from("empresas_catalogo")
            .select("id,nome,descricao,categoria,tipo,logo,banner,taxa_entrega,pedido_minimo,status,cidade_atendimento,uf_atendimento,tempo_estimado_min,tempo_estimado_max")
            .order("nome"),
        carregarResumoAvaliacoes()
    ]);
    const { data, error } = empresasResposta;

    if (error) {
        console.error("Erro ao carregar empresas:", error);
        cards.replaceChildren(criarTexto("p", "sem-restaurantes", "Não foi possível carregar os restaurantes. Verifique o Supabase e as políticas de acesso."));
        return;
    }

    const catalogo = (Array.isArray(data) ? data : [])
    .filter((empresa) => empresa?.id && empresa?.nome)
    .map((empresa) => ({
        ...empresa,
        nota_media: resumoAvaliacoes.get(String(empresa.id))?.media || 0,
        quantidade_avaliacoes: resumoAvaliacoes.get(String(empresa.id))?.quantidade || 0
    }));
    empresas = await carregarDisponibilidadeEmpresas(catalogo);
    aplicarFiltros();
}


function renderizarDestaques(lista) {
    const container = document.getElementById("listaProdutos");
    if (!container) return;
    container.replaceChildren();
    if (!lista.length) {
        const vazio = criarTexto("p", "sem-restaurantes", "Os produtos em destaque aparecerão aqui em breve.");
        container.append(vazio);
        return;
    }

    lista.forEach((produto) => {
        const card = document.createElement("a");
        card.className = "produto-destaque";
        card.href = `html/restaurante.html?id=${encodeURIComponent(produto.empresa_id)}`;
        card.setAttribute("aria-label", `Ver ${produto.nome} no cardápio`);
        card.append(imagemComFallback(produto.imagem, produto.nome, "assets/produto-padrao.svg"));
        const corpo = document.createElement("div");
        const titulo = criarTexto("h3", "", produto.nome || "Produto");
        const descricao = criarTexto("p", "", produto.descricao || "");
        const promocao = Number(produto.promocao || 0);
        const preco = criarTexto("strong", "", dinheiro(promocao > 0 ? promocao : produto.preco));
        corpo.append(titulo, descricao, preco);
        card.append(corpo);
        container.append(card);
    });
}

function aplicarBuscaProdutos(texto = normalizar(pesquisa?.value)) {
    const filtrados = texto
        ? produtosDestaque.filter((produto) => normalizar(`${produto.nome} ${produto.descricao}`).includes(texto)).slice(0, 20)
        : produtosDestaque.slice(0, 6);
    renderizarDestaques(filtrados);
}

async function carregarDestaques() {
    const { data, error } = await window.db
        .from("produtos")
        .select("id,nome,descricao,imagem,preco,promocao,empresa_id")
        .eq("disponivel", true)
        .limit(80);
    produtosDestaque = error || !Array.isArray(data) ? [] : data;
    aplicarBuscaProdutos();
}

function renderizarFavoritosInicio() {
    if (!secaoFavoritosInicio || !listaFavoritosInicio) return;
    const selecionadas = empresas.filter((empresa) => favoritos.has(String(empresa.id))).slice(0, 6);
    listaFavoritosInicio.replaceChildren();
    secaoFavoritosInicio.hidden = selecionadas.length === 0;
    selecionadas.forEach((empresa) => {
        const card = document.createElement("article");
        card.className = "client-favorite-card";
        const link = document.createElement("a");
        link.href = `html/restaurante.html?id=${encodeURIComponent(empresa.id)}`;
        link.append(imagemComFallback(empresa.logo, empresa.nome));
        const corpo = document.createElement("div");
        corpo.append(
            criarTexto("h3", "", empresa.nome || "Restaurante"),
            criarTexto("p", "", `${empresa.quantidade_avaliacoes ? `★ ${Number(empresa.nota_media).toFixed(1)} · ` : ""}${Number(empresa.tempo_estimado_min || 25)}–${Number(empresa.tempo_estimado_max || 45)} min`),
            criarTexto("small", "", `${dinheiro(empresa.taxa_entrega)} taxa de entrega`)
        );
        link.append(corpo);
        const remover = criarTexto("button", "client-favorite-toggle", "♥");
        remover.type = "button";
        remover.setAttribute("aria-label", `Remover ${empresa.nome} dos favoritos`);
        remover.addEventListener("click", async () => {
            try {
                await window.FavoritesSync?.toggle(String(empresa.id));
                favoritos.delete(String(empresa.id));
                aplicarFiltros();
                renderizarFavoritosInicio();
            } catch (erro) {
                window.AppToast?.("Não foi possível atualizar", App.mensagemErro(erro), "error");
            }
        });
        card.append(link, remover);
        listaFavoritosInicio.append(card);
    });
}

async function carregarPedidosRecentes(user) {
    if (!user || !secaoPedirNovamente || !listaPedirNovamente) return;
    const { data: pedidosRecentes, error } = await window.db.from("pedidos")
        .select("id,empresa_id,empresa_nome,status,created_at,pedido_itens(*)")
        .eq("usuario_id", user.id)
        .in("status", ["entregue", "cancelado"])
        .order("created_at", { ascending: false })
        .limit(4);
    if (error || !pedidosRecentes?.length) return;

    const exibidos = pedidosRecentes.filter((pedido) => pedido.pedido_itens?.length).slice(0, 2);
    const produtoIds = [...new Set(exibidos.flatMap((pedido) => pedido.pedido_itens.map((item) => item.produto_id)).filter(Boolean))];
    const produtosResposta = produtoIds.length
        ? await window.db.from("produtos").select("id,imagem").in("id", produtoIds)
        : { data: [] };
    const imagens = new Map((produtosResposta.data || []).map((produto) => [String(produto.id), produto.imagem]));

    listaPedirNovamente.replaceChildren();
    exibidos.forEach((pedido) => {
        const item = pedido.pedido_itens[0];
        const card = document.createElement("article");
        card.className = "client-repeat-card";
        card.append(imagemComFallback(imagens.get(String(item.produto_id)), item.nome_produto, "assets/produto-padrao.svg"));
        const corpo = document.createElement("div");
        corpo.append(
            criarTexto("h3", "", item.nome_produto || "Pedido anterior"),
            criarTexto("p", "", pedido.empresa_nome || "Restaurante"),
            criarTexto("strong", "", dinheiro(Number(item.preco_unitario || 0) * Number(item.quantidade || 1)))
        );
        const repetir = criarTexto("button", "", "+");
        repetir.type = "button";
        repetir.setAttribute("aria-label", `Pedir ${item.nome_produto || "este pedido"} novamente`);
        repetir.addEventListener("click", () => window.PosPedido?.pedirNovamente(pedido, repetir));
        corpo.append(repetir);
        card.append(corpo);
        listaPedirNovamente.append(card);
    });
    secaoPedirNovamente.hidden = exibidos.length === 0;
}

async function atualizarMenuUsuario(user) {
    if (!menuUsuario) return;
    if (!user) return;

    menuUsuario.replaceChildren();

    // O atalho administrativo só é exibido após a permissão ser confirmada
    // pelo banco. Em instalações que ainda não receberam a migração 007, a
    // falha da RPC é ignorada e o menu do cliente continua funcionando.
    const [resAdmin, resEntregador, resPerfil] = await Promise.all([
        window.db.rpc("usuario_eh_admin"),
        window.db.from("entregadores").select("aprovado").eq("id", user.id).maybeSingle(),
        window.db.from("usuarios").select("nome,avatar_url").eq("id", user.id).maybeSingle()
    ]);
    const { data: ehAdmin, error: erroAdmin } = resAdmin;
    if (!erroAdmin && ehAdmin === true) {
        const admin = document.createElement("a");
        admin.href = "html/admin.html";
        admin.className = "btn-admin";
        admin.setAttribute("aria-label", "Abrir painel administrativo");

        const icone = document.createElement("span");
        icone.className = "btn-admin-icon";
        icone.setAttribute("aria-hidden", "true");
        icone.textContent = "◆";

        const texto = document.createElement("span");
        texto.textContent = "Painel admin";

        admin.append(icone, texto);
        menuUsuario.append(admin);
    }

    if (!resEntregador.error && resEntregador.data?.aprovado === true) {
        const entregas = document.createElement("a");
        entregas.href = "html/entregador.html";
        entregas.className = "btn-driver";
        entregas.setAttribute("aria-label", "Abrir painel do entregador");
        entregas.textContent = "🛵 Entregas";
        menuUsuario.append(entregas);
    }

    const perfil = document.createElement("a");
    perfil.href = "html/perfil.html";
    perfil.className = "btn-primary";
    if (resPerfil.data?.avatar_url) {
        const foto = document.createElement("img"); foto.src = resPerfil.data.avatar_url; foto.alt = "";
        perfil.append(foto);
    }
    const textoPerfil = document.createElement("span"); textoPerfil.textContent = resPerfil.data?.nome || "Minha conta";
    perfil.append(textoPerfil);
    menuUsuario.append(perfil);
}

async function atualizarEndereco(user) {
    if (!locationText) return;
    if (!user) {
        locationText.textContent = "Selecionar endereço";
        return;
    }
    const { data, error } = await window.db.from("enderecos")
        .select("apelido,logradouro,rua,numero,bairro,cidade,uf,estado")
        .eq("usuario_id", user.id)
        .order("principal", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) {
        locationText.textContent = "Cadastrar endereço";
        return;
    }
    locationText.textContent = `${data.apelido || "Entrega"} • ${data.logradouro || data.rua || ""}, ${data.numero || ""} — ${data.bairro || ""}`;
}

function atualizarContadoresCarrinho() {
    const carrinhoSalvo = App.lerJSON("carrinho", []);
    const carrinho = Array.isArray(carrinhoSalvo) ? carrinhoSalvo : [];
    const quantidade = carrinho.reduce((soma, item) => {
        const valor = Number(item?.quantidade || 0);
        return soma + (Number.isFinite(valor) && valor > 0 ? valor : 0);
    }, 0);
    document.querySelectorAll(".cart span, .floating-cart span").forEach((span) => {
        span.textContent = quantidade;
    });
}

async function tratarFavorito(event) {
    const favorito = event.target.closest("[data-favorite-id]");
    if (favorito) {
        event.preventDefault();
        event.stopPropagation();
        const id = String(favorito.dataset.favoriteId);
        try {
            const ativo = window.FavoritesSync
                ? await window.FavoritesSync.toggle(id)
                : !favoritos.has(id);
            ativo ? favoritos.add(id) : favoritos.delete(id);
            if (!window.FavoritesSync) App.salvarJSON("favoritos", [...favoritos]);
        } catch (erro) {
            window.AppToast?.("Não foi possível atualizar", App.mensagemErro(erro), "error");
            return;
        }
        document.querySelectorAll(`[data-favorite-id="${CSS.escape(id)}"]`).forEach((botao) => {
            botao.textContent = favoritos.has(id) ? "❤️" : "🤍";
            botao.setAttribute("aria-pressed", String(favoritos.has(id)));
        });
        const nomeEmpresa = favorito.closest(".card")?.querySelector("h3")?.textContent || "restaurante";
        favorito.setAttribute("aria-label", favoritos.has(id) ? `Remover ${nomeEmpresa} dos favoritos` : `Adicionar ${nomeEmpresa} aos favoritos`);
        return;
    }

}

cards?.addEventListener("click", tratarFavorito);
listaBuscaMobile?.addEventListener("click", tratarFavorito);

pesquisa?.addEventListener("input", aplicarFiltros);
pesquisaMobile?.addEventListener("input", () => {
    if (pesquisa) pesquisa.value = pesquisaMobile.value;
    const limpar = document.getElementById("limparBuscaMobile");
    if (limpar) limpar.hidden = !pesquisaMobile.value;
    aplicarFiltros();
});

categorias[0]?.classList.add("ativa");

categorias.forEach((categoria) => {
    const selecionar = () => {
        categorias.forEach((item) => {
            item.classList.remove("ativa");
            item.setAttribute("aria-pressed", "false");
        });
        categoria.classList.add("ativa");
        categoria.setAttribute("aria-pressed", "true");
        categoriaSelecionada = categoria.dataset.categoria || "";
        aplicarFiltros();
        document.getElementById("restaurantes")?.scrollIntoView({ behavior: "smooth" });
    };

    categoria.addEventListener("click", selecionar);
});

function editarEndereco() {
    window.location.href = "html/enderecos.html?redirect=../index.html";
}

if (locationBox) {
    locationBox.setAttribute("aria-label", "Alterar endereço de entrega");
    locationBox.addEventListener("click", editarEndereco);
}

cupomButton?.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText("BEMVINDO20");
        cupomButton.textContent = "Cupom copiado!";
        window.setTimeout(() => { cupomButton.textContent = "Copiar cupom"; }, 2000);
    } catch {
        window.prompt("Copie o cupom:", "BEMVINDO20");
    }
});

verTodos?.addEventListener("click", (event) => {
    event.preventDefault();
    categoriaSelecionada = "";
    filtros.abertoAgora = false;
    filtros.entregaGratis = false;
    filtros.ordenarPorTempo = false;
    filtros.ordenarPorTaxa = false;
    filtroAberto?.classList.remove("active");
    filtroGratis?.classList.remove("active");
    ordenarTempo?.classList.remove("active");
    ordenarTaxa?.classList.remove("active");
    if (pesquisa) pesquisa.value = "";
    categorias.forEach((item) => item.classList.toggle("ativa", !item.dataset.categoria));
    categorias.forEach((item) => item.setAttribute("aria-pressed", item.dataset.categoria ? "false" : "true"));
    aplicarFiltros();
});

filtroAberto?.addEventListener("click", () => {
    filtros.abertoAgora = !filtros.abertoAgora;
    filtroAberto.classList.toggle("active", filtros.abertoAgora);
    filtroAberto.setAttribute("aria-pressed", String(filtros.abertoAgora));
    aplicarFiltros();
});

ordenarTaxa?.addEventListener("click", () => {
    filtros.ordenarPorTaxa = !filtros.ordenarPorTaxa;
    if (filtros.ordenarPorTaxa) filtros.ordenarPorTempo = false;
    ordenarTaxa.classList.toggle("active", filtros.ordenarPorTaxa);
    ordenarTaxa.setAttribute("aria-pressed", String(filtros.ordenarPorTaxa));
    ordenarTempo?.classList.toggle("active", filtros.ordenarPorTempo);
    ordenarTempo?.setAttribute("aria-pressed", String(filtros.ordenarPorTempo));
    aplicarFiltros();
});

filtroGratis?.addEventListener("click", () => {
    filtros.entregaGratis = !filtros.entregaGratis;
    filtroGratis.classList.toggle("active", filtros.entregaGratis);
    filtroGratis.setAttribute("aria-pressed", String(filtros.entregaGratis));
    aplicarFiltros();
});

ordenarTempo?.addEventListener("click", () => {
    filtros.ordenarPorTempo = !filtros.ordenarPorTempo;
    if (filtros.ordenarPorTempo) filtros.ordenarPorTaxa = false;
    ordenarTempo.classList.toggle("active", filtros.ordenarPorTempo);
    ordenarTempo.setAttribute("aria-pressed", String(filtros.ordenarPorTempo));
    ordenarTaxa?.classList.toggle("active", filtros.ordenarPorTaxa);
    ordenarTaxa?.setAttribute("aria-pressed", String(filtros.ordenarPorTaxa));
    aplicarFiltros();
});

function lerHistoricoBusca() {
    try {
        const historico = JSON.parse(localStorage.getItem(BUSCAS_STORAGE_KEY) || "[]");
        return Array.isArray(historico) ? historico.filter(Boolean).slice(0, 6) : [];
    } catch {
        return [];
    }
}

function renderizarHistoricoBusca() {
    if (!historicoBuscaMobile) return;
    const historico = lerHistoricoBusca();
    historicoBuscaMobile.replaceChildren();
    if (!historico.length) {
        historicoBuscaMobile.append(criarTexto("span", "client-search-empty", "Suas buscas aparecerão aqui."));
        return;
    }
    historico.forEach((termo) => {
        const botao = criarTexto("button", "", termo);
        botao.type = "button";
        botao.dataset.searchMobile = termo;
        const icone = criarTexto("span", "", "↗");
        icone.setAttribute("aria-hidden", "true");
        botao.prepend(icone);
        historicoBuscaMobile.append(botao);
    });
}

function salvarBuscaRecente(termo) {
    const valor = String(termo || "").trim().slice(0, 120);
    if (valor.length < 2) return;
    const historico = lerHistoricoBusca().filter((item) => normalizar(item) !== normalizar(valor));
    try { localStorage.setItem(BUSCAS_STORAGE_KEY, JSON.stringify([valor, ...historico].slice(0, 6))); } catch { /* armazenamento opcional */ }
    renderizarHistoricoBusca();
}

function aplicarTermoBuscaMobile(termo, salvar = true) {
    if (!pesquisaMobile) return;
    pesquisaMobile.value = String(termo || "");
    if (pesquisa) pesquisa.value = pesquisaMobile.value;
    const limpar = document.getElementById("limparBuscaMobile");
    if (limpar) limpar.hidden = !pesquisaMobile.value;
    if (salvar) salvarBuscaRecente(pesquisaMobile.value);
    aplicarFiltros();
    pesquisaMobile.focus();
}

function atualizarTelaBuscaMobile() {
    if (!buscaMobile) return;
    const aberta = location.hash === "#buscar" && matchMedia("(max-width: 768px)").matches;
    buscaMobile.hidden = !aberta;
    document.body.classList.toggle("client-search-open", aberta);
    if (!aberta) {
        if (location.hash === "#buscar") pesquisa?.focus();
        return;
    }
    if (pesquisaMobile && pesquisa) pesquisaMobile.value = pesquisa.value;
    renderizarHistoricoBusca();
    aplicarFiltros();
    requestAnimationFrame(() => pesquisaMobile?.focus());
}

document.getElementById("fecharBuscaMobile")?.addEventListener("click", () => {
    history.pushState(null, "", `${location.pathname}${location.search}`);
    atualizarTelaBuscaMobile();
});
document.getElementById("limparBuscaMobile")?.addEventListener("click", () => aplicarTermoBuscaMobile("", false));
document.getElementById("limparHistoricoBusca")?.addEventListener("click", () => {
    try { localStorage.removeItem(BUSCAS_STORAGE_KEY); } catch { /* armazenamento opcional */ }
    renderizarHistoricoBusca();
});
document.getElementById("ordenarBuscaMobile")?.addEventListener("click", (event) => {
    filtros.ordenarPorTempo = !filtros.ordenarPorTempo;
    filtros.ordenarPorTaxa = false;
    event.currentTarget.classList.toggle("active", filtros.ordenarPorTempo);
    event.currentTarget.setAttribute("aria-pressed", String(filtros.ordenarPorTempo));
    event.currentTarget.lastChild.textContent = filtros.ordenarPorTempo ? " Mais rápidos" : " Ordenar";
    aplicarFiltros();
});
document.getElementById("filtrosBuscaMobile")?.addEventListener("click", (event) => {
    const filtrosBusca = document.querySelector(".client-search-filters");
    const expandido = event.currentTarget.getAttribute("aria-expanded") !== "false";
    event.currentTarget.setAttribute("aria-expanded", String(!expandido));
    filtrosBusca?.classList.toggle("collapsed", expandido);
});
document.querySelector(".client-search-view")?.addEventListener("click", (event) => {
    const sugestao = event.target.closest("[data-search-mobile]");
    if (sugestao) aplicarTermoBuscaMobile(sugestao.dataset.searchMobile);
    const filtro = event.target.closest("[data-mobile-filter]");
    if (!filtro) return;
    const chave = filtro.dataset.mobileFilter;
    if (!(chave in filtros)) return;
    filtros[chave] = !filtros[chave];
    if (chave === "ordenarPorTempo" && filtros[chave]) filtros.ordenarPorTaxa = false;
    if (chave === "ordenarPorTaxa" && filtros[chave]) filtros.ordenarPorTempo = false;
    document.querySelectorAll("[data-mobile-filter]").forEach((botao) => {
        const ativo = Boolean(filtros[botao.dataset.mobileFilter]);
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
    aplicarFiltros();
});
pesquisaMobile?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") salvarBuscaRecente(pesquisaMobile.value);
});
addEventListener("hashchange", atualizarTelaBuscaMobile);
addEventListener("resize", atualizarTelaBuscaMobile);
atualizarTelaBuscaMobile();

carts.forEach((cart) => {
    cart.setAttribute("aria-label", "Abrir carrinho");

    const abrir = () => {
        const carrinhoSalvo = App.lerJSON("carrinho", []);
        const carrinho = Array.isArray(carrinhoSalvo) ? carrinhoSalvo : [];
        if (!carrinho.length) {
            document.getElementById("restaurantes")?.scrollIntoView({ behavior: "smooth" });
            return;
        }
        window.location.href = "html/checkout.html";
    };

    cart.addEventListener("click", abrir);
});

(async function iniciarHome() {
    atualizarContadoresCarrinho();
    iniciarAnimacoes();
    iniciarHeroInterativo();
    const conteudo = Promise.allSettled([carregarEmpresas(), carregarDestaques()]);
    const usuario = window.db.auth.getUser()
        .then(({ data }) => data?.user || null)
        .catch(() => null);
    const user = await usuario;
    const favoritosSalvos = window.FavoritesSync
        ? window.FavoritesSync.ready(user)
        : Promise.resolve(App.lerJSON("favoritos", []) || []);
    const [salvos] = await Promise.all([
        favoritosSalvos,
        atualizarEndereco(user),
        atualizarMenuUsuario(user),
        atualizarSaudacao(user),
        carregarPedidosRecentes(user)
    ]);
    favoritos.clear();
    salvos.forEach((id) => favoritos.add(String(id)));
    await conteudo;
    if (empresas.length) {
        aplicarFiltros();
        renderizarFavoritosInicio();
    }
})();

// Atalhos de busca e teclado da página inicial.
document.addEventListener('DOMContentLoaded', () => {
    const busca = document.getElementById('campoBusca');
    document.querySelectorAll('[data-search]').forEach((botao) => {
      botao.addEventListener('click', () => {
        if (!busca) return;
        busca.value = botao.dataset.search || '';
        busca.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('restaurantes')?.scrollIntoView({ behavior: 'smooth' });
      });
    });
    
    document.addEventListener('keydown', (evento) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        const buscaDedicada = location.hash === '#buscar' && matchMedia('(max-width: 768px)').matches;
        (buscaDedicada ? pesquisaMobile : busca)?.focus();
      }
    });
  });
