"use strict";

(() => {
  if (!/restaurante\.html$/i.test(location.pathname)) return;

  let sequencia = 0;

  function metaAtual() {
    const meta = App.lerJSON("empresaAtual", null);
    return meta?.empresa_id && meta?.unidade_id ? meta : null;
  }

  function atualizarInfoEntrega(aberto) {
    const info = document.getElementById("infoEntrega");
    if (!info) return;
    const texto = String(info.textContent || "");
    if (/\s•\s(?:Aberto|Fechado)\s*$/.test(texto)) {
      info.textContent = texto.replace(/\s•\s(?:Aberto|Fechado)\s*$/, ` • ${aberto ? "Aberto" : "Fechado"}`);
    }
  }

  async function sincronizar(metaRecebida = null) {
    const meta = metaRecebida?.empresa_id && metaRecebida?.unidade_id ? metaRecebida : metaAtual();
    if (!meta) return;
    const atual = ++sequencia;
    const { data, error } = await window.db.rpc("empresa_disponibilidade_unidade", {
      p_empresa_id: String(meta.empresa_id),
      p_unidade_id: String(meta.unidade_id),
      p_quando: new Date().toISOString()
    });
    if (atual !== sequencia || error) return;

    const aberto = data?.aberto === true;
    const atualizado = { ...meta, status: aberto, unidade_aberta: aberto };
    App.salvarJSON("empresaAtual", atualizado);

    const badge = document.getElementById("statusBadge");
    if (badge) {
      badge.textContent = aberto ? "Aberto agora" : "Fechado";
      badge.classList.toggle("fechado", !aberto);
      badge.classList.toggle("aberta", aberto);
    }
    atualizarInfoEntrega(aberto);
  }

  window.addEventListener("empresa-carregada", (event) => {
    if (event.detail?.unidade_id) sincronizar(event.detail);
  });

  setTimeout(() => sincronizar(), 250);
})();
