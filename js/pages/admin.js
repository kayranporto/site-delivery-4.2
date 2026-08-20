"use strict";

let adminEmpresas = [];
let adminUsuarios = [];
let adminPedidos = [];
let adminCupons = [];
let adminEntregadores = [];
let adminLogs = [];
let adminAuditoria = [];
let adminRelatorio = null;
let adminInteligencia = { produtos: [], clientes_recorrentes: [], seguranca: {} };
let canalAdmin = null;
let recarregarTimer = null;
let carregandoDados = false;
let paginaPedidos = 1;
const pedidosPorPagina = 10;
const avisosCompatibilidadeAdmin = new Set();

const modal = document.getElementById("adminModal");
const modalTitulo = document.getElementById("adminModalTitle");
const modalKicker = document.getElementById("adminModalKicker");
const modalCorpo = document.getElementById("adminModalBody");
const modalAcoes = document.getElementById("adminModalActions");
let focoAntesModal = null;
let resolverModal = null;

function elemento(tag, classe, texto) {
    const item = document.createElement(tag);
    if (classe) item.className = classe;
    if (texto !== undefined) item.textContent = texto;
    return item;
}

function dataCurta(valor) {
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? data.toLocaleDateString("pt-BR") : "—";
}

function dataHora(valor) {
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function paraDataLocal(valor) {
    if (!valor) return "";
    const data = new Date(valor);
    if (!Number.isFinite(data.getTime())) return "";
    const deslocamento = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - deslocamento).toISOString().slice(0, 16);
}

function vazioTabela(colunas, texto) {
    const tr = document.createElement("tr");
    const td = elemento("td", "", texto);
    td.colSpan = colunas;
    tr.append(td);
    return tr;
}

function nomeEmpresa(id) {
    return adminEmpresas.find((empresa) => String(empresa.id) === String(id))?.nome || "Plataforma";
}

function statusLegivel(status) {
    return ({ recebido: "Recebido", preparando: "Preparando", saiu_para_entrega: "Saiu para entrega", entregue: "Entregue", cancelado: "Cancelado" })[status] || String(status || "Recebido").replaceAll("_", " ");
}

function anunciar(mensagem) {
    document.getElementById("adminLive").textContent = mensagem;
}

function mostrarErro(titulo, erro) {
    const mensagem = App.mensagemErro(erro);
    if (window.AppToast) window.AppToast(titulo, mensagem, "error");
    else alert(`${titulo}: ${mensagem}`);
    anunciar(`${titulo}: ${mensagem}`);
}

function recursoNaoMigrado(erro, ...nomes) {
    if (!erro) return false;
    const mensagem = `${erro.code || ""} ${erro.message || ""} ${erro.details || ""}`.toLowerCase();
    return ["42703", "42p01", "pgrst202", "pgrst204", "pgrst205", "does not exist", "could not find"].some((trecho) => mensagem.includes(trecho))
        && (!nomes.length || nomes.some((nome) => mensagem.includes(String(nome).toLowerCase())));
}

function registrarCompatibilidade(recurso) {
    avisosCompatibilidadeAdmin.add(recurso);
}

async function consultarEmpresasAdmin() {
    const seletores = [
        "id,nome,email,telefone,cnpj,descricao,categoria,taxa_entrega,pedido_minimo,tempo_estimado_min,tempo_estimado_max,publicado,status,created_at",
        "id,nome,email,telefone,cnpj,descricao,categoria,taxa_entrega,pedido_minimo,publicado,status,created_at",
        "id,nome,email,telefone,cnpj,publicado,status,created_at"
    ];
    let resposta;
    for (const colunas of seletores) {
        resposta = await db.from("empresas").select(colunas).order("created_at", { ascending: false });
        if (!resposta.error) return resposta;
        if (!recursoNaoMigrado(resposta.error)) return resposta;
        registrarCompatibilidade("cadastro completo de restaurantes");
    }
    return resposta;
}

async function consultarPedidosAdmin() {
    const seletores = [
        "id,numero,usuario_id,empresa_id,empresa_nome,cliente_nome,cliente_telefone,status,total,pagamento_status,pagamento_modalidade,agendado_para,created_at,updated_at",
        "id,numero,usuario_id,empresa_id,empresa_nome,cliente_nome,cliente_telefone,status,total,pagamento_status,pagamento_modalidade,created_at,updated_at",
        "id,numero,empresa_id,status,total,pagamento_status,created_at,updated_at",
        "id,numero,empresa_id,status,total,created_at,updated_at"
    ];
    let resposta;
    for (const colunas of seletores) {
        resposta = await db.from("pedidos").select(colunas).order("created_at", { ascending: false }).limit(5000);
        if (!resposta.error) {
            resposta.data = (resposta.data || []).map((pedido) => ({ pagamento_status: "pendente", pagamento_modalidade: "na_entrega", ...pedido }));
            return resposta;
        }
        if (!recursoNaoMigrado(resposta.error)) return resposta;
        registrarCompatibilidade("pedidos avançados");
    }
    return resposta;
}

async function consultarCuponsAdmin() {
    const seletores = [
        "id,empresa_id,codigo,tipo,valor,pedido_minimo,ativo,usos,limite_usos,primeiro_pedido,inicio,fim,max_desconto,limite_por_usuario,created_at",
        "id,empresa_id,codigo,tipo,valor,pedido_minimo,ativo,usos,limite_usos,primeiro_pedido,inicio,fim,created_at",
        "id,codigo,desconto,ativo,validade,created_at"
    ];
    let resposta;
    for (const colunas of seletores) {
        resposta = await db.from("cupons").select(colunas).order("created_at", { ascending: false });
        if (!resposta.error) {
            resposta.data = (resposta.data || []).map((cupom) => ({
                empresa_id: null, tipo: "fixo", valor: cupom.desconto || 0, pedido_minimo: 0,
                usos: 0, limite_usos: null, primeiro_pedido: false, inicio: cupom.created_at,
                fim: cupom.validade || null, max_desconto: null, limite_por_usuario: 1, ...cupom
            }));
            return resposta;
        }
        if (!recursoNaoMigrado(resposta.error)) return resposta;
        registrarCompatibilidade("cupons avançados");
    }
    return resposta;
}

async function consultarRecursoOpcional(tabela, colunas, ordem = "created_at", limite = null) {
    let consulta = db.from(tabela).select(colunas).order(ordem, { ascending: false });
    if (limite) consulta = consulta.limit(limite);
    const resposta = await consulta;
    if (!recursoNaoMigrado(resposta.error, tabela)) return resposta;
    registrarCompatibilidade(tabela);
    return { data: [], error: null };
}

function relatorioAdminLocal(dias) {
    const inicio = Date.now() - dias * 86400000;
    const pedidos = adminPedidos.filter((pedido) => new Date(pedido.created_at).getTime() >= inicio);
    const entregues = pedidos.filter((pedido) => pedido.status === "entregue");
    const tempos = entregues.map((pedido) => (new Date(pedido.updated_at).getTime() - new Date(pedido.created_at).getTime()) / 60000).filter((tempo) => Number.isFinite(tempo) && tempo >= 0);
    return {
        periodo_dias: dias,
        pedidos: pedidos.length,
        entregues: entregues.length,
        cancelados: pedidos.filter((pedido) => pedido.status === "cancelado").length,
        ticket_medio: entregues.length ? entregues.reduce((total, pedido) => total + Number(pedido.total || 0), 0) / entregues.length : 0,
        tempo_medio_minutos: tempos.length ? tempos.reduce((total, tempo) => total + tempo, 0) / tempos.length : 0,
        online: pedidos.filter((pedido) => pedido.pagamento_modalidade === "online").length
    };
}

