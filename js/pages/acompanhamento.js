"use strict";

let pedidoAtual = null;
let usuarioAtual = null;
let avaliacaoAtual = null;
let notaAtual = 0;
const notasAvaliacao = { comida: 0, entrega: 0, embalagem: 0 };
let canal = null;
let mensagensPedido = [];
const ordem = ["recebido", "preparando", "saiu_para_entrega", "entregue"];
const finais = new Set(["entregue", "cancelado"]);
const mensagens = {
    recebido: "Seu pedido foi recebido pelo restaurante",
    preparando: "Seu pedido está sendo preparado com cuidado",
    saiu_para_entrega: "Seu pedido saiu para entrega",
    entregue: "Pedido entregue. Bom apetite!",
    cancelado: "Este pedido foi cancelado"
};
const nomesStatus = {
    recebido: "Pedido recebido",
    preparando: "Em preparação",
    saiu_para_entrega: "Saiu para entrega",
    entregue: "Entregue",
    cancelado: "Cancelado"
};
const textosNota = {
    0: "Selecione de 1 a 5 estrelas",
    1: "Poxa, sua experiência não foi boa",
    2: "A experiência poderia melhorar",
    3: "Foi uma experiência razoável",
    4: "Muito bom!",
    5: "Excelente! Você adorou"
};

function queryId() {
    return new URLSearchParams(location.search).get("id") || App.lerJSON("pedidoAtual", {})?.id || "";
}

function dataBr(valor) {
    const data = new Date(valor);
    return Number.isFinite(data.getTime())
        ? data.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })
        : "—";
}

function notificar(status) {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("Atualização do seu pedido", {
            body: mensagens[status] || "O status do pedido mudou.",
            icon: "../assets/favicon.svg"
        });
    }
}

function renderizarItens(pedido) {
    const box = document.getElementById("itensPedido");
    box.replaceChildren();
    (pedido.pedido_itens || []).forEach((item) => {
        const row = document.createElement("div");
        row.className = "item-track";
        const texto = document.createElement("div");
        const principal = document.createElement("strong");
        principal.textContent = `${item.quantidade || 1}x ${item.nome_produto || "Produto"}${item.variante_nome ? ` • ${item.variante_nome}` : ""}`;
        texto.append(principal);
        const adicionais = Array.isArray(item.adicionais) ? item.adicionais : [];
        if (adicionais.length) {
            const extra = document.createElement("small");
            extra.textContent = adicionais.map((adicional) => adicional.nome).filter(Boolean).join(", ");
            texto.append(extra);
        }
        if (item.observacao) {
            const observacao = document.createElement("small");
            observacao.textContent = `Obs.: ${item.observacao}`;
            texto.append(observacao);
        }
        const valor = document.createElement("span");
        const adicionaisTotal = adicionais.reduce((soma, adicional) => soma + Number(adicional.preco || 0), 0);
        valor.textContent = App.dinheiro((Number(item.preco_unitario || 0) + adicionaisTotal) * Number(item.quantidade || 1));
        row.append(texto, valor);
        box.append(row);
    });
    if (!box.children.length) box.textContent = "Itens indisponíveis.";
}

function renderizarRecibo(pedido) {
    document.getElementById("subtotalPedido").textContent = App.dinheiro(pedido.subtotal);
    document.getElementById("taxaPedido").textContent = App.dinheiro(pedido.taxa_entrega);
    document.getElementById("totalPedido").textContent = App.dinheiro(pedido.total);

    const desconto = Number(pedido.desconto || 0);
    document.getElementById("descontoLinha").hidden = desconto <= 0;
    document.getElementById("descontoPedido").textContent = `− ${App.dinheiro(desconto)}`;

    const cupom = String(pedido.cupom || "").trim();
    document.getElementById("cupomLinha").hidden = !cupom;
    document.getElementById("cupomPedido").textContent = cupom;

    const observacoes = String(pedido.observacoes || "").trim();
    document.getElementById("observacoesLinha").hidden = !observacoes;
    document.getElementById("observacoesPedido").textContent = observacoes;
}

function renderizarAcoes(status) {
    const finalizado = finais.has(status);
    const live = document.getElementById("indicadorLive");
    live.classList.toggle("final", finalizado);
    live.querySelector("span").textContent = finalizado ? "FINALIZADO" : "AO VIVO";
    document.getElementById("acoesPosPedido").hidden = !finalizado;
    document.getElementById("ativarNotificacoes").hidden = finalizado;
    document.getElementById("avaliacao").hidden = status !== "entregue";
}

