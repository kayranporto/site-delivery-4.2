"use strict";

(() => {
  if (!/entregador\.html$/i.test(location.pathname)) return;

  let timerPosicao = 0;
  let timerLista = 0;
  let buscando = false;
  let ultimaPosicaoEm = 0;
  let focoAplicado = false;
  const ofertaFoco = new URLSearchParams(location.search).get("oferta");

  const toast = (titulo, mensagem = "", tipo = "info") => {
    if (window.AppToast) window.AppToast(titulo, mensagem, tipo);
    else console[tipo === "error" ? "error" : "log"](titulo, mensagem);
  };
  const dinheiro = (valor) => window.App?.dinheiro?.(valor) || Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBr = (valor) => valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

  function online() {
    return document.getElementById("entregadorOnline")?.checked === true;
  }

  function telefoneWhatsApp(valor) {
    let numero = String(valor || "").replace(/\D/g, "");
    if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
    if (!/^55\d{10,11}$/.test(numero)) return "";
    return numero;
  }

  function obterPosicao() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocalização indisponível."));
      navigator.geolocation.getCurrentPosition(
        (posicao) => resolve(posicao.coords),
        (erro) => reject(new Error(erro.code === 1 ? "Permissão de localização negada." : "Não foi possível atualizar sua posição.")),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 }
      );
    });
  }

  async function atualizarPosicao(silencioso = true) {
    if (!online() || document.hidden) return false;
    try {
      const coords = await obterPosicao();
      const { error } = await window.db.rpc("entregador_atualizar_posicao", {
        p_latitude: coords.latitude,
        p_longitude: coords.longitude,
        p_precisao_metros: Number.isFinite(coords.accuracy) ? coords.accuracy : null
      });
      if (error) throw error;
      ultimaPosicaoEm = Date.now();
      const status = document.getElementById("statusLocalizacao");
      if (status && !document.querySelector("#minhasEntregas .delivery-card")) status.textContent = "Disponível";
      return true;
    } catch (erro) {
      if (!silencioso) toast("Localização não atualizada", erro?.message || "Tente novamente.", "warning");
      return false;
    }
  }

  async function aceitarPedido(item, botao) {
    botao.disabled = true;
    const texto = botao.textContent;
    botao.textContent = "Aceitando...";
    const { data, error } = await window.db.rpc("entregador_aceitar_pedido", { p_pedido_id: item.pedido_id });
    if (error || data !== true) {
      botao.disabled = false;
      botao.textContent = texto;
      return toast("Não foi possível aceitar", error?.message || "A entrega já foi aceita ou esta oferta expirou.", "error");
    }
    toast("Entrega aceita", `Pedido #${item.numero} agora está na sua rota.`, "success");
    if (ofertaFoco === String(item.pedido_id)) history.replaceState(null, "", location.pathname);
    document.getElementById("atualizarEntregas")?.click();
    setTimeout(() => {
      carregarProximidade();
      adicionarWhatsAppAtivos();
    }, 700);
  }

  function renderProximidade(itens) {
    const container = document.getElementById("entregasDisponiveis");
    if (!container) return;
    document.getElementById("totalDisponiveis").textContent = String(itens.length);
    container.replaceChildren();
    if (!itens.length) {
      const vazio = document.createElement("p");
      vazio.className = "empty";
      vazio.textContent = "Nenhuma entrega disponível agora.";
      container.append(vazio);
      return;
    }

    itens.forEach((item) => {
      const card = document.createElement("article");
      const focada = ofertaFoco && String(item.pedido_id) === ofertaFoco;
      card.className = `delivery-card available-card${focada ? " push-target" : ""}`;
      card.dataset.pedidoId = item.pedido_id;

      const topo = document.createElement("div");
      topo.className = "delivery-top";
      const tituloBox = document.createElement("div");
      const titulo = document.createElement("h3");
      titulo.textContent = `#${item.numero} • ${item.restaurante || "Restaurante"}`;
      const unidade = document.createElement("small");
      unidade.textContent = item.unidade_nome ? `Coleta em ${item.unidade_nome}` : "Coleta na unidade principal";
      tituloBox.append(titulo, unidade);
      const status = document.createElement("span");
      status.className = "delivery-status waiting";
      status.textContent = focada ? "Nova oferta" : "Disponível";
      topo.append(tituloBox, status);

      const meta = document.createElement("div");
      meta.className = "delivery-meta";
      const ganho = Number(item.ganho_entregador || 0);
      const valores = [
        `📍 ${item.bairro || "Região protegida"}`,
        `💳 ${item.pagamento || "Pagamento"}`,
        ganho > 0 ? `💵 Ganho ${dinheiro(ganho)}` : "💵 Ganho a definir"
      ];
      if (item.distancia_coleta_km !== null && item.distancia_coleta_km !== undefined) valores.push(`⌖ ${Number(item.distancia_coleta_km).toFixed(2)} km até a coleta`);
      else valores.push("⌖ Distância da coleta indisponível");
      if (item.distancia_entrega_km !== null && item.distancia_entrega_km !== undefined) valores.push(`↗ ${Number(item.distancia_entrega_km).toFixed(2)} km estimados até o cliente`);
      if (item.agendado_para) valores.push(`🕒 Agendado ${dataBr(item.agendado_para)}`);
      valores.forEach((texto) => { const span = document.createElement("span"); span.textContent = texto; meta.append(span); });

      const acoes = document.createElement("div");
      acoes.className = "delivery-actions";
      const aceitar = document.createElement("button");
      aceitar.type = "button";
      aceitar.className = "driver-primary";
      aceitar.textContent = ganho > 0 ? `Aceitar por ${dinheiro(ganho)}` : "Aceitar entrega";
      aceitar.addEventListener("click", () => aceitarPedido(item, aceitar));
      acoes.append(aceitar);
      card.append(topo, meta, acoes);
      container.append(card);

      if (focada && !focoAplicado) {
        focoAplicado = true;
        requestAnimationFrame(() => card.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
    });
  }

  async function carregarProximidade() {
    if (!online() || buscando) return;
    buscando = true;
    try {
      if (!ultimaPosicaoEm || Date.now() - ultimaPosicaoEm > 45000) await atualizarPosicao(true);
      const { data, error } = await window.db.rpc("listar_entregas_disponiveis_proximidade");
      if (error) throw error;
      renderProximidade(Array.isArray(data) ? data : []);
    } catch (erro) {
      console.warn("Proximidade logística:", erro);
    } finally {
      buscando = false;
    }
  }

  async function adicionarWhatsAppAtivos() {
    const container = document.getElementById("minhasEntregas");
    if (!container || !container.querySelector(".delivery-card")) return;
    const { data: auth } = await window.db.auth.getUser();
    if (!auth?.user) return;
    const { data, error } = await window.db.from("pedidos")
      .select("id,numero,cliente_nome,cliente_telefone,status")
      .eq("entregador_id", auth.user.id)
      .in("status", ["preparando", "saiu_para_entrega"])
      .order("created_at");
    if (error) return;

    (data || []).forEach((pedido) => {
      const numero = telefoneWhatsApp(pedido.cliente_telefone);
      if (!numero) return;
      const card = [...container.querySelectorAll(".delivery-card")].find((item) => item.querySelector("h3")?.textContent?.includes(`#${pedido.numero}`));
      const acoes = card?.querySelector(".delivery-actions");
      if (!acoes || acoes.querySelector(".whatsapp44")) return;
      const link = document.createElement("a");
      link.className = "driver-secondary whatsapp44";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const mensagem = `Olá${pedido.cliente_nome ? `, ${pedido.cliente_nome}` : ""}. Sou o entregador do pedido #${pedido.numero} da Multi Delivery. Estou entrando em contato sobre a sua entrega.`;
      link.href = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
      link.textContent = "WhatsApp cliente";
      link.style.cssText = "display:inline-flex;align-items:center;justify-content:center;text-decoration:none";
      acoes.append(link);
    });
  }

  function iniciarTimers() {
    clearInterval(timerPosicao);
    clearInterval(timerLista);
    if (!online()) return;
    atualizarPosicao(false).then(() => carregarProximidade());
    timerPosicao = setInterval(() => atualizarPosicao(true), 30000);
    timerLista = setInterval(() => {
      carregarProximidade();
      adicionarWhatsAppAtivos();
    }, 20000);
  }

  async function iniciar() {
    for (let i = 0; i < 120; i += 1) {
      const seletor = document.getElementById("entregadorOnline");
      if (seletor) {
        seletor.addEventListener("change", () => setTimeout(iniciarTimers, 250));
        document.getElementById("atualizarEntregas")?.addEventListener("click", () => setTimeout(() => {
          carregarProximidade();
          adicionarWhatsAppAtivos();
        }, 600));
        const observer = new MutationObserver(() => setTimeout(adicionarWhatsAppAtivos, 80));
        const minhas = document.getElementById("minhasEntregas");
        if (minhas) observer.observe(minhas, { childList: true, subtree: true });
        document.addEventListener("visibilitychange", () => { if (!document.hidden && online()) iniciarTimers(); });
        if (online()) iniciarTimers();
        setTimeout(adicionarWhatsAppAtivos, 900);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  iniciar().catch((erro) => console.error("Logística do entregador 4.4.3:", erro));
})();