function exibirAvisoCompatibilidade() {
    if (!avisosCompatibilidadeAdmin.size || document.getElementById("adminMigrationWarning")) return;
    const aviso = elemento("section", "admin-migration-warning");
    aviso.id = "adminMigrationWarning";
    const texto = elemento("div");
    texto.append(
        elemento("strong", "", "Banco aguardando atualização"),
        elemento("p", "", "O painel está em modo compatibilidade. Execute as migrações 008, 009 e 010 no Supabase para liberar todas as funções.")
    );
    aviso.append(elemento("span", "", "!"), texto);
    document.querySelector(".admin-main").prepend(aviso);
    const saude = document.querySelector(".admin-health");
    saude?.classList.add("warning");
    const status = saude?.querySelector("strong");
    if (status) status.textContent = "Atualização pendente";
}

function botao(texto, classe = "admin-secondary-button", tipo = "button") {
    const item = elemento("button", classe, texto);
    item.type = tipo;
    return item;
}

function abrirModal({ titulo, kicker = "ADMINISTRAÇÃO", corpo, acoes = [] }) {
    focoAntesModal = document.activeElement;
    modalTitulo.textContent = titulo;
    modalKicker.textContent = kicker;
    modalCorpo.replaceChildren(corpo);
    modalAcoes.replaceChildren(...acoes);
    modal.hidden = false;
    document.body.classList.add("admin-modal-open");
    requestAnimationFrame(() => modal.querySelector("input,select,textarea,button:not([data-modal-close])")?.focus());
}

function fecharModal(resultado = false) {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("admin-modal-open");
    modalCorpo.replaceChildren();
    modalAcoes.replaceChildren();
    const resolver = resolverModal;
    resolverModal = null;
    resolver?.(resultado);
    focoAntesModal?.focus?.();
}

function confirmarAcao(titulo, mensagem, textoConfirmar = "Confirmar", perigoso = false) {
    return new Promise((resolve) => {
        resolverModal = resolve;
        const corpo = elemento("div", "confirm-content");
        const texto = elemento("div");
        texto.append(elemento("strong", "", titulo), elemento("p", "", mensagem));
        corpo.append(elemento("span", "", perigoso ? "!" : "?"), texto);
        const cancelar = botao("Cancelar");
        cancelar.addEventListener("click", () => fecharModal(false));
        const confirmar = botao(textoConfirmar, perigoso ? "admin-primary-button danger" : "admin-primary-button");
        confirmar.addEventListener("click", () => fecharModal(true));
        abrirModal({ titulo, kicker: perigoso ? "ATENÇÃO" : "CONFIRMAÇÃO", corpo, acoes: [cancelar, confirmar] });
    });
}

function campoFormulario(rotulo, id, tipo = "text", valor = "", opcoes = {}) {
    const caixa = elemento("label", `admin-form-field${opcoes.full ? " full" : ""}`);
    caixa.htmlFor = id;
    caixa.append(elemento("span", "", rotulo));
    let entrada;
    if (tipo === "select") {
        entrada = document.createElement("select");
        (opcoes.items || []).forEach(({ value, label }) => {
            const option = document.createElement("option"); option.value = value; option.textContent = label; entrada.append(option);
        });
    } else if (tipo === "textarea") {
        entrada = document.createElement("textarea");
    } else {
        entrada = document.createElement("input"); entrada.type = tipo;
    }
    entrada.id = id;
    entrada.value = valor ?? "";
    if (opcoes.required) entrada.required = true;
    if (opcoes.min !== undefined) entrada.min = opcoes.min;
    if (opcoes.max !== undefined) entrada.max = opcoes.max;
    if (opcoes.step !== undefined) entrada.step = opcoes.step;
    if (opcoes.placeholder) entrada.placeholder = opcoes.placeholder;
    caixa.append(entrada);
    return { caixa, entrada };
}

function campoCheck(rotulo, id, marcado = false) {
    const caixa = elemento("label", "admin-form-check");
    caixa.htmlFor = id;
    const entrada = document.createElement("input"); entrada.type = "checkbox"; entrada.id = id; entrada.checked = marcado;
    caixa.append(entrada, document.createTextNode(rotulo));
    return { caixa, entrada };
}

function atualizarMetricasAdmin() {
    const pendentes = adminEmpresas.filter((empresa) => empresa.publicado !== true).length;
    const bloqueados = adminUsuarios.filter((usuario) => usuario.bloqueado === true).length;
    const faturamento = adminPedidos.filter((pedido) => pedido.status === "entregue" && pedido.pagamento_status === "pago").reduce((soma, pedido) => soma + Number(pedido.total || 0), 0);
    document.getElementById("adminTotalEmpresas").textContent = String(adminEmpresas.length);
    document.getElementById("adminPendentes").textContent = String(pendentes);
    document.getElementById("pendentesMenu").textContent = String(pendentes);
    document.getElementById("adminTotalUsuarios").textContent = String(adminUsuarios.length);
    document.getElementById("adminBloqueados").textContent = String(bloqueados);
    document.getElementById("adminTotalPedidos").textContent = String(adminPedidos.length);
    document.getElementById("pedidosMenu").textContent = String(adminPedidos.length);
    document.getElementById("adminFaturamento").textContent = App.dinheiro(faturamento);
    const entregadoresPendentes = adminEntregadores.filter((item) => !item.aprovado).length;
    document.getElementById("entregadoresPendentesMenu").textContent = String(entregadoresPendentes);
}

function renderizarEntregadores() {
    const tbody = document.getElementById("adminEntregadores");
    const termo = document.getElementById("buscaAdminEntregador").value.trim().toLowerCase();
    const lista = adminEntregadores.filter((item) => !termo || `${item.nome} ${item.telefone} ${item.veiculo} ${item.placa || ""}`.toLowerCase().includes(termo));
    tbody.replaceChildren();
    if (!lista.length) { tbody.append(vazioTabela(6, "Nenhum entregador encontrado.")); return; }
    lista.forEach((item) => {
        const tr = document.createElement("tr");
        const nome = document.createElement("td"); nome.append(elemento("strong", "", item.nome), elemento("small", "", item.documento || "Documento não informado"));
        const veiculo = document.createElement("td"); veiculo.append(elemento("strong", "", item.veiculo || "—"), elemento("small", "", item.placa || "Sem placa"));
        const status = document.createElement("td"); status.append(elemento("span", `status-pill ${item.aprovado ? "active" : ""}`, item.aprovado ? (item.online ? "Online" : "Aprovado") : "Pendente"));
        const acao = document.createElement("td");
        const acaoBotao = botao(item.aprovado ? "Suspender" : "Aprovar", `admin-action ${item.aprovado ? "danger" : "primary"}`);
        acaoBotao.addEventListener("click", async () => {
            const aprovar = !item.aprovado;
            if (!await confirmarAcao(`${aprovar ? "Aprovar" : "Suspender"} entregador`, `${item.nome} ${aprovar ? "poderá aceitar entregas" : "perderá o acesso a novas entregas"}.`, aprovar ? "Aprovar" : "Suspender", !aprovar)) return;
            acaoBotao.disabled = true;
            const { error } = await db.rpc("admin_definir_entregador", { p_entregador_id: item.id, p_aprovado: aprovar });
            acaoBotao.disabled = false;
            if (error) return mostrarErro("Não foi possível atualizar o entregador", error);
            item.aprovado = aprovar; item.online = false; renderizarEntregadores(); atualizarMetricasAdmin();
            anunciar("Entregador atualizado.");
        });
        acao.append(acaoBotao);
        tr.append(nome, elemento("td", "", item.telefone || "—"), veiculo, elemento("td", "", dataCurta(item.created_at)), status, acao);
        tbody.append(tr);
    });
}