function renderizarEntregador(pedido) {
    const card = document.getElementById("cartaoEntregador");
    if (!card) return;
    const visivel = Boolean(pedido.entregador_id) || ["saiu_para_entrega", "entregue"].includes(pedido.status);
    card.hidden = !visivel;
    if (!visivel) return;
    const mensagemEntregador = [...mensagensPedido].reverse().find((mensagem) => mensagem.autor_tipo === "entregador");
    const nome = String(mensagemEntregador?.autor_nome || "Entregador atribuído").trim();
    document.getElementById("tituloEntregador").textContent = nome;
    document.getElementById("avatarEntregador").textContent = nome.charAt(0).toUpperCase() || "E";
    document.getElementById("statusEntregador").textContent = pedido.status === "entregue" ? "Entrega concluída" : pedido.status === "saiu_para_entrega" ? "A caminho do seu endereço" : "Preparando a retirada do pedido";
}

function render(pedido) {
    pedidoAtual = pedido;
    const status = pedido.status || "recebido";
    const pronto = status === "preparando" && Boolean(pedido.pronto_em);
    document.getElementById("tituloPedido").textContent = `Pedido #${pedido.numero || String(pedido.id).slice(0, 8)}`;
    document.getElementById("statusAtual").textContent = pronto ? "Pronto para retirada" : nomesStatus[status] || "Pedido recebido";
    document.getElementById("mensagemStatus").textContent = pedido.cancelamento_status === "solicitado"
        ? "Seu cancelamento está sendo analisado pelo restaurante"
        : pronto ? "Seu pedido está pronto e aguarda o entregador" : mensagens[status] || "Acompanhe seu pedido";
    document.getElementById("nomeEmpresa").textContent = pedido.empresa_nome || "Restaurante";
    const minimo = Number(pedido.previsao_min || 25);
    const maximo = Number(pedido.previsao_max || 45);
    document.getElementById("previsao").textContent = pedido.agendado_para && new Date(pedido.agendado_para) > new Date()
        ? new Date(pedido.agendado_para).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : status === "entregue"
        ? "Entregue"
        : status === "cancelado" ? "Cancelado" : pronto ? "Pronto" : `${minimo}–${maximo} min`;
    document.getElementById("enderecoPedido").textContent = pedido.endereco || "—";
    const pagamentoStatus = pedido.reembolso_status === "pendente"
        ? "reembolso pendente"
        : pedido.reembolso_status === "processando" ? "reembolso em processamento"
        : pedido.reembolso_status === "concluido" ? "reembolso concluído"
        : pedido.reembolso_status === "falhou" ? "reembolso em nova análise"
        : pedido.pagamento_status === "pago"
        ? "pago"
        : pedido.pagamento_status === "estornado" ? "estornado" : pedido.pagamento_modalidade === "online" ? "aguardando pagamento online" : "pendente na entrega";
    document.getElementById("pagamentoPedido").textContent = `${pedido.pagamento || "—"} • ${pagamentoStatus}`;
    document.getElementById("pagarOnline").hidden = window.DELIVERY_CONFIG?.pagamentoOnlineAtivo !== true || pedido.pagamento_modalidade !== "online" || pedido.pagamento_status === "pago" || status === "cancelado";
    document.getElementById("dataPedido").textContent = dataBr(pedido.created_at);

    const telefone = document.getElementById("telefoneEmpresa");
    const numero = App.somenteNumeros(pedido.empresa_telefone);
    telefone.hidden = !numero;
    if (numero) telefone.href = `tel:${numero}`;

    const atual = ordem.indexOf(status);
    document.querySelectorAll("#timeline li").forEach((li, indice) => {
        li.classList.toggle("done", status === "entregue" || indice < atual);
        li.classList.toggle("active", indice === atual);
    });
    document.getElementById("timeline").hidden = status === "cancelado";
    document.getElementById("cancelado").hidden = status !== "cancelado";
    renderizarItens(pedido);
    renderizarRecibo(pedido);
    renderizarAcoes(status);
    renderizarEntregador(pedido);
}

