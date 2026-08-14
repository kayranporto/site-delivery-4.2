"use strict";

(() => {
  if (!/acompanhamento\.html$/i.test(location.pathname)) return;

  function numeroWhatsApp(valor) {
    let numero = String(valor || "").replace(/\D/g, "");
    if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
    return /^55\d{10,11}$/.test(numero) ? numero : "";
  }

  function numeroPedido() {
    const candidatos = [
      document.getElementById("numeroPedido")?.textContent,
      document.querySelector(".order-number")?.textContent,
      document.querySelector("h1")?.textContent,
      document.title
    ].filter(Boolean).join(" ");
    return candidatos.match(/#?\s*(\d{1,12})/)?.[1] || "";
  }

  function instalar() {
    const telefone = document.getElementById("telefoneEmpresa");
    if (!telefone || telefone.dataset.whatsapp44 === "1") return false;
    const numero = numeroWhatsApp(telefone.getAttribute("href") || telefone.textContent);
    if (!numero) return false;

    telefone.dataset.whatsapp44 = "1";
    const link = document.createElement("a");
    link.className = telefone.className;
    link.id = "whatsappEmpresa44";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const pedido = numeroPedido();
    const mensagem = pedido
      ? `Olá! Estou entrando em contato sobre o pedido #${pedido} feito pela Multi Delivery.`
      : "Olá! Estou entrando em contato sobre um pedido feito pela Multi Delivery.";
    link.href = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
    link.textContent = "WhatsApp do restaurante";
    link.setAttribute("aria-label", pedido ? `Falar com o restaurante no WhatsApp sobre o pedido ${pedido}` : "Falar com o restaurante no WhatsApp");
    link.style.cssText = "display:inline-flex;align-items:center;justify-content:center;text-decoration:none";
    telefone.insertAdjacentElement("afterend", link);
    return true;
  }

  let tentativas = 0;
  const timer = setInterval(() => {
    tentativas += 1;
    if (instalar() || tentativas > 80) clearInterval(timer);
  }, 150);
})();