function renderizarAuditoria() {
    const container = document.getElementById("auditoriaAdmin");
    container.replaceChildren();
    if (!adminAuditoria.length) { container.append(elemento("p", "", "Nenhuma atividade administrativa registrada.")); return; }
    const nomes = {
        restaurante_atualizado: "Restaurante moderado", restaurante_editado: "Restaurante editado",
        usuario_bloqueio_atualizado: "Usuário atualizado", cupom_atualizado: "Cupom pausado/ativado",
        cupom_criado: "Cupom criado", cupom_editado: "Cupom editado", cupom_excluido: "Cupom excluído"
    };
    adminAuditoria.slice(0, 10).forEach((registro) => {
        const linha = elemento("div", "audit-row");
        linha.append(
            elemento("strong", "", nomes[registro.acao] || String(registro.acao || "Ação").replaceAll("_", " ")),
            elemento("span", "", registro.detalhes?.codigo || registro.detalhes?.nome || registro.alvo_id || "—"),
            elemento("time", "", dataHora(registro.created_at))
        );
        container.append(linha);
    });
}

function renderizarRelatorio() {
    if (!adminRelatorio) return;
    const total = Number(adminRelatorio.pedidos || 0);
    const cancelados = Number(adminRelatorio.cancelados || 0);
    document.getElementById("relatorioEntregues").textContent = String(adminRelatorio.entregues || 0);
    document.getElementById("relatorioCancelamento").textContent = `${total ? (cancelados / total * 100).toFixed(1) : "0.0"}%`;
    document.getElementById("relatorioTicket").textContent = App.dinheiro(adminRelatorio.ticket_medio);
    document.getElementById("relatorioTempo").textContent = `${Math.round(Number(adminRelatorio.tempo_medio_minutos || 0))} min`;
    document.getElementById("relatorioOnline").textContent = String(adminRelatorio.online || 0);

    const limite = Date.now() - Number(adminRelatorio.periodo_dias || 30) * 86400000;
    const grupos = new Map();
    adminPedidos.filter((pedido) => new Date(pedido.created_at).getTime() >= limite).forEach((pedido) => {
        const atual = grupos.get(String(pedido.empresa_id)) || { pedidos: 0, valor: 0 };
        atual.pedidos += 1;
        if (pedido.status === "entregue") atual.valor += Number(pedido.total || 0);
        grupos.set(String(pedido.empresa_id), atual);
    });
    const top = [...grupos.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 5);
    const topBox = document.getElementById("topRestaurantesAdmin"); topBox.replaceChildren();
    if (!top.length) topBox.append(elemento("p", "", "Sem dados no período."));
    top.forEach(([id, dados]) => { const row = elemento("div", "report-row"); row.append(elemento("span", "", nomeEmpresa(id)), elemento("strong", "", `${dados.pedidos} • ${App.dinheiro(dados.valor)}`)); topBox.append(row); });

    const produtosBox = document.getElementById("topProdutosAdmin"); produtosBox.replaceChildren();
    const produtosTop = adminInteligencia.produtos || [];
    if (!produtosTop.length) produtosBox.append(elemento("p", "", "Sem vendas concluídas no período."));
    produtosTop.slice(0, 6).forEach((produto) => { const row = elemento("div", "report-row"); row.append(elemento("span", "", `${produto.nome} • ${produto.empresa_nome}`), elemento("strong", "", `${produto.quantidade} un.`)); produtosBox.append(row); });

    const clientesBox = document.getElementById("clientesRecorrentesAdmin"); clientesBox.replaceChildren();
    const clientes = adminInteligencia.clientes_recorrentes || [];
    if (!clientes.length) clientesBox.append(elemento("p", "", "Nenhum cliente recorrente neste período."));
    clientes.slice(0, 6).forEach((cliente) => { const row = elemento("div", "report-row report-customer"); if (cliente.avatar_url) { const img = document.createElement("img"); img.src = cliente.avatar_url; img.alt = ""; row.append(img); } row.append(elemento("span", "", cliente.nome || "Cliente"), elemento("strong", "", `${cliente.pedidos} pedidos`)); clientesBox.append(row); });

    const segurancaBox = document.getElementById("segurancaLoginAdmin"); segurancaBox.replaceChildren();
    const seguranca = adminInteligencia.seguranca || {};
    const risco = Number(seguranca.emails_em_risco || 0);
    const resumoSeguranca = elemento("div", `security-summary ${risco ? "warning" : "ok"}`);
    resumoSeguranca.append(elemento("strong", "", risco ? `${risco} conta(s) em atenção` : "Nenhum bloqueio temporário"), elemento("span", "", `${Number(seguranca.falhas_24h || 0)} falha(s) de acesso nas últimas 24 horas`));
    segurancaBox.append(resumoSeguranca);

    const logsBox = document.getElementById("logsAdmin"); logsBox.replaceChildren();
    const logs = adminLogs.filter((log) => log.nivel === "error").slice(0, 6);
    if (!logs.length) logsBox.append(elemento("p", "", "Nenhum erro recente registrado."));
    logs.forEach((log) => { const row = elemento("div", "log-row"); row.append(elemento("strong", "", `${log.contexto} • ${log.pagina || "site"}`), elemento("span", "", log.mensagem), elemento("small", "", dataHora(log.created_at))); logsBox.append(row); });
    renderizarAuditoria();
}

async function carregarRelatorio() {
    const dias = Number(document.getElementById("periodoRelatorio").value || 30);
    const [operacional, inteligencia] = await Promise.all([
        db.rpc("admin_relatorio_operacional", { p_dias: dias }),
        db.rpc("admin_relatorio_clientes_produtos", { p_dias: dias })
    ]);
    const { data, error } = operacional;
    if (recursoNaoMigrado(error, "admin_relatorio_operacional")) {
        registrarCompatibilidade("relatório operacional");
        adminRelatorio = relatorioAdminLocal(dias);
        renderizarRelatorio(); exibirAvisoCompatibilidade(); return;
    }
    if (error) return mostrarErro("Não foi possível gerar o relatório", error);
    adminRelatorio = data;
    if (!inteligencia.error) adminInteligencia = inteligencia.data || adminInteligencia;
    else if (recursoNaoMigrado(inteligencia.error, "admin_relatorio_clientes_produtos")) registrarCompatibilidade("relatórios de produtos e recorrência");
    renderizarRelatorio();
}

function linhasCsv(pedidos) {
    return [["numero", "restaurante", "cliente", "status", "pagamento", "modalidade", "total", "criado_em", "atualizado_em"], ...pedidos.map((p) => [p.numero, nomeEmpresa(p.empresa_id), p.cliente_nome || "", p.status, p.pagamento_status, p.pagamento_modalidade || "na_entrega", p.total, p.created_at, p.updated_at])];
}

