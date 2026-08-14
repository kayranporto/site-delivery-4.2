"use strict";

(() => {
  if (!/empresa-dashboard\.html$/i.test(location.pathname)) return;

  const STORAGE_PREFIX = "multiDeliveryUnidadeAtiva:";
  let unidades = [];
  let unidadeAtivaId = "";
  let unidadeEditandoId = "";
  let inicializado = false;
  let recarregarPedidosOriginal = null;

  const toast = (titulo, mensagem = "", tipo = "info") => {
    if (window.AppToast) window.AppToast(titulo, mensagem, tipo);
    else console[tipo === "error" ? "error" : "log"](titulo, mensagem);
  };

  const erroTexto = (erro) => window.App?.mensagemErro?.(erro) || erro?.message || "Tente novamente.";

  const slugify = (valor) => String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const unidadeAtual = () => unidades.find((item) => String(item.id) === String(unidadeAtivaId)) || null;

  function injetarEstilos() {
    if (document.getElementById("multiunidade43Styles")) return;
    const style = document.createElement("style");
    style.id = "multiunidade43Styles";
    style.textContent = `
      .unit-switcher{display:flex;align-items:center;gap:9px;min-width:210px;padding:7px 10px;border:1px solid #e5e7eb;border-radius:13px;background:#fff}
      .unit-switcher>span{display:grid;width:28px;height:28px;place-items:center;border-radius:9px;background:#fff0f1;color:#d71928;font-weight:800}
      .unit-switcher label{display:grid;gap:1px;min-width:0;flex:1}
      .unit-switcher small{font-size:8px;font-weight:800;letter-spacing:.08em;color:#8a8f9b;text-transform:uppercase}
      .unit-switcher select{width:100%;min-width:0;border:0;background:transparent;color:#20242e;font:700 11px Poppins,sans-serif;outline:0;cursor:pointer}
      .units-view{display:grid;gap:20px}
      .units-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:25px;border:1px solid #e8e9ed;border-radius:22px;background:#fff}
      .units-hero h2{margin:4px 0 5px;font-size:22px}.units-hero p{margin:0;color:#6f7580;font-size:12px;line-height:1.6}
      .units-summary{display:flex;gap:10px;flex-wrap:wrap}.units-summary span{display:grid;gap:2px;min-width:95px;padding:10px 13px;border-radius:13px;background:#f6f7f9}.units-summary strong{font-size:17px}.units-summary small{color:#777e8b;font-size:9px}
      .units-layout{display:grid;grid-template-columns:minmax(300px,.72fr) minmax(0,1.28fr);gap:18px}
      .units-card{padding:22px;border:1px solid #e7e8ec;border-radius:20px;background:#fff}
      .units-card h3{margin:0 0 17px}.units-form{display:grid;gap:12px}.units-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.units-field{display:grid;gap:5px}.units-field.wide{grid-column:1/-1}.units-field label{font-size:9px;font-weight:800;color:#5e6571;text-transform:uppercase;letter-spacing:.05em}.units-field input{width:100%;min-width:0;padding:11px 12px;border:1px solid #dfe2e7;border-radius:11px;font:500 11px Poppins,sans-serif;outline:0}.units-field input:focus{border-color:#ea1d2c;box-shadow:0 0 0 3px rgba(234,29,44,.08)}
      .units-actions{display:flex;gap:9px;flex-wrap:wrap}.units-actions button,.unit-item button{border:0;border-radius:11px;padding:10px 13px;cursor:pointer;font:700 10px Poppins,sans-serif}.units-actions .primary{background:#ea1d2c;color:#fff}.units-actions .secondary,.unit-item button{background:#f1f2f5;color:#303641}.units-actions button[disabled],.unit-item button[disabled]{opacity:.55;cursor:not-allowed}
      .units-list{display:grid;gap:11px}.unit-item{display:grid;grid-template-columns:1fr auto;gap:12px;padding:15px;border:1px solid #e7e9ed;border-radius:15px}.unit-item.is-selected{border-color:#f3b3b9;background:#fffafa}.unit-item.is-inactive{opacity:.62}.unit-item h4{margin:0 0 4px;font-size:13px}.unit-item p{margin:0;color:#737985;font-size:10px;line-height:1.5}.unit-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.unit-badge{padding:4px 7px;border-radius:999px;background:#f1f2f5;color:#616874;font-size:8px;font-weight:800}.unit-badge.primary{background:#fff0f1;color:#cf1d2a}.unit-badge.active{background:#edf8ef;color:#168821}.unit-item-actions{display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap;justify-content:flex-end}.unit-item .use{background:#20242e;color:#fff}.unit-item .danger{background:#fff0f1;color:#c52230}
      .unit-empty{padding:24px;border:1px dashed #d8dbe0;border-radius:14px;color:#777e88;text-align:center;font-size:11px}
      @media(max-width:1000px){.unit-switcher{min-width:170px}.units-layout{grid-template-columns:1fr}}
      @media(max-width:720px){.unit-switcher{order:3;width:100%}.dashboard-header .header-actions{flex-wrap:wrap}.units-hero{align-items:flex-start;flex-direction:column}.units-form-grid{grid-template-columns:1fr}.units-field.wide{grid-column:auto}.unit-item{grid-template-columns:1fr}.unit-item-actions{justify-content:flex-start}}
    `;
    document.head.append(style);
  }

  function montarSeletor() {
    if (document.getElementById("unidadePainelSelect")) return;
    const headerActions = document.querySelector(".dashboard-header .header-actions");
    if (!headerActions) return;

    const wrapper = document.createElement("div");
    wrapper.className = "unit-switcher";
    wrapper.innerHTML = `
      <span aria-hidden="true">⌂</span>
      <label>
        <small>Unidade do painel</small>
        <select id="unidadePainelSelect" aria-label="Selecionar unidade do painel"></select>
      </label>`;
    headerActions.prepend(wrapper);
    wrapper.querySelector("select").addEventListener("change", (event) => selecionarUnidade(event.target.value, true));
  }

  function montarView() {
    if (document.getElementById("unidades43")) return;
    const nav = document.querySelector(".dashboard-sidebar nav");
    const main = document.querySelector(".dashboard-main");
    if (!nav || !main) return;

    const link = document.createElement("a");
    link.href = "#visaoGeral";
    link.id = "abrirUnidades43";
    link.innerHTML = '<span aria-hidden="true">⌂</span> Unidades';
    const configLink = nav.querySelector('a[href="#configuracoes"]');
    if (configLink) nav.insertBefore(link, configLink);
    else nav.append(link);

    const section = document.createElement("section");
    section.id = "unidades43";
    section.className = "management-section dashboard-view units-view";
    section.hidden = true;
    section.setAttribute("tabindex", "-1");
    section.setAttribute("aria-label", "Unidades");
    section.innerHTML = `
      <div class="units-hero">
        <div>
          <span class="section-kicker">MULTIUNIDADE</span>
          <h2>Lojas e unidades</h2>
          <p>Separe pedidos, produtos e categorias por unidade. A unidade principal continua sendo o padrão do checkout enquanto a seleção pública de unidade não for ativada.</p>
        </div>
        <div class="units-summary">
          <span><strong id="unidadesTotal43">0</strong><small>unidades</small></span>
          <span><strong id="unidadesAtivas43">0</strong><small>ativas</small></span>
        </div>
      </div>
      <div class="units-layout">
        <article class="units-card">
          <h3 id="unidadeFormTitulo43">Nova unidade</h3>
          <form class="units-form" id="unidadeForm43">
            <div class="units-form-grid">
              <div class="units-field wide"><label for="unidadeNome43">Nome</label><input id="unidadeNome43" maxlength="100" placeholder="Ex.: Centro" required></div>
              <div class="units-field wide"><label for="unidadeEndereco43">Endereço</label><input id="unidadeEndereco43" maxlength="220" placeholder="Rua, número e complemento"></div>
              <div class="units-field"><label for="unidadeCidade43">Cidade</label><input id="unidadeCidade43" maxlength="100"></div>
              <div class="units-field"><label for="unidadeUf43">UF</label><input id="unidadeUf43" maxlength="2" inputmode="text" style="text-transform:uppercase"></div>
              <div class="units-field wide"><label for="unidadeTelefone43">Telefone</label><input id="unidadeTelefone43" maxlength="30" inputmode="tel"></div>
            </div>
            <div class="units-actions">
              <button class="primary" id="unidadeSalvar43" type="submit">Criar unidade</button>
              <button class="secondary" id="unidadeCancelar43" type="button" hidden>Cancelar edição</button>
            </div>
          </form>
        </article>
        <article class="units-card">
          <h3>Unidades cadastradas</h3>
          <div class="units-list" id="unidadesLista43"><div class="unit-empty">Carregando unidades...</div></div>
        </article>
      </div>`;
    main.append(section);

    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelectorAll("[data-dashboard-view]").forEach((view) => {
        view.hidden = true;
        view.classList.remove("is-active");
      });
      section.hidden = false;
      section.classList.add("is-active");
      document.querySelectorAll(".dashboard-sidebar nav a").forEach((item) => {
        item.classList.toggle("active", item === link);
        if (item === link) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      section.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    [...nav.querySelectorAll('a[href^="#"]')].filter((item) => item !== link).forEach((item) => {
      item.addEventListener("click", () => {
        section.hidden = true;
        section.classList.remove("is-active");
      });
    });

    document.getElementById("unidadeForm43").addEventListener("submit", salvarUnidade);
    document.getElementById("unidadeCancelar43").addEventListener("click", limparFormularioUnidade);
  }

  function limparFormularioUnidade() {
    unidadeEditandoId = "";
    const form = document.getElementById("unidadeForm43");
    form?.reset();
    document.getElementById("unidadeFormTitulo43").textContent = "Nova unidade";
    document.getElementById("unidadeSalvar43").textContent = "Criar unidade";
    document.getElementById("unidadeCancelar43").hidden = true;
  }

  function preencherFormularioUnidade(unidade) {
    unidadeEditandoId = String(unidade.id);
    document.getElementById("unidadeNome43").value = unidade.nome || "";
    document.getElementById("unidadeEndereco43").value = unidade.endereco || "";
    document.getElementById("unidadeCidade43").value = unidade.cidade || "";
    document.getElementById("unidadeUf43").value = unidade.uf || "";
    document.getElementById("unidadeTelefone43").value = unidade.telefone || "";
    document.getElementById("unidadeFormTitulo43").textContent = "Editar unidade";
    document.getElementById("unidadeSalvar43").textContent = "Salvar alterações";
    document.getElementById("unidadeCancelar43").hidden = false;
    document.getElementById("unidadeNome43").focus();
  }

  async function salvarUnidade(event) {
    event.preventDefault();
    if (!empresa?.id) return;
    const nome = document.getElementById("unidadeNome43").value.trim();
    const uf = document.getElementById("unidadeUf43").value.trim().toUpperCase();
    if (nome.length < 2) return toast("Nome inválido", "Informe um nome com pelo menos 2 caracteres.", "warning");
    if (uf && !/^[A-Z]{2}$/.test(uf)) return toast("UF inválida", "Use a sigla do estado com 2 letras.", "warning");

    const payload = {
      empresa_id: String(empresa.id),
      nome,
      endereco: document.getElementById("unidadeEndereco43").value.trim() || null,
      cidade: document.getElementById("unidadeCidade43").value.trim() || null,
      uf: uf || null,
      telefone: document.getElementById("unidadeTelefone43").value.trim() || null,
      updated_at: new Date().toISOString()
    };

    const botao = document.getElementById("unidadeSalvar43");
    botao.disabled = true;
    let resposta;
    if (unidadeEditandoId) {
      resposta = await window.db.from("empresa_unidades")
        .update(payload)
        .eq("id", unidadeEditandoId)
        .eq("empresa_id", String(empresa.id))
        .select("*")
        .single();
    } else {
      payload.slug = slugify(nome) || `unidade-${Date.now()}`;
      payload.ativa = true;
      payload.principal = false;
      delete payload.updated_at;
      resposta = await window.db.from("empresa_unidades").insert(payload).select("*").single();
    }
    botao.disabled = false;

    if (resposta.error) {
      const duplicado = resposta.error.code === "23505";
      return toast("Não foi possível salvar", duplicado ? "Já existe uma unidade com esse identificador. Use outro nome." : erroTexto(resposta.error), "error");
    }

    toast(unidadeEditandoId ? "Unidade atualizada" : "Unidade criada", `${resposta.data.nome} está pronta para ser usada no painel.`, "success");
    limparFormularioUnidade();
    await carregarUnidades(false);
    if (!unidadeEditandoId && resposta.data?.id) await selecionarUnidade(resposta.data.id, true);
  }

  async function alternarUnidade(unidade) {
    if (unidade.principal && unidade.ativa) {
      return toast("Unidade principal", "A unidade principal não pode ser desativada nesta etapa.", "warning");
    }
    const novoStatus = !unidade.ativa;
    const confirmou = window.AppConfirm ? await window.AppConfirm({
      titulo: novoStatus ? "Ativar unidade?" : "Desativar unidade?",
      mensagem: novoStatus
        ? `A unidade ${unidade.nome} voltará a aparecer no seletor operacional.`
        : `A unidade ${unidade.nome} ficará fora do seletor operacional. Os dados existentes serão preservados.`,
      confirmar: novoStatus ? "Ativar unidade" : "Desativar unidade",
      cancelar: "Voltar",
      perigoso: !novoStatus,
      icone: novoStatus ? "✓" : "!",
      etiqueta: "Multiunidade"
    }) : true;
    if (!confirmou) return;

    const { error } = await window.db.from("empresa_unidades")
      .update({ ativa: novoStatus, updated_at: new Date().toISOString() })
      .eq("id", unidade.id)
      .eq("empresa_id", String(empresa.id));
    if (error) return toast("Não foi possível atualizar", erroTexto(error), "error");
    toast(novoStatus ? "Unidade ativada" : "Unidade desativada", unidade.nome, "success");
    await carregarUnidades(false);
  }

  function renderizarUnidades() {
    const lista = document.getElementById("unidadesLista43");
    const select = document.getElementById("unidadePainelSelect");
    if (!lista || !select) return;

    document.getElementById("unidadesTotal43").textContent = String(unidades.length);
    document.getElementById("unidadesAtivas43").textContent = String(unidades.filter((u) => u.ativa).length);

    select.replaceChildren();
    unidades.filter((u) => u.ativa).forEach((unidade) => {
      const option = document.createElement("option");
      option.value = unidade.id;
      option.textContent = `${unidade.nome}${unidade.principal ? " • Principal" : ""}`;
      select.append(option);
    });
    if (unidadeAtivaId && [...select.options].some((o) => o.value === String(unidadeAtivaId))) select.value = String(unidadeAtivaId);

    lista.replaceChildren();
    if (!unidades.length) {
      lista.innerHTML = '<div class="unit-empty">Nenhuma unidade cadastrada.</div>';
      return;
    }

    unidades.forEach((unidade) => {
      const item = document.createElement("div");
      item.className = `unit-item${String(unidade.id) === String(unidadeAtivaId) ? " is-selected" : ""}${!unidade.ativa ? " is-inactive" : ""}`;
      const info = document.createElement("div");
      const local = [unidade.endereco, unidade.cidade, unidade.uf].filter(Boolean).join(" • ") || "Endereço ainda não informado";
      info.innerHTML = `<h4></h4><p></p><div class="unit-badges"></div>`;
      info.querySelector("h4").textContent = unidade.nome;
      info.querySelector("p").textContent = local;
      const badges = info.querySelector(".unit-badges");
      if (unidade.principal) {
        const badge = document.createElement("span"); badge.className = "unit-badge primary"; badge.textContent = "Principal"; badges.append(badge);
      }
      const status = document.createElement("span"); status.className = `unit-badge${unidade.ativa ? " active" : ""}`; status.textContent = unidade.ativa ? "Ativa" : "Inativa"; badges.append(status);
      if (String(unidade.id) === String(unidadeAtivaId)) {
        const atual = document.createElement("span"); atual.className = "unit-badge"; atual.textContent = "Em uso no painel"; badges.append(atual);
      }

      const actions = document.createElement("div");
      actions.className = "unit-item-actions";
      if (unidade.ativa) {
        const usar = document.createElement("button"); usar.type = "button"; usar.className = "use"; usar.textContent = "Usar no painel"; usar.disabled = String(unidade.id) === String(unidadeAtivaId); usar.addEventListener("click", () => selecionarUnidade(unidade.id, true)); actions.append(usar);
      }
      const editar = document.createElement("button"); editar.type = "button"; editar.textContent = "Editar"; editar.addEventListener("click", () => preencherFormularioUnidade(unidade)); actions.append(editar);
      const alternar = document.createElement("button"); alternar.type = "button"; alternar.className = unidade.ativa ? "danger" : ""; alternar.textContent = unidade.ativa ? "Desativar" : "Ativar"; alternar.disabled = unidade.principal && unidade.ativa; alternar.addEventListener("click", () => alternarUnidade(unidade)); actions.append(alternar);
      item.append(info, actions);
      lista.append(item);
    });
  }

  async function carregarUnidades(recarregarDados = true) {
    if (!empresa?.id) return;
    const { data, error } = await window.db.from("empresa_unidades")
      .select("id,empresa_id,nome,slug,endereco,cidade,uf,telefone,ativa,principal,created_at,updated_at")
      .eq("empresa_id", String(empresa.id))
      .order("principal", { ascending: false })
      .order("nome", { ascending: true });
    if (error) return toast("Falha ao carregar unidades", erroTexto(error), "error");
    unidades = data || [];

    const chave = `${STORAGE_PREFIX}${empresa.id}`;
    const salva = localStorage.getItem(chave);
    const valida = unidades.find((u) => u.ativa && String(u.id) === String(salva));
    const principal = unidades.find((u) => u.ativa && u.principal);
    const primeira = unidades.find((u) => u.ativa);
    if (!unidadeAtivaId || !unidades.some((u) => u.ativa && String(u.id) === String(unidadeAtivaId))) {
      unidadeAtivaId = String((valida || principal || primeira)?.id || "");
    }
    if (unidadeAtivaId) localStorage.setItem(chave, unidadeAtivaId);
    renderizarUnidades();
    if (recarregarDados && unidadeAtivaId) await carregarDadosUnidade(false);
  }

  function resetarFormularioProduto() {
    produtoEditandoId = null;
    const form = document.getElementById("produtoForm");
    form?.reset();
    document.getElementById("produtoFormTitulo").textContent = "Novo produto";
    document.getElementById("produtoSalvar").textContent = "Cadastrar produto";
    document.getElementById("produtoDisponivel").checked = true;
    document.getElementById("produtoControlaEstoque").checked = false;
    document.getElementById("produtoEstoque").value = "0";
    document.getElementById("produtoEstoqueMinimo").value = "5";
    document.getElementById("produtoImagem").value = "";
    window.MediaUploader?.refreshAll();
  }

  async function selecionarUnidade(id, avisar = false) {
    const unidade = unidades.find((u) => u.ativa && String(u.id) === String(id));
    if (!unidade || !empresa?.id) return;
    unidadeAtivaId = String(unidade.id);
    localStorage.setItem(`${STORAGE_PREFIX}${empresa.id}`, unidadeAtivaId);
    resetarFormularioProduto();
    renderizarUnidades();
    await carregarDadosUnidade(avisar);
  }

  async function carregarDadosUnidade(avisar = false) {
    if (!empresa?.id || !unidadeAtivaId) return false;
    const [resPedidos, resProdutos, resCategorias] = await Promise.all([
      window.db.from("pedidos").select("*, pedido_itens(*)").eq("empresa_id", String(empresa.id)).eq("unidade_id", unidadeAtivaId).order("created_at", { ascending: false }),
      window.db.from("produtos").select("*").eq("empresa_id", empresa.id).eq("unidade_id", unidadeAtivaId).order("nome"),
      window.db.from("categorias").select("*").eq("empresa_id", empresa.id).eq("unidade_id", unidadeAtivaId).order("ordem").order("nome")
    ]);
    const erro = resPedidos.error || resProdutos.error || resCategorias.error;
    if (erro) {
      toast("Falha ao trocar unidade", erroTexto(erro), "error");
      return false;
    }

    pedidos = resPedidos.data || [];
    produtos = resProdutos.data || [];
    categorias = resCategorias.data || [];
    renderizarPedidos();
    renderizarFilaCozinha();
    renderizarCategorias();
    renderizarProdutos();
    atualizarIndicadores();
    document.getElementById("ultimaAtualizacao").textContent = "agora";
    if (avisar) toast("Unidade selecionada", unidadeAtual()?.nome || "Unidade", "success");
    return true;
  }

  function substituirRecarregamentoPedidos() {
    if (typeof recarregarPedidos !== "function" || recarregarPedidosOriginal) return;
    recarregarPedidosOriginal = recarregarPedidos;
    recarregarPedidos = async (marcarNovo = "") => {
      if (!unidadeAtivaId) return recarregarPedidosOriginal(marcarNovo);
      const { data, error } = await window.db.from("pedidos")
        .select("*, pedido_itens(*)")
        .eq("empresa_id", String(empresa.id))
        .eq("unidade_id", unidadeAtivaId)
        .order("created_at", { ascending: false });
      if (error) {
        toast("Falha ao atualizar", erroTexto(error), "error");
        return false;
      }
      pedidos = (data || []).map((pedido) => ({ ...pedido, _novo: String(pedido.id) === String(marcarNovo) }));
      renderizarPedidos();
      renderizarFilaCozinha();
      atualizarIndicadores();
      return true;
    };
  }

  function interceptarCategoria() {
    const form = document.getElementById("categoriaForm");
    if (!form || form.dataset.multiunidade43 === "1") return;
    form.dataset.multiunidade43 = "1";
    form.addEventListener("submit", async (event) => {
      if (!unidadeAtivaId || !empresa?.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const campo = document.getElementById("novaCategoria");
      const nome = campo.value.trim();
      if (!nome) return;
      if (categorias.some((categoria) => String(categoria.nome).toLowerCase() === nome.toLowerCase())) {
        return toast("Categoria já existe", "Use outro nome nesta unidade.", "warning");
      }
      const botao = form.querySelector("button[type='submit']");
      App.definirCarregando(botao, true, "Adicionando...");
      const { data, error } = await window.db.from("categorias").insert({
        empresa_id: empresa.id,
        unidade_id: unidadeAtivaId,
        nome,
        ordem: categorias.length,
        ativo: true
      }).select("*").single();
      App.definirCarregando(botao, false);
      if (error) return toast("Não foi possível criar a categoria", erroTexto(error), "error");
      categorias.push(data);
      campo.value = "";
      renderizarCategorias();
      toast("Categoria criada", `${nome} foi adicionada a ${unidadeAtual()?.nome || "esta unidade"}.`, "success");
    }, true);
  }

  function interceptarProduto() {
    const form = document.getElementById("produtoForm");
    if (!form || form.dataset.multiunidade43 === "1") return;
    form.dataset.multiunidade43 = "1";
    form.addEventListener("submit", async (event) => {
      if (!unidadeAtivaId || !empresa?.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const preco = Number(document.getElementById("produtoPreco").value);
      const promocaoTexto = document.getElementById("produtoPromocao").value;
      const promocao = promocaoTexto ? Number(promocaoTexto) : null;
      const estoque = Number(document.getElementById("produtoEstoque").value || 0);
      const estoqueMinimo = Number(document.getElementById("produtoEstoqueMinimo").value || 0);
      const nome = document.getElementById("produtoNome").value.trim();
      if (!nome) return toast("Nome obrigatório", "Informe o nome do produto.", "warning");
      if (!Number.isFinite(preco) || preco < 0) return toast("Preço inválido", "Informe um preço válido.", "warning");
      if (promocao !== null && (!Number.isFinite(promocao) || promocao <= 0 || promocao >= preco)) return toast("Promoção inválida", "O preço promocional deve ser maior que zero e menor que o preço normal.", "warning");
      if (![estoque, estoqueMinimo].every(Number.isInteger) || estoque < 0 || estoqueMinimo < 0) return toast("Estoque inválido", "Informe quantidades de estoque válidas.", "warning");

      const payload = {
        empresa_id: empresa.id,
        unidade_id: unidadeAtivaId,
        categoria_id: document.getElementById("produtoCategoria").value || null,
        nome,
        descricao: document.getElementById("produtoDescricao").value.trim() || null,
        imagem: document.getElementById("produtoImagem").value.trim() || null,
        preco,
        promocao,
        disponivel: document.getElementById("produtoDisponivel").checked,
        controle_estoque: document.getElementById("produtoControlaEstoque").checked,
        estoque,
        estoque_minimo: estoqueMinimo
      };

      const botao = form.querySelector("button[type='submit']");
      App.definirCarregando(botao, true, produtoEditandoId ? "Salvando..." : "Cadastrando...");
      let consulta = produtoEditandoId
        ? window.db.from("produtos").update(payload).eq("id", produtoEditandoId).eq("empresa_id", empresa.id)
        : window.db.from("produtos").insert(payload);
      const { data, error } = await consulta.select("*").single();
      App.definirCarregando(botao, false);
      if (error) return toast("Não foi possível salvar o produto", erroTexto(error), "error");

      if (produtoEditandoId) produtos = produtos.map((item) => String(item.id) === String(produtoEditandoId) ? data : item);
      else produtos.push(data);
      produtos.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      resetarFormularioProduto();
      renderizarProdutos();
      toast(produtoEditandoId ? "Produto atualizado" : "Produto cadastrado", `${nome} pertence a ${unidadeAtual()?.nome || "esta unidade"}.`, "success");
    }, true);
  }

  async function aguardarPainel() {
    for (let tentativa = 0; tentativa < 100; tentativa += 1) {
      if (typeof empresa !== "undefined" && empresa?.id && typeof renderizarPedidos === "function") return true;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return false;
  }

  async function iniciar() {
    if (inicializado) return;
    const pronto = await aguardarPainel();
    if (!pronto) return console.warn("Multiunidade 4.3: painel não ficou pronto a tempo.");
    inicializado = true;
    injetarEstilos();
    montarSeletor();
    montarView();
    substituirRecarregamentoPedidos();
    interceptarCategoria();
    interceptarProduto();
    await carregarUnidades(true);
  }

  iniciar().catch((erro) => {
    console.error("Multiunidade 4.3:", erro);
    toast("Falha ao iniciar multiunidade", erroTexto(erro), "error");
  });
})();
