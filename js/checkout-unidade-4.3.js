"use strict";

(() => {
  if (!/checkout\.html$/i.test(location.pathname) || !window.db?.rpc) return;

  const originalRpc = window.db.rpc.bind(window.db);
  let instalado = false;

  function metaCarrinho() {
    return window.CartStore?.meta?.() || App.lerJSON("carrinhoMeta", null) || null;
  }

  function instalarRoteamento() {
    if (instalado) return;
    instalado = true;
    window.db.rpc = function rpcComUnidade(nome, parametros = {}, opcoes) {
      const meta = metaCarrinho();
      if (!meta?.unidade_id) return originalRpc(nome, parametros, opcoes);

      if (nome === "calcular_entrega_empresa") {
        return originalRpc("calcular_entrega_unidade", {
          ...parametros,
          p_unidade_id: String(meta.unidade_id)
        }, opcoes);
      }

      if (nome === "empresa_disponibilidade") {
        return originalRpc("empresa_disponibilidade_unidade", {
          ...parametros,
          p_unidade_id: String(meta.unidade_id)
        }, opcoes);
      }

      if (nome === "criar_pedido_operacional") {
        return originalRpc("criar_pedido_operacional_unidade", {
          ...parametros,
          p_unidade_id: String(meta.unidade_id)
        }, opcoes);
      }

      return originalRpc(nome, parametros, opcoes);
    };
  }

  function mostrarUnidade() {
    const meta = metaCarrinho();
    if (!meta?.unidade_id || !meta?.unidade_nome || document.getElementById("checkoutUnidade43")) return;
    const alvo = document.querySelector(".resumo-pedido, .checkout-summary, #listaResumo")?.parentElement;
    if (!alvo) return;
    const aviso = document.createElement("div");
    aviso.id = "checkoutUnidade43";
    aviso.setAttribute("role", "status");
    aviso.style.cssText = "display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 13px;border:1px solid #e6e8ec;border-radius:12px;background:#f8f9fb;color:#454b56;font:600 11px Poppins,system-ui,sans-serif";
    const icone = document.createElement("span");
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = "⌂";
    icone.style.cssText = "display:grid;width:28px;height:28px;place-items:center;border-radius:9px;background:#fff0f1;color:#d71928;font-weight:800";
    const texto = document.createElement("span");
    texto.textContent = `Pedido da unidade: ${meta.unidade_nome}`;
    aviso.append(icone, texto);
    alvo.prepend(aviso);
  }

  instalarRoteamento();
  mostrarUnidade();
})();