function baixarCsv(linhas, nome) {
    const csv = linhas.map((linha) => linha.map((valor) => `"${String(valor ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = nome; link.click(); URL.revokeObjectURL(url);
}

function exportarRelatorioCsv() {
    baixarCsv(linhasCsv(adminPedidos), `multi-delivery-relatorio-${new Date().toISOString().slice(0, 10)}.csv`);
}

function renderizarGraficoAdmin() {
    const container = document.getElementById("adminChart");
    const agora = new Date();
    const grupos = [];
    for (let indice = 6; indice >= 0; indice -= 1) {
        const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - indice);
        grupos.push({ chave: data.toISOString().slice(0, 10), label: data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), valor: 0, pedidos: 0 });
    }
    adminPedidos.forEach((pedido) => {
        const data = new Date(pedido.created_at);
        const chave = new Date(data.getFullYear(), data.getMonth(), data.getDate()).toISOString().slice(0, 10);
        const grupo = grupos.find((item) => item.chave === chave);
        if (!grupo) return;
        grupo.pedidos += 1;
        if (pedido.status === "entregue" && pedido.pagamento_status === "pago") grupo.valor += Number(pedido.total || 0);
    });
    const total = grupos.reduce((soma, grupo) => soma + grupo.valor, 0);
    const maximo = Math.max(...grupos.map((grupo) => grupo.valor), 1);
    document.getElementById("adminSemanaTotal").textContent = App.dinheiro(total);
    container.replaceChildren();
    grupos.forEach((grupo) => {
        const coluna = elemento("div", "admin-chart-column");
        coluna.title = `${grupo.label}: ${grupo.pedidos} pedidos, ${App.dinheiro(grupo.valor)}`;
        coluna.append(elemento("strong", "", grupo.valor ? App.dinheiro(grupo.valor) : ""));
        const barra = elemento("div", "admin-chart-bar"); barra.style.height = `${Math.max(4, grupo.valor / maximo * 215)}px`;
        coluna.append(barra, elemento("span", "", grupo.label)); container.append(coluna);
    });
}

function renderizarPedidosRecentes() {
    const container = document.getElementById("adminPedidosRecentes");
    container.replaceChildren();
    const recentes = adminPedidos.slice(0, 6);
    if (!recentes.length) { container.append(elemento("p", "", "Nenhum pedido registrado.")); return; }
    recentes.forEach((pedido) => {
        const item = elemento("button", "recent-order"); item.type = "button";
        const info = elemento("div");
        info.append(elemento("strong", "", `#${pedido.numero || String(pedido.id).slice(0, 8)} • ${nomeEmpresa(pedido.empresa_id)}`), elemento("small", "", `${statusLegivel(pedido.status)} • ${dataCurta(pedido.created_at)}`));
        item.append(elemento("span", "", "▣"), info, elemento("em", "", App.dinheiro(pedido.total)));
        item.addEventListener("click", () => abrirDetalhesPedido(pedido));
        container.append(item);
    });
}

function preencherFiltroEmpresas() {
    const select = document.getElementById("filtroPedidoEmpresa");
    const valor = select.value;
    select.replaceChildren();
    const todos = document.createElement("option"); todos.value = ""; todos.textContent = "Todos"; select.append(todos);
    adminEmpresas.forEach((empresa) => { const option = document.createElement("option"); option.value = empresa.id; option.textContent = empresa.nome; select.append(option); });
    select.value = valor;
}

function pedidosFiltrados() {
    const termo = document.getElementById("buscaAdminPedido").value.trim().toLowerCase();
    const empresa = document.getElementById("filtroPedidoEmpresa").value;
    const status = document.getElementById("filtroPedidoStatus").value;
    const pagamento = document.getElementById("filtroPedidoPagamento").value;
    const inicio = document.getElementById("filtroPedidoInicio").value;
    const fim = document.getElementById("filtroPedidoFim").value;
    const inicioMs = inicio ? new Date(`${inicio}T00:00:00`).getTime() : null;
    const fimMs = fim ? new Date(`${fim}T23:59:59.999`).getTime() : null;
    return adminPedidos.filter((pedido) => {
        const busca = `${pedido.numero || ""} ${pedido.cliente_nome || ""} ${pedido.cliente_telefone || ""} ${pedido.empresa_nome || ""} ${nomeEmpresa(pedido.empresa_id)}`.toLowerCase();
        const criado = new Date(pedido.created_at).getTime();
        return (!termo || busca.includes(termo))
            && (!empresa || String(pedido.empresa_id) === empresa)
            && (!status || pedido.status === status)
            && (!pagamento || pedido.pagamento_status === pagamento)
            && (!inicioMs || criado >= inicioMs)
            && (!fimMs || criado <= fimMs);
    });
}

function classeStatusPedido(status) {
    if (status === "entregue") return "active";
    if (status === "cancelado") return "blocked";
    return "";
}

function renderizarPedidos() {
    const tbody = document.getElementById("adminPedidos");
    const lista = pedidosFiltrados();
    const paginas = Math.max(1, Math.ceil(lista.length / pedidosPorPagina));
    paginaPedidos = Math.min(Math.max(1, paginaPedidos), paginas);
    const inicio = (paginaPedidos - 1) * pedidosPorPagina;
    const pagina = lista.slice(inicio, inicio + pedidosPorPagina);
    tbody.replaceChildren();
    if (!pagina.length) tbody.append(vazioTabela(7, "Nenhum pedido corresponde aos filtros."));
    pagina.forEach((pedido) => {
        const tr = document.createElement("tr");
        const numero = document.createElement("td"); numero.append(elemento("strong", "", `#${pedido.numero || String(pedido.id).slice(0, 8)}`), elemento("small", "", pedido.cliente_nome || "Cliente"));
        const pagamento = document.createElement("td"); pagamento.append(elemento("span", `status-pill ${pedido.pagamento_status === "pago" ? "active" : pedido.pagamento_status === "estornado" ? "blocked" : ""}`, pedido.pagamento_status || "pendente"), elemento("small", "", pedido.pagamento_modalidade === "online" ? "Online" : "Na entrega"));
        const acao = document.createElement("td"); const detalhes = botao("Ver detalhes", "admin-action secondary"); detalhes.addEventListener("click", () => abrirDetalhesPedido(pedido)); acao.append(detalhes);
        tr.append(numero, elemento("td", "", nomeEmpresa(pedido.empresa_id)), elemento("td", "", dataHora(pedido.created_at)), elemento("td", "", ""), pagamento, elemento("td", "", App.dinheiro(pedido.total)), acao);
        tr.children[3].append(elemento("span", `status-pill ${classeStatusPedido(pedido.status)}`, statusLegivel(pedido.status)));
        tbody.append(tr);
    });
    const primeiro = lista.length ? inicio + 1 : 0;
    const ultimo = Math.min(inicio + pedidosPorPagina, lista.length);
    document.getElementById("resumoPedidos").textContent = `${primeiro}–${ultimo} de ${lista.length} pedidos`;
    document.getElementById("paginaPedidos").textContent = `${paginaPedidos}/${paginas}`;
    document.getElementById("pedidosAnterior").disabled = paginaPedidos <= 1;
    document.getElementById("pedidosProxima").disabled = paginaPedidos >= paginas;
}

