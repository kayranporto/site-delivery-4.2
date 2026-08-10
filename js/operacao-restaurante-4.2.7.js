"use strict";
(() => {
  if (!document.getElementById("pedidosEmpresa")) return;

  const tempos = [15, 20, 25, 30, 35, 40, 45, 60, 90];
  let historicoCarregado = false;
  let observadorPausado = false;

  function listaPedidosAtual() {
    try { return Array.isArray(pedidos) ? pedidos : []; } catch { return []; }
  }

  function empresaAtual() {
    try { return empresa || null; } catch { return null; }
  }

  function executar(pedido, acao, botao, preparo = null, observacao = null) {
    try {
      return Promise.resolve(executarAcaoOperacional(pedido, acao, botao, preparo, observacao));
    } catch (error) {
      console.error("Operação 4.2.7:", error);
      return Promise.resolve(false);
    }
  }

  function hoje(pedido) {
    const data = new Date(pedido?.created_at || 0);
    const agora = new Date();
    return Number.isFinite(data.getTime())
      && data.getFullYear() === agora.getFullYear()
      && data.getMonth() === agora.getMonth()
      && data.getDate() === agora.getDate();
  }

  function criarResumo() {
    if (document.getElementById("operacao427Resumo")) return;
    const secao = document.getElementById("pedidos");
    const filtros = secao?.querySelector(".order-filters");
    if (!secao || !filtros) return;

    const resumo = document.createElement("section");
    resumo.id = "operacao427Resumo";
    resumo.className = "operacao-427-resumo";
    resumo.setAttribute("aria-label", "Resumo operacional de hoje");
    resumo.innerHTML = `
      <article><small>Aguardando aceite</small><strong id="op427Recebidos">0</strong><span>pedidos novos</span></article>
      <article><small>Em preparo</small><strong id="op427Preparo">0</strong><span id="op427Atrasados">0 atrasados</span></article>
      <article><small>Prontos</small><strong id="op427Prontos">0</strong><span>aguardando retirada</span></article>
      <article><small>Entregues hoje</small><strong id="op427Entregues">0</strong><span id="op427TempoMedio">0 min preparo médio</span></article>`;
    filtros.before(resumo);

    const historico = document.createElement("section");
    historico.className = "operacao-427-historico";
    historico.innerHTML = `
      <div class="operacao-427-historico-head">
        <div><small>HISTÓRICO OPERACIONAL</small><strong>Últimas ações da equipe</strong></div>
        <button id="op427AtualizarHistorico" type="button">Atualizar</button>
      </div>
      <div id="op427HistoricoLista" class="operacao-427-historico-lista"><p>Carregando histórico...</p></div>`;
    secao.append(historico);
    document.getElementById("op427AtualizarHistorico")?.addEventListener("click", () => carregarHistorico(true));
  }

  function atualizarResumo() {
    criarResumo();
    const lista = listaPedidosAtual();
    const recebidos = lista.filter((p) => p.status === "recebido").length;
    const preparando = lista.filter((p) => p.status === "preparando" && !p.pronto_em).length;
    const prontos = lista.filter((p) => p.status === "preparando" && Boolean(p.pronto_em)).length;
    const atrasados = lista.filter((p) => {
      try { return typeof pedidoAtrasado === "function" && pedidoAtrasado(p); } catch { return false; }
    }).length;
    const entreguesHoje = lista.filter((p) => p.status === "entregue" && hoje(p));
    const temposValidos = lista.filter((p) => p.preparo_iniciado_em && p.pronto_em && hoje(p)).map((p) => {
      const inicio = new Date(p.preparo_iniciado_em).getTime();
      const fim = new Date(p.pronto_em).getTime();
      return Math.max(0, Math.round((fim - inicio) / 60000));
    }).filter(Number.isFinite);
    const medio = temposValidos.length ? Math.round(temposValidos.reduce((a, b) => a + b, 0) / temposValidos.length) : 0;

    const set = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = String(valor); };
    set("op427Recebidos", recebidos);
    set("op427Preparo", preparando);
    set("op427Prontos", prontos);
    set("op427Entregues", entreguesHoje.length);
    set("op427Atrasados", `${atrasados} atrasado${atrasados === 1 ? "" : "s"}`);
    set("op427TempoMedio", `${medio} min preparo médio`);
  }

  function localizarPedido(card) {
    const numero = card.querySelector(".order-card-head strong")?.textContent?.replace(/^#/, "").trim();
    if (!numero) return null;
    return listaPedidosAtual().find((pedido) => String(pedido.numero || String(pedido.id).slice(0, 8)) === numero) || null;
  }

  function seletorTempo(pedido) {
    const select = document.createElement("select");
    select.className = "op427-tempo";
    select.setAttribute("aria-label", "Tempo estimado de preparo");
    const padrao = Number(pedido.preparo_estimado_minutos || empresaAtual()?.tempo_estimado_min || 30);
    tempos.forEach((tempo) => {
      const option = document.createElement("option");
      option.value = String(tempo);
      option.textContent = `${tempo} min`;
      option.selected = tempo === padrao;
      select.append(option);
    });
    if (![...select.options].some((o) => Number(o.value) === padrao)) {
      const option = document.createElement("option");
      option.value = String(Math.max(5, Math.min(240, padrao)));
      option.textContent = `${option.value} min`;
      option.selected = true;
      select.prepend(option);
    }
    return select;
  }

  function aprimorarCard(card) {
    if (card.dataset.operacao427 === "1") return;
    const pedido = localizarPedido(card);
    if (!pedido) return;
    card.dataset.operacao427 = "1";

    if (pedido.status === "preparando" && !pedido.pronto_em) {
      let atrasado = false;
      try { atrasado = typeof pedidoAtrasado === "function" && pedidoAtrasado(pedido); } catch { /* noop */ }
      const inicio = new Date(pedido.preparo_iniciado_em || pedido.created_at).getTime();
      if (Number.isFinite(inicio)) {
        const minutos = Math.max(0, Math.round((Date.now() - inicio) / 60000));
        const sla = document.createElement("div");
        sla.className = `op427-sla${atrasado ? " atrasado" : ""}`;
        sla.textContent = atrasado
          ? `Atrasado • ${minutos} min em preparo`
          : `${minutos} min em preparo • meta ${Number(pedido.preparo_estimado_minutos || 30)} min`;
        card.querySelector(".order-total-row")?.before(sla);
      }
    }

    if (pedido.status !== "recebido") return;
    const acoes = card.querySelector(".order-card-actions");
    if (!acoes) return;
    const principal = acoes.querySelector("button.order-action.primary");
    if (!principal || principal.disabled) return;

    const grupo = document.createElement("div");
    grupo.className = "op427-aceite";
    const select = seletorTempo(pedido);
    const aceitar = principal.cloneNode(true);
    aceitar.textContent = "Aceitar pedido";
    aceitar.removeAttribute("disabled");
    aceitar.addEventListener("click", async () => {
      const ok = await executar(pedido, "iniciar_preparo", aceitar, Number(select.value));
      if (ok) {
        window.AppToast?.("Pedido aceito", `Preparo estimado em ${select.value} minutos.`, "success");
        carregarHistorico(true);
      }
    });
    grupo.append(select, aceitar);
    principal.replaceWith(grupo);

    const cancelar = acoes.querySelector("button.order-action.cancel");
    if (cancelar) {
      const recusar = cancelar.cloneNode(true);
      recusar.className = "order-action op427-recusar";
      recusar.textContent = "Recusar";
      recusar.setAttribute("aria-label", "Recusar pedido");
      recusar.addEventListener("click", async () => {
        const motivo = prompt("Motivo da recusa (obrigatório):", "Item indisponível");
        if (!motivo?.trim()) return;
        if (!confirm(`Recusar o pedido #${pedido.numero || ""}?`)) return;
        const ok = await executar(pedido, "recusar_pedido", recusar, null, motivo.trim().slice(0, 500));
        if (ok) {
          window.AppToast?.("Pedido recusado", "A ação foi registrada no histórico operacional.", "info");
          carregarHistorico(true);
        }
      });
      cancelar.replaceWith(recusar);
    } else if (pedido.pagamento_status === "pago") {
      const aviso = document.createElement("span");
      aviso.className = "op427-pago-aviso";
      aviso.textContent = "Pago: cancelamento exige reembolso";
      acoes.append(aviso);
    }
  }

  function aprimorarCards() {
    if (observadorPausado) return;
    document.querySelectorAll("#pedidosEmpresa .order-card").forEach(aprimorarCard);
    atualizarResumo();
  }

  function nomeAcao(acao) {
    return ({
      iniciar_preparo: "Pedido aceito",
      recusar_pedido: "Pedido recusado",
      marcar_pronto: "Marcado como pronto",
      reabrir_preparo: "Preparo reaberto",
      enviar_entrega: "Enviado para entrega",
      confirmar_entrega: "Entrega confirmada",
      definir_prioridade: "Prioridade alterada"
    })[acao] || String(acao || "Ação operacional").replaceAll("_", " ");
  }

  async function carregarHistorico(forcar = false) {
    if (historicoCarregado && !forcar) return;
    const box = document.getElementById("op427HistoricoLista");
    const emp = empresaAtual();
    if (!box || !emp?.id || !window.db) return;
    if (forcar) box.innerHTML = "<p>Atualizando histórico...</p>";
    const { data, error } = await window.db.from("pedido_operacao_eventos")
      .select("id,pedido_id,acao,status_anterior,status_novo,preparo_estimado_minutos,observacao,created_at")
      .eq("empresa_id", String(emp.id))
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) {
      box.innerHTML = "<p>Histórico operacional temporariamente indisponível.</p>";
      return;
    }
    historicoCarregado = true;
    box.replaceChildren();
    if (!data?.length) {
      const p = document.createElement("p");
      p.textContent = "As ações realizadas a partir da 4.2.7 aparecerão aqui.";
      box.append(p);
      return;
    }
    data.forEach((evento) => {
      const linha = document.createElement("article");
      const titulo = document.createElement("strong");
      titulo.textContent = nomeAcao(evento.acao);
      const meta = document.createElement("small");
      const pedido = listaPedidosAtual().find((p) => String(p.id) === String(evento.pedido_id));
      const numero = pedido?.numero ? `Pedido #${pedido.numero}` : `Pedido ${String(evento.pedido_id).slice(0, 8)}`;
      meta.textContent = `${numero} • ${new Date(evento.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
      const detalhe = document.createElement("span");
      const partes = [];
      if (evento.preparo_estimado_minutos) partes.push(`${evento.preparo_estimado_minutos} min`);
      if (evento.observacao) partes.push(evento.observacao);
      detalhe.textContent = partes.join(" • ") || `${evento.status_anterior || "—"} → ${evento.status_novo || "—"}`;
      linha.append(titulo, meta, detalhe);
      box.append(linha);
    });
  }

  function iniciar() {
    criarResumo();
    aprimorarCards();
    setTimeout(() => carregarHistorico(false), 1200);
    const alvo = document.getElementById("pedidosEmpresa");
    if (alvo) {
      const observer = new MutationObserver(() => {
        observadorPausado = true;
        queueMicrotask(() => {
          observadorPausado = false;
          aprimorarCards();
        });
      });
      observer.observe(alvo, { childList: true, subtree: true });
    }
    setInterval(atualizarResumo, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
})();
