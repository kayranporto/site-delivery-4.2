"use strict";

(() => {
  if (!/entregador\.html$/i.test(location.pathname)) return;

  const dinheiro = (valor) => window.App?.dinheiro?.(Number(valor || 0)) || Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataHora = (valor) => {
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  };

  let carregando = false;
  let offset = 0;
  const limite = 20;
  let timerAtualizacao = 0;

  function criar(tag, classe = "", texto = "") {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== "") el.textContent = texto;
    return el;
  }

  function montarSecao() {
    if (document.getElementById("driverEarnings")) return document.getElementById("driverEarnings");
    const app = document.getElementById("entregadorApp");
    const metricas = app?.querySelector(".driver-metrics");
    if (!app || !metricas) return null;

    const secao = criar("section", "driver-section driver-earnings");
    secao.id = "driverEarnings";

    const topo = criar("div", "driver-section-title driver-earnings-title");
    const tituloBox = criar("div");
    tituloBox.append(
      criar("span", "driver-kicker", "HISTÓRICO E GANHOS"),
      criar("h2", "", "Seu resumo de entregas"),
      criar("p", "", "Os ganhos usam o valor por entrega configurado pela administração e registrado quando você aceita a rota.")
    );
    const atualizar = criar("button", "driver-earnings-refresh", "↻ Atualizar");
    atualizar.type = "button";
    atualizar.addEventListener("click", () => carregarTudo(true));
    topo.append(tituloBox, atualizar);

    const resumo = criar("div", "driver-earnings-grid");
    const cards = [
      ["Hoje", "ganhosHoje", "entregasHoje"],
      ["Últimos 7 dias", "ganhosSeteDias", "entregasSeteDias"],
      ["Este mês", "ganhosMes", "entregasMes"],
      ["Valor por entrega", "valorPorEntrega", "tarifaNota"]
    ];
    cards.forEach(([rotulo, valorId, detalheId]) => {
      const card = criar("article", "driver-earning-card");
      card.append(criar("small", "", rotulo));
      const valor = criar("strong", "", "R$ 0,00");
      valor.id = valorId;
      const detalhe = criar("span", "", rotulo === "Valor por entrega" ? "Tarifa atual" : "0 entregas");
      detalhe.id = detalheId;
      card.append(valor, detalhe);
      resumo.append(card);
    });

    const nota = criar("div", "driver-earnings-note");
    nota.id = "driverEarningsNote";
    nota.setAttribute("role", "status");
    nota.textContent = "Carregando informações financeiras...";

    const historicoTopo = criar("div", "driver-history-heading");
    const historicoTexto = criar("div");
    historicoTexto.append(criar("h3", "", "Entregas concluídas"), criar("p", "", "O histórico não mostra endereço ou telefone do cliente."));
    const total = criar("span", "driver-history-total", "0 entregas no histórico");
    total.id = "driverHistoryTotal";
    historicoTopo.append(historicoTexto, total);

    const lista = criar("div", "driver-history-list");
    lista.id = "driverHistoryList";
    lista.append(criar("p", "empty", "Carregando histórico..."));

    const mais = criar("button", "driver-history-more", "Carregar mais");
    mais.id = "driverHistoryMore";
    mais.type = "button";
    mais.hidden = true;
    mais.addEventListener("click", () => carregarHistorico(false));

    secao.append(topo, resumo, nota, historicoTopo, lista, mais);
    metricas.insertAdjacentElement("afterend", secao);
    return secao;
  }

  function pluralEntregas(total) {
    const n = Number(total || 0);
    return `${n} ${n === 1 ? "entrega" : "entregas"}`;
  }

  async function carregarResumo() {
    const { data, error } = await window.db.rpc("entregador_meu_resumo_ganhos");
    if (error) throw error;
    if (!data?.cadastrado) return false;

    document.getElementById("ganhosHoje").textContent = dinheiro(data.hoje_ganhos);
    document.getElementById("entregasHoje").textContent = pluralEntregas(data.hoje_entregas);
    document.getElementById("ganhosSeteDias").textContent = dinheiro(data.sete_dias_ganhos);
    document.getElementById("entregasSeteDias").textContent = pluralEntregas(data.sete_dias_entregas);
    document.getElementById("ganhosMes").textContent = dinheiro(data.mes_ganhos);
    document.getElementById("entregasMes").textContent = pluralEntregas(data.mes_entregas);
    document.getElementById("valorPorEntrega").textContent = dinheiro(data.valor_por_entrega);
    document.getElementById("tarifaNota").textContent = "Aplicada a novas rotas aceitas";
    document.getElementById("driverHistoryTotal").textContent = `${pluralEntregas(data.total_entregas)} • ${dinheiro(data.total_ganhos)} acumulados`;

    const nota = document.getElementById("driverEarningsNote");
    if (Number(data.valor_por_entrega || 0) <= 0) {
      nota.dataset.tipo = "warning";
      nota.textContent = "Sua tarifa por entrega ainda não foi configurada. Rotas aceitas enquanto ela estiver em R$ 0,00 ficam registradas com esse valor.";
    } else {
      nota.dataset.tipo = "info";
      nota.textContent = "O valor fica congelado no aceite da rota. Alterações futuras da tarifa não mudam entregas anteriores.";
    }
    return true;
  }

  function renderHistorico(itens, anexar = false) {
    const lista = document.getElementById("driverHistoryList");
    if (!lista) return;
    if (!anexar) lista.replaceChildren();

    if (!itens.length && !anexar) {
      lista.append(criar("p", "empty", "Você ainda não possui entregas concluídas no histórico."));
      return;
    }

    itens.forEach((item) => {
      const card = criar("article", "driver-history-item");
      const principal = criar("div", "driver-history-main");
      principal.append(
        criar("strong", "", `Pedido #${item.numero}`),
        criar("span", "", item.empresa_nome || "Restaurante"),
        criar("small", "", dataHora(item.entregue_em))
      );
      const meta = criar("div", "driver-history-meta");
      if (item.distancia_km !== null && item.distancia_km !== undefined) meta.append(criar("span", "", `${Number(item.distancia_km).toFixed(2)} km`));
      const ganho = criar("div", "driver-history-value");
      ganho.append(criar("small", "", "Ganho registrado"), criar("strong", "", dinheiro(item.valor)));
      card.append(principal, meta, ganho);
      lista.append(card);
    });
  }

  async function carregarHistorico(reiniciar = true) {
    const botao = document.getElementById("driverHistoryMore");
    if (reiniciar) offset = 0;
    if (botao) botao.disabled = true;
    const atual = offset;
    try {
      const { data, error } = await window.db.rpc("entregador_meu_historico_ganhos", { p_limite: limite, p_offset: atual });
      if (error) throw error;
      const itens = Array.isArray(data) ? data : [];
      renderHistorico(itens, atual > 0);
      offset += itens.length;
      if (botao) botao.hidden = itens.length < limite;
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  async function carregarTudo(forcar = false) {
    if (carregando) return;
    carregando = true;
    const secao = montarSecao();
    try {
      const { data: auth } = await window.db.auth.getUser();
      if (!auth?.user) {
        if (secao) secao.hidden = true;
        return;
      }
      const cadastrado = await carregarResumo();
      if (!cadastrado) {
        if (secao) secao.hidden = true;
        return;
      }
      if (secao) secao.hidden = false;
      await carregarHistorico(true);
      if (forcar) window.AppToast?.("Ganhos atualizados", "Resumo e histórico foram atualizados.", "success");
    } catch (erro) {
      console.warn("Histórico e ganhos do entregador:", erro);
      const nota = document.getElementById("driverEarningsNote");
      if (nota) {
        nota.dataset.tipo = "error";
        nota.textContent = "Não foi possível carregar os ganhos agora. Tente atualizar novamente.";
      }
    } finally {
      carregando = false;
    }
  }

  function agendarAtualizacao() {
    clearTimeout(timerAtualizacao);
    timerAtualizacao = setTimeout(() => carregarTudo(false), 700);
  }

  async function iniciar() {
    for (let i = 0; i < 120; i += 1) {
      if (document.getElementById("entregadorApp") && window.db) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    montarSecao();
    await carregarTudo(false);
    document.getElementById("atualizarEntregas")?.addEventListener("click", () => setTimeout(() => carregarTudo(false), 900));
    const rotas = document.getElementById("minhasEntregas");
    if (rotas) new MutationObserver(agendarAtualizacao).observe(rotas, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) agendarAtualizacao(); });
  }

  iniciar().catch((erro) => console.error("Financeiro do entregador 4.4.2:", erro));
})();