function blocoDetalhe(rotulo, valor) {
    const artigo = document.createElement("article");
    artigo.append(elemento("small", "", rotulo), elemento("strong", "", valor || "—"));
    return artigo;
}

async function abrirDetalhesPedido(pedidoResumo) {
    const carregando = elemento("div", "admin-loading-inline", "Carregando detalhes do pedido...");
    abrirModal({ titulo: `Pedido #${pedidoResumo.numero || ""}`, kicker: "DETALHES DO PEDIDO", corpo: carregando, acoes: [botao("Fechar")] });
    modalAcoes.firstElementChild.addEventListener("click", () => fecharModal());
    const { data: pedido, error } = await db.rpc("admin_obter_pedido", { p_pedido_id: pedidoResumo.id });
    if (error || !pedido) {
        modalCorpo.replaceChildren(elemento("div", "admin-error", recursoNaoMigrado(error, "admin_obter_pedido") ? "Execute a migração 010_admin_avancado.sql para abrir os detalhes completos." : App.mensagemErro(error || { message: "Pedido não encontrado." })));
        return;
    }
    modalTitulo.textContent = `Pedido #${pedido.numero || ""}`;
    const corpo = document.createDocumentFragment();
    const resumo = elemento("div", "order-summary-grid");
    resumo.append(
        blocoDetalhe("Restaurante", pedido.empresa_nome || nomeEmpresa(pedido.empresa_id)),
        blocoDetalhe("Status", statusLegivel(pedido.status)),
        blocoDetalhe("Total", App.dinheiro(pedido.total)),
        blocoDetalhe("Cliente", pedido.cliente_nome || "Cliente"),
        blocoDetalhe("Telefone", pedido.cliente_telefone || "Não informado"),
        blocoDetalhe("Pagamento", `${pedido.pagamento || "—"} • ${pedido.pagamento_status || "pendente"}`),
        blocoDetalhe("Criado em", dataHora(pedido.created_at)),
        blocoDetalhe("Agendado", pedido.agendado_para ? dataHora(pedido.agendado_para) : "Entrega imediata"),
        blocoDetalhe("Cupom", pedido.cupom || "Sem cupom")
    );
    corpo.append(resumo);
    const endereco = elemento("section", "order-detail-section"); endereco.append(elemento("h3", "", "Endereço e observações"), elemento("p", "", pedido.endereco || "Endereço não informado"));
    if (pedido.observacoes) endereco.append(elemento("small", "", pedido.observacoes));
    corpo.append(endereco);
    const itens = elemento("section", "order-detail-section"); itens.append(elemento("h3", "", "Itens do pedido"));
    (pedido.itens || []).forEach((item) => {
        const linha = elemento("div", "order-product");
        const info = elemento("div");
        const adicionais = Array.isArray(item.adicionais) ? item.adicionais.map((adicional) => adicional.nome || adicional).join(", ") : "";
        info.append(elemento("strong", "", `${item.nome_produto || "Produto"}${item.variante_nome ? ` • ${item.variante_nome}` : ""}`));
        if (adicionais || item.observacao) info.append(elemento("small", "", [adicionais, item.observacao].filter(Boolean).join(" • ")));
        linha.append(elemento("strong", "", `${item.quantidade}×`), info, elemento("strong", "", App.dinheiro(Number(item.preco_unitario || 0) * Number(item.quantidade || 0))));
        itens.append(linha);
    });
    if (!(pedido.itens || []).length) itens.append(elemento("p", "", "Itens não encontrados."));
    corpo.append(itens);
    const valores = elemento("div", "order-summary-grid order-detail-section");
    valores.append(blocoDetalhe("Subtotal", App.dinheiro(pedido.subtotal)), blocoDetalhe("Entrega", App.dinheiro(pedido.taxa_entrega)), blocoDetalhe("Desconto", App.dinheiro(pedido.desconto)));
    corpo.append(valores);
    const historico = elemento("section", "order-detail-section"); historico.append(elemento("h3", "", "Linha do tempo"));
    const timeline = elemento("div", "order-timeline");
    (pedido.historico || []).forEach((evento) => { const item = elemento("div"); item.append(elemento("strong", "", statusLegivel(evento.status)), elemento("small", "", dataHora(evento.created_at || evento.criado_em))); timeline.append(item); });
    if (!(pedido.historico || []).length) timeline.append(elemento("p", "", "Sem eventos registrados."));
    historico.append(timeline); corpo.append(historico);
    modalCorpo.replaceChildren(corpo);
}

async function definirRestaurante(empresa, publicado, status, acaoBotao) {
    acaoBotao.disabled = true;
    const { error } = await db.rpc("admin_definir_restaurante", { p_empresa_id: empresa.id, p_publicado: publicado, p_status: status });
    acaoBotao.disabled = false;
    if (error) return mostrarErro("Não foi possível atualizar o restaurante", error);
    empresa.publicado = publicado; empresa.status = status;
    renderizarEmpresas(); atualizarMetricasAdmin();
    window.AppToast?.("Restaurante atualizado", `${empresa.nome} foi ${publicado ? "publicado" : "retirado do catálogo"}.`, "success");
}

function abrirFormularioRestaurante(empresa) {
    const form = elemento("form", "admin-form-grid"); form.id = "formRestauranteAdmin";
    const nome = campoFormulario("Nome", "adminEmpresaNome", "text", empresa.nome, { required: true });
    const email = campoFormulario("E-mail", "adminEmpresaEmail", "email", empresa.email);
    const telefone = campoFormulario("Telefone", "adminEmpresaTelefone", "tel", empresa.telefone);
    const categoria = campoFormulario("Categoria", "adminEmpresaCategoria", "text", empresa.categoria);
    const descricao = campoFormulario("Descrição", "adminEmpresaDescricao", "textarea", empresa.descricao, { full: true });
    const taxa = campoFormulario("Taxa de entrega", "adminEmpresaTaxa", "number", empresa.taxa_entrega || 0, { min: 0, step: 0.01 });
    const minimo = campoFormulario("Pedido mínimo", "adminEmpresaMinimo", "number", empresa.pedido_minimo || 0, { min: 0, step: 0.01 });
    const tempoMin = campoFormulario("Tempo mínimo (min)", "adminEmpresaTempoMin", "number", empresa.tempo_estimado_min || 25, { min: 5, max: 240 });
    const tempoMax = campoFormulario("Tempo máximo (min)", "adminEmpresaTempoMax", "number", empresa.tempo_estimado_max || 45, { min: 5, max: 360 });
    const publicado = campoCheck("Publicado no catálogo", "adminEmpresaPublicado", empresa.publicado);
    const status = campoCheck("Restaurante aberto", "adminEmpresaStatus", empresa.status);
    form.append(nome.caixa, email.caixa, telefone.caixa, categoria.caixa, descricao.caixa, taxa.caixa, minimo.caixa, tempoMin.caixa, tempoMax.caixa, publicado.caixa, status.caixa);
    const cancelar = botao("Cancelar"); cancelar.addEventListener("click", () => fecharModal());
    const salvar = botao("Salvar alterações", "admin-primary-button");
    salvar.addEventListener("click", async () => {
        if (!form.reportValidity()) return;
        salvar.disabled = true;
        const { error } = await db.rpc("admin_atualizar_restaurante", {
            p_empresa_id: empresa.id, p_nome: nome.entrada.value, p_email: email.entrada.value,
            p_telefone: telefone.entrada.value, p_categoria: categoria.entrada.value,
            p_descricao: descricao.entrada.value, p_taxa_entrega: Number(taxa.entrada.value || 0),
            p_pedido_minimo: Number(minimo.entrada.value || 0), p_tempo_min: Number(tempoMin.entrada.value || 25),
            p_tempo_max: Number(tempoMax.entrada.value || 45), p_publicado: publicado.entrada.checked,
            p_status: status.entrada.checked
        });
        salvar.disabled = false;
        if (error) return mostrarErro(recursoNaoMigrado(error, "admin_atualizar_restaurante") ? "Execute a migração 010_admin_avancado.sql" : "Não foi possível salvar", error);
        fecharModal();
        await carregarDadosAdmin();
        window.AppToast?.("Restaurante salvo", "As informações foram atualizadas.", "success");
    });
    abrirModal({ titulo: `Editar ${empresa.nome}`, kicker: "RESTAURANTE", corpo: form, acoes: [cancelar, salvar] });
}

