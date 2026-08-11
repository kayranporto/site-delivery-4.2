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
const ordenarTaxa = document.getElementById("ordenarTaxa");
const resumoResultado = document.getElementById("resultadoResumo");
const carts = document.querySelectorAll("#abrirCarrinho, #floatingCart");

const filtros = {
    abertoAgora: false,
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

function renderizarEmpresas(lista) {
    cards.replaceChildren();

    if (!lista.length) {
        cards.append(criarTexto("p", "sem-restaurantes", "Nenhum restaurante encontrado."));
        atualizarResumo(0);
        return;
    }

    const fragmento = document.createDocumentFragment();

    lista.forEach((empresa) => {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.id = empresa.id;

        const link = document.createElement("a");
        link.className = "card-link";
        link.href = `restaurante.html?id=${encodeURIComponent(empresa.id)}`;
        link.setAttribute("aria-label", `Abrir cardápio de ${empresa.nome}`);

        link.append(imagemComFallback(empresa.logo, empresa.nome));

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
        body.append(criarTexto("p", "descricao", empresa.descricao || "Confira o cardápio deste restaurante."));

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

        const aberta = empresa.status !== false;
        const status = criarTexto("span", `status ${aberta ? "aberto" : "fechado"}`, aberta ? "Aberto" : "Fechado");
        body.append(status);
        link.append(body);
        card.append(link, favorite);
        fragmento.append(card);
    });

    cards.append(fragmento);
    atualizarResumo(lista.length);
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
    const texto = normalizar(pesquisa?.value);
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
            (!filtros.abertoAgora || empresa.status !== false);
    });

    if (filtros.ordenarPorTaxa) {
        resultado.sort((a, b) => (Number(a?.taxa_entrega) || 0) - (Number(b?.taxa_entrega) || 0));
    }

    renderizarEmpresas(resultado);
}

async function carregarEmpresas() {
    cards.innerHTML = '<div class="loading">Carregando restaurantes...</div>';

    const { data, error } = await window.db
        .from("empresas_catalogo")
        .select("id,nome,descricao,categoria,tipo,logo,banner,taxa_entrega,pedido_minimo,status,cidade_atendimento,uf_atendimento,tempo_estimado_min,tempo_estimado_max")
        .order("nome");

    if (error) {
        console.error("Erro ao carregar empresas:", error);
        cards.replaceChildren(criarTexto("p", "sem-restaurantes", "Não foi possível carregar os restaurantes. Verifique o Supabase e as políticas de acesso."));
        return;
    }

    const resumoAvaliacoes = await carregarResumoAvaliacoes();
    empresas = (Array.isArray(data) ? data : [])
        .filter((empresa) => empresa?.id && empresa?.nome)
        .map((empresa) => ({
            ...empresa,
            nota_media: resumoAvaliacoes.get(String(empresa.id))?.media || 0,
            quantidade_avaliacoes: resumoAvaliacoes.get(String(empresa.id))?.quantidade || 0
        }));
    aplicarFiltros();
}


async function carregarDestaques() {
    const container = document.getElementById("listaProdutos");
    if (!container) return;
    const { data, error } = await window.db
        .from("produtos")
        .select("id,nome,descricao,imagem,preco,promocao,empresa_id")
        .eq("disponivel", true)
        .limit(6);

    container.replaceChildren();
    if (error || !data?.length) {
        const vazio = criarTexto("p", "sem-restaurantes", "Os produtos em destaque aparecerão aqui em breve.");
        container.append(vazio);
        return;
    }

    data.forEach((produto) => {
        const card = document.createElement("a");
        card.className = "produto-destaque";
        card.href = `restaurante.html?id=${encodeURIComponent(produto.empresa_id)}`;
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

async function atualizarMenuUsuario() {
    if (!menuUsuario) return;

    const { data: { user } } = await window.db.auth.getUser();
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
        admin.href = "admin.html";
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
        entregas.href = "entregador.html";
        entregas.className = "btn-driver";
        entregas.setAttribute("aria-label", "Abrir painel do entregador");
        entregas.textContent = "🛵 Entregas";
        menuUsuario.append(entregas);
    }

    const perfil = document.createElement("a");
    perfil.href = "perfil.html";
    perfil.className = "btn-primary";
    if (resPerfil.data?.avatar_url) {
        const foto = document.createElement("img"); foto.src = resPerfil.data.avatar_url; foto.alt = "";
        perfil.append(foto);
    }
    const textoPerfil = document.createElement("span"); textoPerfil.textContent = resPerfil.data?.nome || "Minha conta";
    perfil.append(textoPerfil);
    menuUsuario.append(perfil);
}

async function atualizarEndereco() {
    if (!locationText) return;
    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        locationText.textContent = "Selecionar endereço";
        return;
    }
    const { data, error } = await window.db.from("enderecos")
        .select("apelido,logradouro,numero,bairro,cidade,uf")
        .eq("usuario_id", user.id)
        .order("principal", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) {
        locationText.textContent = "Cadastrar endereço";
        return;
    }
    locationText.textContent = `${data.apelido || "Entrega"} • ${data.logradouro}, ${data.numero} — ${data.bairro}`;
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

cards?.addEventListener("click", async (event) => {
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
        favorito.textContent = favoritos.has(id) ? "❤️" : "🤍";
        favorito.setAttribute("aria-pressed", String(favoritos.has(id)));
        const nomeEmpresa = favorito.closest(".card")?.querySelector("h3")?.textContent || "restaurante";
        favorito.setAttribute("aria-label", favoritos.has(id) ? `Remover ${nomeEmpresa} dos favoritos` : `Adicionar ${nomeEmpresa} aos favoritos`);
        return;
    }

});

pesquisa?.addEventListener("input", aplicarFiltros);

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
    window.location.href = "enderecos.html?redirect=index.html";
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
    filtros.ordenarPorTaxa = false;
    filtroAberto?.classList.remove("active");
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
    ordenarTaxa.classList.toggle("active", filtros.ordenarPorTaxa);
    ordenarTaxa.setAttribute("aria-pressed", String(filtros.ordenarPorTaxa));
    aplicarFiltros();
});

carts.forEach((cart) => {
    cart.setAttribute("aria-label", "Abrir carrinho");

    const abrir = () => {
        const carrinhoSalvo = App.lerJSON("carrinho", []);
        const carrinho = Array.isArray(carrinhoSalvo) ? carrinhoSalvo : [];
        if (!carrinho.length) {
            document.getElementById("restaurantes")?.scrollIntoView({ behavior: "smooth" });
            return;
        }
        window.location.href = "checkout.html";
    };

    cart.addEventListener("click", abrir);
});

(async function iniciarHome() {
    const salvos = window.FavoritesSync
        ? await window.FavoritesSync.ready()
        : (App.lerJSON("favoritos", []) || []);
    favoritos.clear();
    salvos.forEach((id) => favoritos.add(String(id)));
    atualizarEndereco();
    atualizarContadoresCarrinho();
    iniciarAnimacoes();
    iniciarHeroInterativo();
    atualizarMenuUsuario();
    carregarEmpresas();
    carregarDestaques();
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
        busca?.focus();
      }
    });
  });
