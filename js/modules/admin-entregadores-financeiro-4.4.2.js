"use strict";

(() => {
  if (!/admin\.html$/i.test(location.pathname)) return;

  let entregadores = [];
  let carregando = false;
  let timer = 0;

  const dinheiro = (valor) => window.App?.dinheiro?.(Number(valor || 0)) || Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function criar(tag, classe = "", texto = "") {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== "") el.textContent = texto;
    return el;
  }

  function montar() {
    const secao = document.getElementById("entregadores");
    if (!secao || document.getElementById("adminDriverRateCard")) return null;
    const tabela = secao.querySelector(".admin-table-wrap");
    if (!tabela) return null;

    const card = criar("div", "admin-driver-rate-card");
    card.id = "adminDriverRateCard";

    const copy = criar("div", "admin-driver-rate-copy");
    copy.append(
      criar("strong", "", "Valor por entrega"),
      criar("small", "", "Define quanto o entregador registra por rota aceita e concluída. Alterações valem apenas para novos aceites; o histórico antigo não muda.")
    );

    const campo = criar("label", "admin-driver-rate-field");
    campo.append(criar("span", "", "Entregador"));
    const select = document.createElement("select");
    select.id = "adminDriverRateSelect";
    campo.append(select);

    const controles = criar("div", "admin-driver-rate-controls");
    const valorBox = criar("label", "admin-driver-rate-field");
    valorBox.append(criar("span", "", "R$ por entrega"));
    const valor = document.createElement("input");
    valor.id = "adminDriverRateValue";
    valor.type = "number";
    valor.min = "0";
    valor.max = "9999.99";
    valor.step = "0.01";
    valor.inputMode = "decimal";
    valorBox.append(valor);
    const salvar = criar("button", "admin-driver-rate-save", "Salvar tarifa");
    salvar.type = "button";
    controles.append(valorBox, salvar);

    const atual = criar("div", "admin-driver-rate-current", "Nenhum entregador selecionado.");
    atual.id = "adminDriverRateCurrent";

    select.addEventListener("change", sincronizarSelecionado);
    salvar.addEventListener("click", salvarTarifa);
    card.append(copy, campo, controles, atual);
    tabela.insertAdjacentElement("beforebegin", card);
    return card;
  }

  function selecionado() {
    const id = document.getElementById("adminDriverRateSelect")?.value;
    return entregadores.find((item) => String(item.id) === String(id)) || null;
  }

  function sincronizarSelecionado() {
    const item = selecionado();
    const input = document.getElementById("adminDriverRateValue");
    const atual = document.getElementById("adminDriverRateCurrent");
    if (!input || !atual) return;
    if (!item) {
      input.value = "";
      input.disabled = true;
      atual.textContent = "Nenhum entregador selecionado.";
      return;
    }
    input.disabled = false;
    input.value = Number(item.valor_por_entrega || 0).toFixed(2);
    atual.textContent = `${item.nome || "Entregador"}: ${dinheiro(item.valor_por_entrega)} por entrega • ${item.aprovado ? "aprovado" : "cadastro pendente"}.`;
  }

  function renderSelect() {
    montar();
    const select = document.getElementById("adminDriverRateSelect");
    if (!select) return;
    const anterior = select.value;
    select.replaceChildren();
    const vazio = document.createElement("option");
    vazio.value = "";
    vazio.textContent = entregadores.length ? "Selecione um entregador" : "Nenhum entregador cadastrado";
    select.append(vazio);
    entregadores
      .slice()
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
      .forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.nome || "Entregador"} — ${dinheiro(item.valor_por_entrega)}`;
        select.append(option);
      });
    if (entregadores.some((item) => String(item.id) === anterior)) select.value = anterior;
    sincronizarSelecionado();
  }

  async function carregar() {
    if (carregando || !window.db) return;
    carregando = true;
    try {
      const { data: ehAdmin, error: erroAdmin } = await window.db.rpc("usuario_eh_admin");
      if (erroAdmin || ehAdmin !== true) return;
      const { data, error } = await window.db.from("entregadores")
        .select("id,nome,aprovado,valor_por_entrega")
        .order("nome");
      if (error) throw error;
      entregadores = Array.isArray(data) ? data : [];
      renderSelect();
    } catch (erro) {
      console.warn("Tarifa do entregador:", erro);
      document.getElementById("adminDriverRateCard")?.remove();
    } finally {
      carregando = false;
    }
  }

  async function salvarTarifa() {
    const item = selecionado();
    const input = document.getElementById("adminDriverRateValue");
    const botao = document.querySelector(".admin-driver-rate-save");
    if (!item || !input || !botao) return window.AppToast?.("Selecione um entregador", "Escolha quem receberá a nova tarifa.", "warning");
    const valor = Number(String(input.value).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0 || valor > 9999.99) return window.AppToast?.("Valor inválido", "Informe um valor entre R$ 0,00 e R$ 9.999,99.", "warning");

    botao.disabled = true;
    const texto = botao.textContent;
    botao.textContent = "Salvando...";
    try {
      const { data, error } = await window.db.rpc("admin_definir_valor_entregador", { p_entregador_id: item.id, p_valor: valor });
      if (error || data !== true) throw error || new Error("Entregador não encontrado.");
      item.valor_por_entrega = Math.round(valor * 100) / 100;
      renderSelect();
      window.AppToast?.("Tarifa atualizada", `Novas rotas aceitas por ${item.nome || "este entregador"} registrarão ${dinheiro(item.valor_por_entrega)}.`, "success");
    } catch (erro) {
      window.AppToast?.("Não foi possível salvar", window.App?.mensagemErro?.(erro) || erro?.message || "Tente novamente.", "error");
    } finally {
      botao.disabled = false;
      botao.textContent = texto;
    }
  }

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(carregar, 500);
  }

  async function iniciar() {
    for (let i = 0; i < 150; i += 1) {
      const app = document.getElementById("adminApp");
      if (app && !app.hidden && window.db) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    montar();
    await carregar();
    const tabela = document.getElementById("adminEntregadores");
    if (tabela) new MutationObserver(agendar).observe(tabela, { childList: true, subtree: true });
  }

  iniciar().catch((erro) => console.error("Financeiro de entregadores no Admin 4.4.2:", erro));
})();
