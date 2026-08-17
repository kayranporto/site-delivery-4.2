"use strict";

(() => {
  if (!/entregador\.html$/i.test(location.pathname)) return;

  const card = document.getElementById("driverPushCard");
  const botao = document.getElementById("ativarPushEntregador");
  const status = document.getElementById("driverPushStatus");
  if (!card || !botao || !status) return;

  async function atualizarEstado() {
    card.classList.remove("is-active", "is-blocked");
    botao.disabled = false;

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      card.classList.add("is-blocked");
      status.textContent = "Este navegador não oferece Web Push.";
      botao.textContent = "Alertas indisponíveis";
      botao.disabled = true;
      return;
    }

    if (Notification.permission === "denied") {
      card.classList.add("is-blocked");
      status.textContent = "Permissão bloqueada nas configurações do navegador.";
      botao.textContent = "Notificações bloqueadas";
      botao.disabled = true;
      return;
    }

    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const subscription = await registro?.pushManager?.getSubscription?.();
      if (Notification.permission === "granted" && subscription) {
        card.classList.add("is-active");
        status.textContent = "Ativo neste dispositivo";
        botao.textContent = "Alertas ativados";
        botao.disabled = true;
        return;
      }
    } catch {
      // O botão abaixo permite repetir o registro.
    }

    status.textContent = "Necessário para receber ofertas com o painel em segundo plano.";
    botao.textContent = Notification.permission === "granted" ? "Concluir ativação" : "Ativar notificações";
  }

  botao.addEventListener("click", async () => {
    botao.disabled = true;
    botao.textContent = "Ativando...";
    const ativar = window.AtivarPushNotificacoes;
    if (typeof ativar !== "function") {
      status.textContent = "O módulo de notificações ainda está carregando. Tente novamente.";
      botao.disabled = false;
      botao.textContent = "Ativar notificações";
      return;
    }
    await ativar();
    await atualizarEstado();
  });

  window.addEventListener("multi-delivery:push-state", atualizarEstado);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizarEstado(); });
  setTimeout(atualizarEstado, 500);
})();
