"use strict";

(() => {
  if (!/admin\.html$/i.test(location.pathname)) return;

  let planos = [];
  let assinaturas = [];
  let empresas = [];
  let planoEditando = null;
  let iniciado = false;

  const toast = (titulo, mensagem = "", tipo = "info") => window.AppToast?.(titulo, mensagem, tipo);
  const dinheiro = (valor, moeda = "BRL") => valor === null || valor === undefined
    ? "Não definido"
    : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: moeda || "BRL" });
  const dataBr = (valor) => valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";
  const numeroOuNull = (id) => {
    const valor = document.getElementById(id)?.value?.trim();
    return valor === "" || valor === undefined ? null : Number(valor);
  };
  const slugify = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  function estilos() {
    if (document.getElementById("adminPlanos43Styles")) return;
    const style = document.createElement("style");
    style.id = "adminPlanos43Styles";
    style.textContent = `
      #planos .plans-admin-grid{display:grid;grid-template-columns:minmax(300px,.75fr) minmax(0,1.25fr);gap:18px;align-items:start}#planos .plans-card{padding:20px;border:1px solid #e3e5ea;border-radius:18px;background:#fff}#planos .plans-card h3{margin:0 0 15px;font-size:14px}.plans-form{display:grid;gap:11px}.plans-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.plans-field{display:grid;gap:5px}.plans-field.wide{grid-column:1/-1}.plans-field label{color:#656c78;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.plans-field input,.plans-field textarea,.plans-field select{width:100%;min-width:0;padding:10px 11px;border:1px solid #dfe2e7;border-radius:10px;background:#fff;font:500 10px Poppins,sans-serif}.plans-field textarea{min-height:74px;resize:vertical}.plans-checks{display:flex;gap:14px;flex-wrap:wrap}.plans-checks label{display:flex;align-items:center;gap:7px;color:#4e5560;font-size:10px;font-weight:600}.plans-actions{display:flex;gap:8px;flex-wrap:wrap}.plans-actions button{border:0;border-radius:10px;padding:10px 13px;cursor:pointer;font:700 10px Poppins,sans-serif}.plans-actions .primary{background:#ea1d2c;color:#fff}.plans-actions .secondary{background:#f1f2f5;color:#343a45}.plans-list{display:grid;gap:10px}.plan-admin-item{display:grid;grid-template-columns:1fr auto;gap:12px;padding:14px;border:1px solid #e5e7eb;border-radius:14px}.plan-admin-item h4{margin:0 0 3px;font-size:12px}.plan-admin-item p{margin:0;color:#707784;font-size:9px;line-height:1.5}.plan-admin-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.plan-admin-tags span{padding:4px 7px;border-radius:999px;background:#f2f3f6;color:#626975;font-size:8px;font-weight:800}.plan-admin-tags .default{background:#fff0f1;color:#c71f2d}.plan-admin-tags .active{background:#edf8ef;color:#168821}.plan-admin-item button{align-self:start;border:0;border-radius:9px;padding:8px 10px;background:#222732;color:#fff;cursor:pointer;font:700 9px Poppins,sans-serif}.plans-subscription{margin-top:18px}.plans-subscription-grid{display:grid;grid-template-columns:1.3fr 1fr .8fr .7fr auto;gap:9px;align-items:end}.plans-subscription-grid button{min-height:38px;border:0;border-radius:10px;background:#222732;color:#fff;cursor:pointer;font:700 9px Poppins,sans-serif}.plans-table-wrap{margin-top:14px;overflow:auto}.plans-table{width:100%;border-collapse:collapse;font-size:9px}.plans-table th,.plans-table td{padding:10px 8px;border-bottom:1px solid #eceef2;text-align:left;white-space:nowrap}.plans-table th{color:#737a86;font-size:8px;text-transform:uppercase}.plans-empty{padding:20px;color:#737a86;text-align:center;font-size:10px}.plans-note{margin:0 0 16px;padding:11px 13px;border-radius:12px;background:#fff8e8;color:#765411;font-size:9px;line-height:1.55}
      @media(max-width:1050px){#planos .plans-admin-grid{grid-template-columns:1fr}.plans-subscription-grid{grid-template-columns:1fr 1fr}.plans-subscription-grid button{grid-column:1/-1}}@media(max-width:620px){.plans-form-grid,.plans-subscription-grid{grid-template-columns:1fr}.plans-field.wide{grid-column:auto}}
    `;
    document.head.append(style);
  }

  function montar() {
    if (document.getElementById("planos")) return;
    const nav = document.querySelector(".admin-sidebar nav");
    const main = document.querySelector(".admin-main");
    if (!nav || !main) return;

    const link = document.createElement("a");
    link.href = "#planos";
    link.innerHTML = '◇ <span>Planos</span>';
    const relatorios = nav.querySelector('a[href="#relatorios"]');
    if (relatorios) nav.insertBefore(link, relatorios); else nav.append(link);

    const section = document.createElement("section");
    section.className = "admin-section";
    section.id = "planos";
    section.innerHTML = `
      <div class="admin-section-title"><div><span class="admin-kicker">SAAS E ASSINATURAS</span><h2>Planos da plataforma</h2><p>Configure trial, preço e limites. Nenhuma cobrança é criada automaticamente nesta etapa.</p></div><button class="admin-secondary-button" id="recarregarPlanos43" type="button">↻ Atualizar</button></div>
      <p class="plans-note">O plano <strong>Legado</strong> mantém as operações existentes sem limites. Defina um plano comercial como “padrão para novos” somente quando preço, trial e limites estiverem decididos.</p>
      <div class="plans-admin-grid">
        <article class="plans-card">
          <h3 id="planoAdminTitulo43">Novo plano</h3>
          <form class="plans-form" id="planoAdminForm43">
            <div class="plans-form-grid">
              <div class="plans-field"><label for="planoAdminNome43">Nome</label><input id="planoAdminNome43" maxlength="80" required></div>
              <div class="plans-field"><label for="planoAdminSlug43">Slug</label><input id="planoAdminSlug43" maxlength="60" placeholder="starter" required></div>
              <div class="plans-field wide"><label for="planoAdminDescricao43">Descrição</label><textarea id="planoAdminDescricao43" maxlength="500"></textarea></div>
              <div class="plans-field"><label for="planoAdminPreco43">Preço mensal (R$)</label><input id="planoAdminPreco43" type="number" min="0" step="0.01" placeholder="Opcional"></div>
              <div class="plans-field"><label for="planoAdminTrial43">Trial (dias)</label><input id="planoAdminTrial43" type="number" min="0" max="365" step="1" value="0"></div>
              <div class="plans-field"><label for="planoAdminUnidades43">Limite de unidades</label><input id="planoAdminUnidades43" type="number" min="1" step="1" placeholder="Ilimitado"></div>
              <div class="plans-field"><label for="planoAdminProdutos43">Limite de produtos</label><input id="planoAdminProdutos43" type="number" min="1" step="1" placeholder="Ilimitado"></div>
              <div class="plans-field"><label for="planoAdminFuncionarios43">Limite de funcionários</label><input id="planoAdminFuncionarios43" type="number" min="1" step="1" placeholder="Ilimitado"></div>
              <div class="plans-field"><label for="planoAdminPedidos43">Pedidos/mês</label><input id="planoAdminPedidos43" type="number" min="1" step="1" placeholder="Ilimitado"></div>
            </div>
            <div class="plans-checks"><label><input id="planoAdminAtivo43" type="checkbox" checked> Plano ativo</label><label><input id="planoAdminPadrao43" type="checkbox"> Padrão para novos restaurantes</label></div>
            <div class="plans-actions"><button class="primary" id="planoAdminSalvar43" type="submit">Salvar plano</button><button class="secondary" id="planoAdminCancelar43" type="button" hidden>Cancelar edição</button></div>
          </form>
        </article>
        <article class="plans-card"><h3>Planos configurados</h3><div class="plans-list" id="planosAdminLista43"><div class="plans-empty">Carregando...</div></div></article>
      </div>
      <article class="plans-card plans-subscription">
        <h3>Assinatura por restaurante</h3>
        <div class="plans-subscription-grid">
          <div class="plans-field"><label for="assinaturaEmpresa43">Restaurante</label><select id="assinaturaEmpresa43"></select></div>
          <div class="plans-field"><label for="assinaturaPlano43">Plano</label><select id="assinaturaPlano43"></select></div>
          <div class="plans-field"><label for="assinaturaStatus43">Status</label><select id="assinaturaStatus43"><option value="ativa">Ativa</option><option value="trial">Trial</option><option value="inadimplente">Pagamento pendente</option><option value="cancelada">Cancelada</option><option value="expirada">Expirada</option></select></div>
          <div class="plans-field"><label for="assinaturaTrial43">Trial (dias)</label><input id="assinaturaTrial43" type="number" min="1" max="365" step="1" placeholder="Do plano"></div>
          <button id="assinaturaSalvar43" type="button">Aplicar assinatura</button>
        </div>
        <div class="plans-table-wrap"><table class="plans-table"><thead><tr><th>Restaurante</th><th>Plano</th><th>Status</th><th>Início</th><th>Fim do trial</th></tr></thead><tbody id="assinaturasAdminLista43"></tbody></table></div>
      </article>`;
    main.append(section);

    document.getElementById("planoAdminNome43").addEventListener("input", (event) => {
      if (!planoEditando) document.getElementById("planoAdminSlug43").value = slugify(event.target.value);
    });
    document.getElementById("planoAdminForm43").addEventListener("submit", salvarPlano);
    document.getElementById("planoAdminCancelar43").addEventListener("click", limparForm);
    document.getElementById("assinaturaSalvar43").addEventListener("click", salvarAssinatura);
    document.getElementById("recarregarPlanos43").addEventListener("click", carregar);
    link.addEventListener("click", () => setTimeout(carregar, 0));
  }

  function limparForm() {
    planoEditando = null;
    const form = document.getElementById("planoAdminForm43");
    form.reset();
    document.getElementById("planoAdminAtivo43").checked = true;
    document.getElementById("planoAdminTrial43").value = "0";
    document.getElementById("planoAdminTitulo43").textContent = "Novo plano";
    document.getElementById("planoAdminSalvar43").textContent = "Salvar plano";
    document.getElementById("planoAdminCancelar43").hidden = true;
  }

  function editarPlano(item) {
    planoEditando = item;
    document.getElementById("planoAdminNome43").value = item.nome || "";
    document.getElementById("planoAdminSlug43").value = item.slug || "";
    document.getElementById("planoAdminDescricao43").value = item.descricao || "";
    document.getElementById("planoAdminPreco43").value = item.preco_mensal ?? "";
    document.getElementById("planoAdminTrial43").value = item.trial_dias ?? 0;
    document.getElementById("planoAdminUnidades43").value = item.limite_unidades ?? "";
    document.getElementById("planoAdminProdutos43").value = item.limite_produtos ?? "";
    document.getElementById("planoAdminFuncionarios43").value = item.limite_funcionarios ?? "";
    document.getElementById("planoAdminPedidos43").value = item.limite_pedidos_mes ?? "";
    document.getElementById("planoAdminAtivo43").checked = item.ativo !== false;
    document.getElementById("planoAdminPadrao43").checked = item.padrao_novos === true;
    document.getElementById("planoAdminTitulo43").textContent = `Editar ${item.nome}`;
    document.getElementById("planoAdminSalvar43").textContent = "Salvar alterações";
    document.getElementById("planoAdminCancelar43").hidden = false;
    document.getElementById("planoAdminNome43").focus();
  }

  async function salvarPlano(event) {
    event.preventDefault();
    const nome = document.getElementById("planoAdminNome43").value.trim();
    const slug = document.getElementById("planoAdminSlug43").value.trim().toLowerCase();
    if (nome.length < 2 || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) return toast("Plano inválido", "Revise nome e slug.", "warning");
    const limites = ["planoAdminUnidades43", "planoAdminProdutos43", "planoAdminFuncionarios43", "planoAdminPedidos43"].map(numeroOuNull);
    if (limites.some((valor) => valor !== null && (!Number.isInteger(valor) || valor < 1))) return toast("Limite inválido", "Use números inteiros maiores que zero ou deixe em branco para ilimitado.", "warning");
    const trial = numeroOuNull("planoAdminTrial43") ?? 0;
    const preco = numeroOuNull("planoAdminPreco43");
    if (!Number.isInteger(trial) || trial < 0 || trial > 365 || (preco !== null && (!Number.isFinite(preco) || preco < 0))) return toast("Valores inválidos", "Revise preço e duração do trial.", "warning");

    const payload = {
      ...(planoEditando?.id ? { id: planoEditando.id } : {}),
      slug,
      nome,
      descricao: document.getElementById("planoAdminDescricao43").value.trim() || null,
      ativo: document.getElementById("planoAdminAtivo43").checked,
      interno: planoEditando?.interno === true,
      padrao_novos: document.getElementById("planoAdminPadrao43").checked,
      preco_mensal: preco,
      moeda: "BRL",
      trial_dias: trial,
      limite_unidades: limites[0],
      limite_produtos: limites[1],
      limite_funcionarios: limites[2],
      limite_pedidos_mes: limites[3],
      recursos: planoEditando?.recursos || { multiunidade: true, equipe: true, operacao: true },
      ordem: planoEditando?.ordem || 0
    };
    const botao = document.getElementById("planoAdminSalvar43");
    botao.disabled = true;
    const { error } = await window.db.rpc("admin_plano_salvar", { p_plano: payload });
    botao.disabled = false;
    if (error) return toast("Não foi possível salvar o plano", error.message || "Tente novamente.", "error");
    toast("Plano salvo", `${nome} foi atualizado.`, "success");
    limparForm();
    await carregar();
  }

  async function salvarAssinatura() {
    const empresaId = document.getElementById("assinaturaEmpresa43").value;
    const planoId = document.getElementById("assinaturaPlano43").value;
    const status = document.getElementById("assinaturaStatus43").value;
    const trial = numeroOuNull("assinaturaTrial43");
    if (!empresaId || !planoId) return toast("Seleção incompleta", "Escolha restaurante e plano.", "warning");
    if (status === "trial" && trial !== null && (!Number.isInteger(trial) || trial < 1 || trial > 365)) return toast("Trial inválido", "Use de 1 a 365 dias ou deixe em branco para usar o trial do plano.", "warning");
    const botao = document.getElementById("assinaturaSalvar43");
    botao.disabled = true;
    const { error } = await window.db.rpc("admin_assinatura_definir", {
      p_empresa_id: empresaId,
      p_plano_id: planoId,
      p_status: status,
      p_trial_dias: trial
    });
    botao.disabled = false;
    if (error) return toast("Não foi possível aplicar a assinatura", error.message || "Tente novamente.", "error");
    toast("Assinatura atualizada", "As novas regras já estão ativas no banco.", "success");
    await carregar();
  }

  function renderPlanos() {
    const lista = document.getElementById("planosAdminLista43");
    lista.replaceChildren();
    if (!planos.length) return lista.append(Object.assign(document.createElement("div"), { className: "plans-empty", textContent: "Nenhum plano configurado." }));
    planos.forEach((item) => {
      const card = document.createElement("article"); card.className = "plan-admin-item";
      const info = document.createElement("div");
      const h = document.createElement("h4"); h.textContent = item.nome;
      const p = document.createElement("p");
      const limites = [`${item.limite_unidades ?? "∞"} un.`, `${item.limite_produtos ?? "∞"} prod.`, `${item.limite_funcionarios ?? "∞"} func.`, `${item.limite_pedidos_mes ?? "∞"} ped./mês`].join(" • ");
      p.textContent = `${dinheiro(item.preco_mensal, item.moeda)}/mês • trial ${item.trial_dias || 0} dias • ${limites}`;
      const tags = document.createElement("div"); tags.className = "plan-admin-tags";
      if (item.padrao_novos) { const tag = document.createElement("span"); tag.className = "default"; tag.textContent = "Padrão novos"; tags.append(tag); }
      if (item.ativo) { const tag = document.createElement("span"); tag.className = "active"; tag.textContent = "Ativo"; tags.append(tag); }
      if (item.interno) { const tag = document.createElement("span"); tag.textContent = "Interno"; tags.append(tag); }
      const slug = document.createElement("span"); slug.textContent = item.slug; tags.append(slug);
      info.append(h, p, tags);
      const editar = document.createElement("button"); editar.type = "button"; editar.textContent = "Editar"; editar.addEventListener("click", () => editarPlano(item));
      card.append(info, editar); lista.append(card);
    });
  }

  function renderSelects() {
    const planoSelect = document.getElementById("assinaturaPlano43");
    planoSelect.replaceChildren();
    planos.filter((p) => p.ativo).forEach((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.nome; planoSelect.append(o); });
    const empresaSelect = document.getElementById("assinaturaEmpresa43");
    const anterior = empresaSelect.value;
    empresaSelect.replaceChildren();
    empresas.forEach((e) => { const o = document.createElement("option"); o.value = e.id; o.textContent = e.nome; empresaSelect.append(o); });
    if ([...empresaSelect.options].some((o) => o.value === anterior)) empresaSelect.value = anterior;
  }

  function renderAssinaturas() {
    const tbody = document.getElementById("assinaturasAdminLista43");
    tbody.replaceChildren();
    if (!assinaturas.length) {
      const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.textContent = "Nenhuma assinatura encontrada."; tr.append(td); tbody.append(tr); return;
    }
    assinaturas.forEach((item) => {
      const tr = document.createElement("tr");
      [item.empresa_nome, item.plano_nome, item.status, dataBr(item.inicio_em), dataBr(item.trial_fim_em)].forEach((texto) => { const td = document.createElement("td"); td.textContent = texto || "—"; tr.append(td); });
      tr.addEventListener("click", () => {
        document.getElementById("assinaturaEmpresa43").value = String(item.empresa_id);
        document.getElementById("assinaturaPlano43").value = String(item.plano_id);
        document.getElementById("assinaturaStatus43").value = item.status === "expirada" ? "expirada" : item.status;
      });
      tbody.append(tr);
    });
  }

  async function carregar() {
    const [resPlanos, resAssinaturas, resEmpresas] = await Promise.all([
      window.db.rpc("admin_planos_listar"),
      window.db.rpc("admin_assinaturas_listar"),
      window.db.from("empresas").select("id,nome").order("nome")
    ]);
    const erro = resPlanos.error || resAssinaturas.error || resEmpresas.error;
    if (erro) return toast("Não foi possível carregar planos", erro.message || "Tente novamente.", "error");
    planos = Array.isArray(resPlanos.data) ? resPlanos.data : [];
    assinaturas = Array.isArray(resAssinaturas.data) ? resAssinaturas.data : [];
    empresas = resEmpresas.data || [];
    renderPlanos(); renderSelects(); renderAssinaturas();
  }

  async function iniciar() {
    if (iniciado) return;
    for (let i = 0; i < 120; i += 1) {
      if (document.querySelector(".admin-sidebar nav") && document.querySelector(".admin-main") && document.getElementById("adminApp")?.hidden === false) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    iniciado = true;
    estilos(); montar();
    if (location.hash === "#planos") await carregar();
  }

  iniciar().catch((erro) => console.error("Admin planos 4.3:", erro));
})();
