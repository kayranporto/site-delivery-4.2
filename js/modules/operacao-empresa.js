"use strict";

(() => {
    const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    let loja = null;
    let horarios = [];
    let pausas = [];
    let regioes = [];
    let cancelamentos = [];

    const $ = (id) => document.getElementById(id);
    const criar = (tag, classe, texto) => {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    };
    const dataBr = (valor) => new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const erro = (mensagem) => window.AppToast?.("Não foi possível concluir", App.mensagemErro(mensagem), "error") || alert(App.mensagemErro(mensagem));
    const sucesso = (titulo, mensagem) => window.AppToast?.(titulo, mensagem, "success");

    function renderizarHorarios() {
        const mapa = new Map(horarios.map((item) => [Number(item.dia_semana), item]));
        $("horariosEmpresa").replaceChildren(...DIAS.map((nome, dia) => {
            const atual = mapa.get(dia) || { dia_semana: dia, abre: "08:00:00", fecha: "22:00:00", ativo: dia !== 0 };
            const linha = criar("div", "hours-row");
            linha.dataset.dia = String(dia);
            const label = criar("label");
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

    function renderizarPausas() {
        const container = $("pausasEmpresa");
        container.replaceChildren();
        const futuras = pausas.filter((item) => new Date(item.fim).getTime() > Date.now());
        if (!futuras.length) return container.append(criar("p", "empty", "Nenhuma pausa futura programada."));
        futuras.forEach((pausa) => {
            const item = criar("article", "operation-item");
            const texto = criar("div");
            texto.append(criar("strong", "", pausa.motivo || "Pausa da operação"), criar("small", "", `${dataBr(pausa.inicio)} até ${dataBr(pausa.fim)}`));
            const acoes = criar("div", "operation-actions");
            const remover = criar("button", "remove", "Excluir");
            remover.type = "button";
            remover.addEventListener("click", async () => {
                remover.disabled = true;
                const { error } = await window.db.from("empresa_pausas").delete().eq("id", pausa.id);
                if (error) { remover.disabled = false; return erro(error); }
                pausas = pausas.filter((atual) => atual.id !== pausa.id);
                renderizarPausas();
                atualizarDisponibilidade();
            });
            acoes.append(remover);
            item.append(texto, acoes);
            container.append(item);
        });
    }

    function renderizarRegioes() {
        const container = $("regioesEmpresa");
        container.replaceChildren();
        if (!regioes.length) return container.append(criar("p", "empty", "Sem regiões específicas: serão usadas as configurações gerais da loja."));
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
            alternar.addEventListener("click", async () => {
                const { error } = await window.db.from("empresa_regioes").update({ ativo: !regiao.ativo }).eq("id", regiao.id);
                if (error) return erro(error);
                regiao.ativo = !regiao.ativo;
                renderizarRegioes();
            });
            const remover = criar("button", "remove", "Excluir");
            remover.type = "button";
            remover.addEventListener("click", async () => {
                const confirmar = window.AppConfirm ? await AppConfirm({ titulo: "Excluir região", mensagem: `Remover a entrega para ${regiao.bairro}?`, confirmar: "Excluir" }) : confirm("Excluir esta região?");
                if (!confirmar) return;
                const { error } = await window.db.from("empresa_regioes").delete().eq("id", regiao.id);
                if (error) return erro(error);
                regioes = regioes.filter((atual) => atual.id !== regiao.id);
                renderizarRegioes();
            });
            acoes.append(alternar, remover);
            item.append(texto, acoes);
            container.append(item);
        });
    }

    async function decidirCancelamento(pedido, aprovar, botao) {
        const confirmar = window.AppConfirm ? await AppConfirm({
            titulo: aprovar ? "Aprovar cancelamento" : "Recusar cancelamento",
            mensagem: aprovar ? "O pedido será cancelado e o estoque reservado será devolvido." : "O pedido continuará em andamento e o cliente será avisado.",
            confirmar: aprovar ? "Aprovar" : "Recusar"
        }) : confirm(aprovar ? "Aprovar o cancelamento?" : "Recusar o cancelamento?");
        if (!confirmar) return;
        App.definirCarregando(botao, true, "Salvando...");
        const { error } = await window.db.rpc("empresa_decidir_cancelamento", { p_pedido_id: pedido.id, p_aprovar: aprovar, p_observacao: null });
        App.definirCarregando(botao, false);
        if (error) return erro(error);
        cancelamentos = cancelamentos.filter((item) => item.id !== pedido.id);
        renderizarCancelamentos();
        carregarFinanceiro();
        sucesso("Solicitação atualizada", aprovar ? "O pedido foi cancelado." : "O pedido continuará em andamento.");
    }

    function renderizarCancelamentos() {
        const container = $("cancelamentosEmpresa");
        container.replaceChildren();
        if (!cancelamentos.length) return container.append(criar("p", "empty", "Nenhuma solicitação pendente."));
        cancelamentos.forEach((pedido) => {
            const item = criar("article", "operation-item");
            const texto = criar("div");
            texto.append(criar("strong", "", `Pedido #${pedido.numero || String(pedido.id).slice(0, 8)} • ${pedido.cliente_nome || "Cliente"}`), criar("small", "", pedido.cancelamento_motivo || "Motivo não informado"));
            const acoes = criar("div", "operation-actions");
            const aprovar = criar("button", "approve", "Aprovar");
            const recusar = criar("button", "reject", "Recusar");
            aprovar.type = recusar.type = "button";
            aprovar.addEventListener("click", () => decidirCancelamento(pedido, true, aprovar));
            recusar.addEventListener("click", () => decidirCancelamento(pedido, false, recusar));
            acoes.append(aprovar, recusar);
            item.append(texto, acoes);
            container.append(item);
        });
    }

    async function atualizarDisponibilidade() {
        const { data, error } = await window.db.rpc("empresa_disponibilidade", { p_empresa_id: String(loja.id), p_quando: new Date().toISOString() });
        const status = $("operacaoStatus");
        if (error) { status.textContent = "Horários aguardam a migração 013"; status.classList.add("closed"); return; }
        status.textContent = data?.aberto ? "● Aberta pelo horário" : "● Fechada pelo horário";
        status.classList.toggle("closed", !data?.aberto);
    }

    async function carregarFinanceiro() {
        const dias = Number($("financeiroPeriodo").value || 30);
        const { data, error } = await window.db.rpc("empresa_relatorio_financeiro", { p_dias: dias });
        if (error) return erro(error);
        $("financeBruto").textContent = App.dinheiro(data?.bruto);
        $("financeTaxa").textContent = App.dinheiro(data?.taxa_plataforma);
        $("financeLiquido").textContent = App.dinheiro(data?.liquido);
        $("financePendente").textContent = App.dinheiro(data?.online_pendente);
        $("financeReembolsos").textContent = String(data?.reembolsos_pendentes || 0);
        $("financeEntregues").textContent = String(data?.pedidos_entregues || 0);
        $("financeNota").textContent = `Estimativa dos últimos ${dias} dias, descontando ${Number(data?.taxa_percentual || 0).toLocaleString("pt-BR")}% de taxa da plataforma.`;
    }

    async function carregarDados() {
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return;
        const { data: empresaAtual, error: erroEmpresa } = await window.db.from("empresas").select("id,nome,cidade_atendimento,uf_atendimento,pedido_minimo").eq("usuario_id", user.id).maybeSingle();
        if (erroEmpresa || !empresaAtual) return;
        loja = empresaAtual;
        $("regiaoCidade").value = loja.cidade_atendimento || "";
        $("regiaoUf").value = loja.uf_atendimento || "";
        $("regiaoMinimo").value = Number(loja.pedido_minimo || 0).toFixed(2);
        const [resHorarios, resPausas, resRegioes, resCancelamentos, resFidelidade] = await Promise.all([
            window.db.from("empresa_horarios").select("*").eq("empresa_id", String(loja.id)).order("dia_semana"),
            window.db.from("empresa_pausas").select("*").eq("empresa_id", String(loja.id)).order("inicio"),
            window.db.from("empresa_regioes").select("*").eq("empresa_id", String(loja.id)).order("bairro"),
            window.db.from("pedidos").select("id,numero,cliente_nome,cancelamento_motivo,cancelamento_status,pagamento_modalidade,pagamento_status,total").eq("empresa_id", String(loja.id)).eq("cancelamento_status", "solicitado").order("cancelamento_solicitado_em"),
            window.db.from("programa_fidelidade_empresa").select("*").eq("empresa_id", String(loja.id)).maybeSingle()
        ]);
        const migracaoAusente = [resHorarios, resPausas, resRegioes, resCancelamentos, resFidelidade].find((resposta) => resposta.error)?.error;
        if (migracaoAusente) { console.warn("Recursos 3.5 aguardam a migração 013:", migracaoAusente); return erro("Execute a migração 013_operacao_real.sql para ativar a operação avançada."); }
        horarios = resHorarios.data || [];
        pausas = resPausas.data || [];
        regioes = resRegioes.data || [];
        cancelamentos = resCancelamentos.data || [];
        const fidelidade = resFidelidade.data || {};
        $("fidelidadeAtiva").checked = fidelidade.ativo === true;
        $("pontosPorReal").value = Number(fidelidade.pontos_por_real || 1);
        $("pontosBeneficio").value = Number(fidelidade.pontos_para_beneficio || 500);
        $("valorBeneficio").value = Number(fidelidade.valor_beneficio || 20);
        renderizarHorarios(); renderizarPausas(); renderizarRegioes(); renderizarCancelamentos();
        await Promise.all([atualizarDisponibilidade(), carregarFinanceiro()]);
    }

    $("horariosForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const registros = [...$("horariosEmpresa").querySelectorAll(".hours-row")].map((linha) => ({
            empresa_id: String(loja.id), dia_semana: Number(linha.dataset.dia), ativo: linha.querySelector("[data-campo='ativo']").checked,
            abre: linha.querySelector("[data-campo='abre']").value, fecha: linha.querySelector("[data-campo='fecha']").value, updated_at: new Date().toISOString()
        }));
        const botao = event.currentTarget.querySelector("button[type='submit']"); App.definirCarregando(botao, true, "Salvando...");
        const { data, error } = await window.db.from("empresa_horarios").upsert(registros, { onConflict: "empresa_id,dia_semana" }).select("*");
        App.definirCarregando(botao, false); if (error) return erro(error); horarios = data || registros; sucesso("Horários salvos", "A disponibilidade já segue a nova agenda."); atualizarDisponibilidade();
    });

    $("pausaForm")?.addEventListener("submit", async (event) => {
        event.preventDefault(); const inicio = new Date($("pausaInicio").value); const fim = new Date($("pausaFim").value);
        if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) return erro("Informe um intervalo válido para a pausa.");
        const { data, error } = await window.db.from("empresa_pausas").insert({ empresa_id: String(loja.id), inicio: inicio.toISOString(), fim: fim.toISOString(), motivo: $("pausaMotivo").value.trim() || null }).select("*").single();
        if (error) return erro(error); pausas.push(data); event.currentTarget.reset(); renderizarPausas(); atualizarDisponibilidade(); sucesso("Pausa programada", "A loja ficará indisponível no período informado.");
    });

    $("regiaoForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = { empresa_id: String(loja.id), bairro: $("regiaoBairro").value.trim(), cidade: $("regiaoCidade").value.trim(), uf: $("regiaoUf").value.trim().toUpperCase(), taxa_entrega: Number($("regiaoTaxa").value), pedido_minimo: Number($("regiaoMinimo").value), tempo_min: Number($("regiaoTempoMin").value), tempo_max: Number($("regiaoTempoMax").value), ativo: true };
        if (!payload.bairro || !payload.cidade || !/^[A-Z]{2}$/.test(payload.uf) || payload.tempo_max < payload.tempo_min) return erro("Revise os dados da região.");
        const { data, error } = await window.db.from("empresa_regioes").insert(payload).select("*").single();
        if (error) return erro(error); regioes.push(data); $("regiaoBairro").value = ""; renderizarRegioes(); sucesso("Região adicionada", "O checkout já usará a nova taxa e previsão.");
    });

    $("fidelidadeForm")?.addEventListener("submit", async (event) => {
        event.preventDefault(); const payload = { empresa_id: String(loja.id), ativo: $("fidelidadeAtiva").checked, pontos_por_real: Number($("pontosPorReal").value), pontos_para_beneficio: Number($("pontosBeneficio").value), valor_beneficio: Number($("valorBeneficio").value), updated_at: new Date().toISOString() };
        const { error } = await window.db.from("programa_fidelidade_empresa").upsert(payload, { onConflict: "empresa_id" });
        if (error) return erro(error); sucesso("Fidelidade atualizada", payload.ativo ? "Os próximos pedidos entregues gerarão pontos." : "O programa foi pausado.");
    });

    $("financeiroPeriodo")?.addEventListener("change", carregarFinanceiro);
    carregarDados().catch(erro);
})();
