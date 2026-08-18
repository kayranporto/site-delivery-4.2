"use strict";

(() => {
  if (!/entregador\.html$/i.test(location.pathname)) return;

  const STORAGE_PREFIX = "multi-delivery:entregador:onboarding:4.4.4:";
  const SESSION_SKIP = "multi-delivery:entregador:onboarding:skip";
  let usuarioId = "";
  let painel = null;
  let localizacaoConfirmada = false;
  let atualizando = false;

  const criar = (tag, classe, texto) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function chaveConcluido() {
    return `${STORAGE_PREFIX}${usuarioId || "anon"}`;
  }

  async function estadoLocalizacao() {
    if (!("geolocation" in navigator)) {
      return { done: false, warning: true, text: "Localização indisponível neste dispositivo." };
    }

    if (navigator.permissions?.query) {
      try {
        const permissao = await navigator.permissions.query({ name: "geolocation" });
        if (permissao.state === "granted") return { done: true, text: "Localização permitida." };
        if (permissao.state === "denied") return { done: false, warning: true, text: "Localização bloqueada no navegador." };
      } catch {
        // Alguns navegadores não expõem geolocation via Permissions API.
      }
    }

    const status = document.getElementById("statusLocalizacao")?.textContent || "";
    if (localizacaoConfirmada || /disponível|compartilhando|conectando/i.test(status)) {
      return { done: true, text: "Localização permitida." };
    }
    return { done: false, text: "Permita o GPS para receber ofertas próximas." };
  }

  async function estadoPush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { done: false, warning: true, text: "Web Push não é suportado neste navegador." };
    }
    if (Notification.permission === "denied") {
      return { done: false, warning: true, text: "Notificações bloqueadas nas configurações do navegador." };
    }
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const assinatura = await registro?.pushManager?.getSubscription?.();
      if (Notification.permission === "granted" && assinatura) {
        return { done: true, text: "Notificações ativas neste dispositivo." };
      }
    } catch {
      // Mantém o passo disponível para nova tentativa.
    }
    return { done: false, text: "Ative para receber novas entregas em segundo plano." };
  }

  function estadoOnline() {
    const controle = document.getElementById("entregadorOnline");
    return controle?.checked
      ? { done: true, text: "Você está online e disponível." }
      : { done: false, text: "Fique online para entrar na distribuição de entregas." };
  }

  function atualizarPasso(indice, estado, textoBotao) {
    const passo = painel?.querySelector(`[data-onboarding-step="${indice}"]`);
    const botao = passo?.querySelector("button");
    const status = passo?.querySelector("[data-step-state]");
    if (!passo || !botao || !status) return;

    passo.classList.toggle("is-done", Boolean(estado.done));
    passo.classList.toggle("is-warning", Boolean(estado.warning) && !estado.done);
    status.textContent = estado.text;
    botao.disabled = Boolean(estado.done) || (Boolean(estado.warning) && indice === 2 && Notification?.permission === "denied");
    botao.textContent = estado.done ? "Concluído" : textoBotao;
  }

  async function atualizar() {
    if (!painel || atualizando) return;
    atualizando = true;
    try {
      const [localizacao, push] = await Promise.all([estadoLocalizacao(), estadoPush()]);
      const online = estadoOnline();

      atualizarPasso(1, localizacao, "Permitir localização");
      atualizarPasso(2, push, push.warning ? "Ver instrução" : "Ativar notificações");
      atualizarPasso(3, online, "Ficar online");

      const completos = [localizacao, push, online].filter((item) => item.done).length;
      const contador = painel.querySelector("[data-onboarding-progress]");
      if (contador) contador.textContent = `${completos}/3`;

      const rodape = painel.querySelector("[data-onboarding-footer]");
      if (completos === 3) {
        localStorage.setItem(chaveConcluido(), "1");
        painel.classList.add("is-complete");
        if (rodape) {
          rodape.className = "driver-onboarding-complete";
          rodape.textContent = "Tudo pronto. Você já pode receber ofertas de entrega.";
        }
        const fechar = painel.querySelector("[data-onboarding-close]");
        if (fechar) fechar.textContent = "Fechar";
      } else {
        painel.classList.remove("is-complete");
        if (rodape) {
          rodape.className = "";
          rodape.textContent = "Conclua os passos acima. O guia não altera pedidos nem aceita entregas automaticamente.";
        }
      }
    } finally {
      atualizando = false;
    }
  }

  async function solicitarLocalizacao(botao) {
    if (!("geolocation" in navigator)) return atualizar();
    botao.disabled = true;
    botao.textContent = "Solicitando...";
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => { localizacaoConfirmada = true; resolve(); },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 }
      );
    });
    await atualizar();
  }

  async function solicitarPush(botao) {
    if (Notification?.permission === "denied") {
      window.AppToast?.("Notificações bloqueadas", "Abra as configurações do navegador e permita notificações para este site.", "warning");
      return atualizar();
    }
    botao.disabled = true;
    botao.textContent = "Ativando...";
    const ativar = window.AtivarPushNotificacoes;
    if (typeof ativar !== "function") {
      window.AppToast?.("Alertas ainda carregando", "Aguarde alguns segundos e tente novamente.", "warning");
      botao.disabled = false;
      return atualizar();
    }
    await ativar();
    await esperar(350);
    await atualizar();
  }

  async function ficarOnline(botao) {
    const controle = document.getElementById("entregadorOnline");
    if (!controle || controle.disabled) {
      window.AppToast?.("Status indisponível", "Aguarde o painel terminar de carregar e tente novamente.", "warning");
      return atualizar();
    }
    if (!controle.checked) {
      botao.disabled = true;
      botao.textContent = "Entrando online...";
      controle.click();
      for (let i = 0; i < 12; i += 1) {
        await esperar(250);
        if (!controle.disabled) break;
      }
    }
    await atualizar();
  }

  function montar() {
    if (painel || localStorage.getItem(chaveConcluido()) === "1" || sessionStorage.getItem(SESSION_SKIP) === "1") return;
    const app = document.getElementById("entregadorApp");
    const hero = app?.querySelector(".driver-hero");
    if (!app || !hero) return;

    painel = criar("section", "driver-onboarding");
    painel.id = "driverOnboarding";
    painel.setAttribute("aria-labelledby", "driverOnboardingTitle");

    const header = criar("div", "driver-onboarding-header");
    const copy = criar("div");
    copy.append(criar("span", "driver-kicker", "PRIMEIROS PASSOS"));
    const titulo = criar("h2", "", "Prepare seu celular para receber entregas");
    titulo.id = "driverOnboardingTitle";
    copy.append(titulo, criar("p", "", "Faça esta configuração uma vez. O painel acompanha o progresso automaticamente."));
    const fechar = criar("button", "driver-onboarding-close", "Agora não");
    fechar.type = "button";
    fechar.dataset.onboardingClose = "1";
    fechar.addEventListener("click", () => {
      if (painel?.classList.contains("is-complete")) localStorage.setItem(chaveConcluido(), "1");
      else sessionStorage.setItem(SESSION_SKIP, "1");
      painel.hidden = true;
    });
    header.append(copy, fechar);

    const progresso = criar("div", "driver-onboarding-progress");
    progresso.append(criar("span", "", "Progresso"));
    const valor = criar("strong", "", "0/3");
    valor.dataset.onboardingProgress = "1";
    progresso.append(valor);
    copy.append(progresso);

    const lista = criar("ol", "driver-onboarding-list");
    const passos = [
      [1, "Localização", "Usada para encontrar entregas próximas.", "Permitir localização", solicitarLocalizacao],
      [2, "Notificações", "Avisa quando surgir uma nova oportunidade.", "Ativar notificações", solicitarPush],
      [3, "Ficar online", "Coloca você na fila automática de distribuição.", "Ficar online", ficarOnline]
    ];

    passos.forEach(([numero, tituloPasso, descricao, acao, handler]) => {
      const li = criar("li", "driver-onboarding-step");
      li.dataset.onboardingStep = String(numero);
      li.append(criar("span", "driver-onboarding-number", String(numero)));
      const texto = criar("div", "driver-onboarding-copy");
      texto.append(criar("strong", "", tituloPasso), criar("small", "", descricao));
      const estado = criar("span", "driver-onboarding-state", "Verificando...");
      estado.dataset.stepState = "1";
      texto.append(estado);
      const botao = criar("button", "driver-onboarding-action", acao);
      botao.type = "button";
      botao.addEventListener("click", () => handler(botao));
      li.append(texto, botao);
      lista.append(li);
    });

    const footer = criar("div", "driver-onboarding-footer");
    const mensagem = criar("p", "", "Conclua os passos acima para receber entregas com mais segurança.");
    mensagem.dataset.onboardingFooter = "1";
    footer.append(mensagem);

    painel.append(header, lista, footer);
    hero.insertAdjacentElement("afterend", painel);

    document.getElementById("entregadorOnline")?.addEventListener("change", () => setTimeout(atualizar, 450));
    window.addEventListener("multi-delivery:push-state", () => setTimeout(atualizar, 100));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizar(); });
    const statusLocalizacao = document.getElementById("statusLocalizacao");
    if (statusLocalizacao) new MutationObserver(() => atualizar()).observe(statusLocalizacao, { childList: true, subtree: true });

    atualizar();
  }

  async function iniciar() {
    for (let i = 0; i < 100; i += 1) {
      if (window.db && document.getElementById("entregadorApp")) break;
      await esperar(80);
    }
    if (!window.db) return;
    try {
      const { data } = await window.db.auth.getUser();
      usuarioId = data?.user?.id || "";
    } catch {
      usuarioId = "";
    }
    montar();
  }

  iniciar().catch((erro) => console.error("Onboarding entregador 4.4.4:", erro));
})();