function renderizarEmpresas() {
    const tbody = document.getElementById("adminEmpresas");
    const termo = document.getElementById("buscaAdminEmpresa").value.trim().toLowerCase();
    const lista = adminEmpresas.filter((empresa) => !termo || `${empresa.nome} ${empresa.email} ${empresa.cnpj}`.toLowerCase().includes(termo));
    tbody.replaceChildren();
    if (!lista.length) { tbody.append(vazioTabela(6, "Nenhum restaurante encontrado.")); return; }
    lista.forEach((empresa) => {
        const tr = document.createElement("tr");
        const nome = document.createElement("td"); nome.append(elemento("strong", "", empresa.nome || "Restaurante"), elemento("small", "", empresa.cnpj || "CNPJ não informado"));
        const contato = document.createElement("td"); contato.append(elemento("strong", "", empresa.email || "E-mail não informado"), elemento("small", "", empresa.telefone || "Telefone não informado"));
        const publicacao = document.createElement("td"); publicacao.append(elemento("span", `status-pill ${empresa.publicado ? "active" : ""}`, empresa.publicado ? "Publicado" : "Pendente"));
        const operacao = document.createElement("td"); operacao.append(elemento("span", `status-pill ${empresa.status ? "active" : "blocked"}`, empresa.status ? "Aberta" : "Fechada"));
        const acoes = elemento("td", ""); const grupo = elemento("div", "admin-action-group");
        const editar = botao("Editar", "admin-action secondary"); editar.addEventListener("click", () => abrirFormularioRestaurante(empresa));
        const moderar = botao(empresa.publicado ? "Suspender" : "Aprovar", `admin-action ${empresa.publicado ? "danger" : "primary"}`);
        moderar.addEventListener("click", async () => {
            const publicar = !empresa.publicado;
            if (!await confirmarAcao(`${publicar ? "Aprovar" : "Suspender"} restaurante`, `${empresa.nome} ${publicar ? "será exibido no catálogo" : "deixará de aparecer para os clientes"}.`, publicar ? "Aprovar" : "Suspender", !publicar)) return;
            definirRestaurante(empresa, publicar, publicar ? true : false, moderar);
        });
        grupo.append(editar, moderar); acoes.append(grupo);
        tr.append(nome, contato, elemento("td", "", dataCurta(empresa.created_at)), publicacao, operacao, acoes); tbody.append(tr);
    });
}

async function definirBloqueio(usuario, bloqueado, acaoBotao) {
    acaoBotao.disabled = true;
    const { error } = await db.rpc("admin_definir_usuario_bloqueio", { p_usuario_id: usuario.id, p_bloqueado: bloqueado });
    acaoBotao.disabled = false;
    if (error) return mostrarErro("Não foi possível atualizar o usuário", error);
    usuario.bloqueado = bloqueado; renderizarUsuarios(); atualizarMetricasAdmin(); anunciar("Usuário atualizado.");
}

function renderizarUsuarios() {
    const tbody = document.getElementById("adminUsuarios");
    const termo = document.getElementById("buscaAdminUsuario").value.trim().toLowerCase();
    const lista = adminUsuarios.filter((usuario) => !termo || `${usuario.nome} ${usuario.sobrenome} ${usuario.telefone}`.toLowerCase().includes(termo));
    tbody.replaceChildren();
    if (!lista.length) { tbody.append(vazioTabela(5, "Nenhum usuário encontrado.")); return; }
    lista.forEach((usuario) => {
        const tr = document.createElement("tr"); const nome = document.createElement("td"); const identidade = elemento("div", "admin-user-identity");
        if (usuario.avatar_url) { const foto = document.createElement("img"); foto.src = usuario.avatar_url; foto.alt = ""; identidade.append(foto); }
        const dadosNome = document.createElement("div"); dadosNome.append(elemento("strong", "", [usuario.nome, usuario.sobrenome].filter(Boolean).join(" ") || "Usuário"), elemento("small", "", String(usuario.id).slice(0, 8))); identidade.append(dadosNome); nome.append(identidade);
        const status = document.createElement("td"); status.append(elemento("span", `status-pill ${usuario.bloqueado ? "blocked" : "active"}`, usuario.bloqueado ? "Bloqueado" : "Ativo"));
        const acao = document.createElement("td"); const acaoBotao = botao(usuario.bloqueado ? "Desbloquear" : "Bloquear pedidos", `admin-action ${usuario.bloqueado ? "primary" : "danger"}`);
        acaoBotao.addEventListener("click", async () => {
            const bloquear = !usuario.bloqueado;
            if (!await confirmarAcao(`${bloquear ? "Bloquear" : "Desbloquear"} usuário`, bloquear ? "O usuário não poderá criar novos pedidos, mas o histórico será preservado." : "O usuário poderá voltar a realizar pedidos.", bloquear ? "Bloquear" : "Desbloquear", bloquear)) return;
            definirBloqueio(usuario, bloquear, acaoBotao);
        });
        acao.append(acaoBotao); tr.append(nome, elemento("td", "", usuario.telefone || "—"), elemento("td", "", dataCurta(usuario.created_at)), status, acao); tbody.append(tr);
    });
}

async function definirCupom(cupom, ativo, acaoBotao) {
    acaoBotao.disabled = true;
    const { error } = await db.rpc("admin_definir_cupom", { p_cupom_id: cupom.id, p_ativo: ativo });
    acaoBotao.disabled = false;
    if (error) return mostrarErro("Não foi possível atualizar o cupom", error);
    cupom.ativo = ativo; renderizarCupons(); anunciar("Cupom atualizado.");
}

function beneficioCupom(cupom) {
    if (cupom.tipo === "percentual") return `${Number(cupom.valor || 0)}%`;
    if (cupom.tipo === "frete") return "Frete grátis";
    return App.dinheiro(cupom.valor || cupom.desconto || 0);
}

