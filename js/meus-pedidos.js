"use strict";

const lista = document.getElementById("listaPedidos");
const filtrosContainer = document.querySelector(".order-filters");
const resumoPedidos = document.getElementById("resumoPedidos");
let pedidos = [];
let avaliacoes = new Map();
let filtroAtual = "todos";
let canal = null;
let usuarioAtual = null;

const statusFinais = new Set(["entregue", "cancelado"]);

function dataBr(valor) {
    const data = valor ? new Date(valor) : null;
    return data && Number.isFinite(data.getTime())
        ? data.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })
        : "Data indisponível";
}

function nomeStatus(valor) {
    return ({
        recebido: "Pedido recebido",
        preparando: "Em preparação",
        saiu_para_entrega: "Saiu para entrega",
        entregue: "Entregue",
        cancelado: "Cancelado"
    })[valor] || "Pedido recebido";
}

function criar(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function grupoDoPedido(pedido) {
    if (pedido.status === "entregue") return "entregues";
    if (pedido.status === "cancelado") return "cancelados";
    return "andamento";
}

function pedidosFiltrados() {
    if (filtroAtual === "todos") return pedidos;
    return pedidos.filter((pedido) => grupoDoPedido(pedido) === filtroAtual);
}

function atualizarContagens() {
    const quantidades = {
        todos: pedidos.length,
        andamento: pedidos.filter((pedido) => grupoDoPedido(pedido) === "andamento").length,
        entregues: pedidos.filter((pedido) => grupoDoPedido(pedido) === "entregues").length,
        cancelados: pedidos.filter((pedido) => grupoDoPedido(pedido) === "cancelados").length
    };
    document.getElementById("totalPedidos").textContent = String(quantidades.todos);
    document.getElementById("contagemTodos").textContent = String(quantidades.todos);
    document.getElementById("contagemAndamento").textContent = String(quantidades.andamento);
    document.getElementById("contagemEntregues").textContent = String(quantidades.entregues);
    document.getElementById("contagemCancelados").textContent = String(quantidades.cancelados);
}

function renderizarVazio() {
    const vazio = criar("div", "orders-empty");
    const icone = criar("span", "", filtroAtual === "todos" ? "🛍️" : "🔎");
    icone.setAttribute("aria-hidden", "true");
    icone.style.fontSize = "34px";
    const titulo = criar("h2", "", filtroAtual === "todos" ? "Nenhum pedido ainda" : "Nenhum pedido neste filtro");
    const texto = criar("p", "", filtroAtual === "todos"
        ? "Escolha um restaurante e faça seu primeiro pedido."
        : "Tente outro filtro para consultar seu histórico.");
    vazio.append(icone, titulo, texto);
    if (filtroAtual === "todos") {
        const link = criar("a", "", "Ver restaurantes");
        link.href = "index.html";
        vazio.append(link);
    }
    lista.append(vazio);
}

function criarAvaliacao(pedido) {
    if (pedido.status !== "entregue") return null;
    const avaliacao = avaliacoes.get(String(pedido.id));
    const bloco = criar("a", "order-review");
    bloco.href = `acompanhamento.html?id=${encodeURIComponent(pedido.id)}#avaliacao`;
    if (avaliacao) {
        const estrelas = "★".repeat(Number(avaliacao.nota || 0)) + "☆".repeat(5 - Number(avaliacao.nota || 0));
        bloco.textContent = `${estrelas} Sua avaliação`;
        bloco.setAttribute("aria-label", `Sua avaliação: ${avaliacao.nota} de 5 estrelas. Editar avaliação.`);
    } else {
        bloco.textContent = "☆ Conte como foi seu pedido";
        bloco.setAttribute("aria-label", "Avaliar este pedido");
    }
    return bloco;
}

function criarCard(pedido, indice) {
    const status = String(pedido.status || "recebido");
    const card = criar("article", "order-card");
    card.dataset.status = status;
    card.style.animationDelay = `${Math.min(indice * 55, 330)}ms`;

    const info = criar("div", "order-info");
    const topo = criar("div", "order-topline");
    const titulo = criar("h3", "order-number", `Pedido #${pedido.numero || String(pedido.id || "").slice(0, 8) || "—"}`);
    const data = criar("span", "order-date", dataBr(pedido.created_at));
    topo.append(titulo, data);
    const restaurante = criar("p", "order-store", pedido.empresa_nome || "Restaurante");
    const itens = criar("p", "order-items", (pedido.pedido_itens || [])
        .map((item) => `${Number(item?.quantidade) || 1}x ${item?.nome_produto || "Produto"}${item?.variante_nome ? ` • ${item.variante_nome}` : ""}`)
        .join(" • ") || "Itens do pedido");
    info.append(topo, restaurante, itens);
    const avaliacao = criarAvaliacao(pedido);
    if (avaliacao) info.append(avaliacao);

    const lado = criar("div", "order-side");
    const badge = criar("span", "status-badge", status === "preparando" && pedido.pronto_em ? "Pronto para retirada" : nomeStatus(status));
    const pagamento = criar("span", "payment-label", pedido.pagamento_status === "pago"
        ? "Pagamento confirmado"
        : "Pagamento na entrega");
    if (pedido.cancelamento_status === "solicitado") pagamento.textContent = "Cancelamento em análise";
    if (pedido.cancelamento_status === "recusado") pagamento.textContent = "Cancelamento não aprovado";
    if (pedido.reembolso_status === "pendente") pagamento.textContent = "Reembolso pendente";
    if (pedido.reembolso_status === "processando") pagamento.textContent = "Reembolso em processamento";
    if (pedido.reembolso_status === "concluido") pagamento.textContent = "Reembolso concluído";
    const total = criar("strong", "order-price", App.dinheiro(pedido.total));
    const acoes = criar("div", "order-actions");

    if (statusFinais.has(status)) {
        const repetir = criar("button", "action-secondary", "Pedir novamente");
        repetir.type = "button";
        repetir.dataset.repetirPedido = String(pedido.id);
        acoes.append(repetir);
    }

    if (["recebido", "preparando"].includes(status) && pedido.cancelamento_status !== "solicitado") {
        const cancelar = criar("button", "action-cancel", pedido.cancelamento_status === "recusado" ? "Pedir nova análise" : "Solicitar cancelamento");
        cancelar.type = "button";
        cancelar.dataset.cancelarPedido = String(pedido.id);
        acoes.append(cancelar);
    }

    const acompanhar = criar("a", "action-primary", statusFinais.has(status) ? "Ver recibo" : "Acompanhar");
    acompanhar.href = `acompanhamento.html?id=${encodeURIComponent(pedido.id)}`;
    acoes.append(acompanhar);
    lado.append(badge, pagamento, total, acoes);
    card.append(info, lado);
    return card;
}

function pedirMotivoCancelamento(pedido) {
    return new Promise((resolve) => {
        const overlay = criar("div", "cancel-dialog");
        const painel = criar("section", "cancel-dialog-panel");
        painel.setAttribute("role", "dialog");
        painel.setAttribute("aria-modal", "true");
        const titulo = criar("h2", "", `Cancelar pedido #${pedido.numero || ""}`);
        const texto = criar("p", "", "Conte o motivo. O restaurante analisará a solicitação e você receberá uma notificação.");
        const campo = document.createElement("textarea");
        campo.maxLength = 500;
        campo.placeholder = "Ex.: selecionei o endereço errado";
        campo.setAttribute("aria-label", "Motivo do cancelamento");
        const acoes = criar("div", "cancel-dialog-actions");
        const voltar = criar("button", "action-secondary", "Voltar");
        const enviar = criar("button", "action-primary", "Enviar solicitação");
        voltar.type = enviar.type = "button";
        const fechar = (valor) => { overlay.remove(); resolve(valor); };
        voltar.addEventListener("click", () => fechar(null));
        overlay.addEventListener("click", (event) => { if (event.target === overlay) fechar(null); });
        enviar.addEventListener("click", () => {
            const motivo = campo.value.trim();
            if (motivo.length < 5) { campo.setCustomValidity("Explique o motivo com pelo menos 5 caracteres."); campo.reportValidity(); return; }
            fechar(motivo);
        });
        acoes.append(voltar, enviar);
        painel.append(titulo, texto, campo, acoes);
        overlay.append(painel);
        document.body.append(overlay);
        campo.focus();
    });
}

async function solicitarCancelamento(pedido, botao) {
    const motivo = await pedirMotivoCancelamento(pedido);
    if (!motivo) return;
    App.definirCarregando(botao, true, "Enviando...");
    const { error } = await db.rpc("cliente_solicitar_cancelamento", { p_pedido_id: pedido.id, p_motivo: motivo });
    App.definirCarregando(botao, false);
    if (error) {
        window.AppToast?.("Não foi possível solicitar", App.mensagemErro(error), "error");
        return;
    }
    pedido.cancelamento_status = "solicitado";
    pedido.cancelamento_motivo = motivo;
    renderizar();
    window.AppToast?.("Solicitação enviada", "O restaurante foi avisado e analisará o cancelamento.", "success");
}

function renderizar() {
    atualizarContagens();
    const resultado = pedidosFiltrados();
    lista.replaceChildren();
    const nomes = {
        todos: "todos os pedidos",
        andamento: "pedidos em andamento",
        entregues: "pedidos entregues",
        cancelados: "pedidos cancelados"
    };
    resumoPedidos.textContent = resultado.length
        ? `${resultado.length} ${resultado.length === 1 ? "resultado" : "resultados"} em ${nomes[filtroAtual]}.`
        : `Nenhum resultado em ${nomes[filtroAtual]}.`;
    if (!resultado.length) {
        renderizarVazio();
        return;
    }
    const fragmento = document.createDocumentFragment();
    resultado.forEach((pedido, indice) => fragmento.append(criarCard(pedido, indice)));
    lista.append(fragmento);
}

async function buscarPedidos() {
    const { data, error } = await db.from("pedidos")
        .select("*, pedido_itens(*)")
        .eq("usuario_id", usuarioAtual.id)
        .order("created_at", { ascending: false });
    if (error) throw error;
    pedidos = Array.isArray(data) ? data : [];

    const ids = pedidos.map((pedido) => pedido.id).filter(Boolean);
    avaliacoes = new Map();
    if (ids.length) {
        const { data: notas, error: erroNotas } = await db.from("avaliacoes")
            .select("id,pedido_id,nota")
            .eq("usuario_id", usuarioAtual.id)
            .in("pedido_id", ids);
        if (erroNotas) console.warn("Não foi possível carregar as avaliações:", erroNotas);
        else avaliacoes = new Map((notas || []).map((avaliacao) => [String(avaliacao.pedido_id), avaliacao]));
    }
    renderizar();
}

async function carregar() {
    const { data: { user }, error: erroAuth } = await db.auth.getUser();
    if (erroAuth || !user) {
        localStorage.setItem("redirect", "meus-pedidos.html");
        location.href = "login.html";
        return;
    }
    usuarioAtual = user;
    App.vincularUsuarioLocal(user.id);

    try {
        await buscarPedidos();
    } catch (error) {
        console.error(error);
        resumoPedidos.textContent = "Não foi possível carregar seus pedidos.";
        lista.replaceChildren();
        const falha = criar("div", "orders-empty");
        falha.append(
            criar("h2", "", "Falha ao carregar"),
            criar("p", "", "Verifique sua conexão e tente novamente.")
        );
        lista.append(falha);
        return;
    }

    canal = db.channel(`meus-pedidos-${user.id}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "pedidos",
            filter: `usuario_id=eq.${user.id}`
        }, async (payload) => {
            await buscarPedidos();
            if (payload.eventType === "UPDATE") {
                window.AppToast?.("Pedido atualizado", `Novo status: ${nomeStatus(payload.new.status)}.`, "success");
            }
        })
        .subscribe();
}

filtrosContainer?.addEventListener("click", (event) => {
    const botao = event.target.closest("button[data-filtro]");
    if (!botao) return;
    filtroAtual = botao.dataset.filtro || "todos";
    filtrosContainer.querySelectorAll("button[data-filtro]").forEach((item) => {
        const ativo = item === botao;
        item.classList.toggle("active", ativo);
        item.setAttribute("aria-pressed", String(ativo));
    });
    renderizar();
});

lista?.addEventListener("click", (event) => {
    const cancelar = event.target.closest("[data-cancelar-pedido]");
    if (cancelar) {
        const pedido = pedidos.find((item) => String(item.id) === String(cancelar.dataset.cancelarPedido));
        if (pedido) solicitarCancelamento(pedido, cancelar);
        return;
    }
    const botao = event.target.closest("[data-repetir-pedido]");
    if (!botao) return;
    const pedido = pedidos.find((item) => String(item.id) === String(botao.dataset.repetirPedido));
    if (pedido) window.PosPedido?.pedirNovamente(pedido, botao);
});

addEventListener("beforeunload", () => {
    if (canal) db.removeChannel(canal);
});

carregar();