function atualizarMediaAvaliacao() {
    const valores = Object.values(notasAvaliacao).filter((nota) => nota > 0);
    notaAtual = valores.length === 3 ? Math.round(valores.reduce((soma, nota) => soma + nota, 0) / 3) : 0;
    document.getElementById("textoNota").textContent = valores.length === 3 ? textosNota[notaAtual] : `Avalie os três itens • ${valores.length}/3 concluídos`;
}

function selecionarNota(tipo, nota) {
    if (!(tipo in notasAvaliacao)) return;
    notasAvaliacao[tipo] = Number(nota) || 0;
    document.querySelectorAll(`[data-rating-type="${tipo}"] button`).forEach((botao) => {
        const selecionada = Number(botao.dataset.nota) <= notasAvaliacao[tipo];
        botao.classList.toggle("selected", selecionada);
        botao.setAttribute("aria-checked", String(Number(botao.dataset.nota) === notasAvaliacao[tipo]));
        botao.tabIndex = Number(botao.dataset.nota) === (notasAvaliacao[tipo] || 1) ? 0 : -1;
    });
    atualizarMediaAvaliacao();
}

function separarComentarioAvaliacao(comentario) {
    const texto = String(comentario || "");
    const resultado = texto.match(/^\[Notas: Comida (\d) \| Entrega (\d) \| Embalagem (\d)\]\n?/i);
    if (!resultado) return { comentario: texto, notas: null };
    return {
        comentario: texto.slice(resultado[0].length),
        notas: { comida: Number(resultado[1]), entrega: Number(resultado[2]), embalagem: Number(resultado[3]) }
    };
}

