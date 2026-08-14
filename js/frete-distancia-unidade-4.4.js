"use strict";

(() => {
  if (!/empresa-dashboard\.html$/i.test(location.pathname)) return;

  let iniciado = false;
  let carregando = false;

  const $ = (id) => document.getElementById(id);
  const criar = (tag, texto) => {
    const el = document.createElement(tag);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const toast = (titulo, mensagem = "", tipo = "info") => window.AppToast?.(titulo, mensagem, tipo);
  const mensagemErro = (erro) => window.App?.mensagemErro?.(erro) || erro?.message || "Tente novamente.";

  function unidadeId() {
    return $("unidadePainelSelect")?.value || "";
  }

  function numeroOuNulo(id) {
    const texto = String($(id)?.value || "").trim().replace(",", ".");
    if (!texto) return null;
    const valor = Number(texto);
    return Number.isFinite(valor) ? valor : NaN;
  }

  function atualizarEstadoVisual(dados) {
    const ativo = $("freteDistanciaAtivo44");
    const taxaBase = $("freteTaxaBase44");
    const valorKm = $("freteValorKm44");
    const raio = $("freteRaioMax44");
    const status = $("freteDistanciaStatus44");
    if (!ativo || !taxaBase || !valorKm || !raio || !status) return;

    const temGps = dados?.latitude !== null && dados?.latitude !== undefined
      && dados?.longitude !== null && dados?.longitude !== undefined;
    ativo.checked = dados?.frete_distancia_ativo === true;
    ativo.disabled = !temGps && !ativo.checked;
    taxaBase.value = dados?.frete_taxa_base ?? "";
    valorKm.value = dados?.frete_valor_km ?? "";
    raio.value = dados?.frete_raio_max_km ?? "";

    if (ativo.checked) {
      status.textContent = `Ativo em ${dados.nome}: taxa base + valor por km, limitado ao raio configurado.`;
    } else if (!temGps) {
      status.textContent = `Desligado em ${dados?.nome || "esta unidade"}. Defina o GPS da unidade antes de ativar.`;
    } else {
      status.textContent = `Desligado em ${dados.nome}. As regras atuais por bairro/região continuam valendo.`;
    }
  }

  async function carregar() {
    const id = unidadeId();
    const card = $("freteDistanciaCard44");
    if (!id || !card || carregando) return;
    carregando = true;
    try {
      const { data, error } = await window.db.from("empresa_unidades")
        .select("id,nome,latitude,longitude,frete_distancia_ativo,frete_taxa_base,frete_valor_km,frete_raio_max_km")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      atualizarEstadoVisual(data);
    } finally {
      carregando = false;
    }
  }

  async function salvar(event) {
    event.preventDefault();
    const id = unidadeId();
    if (!id) return toast("Selecione uma unidade", "Escolha a unidade antes de configurar o frete.", "warning");

    const ativo = $("freteDistanciaAtivo44").checked;
    const taxaBase = numeroOuNulo("freteTaxaBase44");
    const valorKm = numeroOuNulo("freteValorKm44");
    const raio = numeroOuNulo("freteRaioMax44");

    if ([taxaBase, valorKm, raio].some(Number.isNaN)) {
      return toast("Valores inválidos", "Use apenas números válidos nos campos de frete.", "warning");
    }
    if (taxaBase !== null && taxaBase < 0) return toast("Taxa base inválida", "A taxa base não pode ser negativa.", "warning");
    if (valorKm !== null && valorKm < 0) return toast("Valor por km inválido", "O valor por km não pode ser negativo.", "warning");
    if (raio !== null && raio <= 0) return toast("Raio inválido", "O raio máximo precisa ser maior que zero.", "warning");
    if (ativo && (taxaBase === null || valorKm === null || raio === null)) {
      return toast("Complete a configuração", "Informe taxa base, valor por km e raio máximo para ativar.", "warning");
    }

    const botao = $("salvarFreteDistancia44");
    window.App?.definirCarregando?.(botao, true, "Salvando...");
    const { error } = await window.db.rpc("empresa_unidade_configurar_frete_distancia", {
      p_unidade_id: id,
      p_ativo: ativo,
      p_taxa_base: taxaBase,
      p_valor_km: valorKm,
      p_raio_max_km: raio
    });
    window.App?.definirCarregando?.(botao, false);

    if (error) return toast("Não foi possível salvar o frete", mensagemErro(error), "error");
    await carregar();
    toast(
      ativo ? "Frete por distância ativado" : "Frete por distância desativado",
      ativo
        ? "Novos cálculos usarão taxa base + valor por km quando o endereço tiver GPS."
        : "A unidade voltou a usar somente as regras atuais por bairro/região.",
      "success"
    );
  }

  function montarCard(secao) {
    if ($("freteDistanciaCard44")) return;
    const card = criar("section");
    card.id = "freteDistanciaCard44";
    card.className = "management-card";
    card.style.cssText = "margin-top:18px;padding:18px;border:1px solid #e7e8eb;border-radius:16px;background:#fff";

    const titulo = criar("h3", "Frete por distância");
    const descricao = criar("p", "Opcional por unidade. Quando desligado, nada muda: continuam valendo as taxas por bairro/região. Se o endereço não tiver GPS, o cálculo também usa essa regra atual como fallback.");
    descricao.style.cssText = "margin:6px 0 16px;color:#6b7280;font-size:11px;line-height:1.6";

    const form = criar("form");
    form.id = "freteDistanciaForm44";
    const topo = criar("label");
    topo.style.cssText = "display:flex;align-items:center;gap:9px;margin-bottom:14px;font-size:12px;font-weight:700";
    const ativo = criar("input");
    ativo.id = "freteDistanciaAtivo44";
    ativo.type = "checkbox";
    topo.append(ativo, document.createTextNode(" Ativar cobrança por distância nesta unidade"));

    const grade = criar("div");
    grade.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px";
    const campos = [
      ["freteTaxaBase44", "Taxa base (R$)", "0.01"],
      ["freteValorKm44", "Valor por km (R$)", "0.01"],
      ["freteRaioMax44", "Raio máximo (km)", "0.1"]
    ];
    campos.forEach(([id, texto, passo]) => {
      const label = criar("label", texto);
      label.style.cssText = "display:grid;gap:6px;color:#4b5563;font-size:10px;font-weight:700";
      const input = criar("input");
      input.id = id;
      input.type = "number";
      input.min = id === "freteRaioMax44" ? "0.01" : "0";
      input.step = passo;
      input.inputMode = "decimal";
      input.style.cssText = "width:100%;padding:10px 11px;border:1px solid #dfe2e7;border-radius:10px;font:600 12px Poppins,sans-serif";
      label.append(input);
      grade.append(label);
    });

    const status = criar("p");
    status.id = "freteDistanciaStatus44";
    status.setAttribute("role", "status");
    status.style.cssText = "margin:12px 0;color:#6b7280;font-size:10px;line-height:1.5";

    const salvar = criar("button", "Salvar configuração de frete");
    salvar.id = "salvarFreteDistancia44";
    salvar.type = "submit";
    salvar.className = "btn primary";
    salvar.style.cssText = "border:0;border-radius:11px;padding:11px 14px;background:#20242e;color:#fff;cursor:pointer;font:700 10px Poppins,sans-serif";

    form.append(topo, grade, status, salvar);
    form.addEventListener("submit", salvar);
    card.append(titulo, descricao, form);

    const referencia = $("operacaoUnidade43");
    if (referencia?.parentElement === secao) referencia.insertAdjacentElement("afterend", card);
    else secao.prepend(card);
  }

  async function iniciar() {
    if (iniciado) return;
    for (let tentativa = 0; tentativa < 120; tentativa += 1) {
      const secao = $("operacao");
      const select = $("unidadePainelSelect");
      if (secao && select?.options?.length) {
        iniciado = true;
        montarCard(secao);
        select.addEventListener("change", () => setTimeout(carregar, 80));
        window.addEventListener("focus", () => carregar());
        await carregar();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  iniciar().catch((erro) => console.error("Frete por distância 4.4:", erro));
})();
