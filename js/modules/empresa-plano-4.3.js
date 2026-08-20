"use strict";

(() => {
  if (!/empresa-dashboard\.html$/i.test(location.pathname)) return;

  let plano = null;
  let iniciado = false;

  const toast = (titulo, mensagem = "", tipo = "info") => window.AppToast?.(titulo, mensagem, tipo);
  const fmtData = (valor) => valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const fmtPreco = (valor, moeda = "BRL") => valor === null || valor === undefined
    ? "Preço comercial não configurado"
    : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: moeda || "BRL" }) + "/mês";

  function estilos() {
    if (document.getElementById("empresaPlano43Styles")) return;
    const style = document.createElement("style");
    style.id = "empresaPlano43Styles";
    style.textContent = `
      .plan43{display:grid;gap:18px}.plan43-hero{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;padding:26px;border:1px solid #e6e8ed;border-radius:22px;background:#fff}.plan43-hero h2{margin:4px 0 7px;font-size:24px}.plan43-hero p{max-width:650px;margin:0;color:#6a717d;font-size:11px;line-height:1.65}.plan43-status{display:grid;justify-items:end;gap:5px}.plan43-status strong{font-size:16px}.plan43-status span{padding:6px 9px;border-radius:999px;background:#edf8ef;color:#168821;font-size:9px;font-weight:800;text-transform:uppercase}.plan43-status span.warn{background:#fff6e7;color:#a96300}.plan43-status span.danger{background:#fff0f1;color:#c62828}.plan43-price{font-size:11px;color:#707784}
      .plan43-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.plan43-usage{padding:18px;border:1px solid #e7e9ed;border-radius:18px;background:#fff}.plan43-usage small{display:block;color:#757c88;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.plan43-usage strong{display:block;margin:5px 0 9px;font-size:22px}.plan43-usage p{margin:0;color:#6f7580;font-size:10px}.plan43-bar{height:6px;margin:10px 0 7px;overflow:hidden;border-radius:999px;background:#eceef2}.plan43-bar span{display:block;height:100%;border-radius:inherit;background:#ea1d2c}.plan43-card{padding:21px;border:1px solid #e7e9ed;border-radius:18px;background:#fff}.plan43-card h3{margin:0 0 8px;font-size:15px}.plan43-card p{margin:0;color:#6d7480;font-size:10px;line-height:1.65}.plan43-meta{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}.plan43-meta span{padding:8px 10px;border-radius:11px;background:#f5f6f8;color:#555c67;font-size:9px}.plan43-actions{display:flex;justify-content:flex-end}.plan43-actions button{border:0;border-radius:11px;padding:10px 14px;background:#20242e;color:#fff;cursor:pointer;font:700 10px Poppins,sans-serif}
      @media(max-width:900px){.plan43-grid{grid-template-columns:1fr 1fr}.plan43-hero{grid-template-columns:1fr}.plan43-status{justify-items:start}}
      @media(max-width:560px){.plan43-grid{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function montar() {
    if (document.getElementById("plano43")) return;
    const nav = document.querySelector(".dashboard-sidebar nav");
    const main = document.querySelector(".dashboard-main");
    if (!nav || !main) return;

    const link = document.createElement("a");
    link.href = "#plano43";
    link.id = "abrirPlano43";
    link.innerHTML = '<span aria-hidden="true">◇</span> Plano';
    const config = nav.querySelector('a[href="#configuracoes"]');
    if (config) nav.insertBefore(link, config);
    else nav.append(link);

    const section = document.createElement("section");
    section.id = "plano43";
    section.className = "management-section dashboard-view plan43";
    section.hidden = true;
    section.setAttribute("data-dashboard-view", "");
    section.setAttribute("tabindex", "-1");
    section.innerHTML = `
      <div class="plan43-hero">
        <div><span class="section-kicker">CONTA E ASSINATURA</span><h2 id="planoNome43">Carregando plano...</h2><p id="planoDescricao43">Consultando sua assinatura e limites atuais.</p></div>
        <div class="plan43-status"><span id="planoStatus43">—</span><strong id="planoPreco43">—</strong><small class="plan43-price" id="planoPeriodo43"></small></div>
      </div>
      <div class="plan43-grid" id="planoUso43"></div>
      <article class="plan43-card" id="planoInfo43"><h3>Como funcionam os limites</h3><p>Os limites são aplicados no banco de dados. Esconder controles na interface não altera as regras da assinatura.</p><div class="plan43-meta" id="planoMeta43"></div></article>
      <div class="plan43-actions"><button id="atualizarPlano43" type="button">↻ Atualizar uso</button></div>`;
    main.append(section);

    link.addEventListener("click", async (event) => {
      event.preventDefault();
      document.querySelectorAll("[data-dashboard-view]").forEach((view) => { view.hidden = true; view.classList.remove("is-active"); });
      const unidades = document.getElementById("unidades43");
      if (unidades) { unidades.hidden = true; unidades.classList.remove("is-active"); }
      section.hidden = false;
      section.classList.add("is-active");
      document.querySelectorAll(".dashboard-sidebar nav a").forEach((item) => {
        item.classList.toggle("active", item === link);
        if (item === link) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
      });
      section.focus({ preventScroll: true });
      history.replaceState({}, "", `${location.pathname}${location.search}#plano43`);
      if (!plano) await carregar();
    });

    [...nav.querySelectorAll("a")].filter((item) => item !== link).forEach((item) => item.addEventListener("click", () => {
      section.hidden = true;
      section.classList.remove("is-active");
    }));
    document.getElementById("atualizarPlano43").addEventListener("click", carregar);
  }

  function statusClasse(status) {
    if (["cancelada", "expirada", "inadimplente"].includes(status)) return "danger";
    if (status === "trial") return "warn";
    return "";
  }

  function renderUso(chave, titulo) {
    const uso = Number(plano?.uso?.[chave] || 0);
    const limite = plano?.limites?.[chave];
    const ilimitado = limite === null || limite === undefined;
    const percentual = ilimitado ? 0 : Math.min(100, Math.round((uso / Math.max(1, Number(limite))) * 100));
    const card = document.createElement("article");
    card.className = "plan43-usage";
    const small = document.createElement("small"); small.textContent = titulo;
    const strong = document.createElement("strong"); strong.textContent = String(uso);
    const bar = document.createElement("div"); bar.className = "plan43-bar";
    const fill = document.createElement("span"); fill.style.width = `${percentual}%`; bar.append(fill);
    const p = document.createElement("p"); p.textContent = ilimitado ? "Ilimitado no plano atual" : `${uso} de ${limite} utilizados`;
    card.append(small, strong, bar, p);
    return card;
  }

  function render() {
    if (!plano) return;
    const p = plano.plano || {};
    const a = plano.assinatura || {};
    document.getElementById("planoNome43").textContent = p.nome || "Plano";
    document.getElementById("planoDescricao43").textContent = p.descricao || "Configuração de assinatura da sua empresa.";
    const status = document.getElementById("planoStatus43");
    status.textContent = String(a.status || "—").replace("inadimplente", "pagamento pendente");
    status.className = statusClasse(a.status);
    document.getElementById("planoPreco43").textContent = fmtPreco(p.preco_mensal, p.moeda);

    let periodo = `Início: ${fmtData(a.inicio_em)}`;
    if (a.status === "trial" && a.trial_fim_em) periodo = `Trial até ${fmtData(a.trial_fim_em)}`;
    else if (a.periodo_fim) periodo = `Período até ${fmtData(a.periodo_fim)}`;
    document.getElementById("planoPeriodo43").textContent = periodo;

    const uso = document.getElementById("planoUso43");
    uso.replaceChildren(
      renderUso("unidades", "Unidades ativas"),
      renderUso("produtos", "Produtos"),
      renderUso("funcionarios", "Funcionários ativos"),
      renderUso("pedidos_mes", "Pedidos no mês")
    );

    const info = document.getElementById("planoInfo43");
    const titulo = info.querySelector("h3");
    const texto = info.querySelector("p");
    if (p.interno) {
      titulo.textContent = "Plano técnico de compatibilidade";
      texto.textContent = "Sua operação continua sem limites enquanto os planos comerciais, preços e condições de cobrança não forem configurados pelo administrador da plataforma.";
    } else {
      titulo.textContent = "Limites aplicados pela assinatura";
      texto.textContent = "Novas unidades, produtos, funcionários e pedidos mensais respeitam os limites configurados para este plano. Trial vencido ou assinatura inativa bloqueia novos consumos sem apagar dados existentes.";
    }
    const meta = document.getElementById("planoMeta43");
    meta.replaceChildren();
    const recursos = p.recursos && typeof p.recursos === "object" ? Object.keys(p.recursos).filter((key) => p.recursos[key] === true) : [];
    if (recursos.length) {
      const item = document.createElement("span"); item.textContent = `Recursos: ${recursos.join(", ")}`; meta.append(item);
    }
    if (p.slug) { const item = document.createElement("span"); item.textContent = `Plano: ${p.slug}`; meta.append(item); }
  }

  async function carregar() {
    const botao = document.getElementById("atualizarPlano43");
    if (botao) botao.disabled = true;
    const { data, error } = await window.db.rpc("empresa_meu_plano");
    if (botao) botao.disabled = false;
    if (error) return toast("Não foi possível carregar o plano", error.message || "Tente novamente.", "error");
    plano = data;
    render();
  }

  async function iniciar() {
    if (iniciado) return;
    for (let i = 0; i < 100; i += 1) {
      let atual = null;
      try { atual = typeof empresa !== "undefined" ? empresa : null; } catch { atual = null; }
      if (atual?.id && document.querySelector(".dashboard-sidebar nav")) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    iniciado = true;
    estilos();
    montar();
    if (location.hash === "#plano43") document.getElementById("abrirPlano43")?.click();
  }

  iniciar().catch((erro) => console.error("Plano da empresa 4.3:", erro));
})();