function abrirFormularioCupom(cupom = null) {
    const atual = cupom || { tipo: "percentual", valor: 10, ativo: true, primeiro_pedido: false, limite_por_usuario: 1, inicio: new Date().toISOString() };
    const form = elemento("form", "admin-form-grid"); form.id = "formCupomAdmin";
    const codigo = campoFormulario("Código", "adminCupomCodigo", "text", atual.codigo || "", { required: true, placeholder: "EXEMPLO20" });
    const tipo = campoFormulario("Tipo", "adminCupomTipo", "select", atual.tipo, { items: [{ value: "percentual", label: "Percentual" }, { value: "fixo", label: "Valor fixo" }, { value: "frete", label: "Frete grátis" }] });
    const valor = campoFormulario("Valor do benefício", "adminCupomValor", "number", atual.valor || 0, { min: 0, step: 0.01, required: true });
    const escopo = campoFormulario("Escopo", "adminCupomEmpresa", "select", atual.empresa_id || "", { items: [{ value: "", label: "Global — todos os restaurantes" }, ...adminEmpresas.map((empresa) => ({ value: empresa.id, label: empresa.nome }))] });
    const pedidoMinimo = campoFormulario("Pedido mínimo", "adminCupomPedidoMinimo", "number", atual.pedido_minimo || 0, { min: 0, step: 0.01 });
    const maxDesconto = campoFormulario("Teto do desconto", "adminCupomMaxDesconto", "number", atual.max_desconto || "", { min: 0, step: 0.01 });
    const limiteUsos = campoFormulario("Limite total de usos", "adminCupomLimite", "number", atual.limite_usos || "", { min: 1 });
    const limiteUsuario = campoFormulario("Limite por usuário", "adminCupomLimiteUsuario", "number", atual.limite_por_usuario || 1, { min: 1, max: 100 });
    const inicio = campoFormulario("Início", "adminCupomInicio", "datetime-local", paraDataLocal(atual.inicio));
    const fim = campoFormulario("Término", "adminCupomFim", "datetime-local", paraDataLocal(atual.fim));
    const primeiroPedido = campoCheck("Somente primeiro pedido", "adminCupomPrimeiro", atual.primeiro_pedido);
    const ativo = campoCheck("Cupom ativo", "adminCupomAtivo", atual.ativo !== false);
    const ajuda = elemento("p", "admin-form-help", "Códigos aceitam letras, números, hífen e sublinhado. O teto é usado principalmente em descontos percentuais."); ajuda.classList.add("full");
    form.append(codigo.caixa, tipo.caixa, valor.caixa, escopo.caixa, pedidoMinimo.caixa, maxDesconto.caixa, limiteUsos.caixa, limiteUsuario.caixa, inicio.caixa, fim.caixa, primeiroPedido.caixa, ativo.caixa, ajuda);
    function ajustarTipo() { const frete = tipo.entrada.value === "frete"; valor.entrada.disabled = frete; if (frete) valor.entrada.value = "0"; }
    tipo.entrada.addEventListener("change", ajustarTipo); ajustarTipo();
    const cancelar = botao("Cancelar"); cancelar.addEventListener("click", () => fecharModal());
    const salvar = botao(cupom ? "Salvar alterações" : "Criar cupom", "admin-primary-button");
    salvar.addEventListener("click", async () => {
        if (!form.reportValidity()) return;
        salvar.disabled = true;
        const inicioIso = inicio.entrada.value ? new Date(inicio.entrada.value).toISOString() : new Date().toISOString();
        const fimIso = fim.entrada.value ? new Date(fim.entrada.value).toISOString() : null;
        const { error } = await db.rpc("admin_salvar_cupom", {
            p_codigo: codigo.entrada.value, p_tipo: tipo.entrada.value, p_valor: Number(valor.entrada.value || 0),
            p_empresa_id: escopo.entrada.value || null, p_pedido_minimo: Number(pedidoMinimo.entrada.value || 0),
            p_limite_usos: limiteUsos.entrada.value ? Number(limiteUsos.entrada.value) : null,
            p_primeiro_pedido: primeiroPedido.entrada.checked, p_inicio: inicioIso, p_fim: fimIso,
            p_max_desconto: maxDesconto.entrada.value ? Number(maxDesconto.entrada.value) : null,
            p_limite_por_usuario: Number(limiteUsuario.entrada.value || 1), p_cupom_id: cupom?.id || null,
            p_ativo: ativo.entrada.checked
        });
        salvar.disabled = false;
        if (error) return mostrarErro(recursoNaoMigrado(error, "admin_salvar_cupom") ? "Execute a migração 010_admin_avancado.sql" : "Não foi possível salvar o cupom", error);
        fecharModal(); await carregarDadosAdmin();
        window.AppToast?.("Cupom salvo", `${codigo.entrada.value.toUpperCase()} está pronto para uso.`, "success");
    });
    abrirModal({ titulo: cupom ? `Editar ${cupom.codigo}` : "Criar novo cupom", kicker: "PROMOÇÕES", corpo: form, acoes: [cancelar, salvar] });
}

async function excluirCupom(cupom) {
    if (!await confirmarAcao("Excluir cupom", `O cupom ${cupom.codigo} será removido permanentemente. Pedidos anteriores continuarão preservados.`, "Excluir permanentemente", true)) return;
    const { error } = await db.rpc("admin_excluir_cupom", { p_cupom_id: cupom.id });
    if (error) return mostrarErro(recursoNaoMigrado(error, "admin_excluir_cupom") ? "Execute a migração 010_admin_avancado.sql" : "Não foi possível excluir o cupom", error);
    adminCupons = adminCupons.filter((item) => item.id !== cupom.id); renderizarCupons();
    window.AppToast?.("Cupom excluído", `${cupom.codigo} foi removido.`, "success");
}

function renderizarCupons() {
    const tbody = document.getElementById("adminCupons");
    const termo = document.getElementById("buscaAdminCupom").value.trim().toLowerCase();
    const lista = adminCupons.filter((cupom) => !termo || `${cupom.codigo || ""} ${nomeEmpresa(cupom.empresa_id)}`.toLowerCase().includes(termo));
    tbody.replaceChildren();
    if (!lista.length) { tbody.append(vazioTabela(7, "Nenhum cupom encontrado.")); return; }
    lista.forEach((cupom) => {
        const tr = document.createElement("tr");
        const status = document.createElement("td"); status.append(elemento("span", `status-pill ${cupom.ativo ? "active" : "blocked"}`, cupom.ativo ? "Ativo" : "Pausado"));
        const uso = cupom.limite_usos ? `${cupom.usos || 0}/${cupom.limite_usos}` : `${cupom.usos || 0} usos`;
        const acoes = document.createElement("td"); const grupo = elemento("div", "admin-action-group");
        const editar = botao("Editar", "admin-action secondary"); editar.addEventListener("click", () => abrirFormularioCupom(cupom));
        const pausar = botao(cupom.ativo ? "Pausar" : "Ativar", `admin-action ${cupom.ativo ? "warning" : "primary"}`); pausar.addEventListener("click", () => definirCupom(cupom, !cupom.ativo, pausar));
        const excluir = botao("Excluir", "admin-action danger"); excluir.addEventListener("click", () => excluirCupom(cupom));
        grupo.append(editar, pausar, excluir); acoes.append(grupo);
        tr.append(elemento("td", "", cupom.codigo || "—"), elemento("td", "", cupom.empresa_id ? nomeEmpresa(cupom.empresa_id) : "Global"), elemento("td", "", beneficioCupom(cupom)), elemento("td", "", uso), elemento("td", "", cupom.fim ? dataCurta(cupom.fim) : "Sem validade"), status, acoes);
        tbody.append(tr);
    });
}

