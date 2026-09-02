"use strict";

(() => {
  if (!/empresa-dashboard\.html$/i.test(location.pathname)) return;

  const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  let horarios = [];
  let pausas = [];
  let regioes = [];
  let unidadeId = "";
  let empresaId = "";
  let iniciado = false;

  const $ = (id) => document.getElementById(id);
  const criar = (tag, classe, texto) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const toast = (titulo, mensagem = "", tipo = "info") => window.AppToast?.(titulo, mensagem, tipo);
  const mensagemErro = (erro) => window.App?.mensagemErro?.(erro) || erro?.message || String(erro || "Tente novamente.");
  const dataBr = (valor) => new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  function unidadeSelecionada() {
    const select = $("unidadePainelSelect");
    if (select?.value) return String(select.value);
    if (!empresaId) return "";
    return localStorage.getItem(`multiDeliveryUnidadeAtiva:${empresaId}`) || "";
  }

  function nomeUnidade() {
    const select = $("unidadePainelSelect");
    return select?.selectedOptions?.[0]?.textContent?.replace(/\s*•\s*Principal\s*$/, "") || "unidade selecionada";
  }

  function garantirIndicador() {
    const secao = $("operacao");
    if (!secao || $("operacaoUnidade43")) return;
    const alvo = secao.querySelector(".section-heading, .dashboard-section-header, .management-header") || secao.firstElementChild;
    const badge = criar("div", "operation-unit-badge");
    badge.id = "operacaoUnidade43";
    badge.setAttribute("role", "status");
    badge.style.cssText = "display:inline-flex;align-items:center;gap:8px;margin:0 0 16px;padding:9px 12px;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:var(--surface-soft,#f8f9fb);color:var(--ink,#4c535e);font:700 10px Poppins,system-ui,sans-serif";
    const icone = criar("span", "", "⌂");
    icone.setAttribute("aria-hidden", "true");
    icone.style.cssText = "display:grid;width:25px;height:25px;place-items:center;border-radius:8px;background:#fff0f1;color:#d71928";
    const texto = criar("span", "", "Operação da unidade selecionada");
    texto.id = "operacaoUnidadeNome43";
    badge.append(icone, texto);
    if (alvo) alvo.insertAdjacentElement("afterend", badge);
    else secao.prepend(badge);
  }

  function atualizarIndicador() {
    garantirIndicador();
    const texto = $("operacaoUnidadeNome43");
    if (texto) texto.textContent = `Operação: ${nomeUnidade()}`;
  }

  function renderizarHorarios() {
    const container = $("horariosEmpresa");
    if (!container) return;
    const mapa = new Map(horarios.map((item) => [Number(item.dia_semana), item]));
    container.replaceChildren(...DIAS.map((nome, dia) => {
      const atual = mapa.get(dia) || { dia_semana: dia, abre: "08:00:00", fecha: "22:00:00", ativo: dia !== 0 };
      const linha = criar("div", "hours-row");
      linha.dataset.dia = String(dia);
      const label = document.createElement("label");
      const ativo = document.createElement("input");
      ativo.type = "checkbox";
      ativo.checked = atual.ativo !== false;
      ativo.dataset.campo = "ativo";
      label.append(ativo, document.createTextNode(nome));
      const abre = document.createElement("input");
      abre.type = "time";
      abre.value = String(atual.abre || "08:00").slice(0, 5);
      abre.dataset.campo = "abre";
      abre.setAttribute("aria-label", `Abertura de ${nome}`);
      const fecha = document.createElement("input");
      fecha.type = "time";
      fecha.value = String(atual.fecha || "22:00").slice(0, 5);
      fecha.dataset.campo = "fecha";
      fecha.setAttribute("aria-label", `Fechamento de ${nome}`);
      linha.append(label, abre, fecha);
      return linha;
    }));
  }

  async function excluirPausa(pausa, botao) {
    botao.disabled = true;
    const { error } = await window.db.from("empresa_pausas")
      .delete()
      .eq("id", pausa.id)
      .eq("empresa_id", empresaId)
      .eq("unidade_id", unidadeId);
    botao.disabled = false;
    if (error) return toast("Não foi possível excluir a pausa", mensagemErro(error), "error");
    pausas = pausas.filter((item) => String(item.id) !== String(pausa.id));
    renderizarPausas();
    atualizarDisponibilidade();
  }

  function renderizarPausas() {
    const container = $("pausasEmpresa");
    if (!container) return;
    container.replaceChildren();
    const futuras = pausas.filter((item) => new Date(item.fim).getTime() > Date.now());
    if (!futuras.length) return container.append(criar("p", "empty", "Nenhuma pausa futura programada nesta unidade."));
    futuras.forEach((pausa) => {
      const item = criar("article", "operation-item");
      const texto = criar("div");
      texto.append(
        criar("strong", "", pausa.motivo || "Pausa da operação"),
        criar("small", "", `${dataBr(pausa.inicio)} até ${dataBr(pausa.fim)}`)
      );
      const acoes = criar("div", "operation-actions");
      const remover = criar("button", "remove", "Excluir");
      remover.type = "button";
      remover.addEventListener("click", () => excluirPausa(pausa, remover));
      acoes.append(remover);
      item.append(texto, acoes);
      container.append(item);
    });
  }

  async function alternarRegiao(regiao) {
    const { error } = await window.db.from("empresa_regioes")
      .update({ ativo: !regiao.ativo, updated_at: new Date().toISOString() })
      .eq("id", regiao.id)
      .eq("empresa_id", empresaId)
      .eq("unidade_id", unidadeId);
    if (error) return toast("Não foi possível atualizar a região", mensagemErro(error), "error");
    regiao.ativo = !regiao.ativo;
    renderizarRegioes();
  }

  async function excluirRegiao(regiao) {
    const confirmou = window.AppConfirm ? await window.AppConfirm({
      titulo: "Excluir região?",
      mensagem: `A regra de entrega para ${regiao.bairro} será removida somente de ${nomeUnidade()}.`,
      confirmar: "Excluir região",
      cancelar: "Voltar",
      perigoso: true,
      icone: "!",
      etiqueta: "Multiunidade"
    }) : false;
    if (!confirmou) return;
    const { error } = await window.db.from("empresa_regioes")
      .delete()
      .eq("id", regiao.id)
      .eq("empresa_id", empresaId)
      .eq("unidade_id", unidadeId);
    if (error) return toast("Não foi possível excluir a região", mensagemErro(error), "error");
    regioes = regioes.filter((item) => String(item.id) !== String(regiao.id));
    renderizarRegioes();
  }

  function renderizarRegioes() {
    const container = $("regioesEmpresa");
    if (!container) return;
    container.replaceChildren();
    if (!regioes.length) return container.append(criar("p", "empty", "Sem regiões específicas nesta unidade: serão usadas as configurações gerais da loja."));
    regioes.forEach((regiao) => {
      const item = criar("article", "region-item");
      const texto = criar("div");
      texto.append(
        criar("strong", "", `${regiao.bairro} • ${regiao.cidade}/${regiao.uf}`),
        criar("small", "", `${App.dinheiro(regiao.taxa_entrega)} de entrega • mínimo ${App.dinheiro(regiao.pedido_minimo)} • ${regiao.tempo_min}–${regiao.tempo_max} min`)
      );
      const acoes = criar("div", "operation-actions");
      const alternar = criar("button", regiao.ativo ? "approve" : "", regiao.ativo ? "Ativa" : "Pausada");
      alternar.type = "button";
      alternar.addEventListener("click", () => alternarRegiao(regiao));
      const remover = criar("button", "remove", "Excluir");
      remover.type = "button";
      remover.addEventListener("click", () => excluirRegiao(regiao));
      acoes.append(alternar, remover);
      item.append(texto, acoes);
      container.append(item);
    });
  }

  async function atualizarDisponibilidade() {
    const status = $("operacaoStatus");
    if (!status || !empresaId || !unidadeId) return;
    const { data, error } = await window.db.rpc("empresa_disponibilidade_unidade", {
      p_empresa_id: empresaId,
      p_unidade_id: unidadeId,
      p_quando: new Date().toISOString()
    });
    if (error) {
      status.textContent = "● Status da unidade indisponível";
      status.classList.add("closed");
      return;
    }
    status.textContent = data?.aberto ? "● Unidade aberta pelo horário" : "● Unidade fechada pelo horário";
    status.classList.toggle("closed", !data?.aberto);
  }

  async function carregarDadosUnidade() {
    unidadeId = unidadeSelecionada();
    if (!empresaId || !unidadeId) return false;
    atualizarIndicador();
    const [resHorarios, resPausas, resRegioes] = await Promise.all([
      window.db.from("empresa_horarios").select("*").eq("empresa_id", empresaId).eq("unidade_id", unidadeId).order("dia_semana"),
      window.db.from("empresa_pausas").select("*").eq("empresa_id", empresaId).eq("unidade_id", unidadeId).order("inicio"),
      window.db.from("empresa_regioes").select("*").eq("empresa_id", empresaId).eq("unidade_id", unidadeId).order("bairro")
    ]);
    const erro = resHorarios.error || resPausas.error || resRegioes.error;
    if (erro) {
      toast("Não foi possível carregar a operação da unidade", mensagemErro(erro), "error");
      return false;
    }
    horarios = resHorarios.data || [];
    pausas = resPausas.data || [];
    regioes = resRegioes.data || [];
    renderizarHorarios();
    renderizarPausas();
    renderizarRegioes();
    await atualizarDisponibilidade();
    return true;
  }

  function interceptarHorarios() {
    const form = $("horariosForm");
    if (!form || form.dataset.unidades43 === "1") return;
    form.dataset.unidades43 = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      unidadeId = unidadeSelecionada();
      if (!unidadeId) return toast("Unidade não selecionada", "Escolha a unidade antes de salvar os horários.", "warning");
      const registros = [...$("horariosEmpresa").querySelectorAll(".hours-row")].map((linha) => ({
        empresa_id: empresaId,
        unidade_id: unidadeId,
        dia_semana: Number(linha.dataset.dia),
        ativo: linha.querySelector("[data-campo='ativo']").checked,
        abre: linha.querySelector("[data-campo='abre']").value,
        fecha: linha.querySelector("[data-campo='fecha']").value,
        updated_at: new Date().toISOString()
      }));
      const botao = form.querySelector("button[type='submit']");
      App.definirCarregando(botao, true, "Salvando...");
      const { data, error } = await window.db.from("empresa_horarios")
        .upsert(registros, { onConflict: "empresa_id,unidade_id,dia_semana" })
        .select("*");
      App.definirCarregando(botao, false);
      if (error) return toast("Não foi possível salvar os horários", mensagemErro(error), "error");
      horarios = data || registros;
      renderizarHorarios();
      await atualizarDisponibilidade();
      toast("Horários salvos", `A agenda de ${nomeUnidade()} foi atualizada.`, "success");
    }, true);
  }

  function interceptarPausa() {
    const form = $("pausaForm");
    if (!form || form.dataset.unidades43 === "1") return;
    form.dataset.unidades43 = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      unidadeId = unidadeSelecionada();
      const inicio = new Date($("pausaInicio").value);
      const fim = new Date($("pausaFim").value);
      if (!unidadeId) return toast("Unidade não selecionada", "Escolha a unidade antes de programar uma pausa.", "warning");
      if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
        return toast("Intervalo inválido", "Informe início e fim válidos para a pausa.", "warning");
      }
      const { data, error } = await window.db.from("empresa_pausas").insert({
        empresa_id: empresaId,
        unidade_id: unidadeId,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        motivo: $("pausaMotivo").value.trim() || null
      }).select("*").single();
      if (error) return toast("Não foi possível programar a pausa", mensagemErro(error), "error");
      pausas.push(data);
      form.reset();
      renderizarPausas();
      await atualizarDisponibilidade();
      toast("Pausa programada", `${nomeUnidade()} ficará indisponível no período informado.`, "success");
    }, true);
  }

  function interceptarRegiao() {
    const form = $("regiaoForm");
    if (!form || form.dataset.unidades43 === "1") return;
    form.dataset.unidades43 = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      unidadeId = unidadeSelecionada();
      if (!unidadeId) return toast("Unidade não selecionada", "Escolha a unidade antes de cadastrar uma região.", "warning");
      const payload = {
        empresa_id: empresaId,
        unidade_id: unidadeId,
        bairro: $("regiaoBairro").value.trim(),
        cidade: $("regiaoCidade").value.trim(),
        uf: $("regiaoUf").value.trim().toUpperCase(),
        taxa_entrega: Number($("regiaoTaxa").value),
        pedido_minimo: Number($("regiaoMinimo").value),
        tempo_min: Number($("regiaoTempoMin").value),
        tempo_max: Number($("regiaoTempoMax").value),
        ativo: true
      };
      if (!payload.bairro || !payload.cidade || !/^[A-Z]{2}$/.test(payload.uf)) {
        return toast("Região incompleta", "Informe bairro, cidade e UF válidos.", "warning");
      }
      if (![payload.taxa_entrega, payload.pedido_minimo, payload.tempo_min, payload.tempo_max].every(Number.isFinite)
        || payload.taxa_entrega < 0 || payload.pedido_minimo < 0 || payload.tempo_min < 5 || payload.tempo_max < payload.tempo_min) {
        return toast("Valores inválidos", "Revise taxa, pedido mínimo e tempos de entrega.", "warning");
      }
      const { data, error } = await window.db.from("empresa_regioes").insert(payload).select("*").single();
      if (error) return toast("Não foi possível cadastrar a região", mensagemErro(error), "error");
      regioes.push(data);
      regioes.sort((a, b) => String(a.bairro).localeCompare(String(b.bairro), "pt-BR"));
      form.reset();
      renderizarRegioes();
      toast("Região adicionada", `${payload.bairro} agora pertence às regras de ${nomeUnidade()}.`, "success");
    }, true);
  }

  async function esperarContexto() {
    for (let tentativa = 0; tentativa < 120; tentativa += 1) {
      let empresaAtual = null;
      try { empresaAtual = typeof empresa !== "undefined" ? empresa : null; } catch { empresaAtual = null; }
      const select = $("unidadePainelSelect");
      if (empresaAtual?.id && select?.options?.length) {
        empresaId = String(empresaAtual.id);
        unidadeId = unidadeSelecionada();
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    return false;
  }

  async function iniciar() {
    if (iniciado) return;
    const pronto = await esperarContexto();
    if (!pronto) return console.warn("Operação multiunidade 4.3: contexto não ficou pronto.");
    iniciado = true;
    interceptarHorarios();
    interceptarPausa();
    interceptarRegiao();
    $("unidadePainelSelect")?.addEventListener("change", () => {
      setTimeout(() => carregarDadosUnidade(), 0);
    });
    await carregarDadosUnidade();
  }

  iniciar().catch((erro) => {
    console.error("Operação multiunidade 4.3:", erro);
    toast("Falha na operação por unidade", mensagemErro(erro), "error");
  });
})();
