"use strict";

(() => {
    let usuario = null;
    let chamados = [];
    const $ = (id) => document.getElementById(id);
    const criar = (tag, classe, texto) => { const item = document.createElement(tag); if (classe) item.className = classe; if (texto !== undefined) item.textContent = texto; return item; };
    const nomesStatus = { aberto: "Aberto", em_analise: "Em análise", respondido: "Respondido", fechado: "Fechado" };

    function avisar(titulo, mensagem, tipo = "info") {
        window.AppToast?.(titulo, mensagem, tipo);
    }

    function renderizar() {
        $("chamadosAbertos").textContent = String(chamados.filter((item) => !["fechado", "respondido"].includes(item.status)).length);
        const lista = $("listaChamados"); lista.replaceChildren();
        if (!chamados.length) return lista.append(criar("p", "ticket-empty", "Você ainda não abriu nenhuma solicitação."));
        chamados.forEach((chamado) => {
            const card = criar("article", "ticket");
            const corpo = criar("div"); const header = document.createElement("header");
            header.append(criar("h3", "", chamado.assunto), criar("small", "", chamado.pedido_id ? `Pedido ${String(chamado.pedido_id).slice(0, 8)}` : chamado.categoria));
            corpo.append(header, criar("p", "", chamado.mensagem), criar("small", "", new Date(chamado.created_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })));
            const status = criar("span", `ticket-status ${chamado.status}`, nomesStatus[chamado.status] || chamado.status);
            card.append(corpo, status);
            if (chamado.resposta) card.append(criar("div", "ticket-response", `Resposta do suporte: ${chamado.resposta}`));
            lista.append(card);
        });
    }

    async function carregar() {
        const { data: { user }, error } = await window.db.auth.getUser();
        if (error || !user) { localStorage.setItem("redirect", "suporte.html"); location.replace("login.html"); return; }
        usuario = user;
        const [resChamados, resPedidos] = await Promise.all([
            window.db.from("chamados_suporte").select("*").eq("usuario_id", user.id).order("created_at", { ascending: false }),
            window.db.from("pedidos").select("id,numero,empresa_nome,created_at").eq("usuario_id", user.id).order("created_at", { ascending: false }).limit(40)
        ]);
        if (resChamados.error) throw resChamados.error;
        chamados = resChamados.data || [];
        (resPedidos.data || []).forEach((pedido) => {
            const option = document.createElement("option"); option.value = pedido.id; option.textContent = `#${pedido.numero || String(pedido.id).slice(0, 8)} • ${pedido.empresa_nome}`; $("suportePedido").append(option);
        });
        renderizar();
    }

    $("suporteForm").addEventListener("submit", async (event) => {
        event.preventDefault(); if (!usuario) return;
        const botao = event.currentTarget.querySelector("button"); App.definirCarregando(botao, true, "Enviando...");
        const { data, error } = await window.db.rpc("abrir_chamado_suporte", { p_categoria: $("suporteCategoria").value, p_assunto: $("suporteAssunto").value.trim(), p_mensagem: $("suporteMensagem").value.trim(), p_pedido_id: $("suportePedido").value || null });
        App.definirCarregando(botao, false);
        if (error) {
            avisar("Não foi possível enviar", App.mensagemErro(error), "error");
            return;
        }
        event.currentTarget.reset();
        const { data: novo } = await window.db.from("chamados_suporte").select("*").eq("id", data).single();
        if (novo) chamados.unshift(novo);
        renderizar();
        avisar("Solicitação enviada", "A equipe de suporte já pode analisar seu chamado.", "success");
    });

    carregar().catch((error) => { console.error(error); App.mostrarErroPagina(`Não foi possível carregar o suporte: ${App.mensagemErro(error)}`); });
})();
