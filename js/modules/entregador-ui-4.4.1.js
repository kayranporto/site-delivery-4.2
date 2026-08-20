"use strict";

(() => {
  if (!/entregador\.html$/i.test(location.pathname)) return;

  const app = document.getElementById("entregadorApp");
  const online = document.getElementById("entregadorOnline");
  const localizacao = document.getElementById("statusLocalizacao");
  const minhas = document.getElementById("minhasEntregas");
  const disponiveis = document.getElementById("entregasDisponiveis");
  const atualizar = document.getElementById("atualizarEntregas");
  if (!app || !online || !minhas || !disponiveis) return;

  const livebar = document.createElement("section");
  livebar.className = "driver-livebar";
  livebar.setAttribute("aria-label", "Status da operação");

  function itemStatus(rotulo, id) {
    const item = document.createElement("div");
    item.className = "driver-livebar-item";
    const dot = document.createElement("span");
    dot.className = "driver-livebar-dot";
    dot.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    copy.className = "driver-livebar-copy";
    const small = document.createElement("small");
    small.textContent = rotulo;
    const strong = document.createElement("strong");
    strong.id = id;
    strong.textContent = "Verificando...";
    copy.append(small, strong);
    item.append(dot, copy);
    return item;
  }

  const itemConexao = itemStatus("Conexão", "driverConexao441");
  const itemGps = itemStatus("GPS", "driverGps441");
  const botaoAtualizar = document.createElement("button");
  botaoAtualizar.className = "driver-livebar-refresh";
  botaoAtualizar.type = "button";
  botaoAtualizar.textContent = "↻ Atualizar entregas";
  livebar.append(itemConexao, itemGps, botaoAtualizar);

  const hero = app.querySelector(".driver-hero");
  if (hero) hero.insertAdjacentElement("afterend", livebar);
  else app.prepend(livebar);

  function atualizarConexao() {
    const strong = document.getElementById("driverConexao441");
    const dot = itemConexao.querySelector(".driver-livebar-dot");
    if (!strong || !dot) return;
    const conectado = navigator.onLine;
    strong.textContent = conectado ? (online.checked ? "Online e recebendo" : "Conectado • offline") : "Sem conexão";
    dot.classList.toggle("online", conectado && online.checked);
    dot.classList.toggle("warning", conectado && !online.checked);
    document.body.dataset.driverOnline = String(online.checked);
  }

  function atualizarGps() {
    const strong = document.getElementById("driverGps441");
    const dot = itemGps.querySelector(".driver-livebar-dot");
    if (!strong || !dot) return;
    const texto = String(localizacao?.textContent || "Desativada").trim();
    strong.textContent = texto;
    const ativo = /compartilhando|disponível/i.test(texto);
    const alerta = /permissão|indisponível|conectando/i.test(texto);
    dot.classList.toggle("online", ativo);
    dot.classList.toggle("warning", !ativo && alerta);
  }

  function marcarAcao(elemento, acao) {
    if (elemento && !elemento.dataset.driverAction) elemento.dataset.driverAction = acao;
  }

  function decorarAcoes(card) {
    card.querySelectorAll(".delivery-actions button, .delivery-actions a").forEach((acao) => {
      const texto = String(acao.textContent || "").trim().toLowerCase();
      if (texto.includes("whatsapp")) marcarAcao(acao, "whatsapp");
      else if (texto.includes("rota")) marcarAcao(acao, "route");
      else if (texto.includes("chat")) marcarAcao(acao, "chat");
      else if (texto.includes("iniciar")) marcarAcao(acao, "start");
      else if (texto.includes("confirmar entrega")) marcarAcao(acao, "finish");
      else if (texto.includes("aceitar")) marcarAcao(acao, "accept");
    });
  }

  function adicionarEyebrow(card, texto) {
    const titulo = card.querySelector("h3");
    if (!titulo || card.querySelector(".delivery-card-eyebrow")) return;
    const badge = document.createElement("span");
    badge.className = "delivery-card-eyebrow";
    badge.textContent = texto;
    titulo.before(badge);
  }

  function decorarCards() {
    const secaoAtiva = minhas.closest(".driver-section");
    if (secaoAtiva) secaoAtiva.dataset.driverSection = "active";

    minhas.querySelectorAll(".delivery-card").forEach((card) => {
      card.classList.add("delivery-card--active");
      const emRota = /em rota/i.test(card.querySelector(".status-chip")?.textContent || "");
      card.classList.toggle("delivery-card--route", emRota);
      adicionarEyebrow(card, emRota ? "Entrega em rota" : "Coleta pendente");
      decorarAcoes(card);
    });

    disponiveis.querySelectorAll(".delivery-card").forEach((card) => {
      card.classList.add("delivery-card--available");
      adicionarEyebrow(card, "Nova oportunidade");
      card.querySelectorAll(".delivery-meta span").forEach((span) => {
        if (/km/i.test(span.textContent || "")) span.classList.add("delivery-distance");
      });
      decorarAcoes(card);
    });
  }

  function atualizarTudo() {
    atualizarConexao();
    atualizarGps();
    decorarCards();
  }

  botaoAtualizar.addEventListener("click", () => {
    if (atualizar) atualizar.click();
    botaoAtualizar.disabled = true;
    botaoAtualizar.textContent = "Atualizando...";
    setTimeout(() => {
      botaoAtualizar.disabled = false;
      botaoAtualizar.textContent = "↻ Atualizar entregas";
      atualizarTudo();
    }, 900);
  });

  online.addEventListener("change", () => setTimeout(atualizarTudo, 80));
  addEventListener("online", atualizarConexao);
  addEventListener("offline", atualizarConexao);

  const observer = new MutationObserver(() => requestAnimationFrame(atualizarTudo));
  observer.observe(minhas, { childList: true, subtree: true });
  observer.observe(disponiveis, { childList: true, subtree: true });
  if (localizacao) observer.observe(localizacao, { childList: true, subtree: true, characterData: true });

  atualizarTudo();
})();