async function carregarAvaliacao() {
    if (!pedidoAtual || pedidoAtual.status !== "entregue" || !usuarioAtual) return;
    const { data, error } = await db.from("avaliacoes")
        .select("id,nota,comentario,resposta,created_at,updated_at")
        .eq("pedido_id", pedidoAtual.id)
        .eq("usuario_id", usuarioAtual.id)
        .maybeSingle();
    if (error) {
        console.warn("Não foi possível carregar a avaliação:", error);
        return;
    }
    avaliacaoAtual = data || null;
    const detalhes = separarComentarioAvaliacao(avaliacaoAtual?.comentario);
    const notas = detalhes.notas || { comida: avaliacaoAtual?.nota || 0, entrega: avaliacaoAtual?.nota || 0, embalagem: avaliacaoAtual?.nota || 0 };
    Object.entries(notas).forEach(([tipo, nota]) => selecionarNota(tipo, nota));
    document.getElementById("comentarioAvaliacao").value = detalhes.comentario;
    document.getElementById("salvarAvaliacao").textContent = avaliacaoAtual ? "Atualizar avaliação" : "Enviar avaliação";
    document.getElementById("statusAvaliacao").textContent = avaliacaoAtual ? "Avaliação enviada. Você pode editá-la." : "";
    const resposta = String(avaliacaoAtual?.resposta || "").trim();
    document.getElementById("respostaRestaurante").hidden = !resposta;
    document.getElementById("textoRespostaRestaurante").textContent = resposta;

    if (location.hash === "#avaliacao") {
        requestAnimationFrame(() => document.getElementById("avaliacao").focus({ preventScroll: true }));
        document.getElementById("avaliacao").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function renderizarMensagens() {
    const box = document.getElementById("mensagensPedido");
    box.replaceChildren();
    if (!mensagensPedido.length) { box.append(Object.assign(document.createElement("p"), { textContent: "Envie uma mensagem para iniciar a conversa." })); return; }
    mensagensPedido.forEach((mensagem) => {
        const item = document.createElement("article");
        item.className = `chat-message ${mensagem.autor_id === usuarioAtual?.id ? "mine" : ""}`;
        const cabecalho = document.createElement("div"); cabecalho.className = "chat-author";
        if (mensagem.autor_avatar_url) { const foto = document.createElement("img"); foto.src = mensagem.autor_avatar_url; foto.alt = ""; cabecalho.append(foto); }
        const autor = document.createElement("strong"); autor.textContent = mensagem.autor_nome || ({ cliente: "Cliente", restaurante: "Restaurante", entregador: "Entregador", admin: "Administração" })[mensagem.autor_tipo] || "Equipe"; cabecalho.append(autor);
        const texto = document.createElement("span"); texto.textContent = mensagem.mensagem;
        const horario = document.createElement("small"); horario.textContent = new Date(mensagem.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        item.append(cabecalho, texto, horario); box.append(item);
    });
    box.scrollTop = box.scrollHeight;
    if (pedidoAtual) renderizarEntregador(pedidoAtual);
}

function atualizarMapa(localizacao) {
    const card = document.getElementById("mapaEntrega");
    if (!localizacao || pedidoAtual?.status !== "saiu_para_entrega") { card.hidden = true; return; }
    const lat = Number(localizacao.latitude); const lon = Number(localizacao.longitude); const margem = .008;
    document.getElementById("mapaFrame").src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - margem}%2C${lat - margem}%2C${lon + margem}%2C${lat + margem}&layer=mapnik&marker=${lat}%2C${lon}`;
    document.getElementById("mapaAtualizado").textContent = `Atualizado ${new Date(localizacao.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    card.hidden = false;
}

async function carregarRecursosTempoReal(id) {
    const [resMensagens, resLocalizacao] = await Promise.all([
        db.from("pedido_mensagens").select("*").eq("pedido_id", id).order("created_at"),
        db.from("entrega_localizacoes").select("*").eq("pedido_id", id).maybeSingle()
    ]);
    if (!resMensagens.error) { mensagensPedido = resMensagens.data || []; renderizarMensagens(); }
    if (!resLocalizacao.error) atualizarMapa(resLocalizacao.data);
}

async function salvarAvaliacao(event) {
    event.preventDefault();
    if (!pedidoAtual || pedidoAtual.status !== "entregue" || !usuarioAtual) return;
    if (Object.values(notasAvaliacao).some((nota) => nota < 1 || nota > 5)) {
        document.getElementById("statusAvaliacao").textContent = "Avalie comida, entrega e embalagem.";
        document.getElementById("estrelasAvaliacao").querySelector("button")?.focus();
        return;
    }

    const botao = document.getElementById("salvarAvaliacao");
    const comentarioCliente = document.getElementById("comentarioAvaliacao").value.trim();
    const marcadorNotas = `[Notas: Comida ${notasAvaliacao.comida} | Entrega ${notasAvaliacao.entrega} | Embalagem ${notasAvaliacao.embalagem}]`;
    const comentario = `${marcadorNotas}${comentarioCliente ? `\n${comentarioCliente}` : ""}`.slice(0, 1000);
    botao.disabled = true;
    botao.textContent = "Salvando...";
    document.getElementById("statusAvaliacao").textContent = "";

    try {
        let resposta;
        if (avaliacaoAtual) {
            resposta = await db.from("avaliacoes")
                .update({ nota: notaAtual, comentario: comentario || null, updated_at: new Date().toISOString() })
                .eq("id", avaliacaoAtual.id)
                .eq("usuario_id", usuarioAtual.id)
                .select("id,nota,comentario,created_at,updated_at")
                .single();
        } else {
            resposta = await db.from("avaliacoes")
                .insert({
                    pedido_id: pedidoAtual.id,
                    usuario_id: usuarioAtual.id,
                    empresa_id: String(pedidoAtual.empresa_id),
                    nota: notaAtual,
                    comentario: comentario || null
                })
                .select("id,nota,comentario,created_at,updated_at")
                .single();
        }
        if (resposta.error) throw resposta.error;
        avaliacaoAtual = resposta.data;
        document.getElementById("statusAvaliacao").textContent = "Obrigado! Sua avaliação foi salva.";
        botao.textContent = "Atualizar avaliação";
        window.AppToast?.("Avaliação enviada", "Obrigado por compartilhar sua experiência!", "success");
    } catch (error) {
        console.error("Erro ao salvar avaliação:", error);
        document.getElementById("statusAvaliacao").textContent = `Não foi possível salvar: ${App.mensagemErro(error)}`;
        botao.textContent = avaliacaoAtual ? "Atualizar avaliação" : "Enviar avaliação";
    } finally {
        botao.disabled = false;
    }
}

async function carregar() {
    const id = queryId();
    if (!id) return location.replace("meus-pedidos.html");
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
        localStorage.setItem("redirect", `acompanhamento.html?id=${encodeURIComponent(id)}`);
        location.replace("login.html");
        return;
    }
    usuarioAtual = user;
    App.vincularUsuarioLocal(user.id);
    const { data, error } = await db.from("pedidos")
        .select("*, pedido_itens(*)")
        .eq("id", id)
        .eq("usuario_id", user.id)
        .maybeSingle();
    if (error || !data) {
        App.mostrarErroPagina("Pedido não encontrado ou indisponível.");
        return;
    }
    render(data);
    await Promise.all([carregarAvaliacao(), carregarRecursosTempoReal(id)]);
    canal = db.channel(`pedido-${id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${id}` }, async (payload) => {
            const anterior = pedidoAtual?.status;
            render({ ...pedidoAtual, ...payload.new });
            if (anterior !== payload.new.status) {
                notificar(payload.new.status);
                window.AppToast?.("Pedido atualizado", mensagens[payload.new.status], "success");
                if (payload.new.status === "entregue") await carregarAvaliacao();
            } else if (!pedidoAtual?.pronto_em && payload.new.pronto_em) {
                notificar("preparando");
                window.AppToast?.("Pedido pronto", "Seu pedido está pronto e aguarda retirada.", "success");
            }
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedido_mensagens", filter: `pedido_id=eq.${id}` }, (payload) => { mensagensPedido.push(payload.new); renderizarMensagens(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "entrega_localizacoes", filter: `pedido_id=eq.${id}` }, (payload) => atualizarMapa(payload.new))
        .subscribe();
}

document.getElementById("estrelasAvaliacao").addEventListener("click", (event) => {
    const botao = event.target.closest("button[data-nota]");
    const grupo = botao?.closest("[data-rating-type]");
    if (botao && grupo) selecionarNota(grupo.dataset.ratingType, botao.dataset.nota);
});

document.getElementById("estrelasAvaliacao").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const botao = event.target.closest("button[data-nota]");
    const grupo = botao?.closest("[data-rating-type]");
    if (!grupo) return;
    const delta = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
    const atual = notasAvaliacao[grupo.dataset.ratingType] || 1;
    const proxima = Math.min(5, Math.max(1, atual + delta));
    selecionarNota(grupo.dataset.ratingType, proxima);
    grupo.querySelector(`button[data-nota="${proxima}"]`)?.focus();
});

document.getElementById("falarEntregador")?.addEventListener("click", () => {
    document.getElementById("chatPedido")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("mensagemTexto")?.focus({ preventScroll: true });
});

document.getElementById("avaliacaoForm").addEventListener("submit", salvarAvaliacao);
document.getElementById("mensagemForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("mensagemTexto"); const mensagem = input.value.trim(); if (!mensagem || !pedidoAtual) return;
    const botao = event.currentTarget.querySelector("button"); App.definirCarregando(botao, true, "Enviando...");
    const { error } = await db.from("pedido_mensagens").insert({ pedido_id: pedidoAtual.id, autor_id: usuarioAtual.id, autor_tipo: "cliente", mensagem });
    App.definirCarregando(botao, false); if (error) return alert(`Não foi possível enviar: ${App.mensagemErro(error)}`); input.value = "";
});
document.getElementById("pagarOnline").addEventListener("click", async (event) => {
    if (!pedidoAtual) return; App.definirCarregando(event.currentTarget, true, "Abrindo pagamento...");
    const { data, error } = await db.functions.invoke("criar-pagamento", { body: { pedido_id: pedidoAtual.id } });
    App.definirCarregando(event.currentTarget, false);
    if (error || !data?.checkout_url) return alert(`Não foi possível abrir o pagamento: ${App.mensagemErro(error, data?.error)}`);
    location.href = data.checkout_url;
});
document.getElementById("pedirNovamente").addEventListener("click", (event) => {
    if (pedidoAtual) window.PosPedido?.pedirNovamente(pedidoAtual, event.currentTarget);
});
document.getElementById("imprimirRecibo").addEventListener("click", () => window.print());

document.getElementById("ativarNotificacoes").onclick = async () => {
    if (!("Notification" in window)) return window.AppToast?.("Indisponível", "Seu navegador não oferece notificações.");
    const permissao = await Notification.requestPermission();
    window.AppToast?.(
        permissao === "granted" ? "Notificações ativadas" : "Permissão não concedida",
        permissao === "granted" ? "Avisaremos quando o status mudar." : "Você pode alterar a permissão no navegador.",
        permissao === "granted" ? "success" : "info"
    );
};

addEventListener("beforeunload", () => {
    if (canal) db.removeChannel(canal);
});

Object.keys(notasAvaliacao).forEach((tipo) => selecionarNota(tipo, 0));
carregar();