async function carregarDadosAdmin() {
    if (carregandoDados) return;
    carregandoDados = true;
    try {
        const [resEmpresas, resUsuarios, resPedidos, resCupons, resEntregadores, resLogs, resAuditoria] = await Promise.all([
            consultarEmpresasAdmin(),
            db.from("usuarios").select("id,nome,sobrenome,telefone,avatar_url,bloqueado,created_at").order("created_at", { ascending: false }),
            consultarPedidosAdmin(),
            consultarCuponsAdmin(),
            consultarRecursoOpcional("entregadores", "*"),
            consultarRecursoOpcional("app_logs", "nivel,contexto,mensagem,pagina,created_at", "created_at", 50),
            consultarRecursoOpcional("admin_auditoria", "acao,alvo_id,detalhes,created_at", "created_at", 30)
        ]);
        const erro = [resEmpresas, resUsuarios, resPedidos, resCupons, resEntregadores, resLogs, resAuditoria].find((resposta) => resposta.error)?.error;
        if (erro) throw erro;
        adminEmpresas = resEmpresas.data || [];
        adminUsuarios = resUsuarios.data || [];
        adminPedidos = resPedidos.data || [];
        adminCupons = resCupons.data || [];
        adminEntregadores = resEntregadores.data || [];
        adminLogs = resLogs.data || [];
        adminAuditoria = resAuditoria.data || [];
        preencherFiltroEmpresas();
        atualizarMetricasAdmin(); renderizarGraficoAdmin(); renderizarPedidosRecentes(); renderizarPedidos();
        renderizarEmpresas(); renderizarUsuarios(); renderizarCupons(); renderizarEntregadores();
        await carregarRelatorio(); exibirAvisoCompatibilidade();
    } finally {
        carregandoDados = false;
    }
}

function agendarRecarregamento() {
    clearTimeout(recarregarTimer);
    recarregarTimer = setTimeout(() => carregarDadosAdmin().catch((erro) => mostrarErro("Não foi possível atualizar o painel", erro)), 500);
}

function aplicarTamanhoFonte(valor) {
    const permitido = ["normal", "large", "xlarge"].includes(valor) ? valor : "normal";
    document.body.dataset.adminFont = permitido;
    document.getElementById("adminFontSize").value = permitido;
    localStorage.setItem("admin_font_size", permitido);
    anunciar(`Tamanho das letras: ${{ normal: "normal", large: "grande", xlarge: "extra grande" }[permitido]}.`);
}

function configurarNavegacao() {
    const links = [...document.querySelectorAll(".admin-sidebar nav a")];
    links.forEach((link) => link.addEventListener("click", () => {
        links.forEach((item) => item.classList.toggle("active", item === link));
        adminSidebar.classList.remove("open"); adminOverlay.classList.remove("show");
    }));
    if ("IntersectionObserver" in window) {
        const observador = new IntersectionObserver((entradas) => {
            const visivel = entradas.filter((entrada) => entrada.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (!visivel) return;
            links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visivel.target.id}`));
        }, { rootMargin: "-20% 0px -65%", threshold: [0.05, 0.3] });
        document.querySelectorAll("main section[id]").forEach((secao) => observador.observe(secao));
    }
}

async function iniciarAdmin() {
    aplicarTamanhoFonte(localStorage.getItem("admin_font_size") || "normal");
    const { data: { user } } = await db.auth.getUser();
    if (!user) { localStorage.setItem("redirect", "admin.html"); location.replace("login.html"); return; }
    const { data: permitido, error } = await db.rpc("usuario_eh_admin");
    if (error || permitido !== true) { alert("Esta conta não possui acesso administrativo."); location.replace("perfil.html"); return; }
    try {
        await carregarDadosAdmin();
        document.getElementById("adminLoading").hidden = true;
        document.getElementById("adminApp").hidden = false;
        canalAdmin = db.channel("admin-plataforma")
            .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, agendarRecarregamento)
            .on("postgres_changes", { event: "*", schema: "public", table: "empresas" }, agendarRecarregamento)
            .on("postgres_changes", { event: "*", schema: "public", table: "cupons" }, agendarRecarregamento)
            .subscribe();
    } catch (erroDados) {
        console.error(erroDados);
        document.getElementById("adminLoading").replaceChildren(elemento("strong", "", `Não foi possível carregar o painel: ${App.mensagemErro(erroDados)}`));
    }
}

const adminSidebar = document.getElementById("adminSidebar");
const adminOverlay = document.getElementById("adminOverlay");

["buscaAdminEmpresa", "buscaAdminUsuario", "buscaAdminCupom", "buscaAdminEntregador"].forEach((id) => {
    document.getElementById(id).addEventListener("input", ({ target }) => ({
        buscaAdminEmpresa: renderizarEmpresas, buscaAdminUsuario: renderizarUsuarios,
        buscaAdminCupom: renderizarCupons, buscaAdminEntregador: renderizarEntregadores
    })[target.id]());
});
["buscaAdminPedido", "filtroPedidoEmpresa", "filtroPedidoStatus", "filtroPedidoPagamento", "filtroPedidoInicio", "filtroPedidoFim"].forEach((id) => {
    document.getElementById(id).addEventListener(id === "buscaAdminPedido" ? "input" : "change", () => { paginaPedidos = 1; renderizarPedidos(); });
});
document.getElementById("limparFiltrosPedido").addEventListener("click", () => {
    ["buscaAdminPedido", "filtroPedidoEmpresa", "filtroPedidoStatus", "filtroPedidoPagamento", "filtroPedidoInicio", "filtroPedidoFim"].forEach((id) => { document.getElementById(id).value = ""; });
    paginaPedidos = 1; renderizarPedidos();
});
document.getElementById("pedidosAnterior").addEventListener("click", () => { paginaPedidos -= 1; renderizarPedidos(); });
document.getElementById("pedidosProxima").addEventListener("click", () => { paginaPedidos += 1; renderizarPedidos(); });
document.getElementById("exportarPedidos").addEventListener("click", () => baixarCsv(linhasCsv(pedidosFiltrados()), `multi-delivery-pedidos-filtrados-${new Date().toISOString().slice(0, 10)}.csv`));
document.getElementById("novoCupom").addEventListener("click", () => abrirFormularioCupom());
document.getElementById("periodoRelatorio").addEventListener("change", carregarRelatorio);
document.getElementById("exportarRelatorio").addEventListener("click", exportarRelatorioCsv);
document.getElementById("adminFontSize").addEventListener("change", ({ target }) => aplicarTamanhoFonte(target.value));
document.getElementById("adminMenu").addEventListener("click", () => { adminSidebar.classList.add("open"); adminOverlay.classList.add("show"); });
adminOverlay.addEventListener("click", () => { adminSidebar.classList.remove("open"); adminOverlay.classList.remove("show"); });
document.querySelectorAll("[data-modal-close]").forEach((item) => item.addEventListener("click", () => fecharModal(false)));
modal.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") { fecharModal(false); return; }
    if (evento.key !== "Tab") return;
    const focaveis = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter((item) => item.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0]; const ultimo = focaveis.at(-1);
    if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
    else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
});
document.addEventListener("keydown", (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") { evento.preventDefault(); document.getElementById("buscaAdminPedido").focus(); document.getElementById("pedidos").scrollIntoView({ behavior: "smooth" }); }
});
document.getElementById("adminLogout").addEventListener("click", async () => { await db.auth.signOut(); App.limparDadosPrivados(); location.replace("login.html"); });
addEventListener("beforeunload", () => { clearTimeout(recarregarTimer); if (canalAdmin) db.removeChannel(canalAdmin); });
configurarNavegacao();
iniciarAdmin();
