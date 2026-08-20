"use strict";

(() => {
    const $ = (id) => document.getElementById(id);
    const ROTULOS = { gerente: "Gerente", cozinha: "Cozinha", atendente: "Atendente", financeiro: "Financeiro" };
    let acesso = null;
    let pedidos = [];

    function criar(tag, classe, texto) {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }

    function status(mensagem, tipo = "") {
        const elemento = $("colaboradorStatus");
        if (!elemento) return;
        elemento.hidden = !mensagem;
        elemento.textContent = mensagem || "";
        elemento.className = `team-status${tipo ? ` ${tipo}` : ""}`;
    }

    async function rpc(nome, parametros = {}) {
        const resposta = await window.db.rpc(nome, parametros);
        if (resposta.error) throw resposta.error;
        return resposta.data;
    }

    function textoStatus(pedido) {
        if (pedido.status === "preparando" && pedido.pronto_em) return "Pronto";
        return ({ recebido: "Recebido", preparando: "Preparando", saiu_para_entrega: "Em entrega", entregue: "Entregue", cancelado: "Cancelado" })[pedido.status] || pedido.status || "Pedido";
    }

    function adicionaisTexto(adicionais) {
        if (!Array.isArray(adicionais)) return "";
        return adicionais.map((item) => item?.nome).filter(Boolean).join(", ");
    }

    async function executarOperacao(pedido, acao, preparo = null, observacao = null) {
        status("");
        try {
            await rpc("empresa_atualizar_operacao_pedido", {
                p_pedido_id: pedido.id,
                p_acao: acao,
                p_preparo_estimado: preparo,
                p_observacao: observacao
            });
            status("Pedido atualizado com sucesso.", "success");
            await carregarPedidos();
        } catch (erro) {
            console.error("Erro na operação do pedido:", erro);
            status(App.mensagemErro(erro), "error");
        }
    }

    function adicionarAcao(container, texto, classe, callback) {
        const botao = criar("button", classe, texto);
        botao.type = "button";
        botao.addEventListener("click", callback);
        container.append(botao);
    }

    function acoesPedido(pedido) {
        const container = criar("div", "order-actions");
        const cozinha = ["gerente", "cozinha"].includes(acesso.papel);
        const atendimento = ["gerente", "atendente"].includes(acesso.papel);

        if (cozinha && pedido.status === "recebido") {
            adicionarAcao(container, "Iniciar preparo", "primary", () => {
                const valor = Number(prompt("Tempo estimado de preparo em minutos:", String(pedido.preparo_estimado_minutos || 30)));
                if (!Number.isInteger(valor) || valor < 5 || valor > 240) return status("Informe um tempo entre 5 e 240 minutos.", "error");
                executarOperacao(pedido, "iniciar_preparo", valor);
            });
        }
        if (cozinha && pedido.status === "preparando" && !pedido.pronto_em) {
            adicionarAcao(container, "Marcar pronto", "primary", () => executarOperacao(pedido, "marcar_pronto"));
        }
        if (cozinha && pedido.status === "preparando" && pedido.pronto_em) {
            adicionarAcao(container, "Reabrir preparo", "", () => executarOperacao(pedido, "reabrir_preparo"));
        }

        if (atendimento && pedido.status === "recebido" && pedido.pagamento_status !== "pago") {
            adicionarAcao(container, "Recusar pedido", "danger", () => {
                const motivo = prompt("Motivo da recusa:", "");
                if (motivo === null) return;
                executarOperacao(pedido, "recusar_pedido", null, motivo.trim() || null);
            });
        }
        if (atendimento && pedido.pagamento_modalidade !== "online" && pedido.pagamento_status !== "pago" && pedido.status !== "cancelado") {
            adicionarAcao(container, "Confirmar pagamento", "", async () => {
                if (!confirm("Confirmar que o pagamento presencial foi recebido?")) return;
                try {
                    await rpc("empresa_marcar_pagamento_offline", { p_pedido_id: pedido.id });
                    status("Pagamento confirmado.", "success");
                    await carregarPedidos();
                } catch (erro) { status(App.mensagemErro(erro), "error"); }
            });
        }
        if (atendimento && pedido.status === "preparando" && pedido.pronto_em && !pedido.entregador_atribuido) {
            adicionarAcao(container, "Enviar para entrega", "primary", () => executarOperacao(pedido, "enviar_entrega"));
        }
        if (atendimento && pedido.status === "saiu_para_entrega" && !pedido.entregador_atribuido) {
            adicionarAcao(container, "Confirmar entrega", "primary", () => executarOperacao(pedido, "confirmar_entrega"));
        }
        if (atendimento && pedido.status === "preparando" && pedido.pagamento_status !== "pago") {
            adicionarAcao(container, "Cancelar pedido", "danger", async () => {
                const motivo = prompt("Motivo do cancelamento:", "");
                if (!motivo?.trim()) return;
                try {
                    await rpc("empresa_cancelar_pedido_nao_pago", { p_pedido_id: pedido.id, p_motivo: motivo.trim() });
                    status("Pedido cancelado.", "success");
                    await carregarPedidos();
                } catch (erro) { status(App.mensagemErro(erro), "error"); }
            });
        }
        if (acesso.papel === "gerente" && pedido.cancelamento_status === "solicitado") {
            adicionarAcao(container, "Aprovar cancelamento", "warn", async () => {
                if (!confirm("Aprovar a solicitação de cancelamento?")) return;
                try {
                    await rpc("empresa_decidir_cancelamento", { p_pedido_id: pedido.id, p_aprovar: true, p_observacao: null });
                    status("Cancelamento aprovado.", "success");
                    await carregarPedidos();
                } catch (erro) { status(App.mensagemErro(erro), "error"); }
            });
            adicionarAcao(container, "Recusar cancelamento", "", async () => {
                try {
                    await rpc("empresa_decidir_cancelamento", { p_pedido_id: pedido.id, p_aprovar: false, p_observacao: null });
                    status("Cancelamento recusado.", "success");
                    await carregarPedidos();
                } catch (erro) { status(App.mensagemErro(erro), "error"); }
            });
        }
        return container;
    }

    function renderizarPedido(pedido) {
        const card = criar("article", "operator-order");
        const cabecalho = criar("div", "order-head");
        const titulo = criar("h3", "", `Pedido #${pedido.numero || String(pedido.id).slice(0, 8)}`);
        cabecalho.append(titulo, criar("span", `order-status ${pedido.status || ""}`, textoStatus(pedido)));
        card.append(cabecalho);

        const info = criar("div", "order-info");
        if (pedido.cliente_nome) info.append(criar("span", "", `Cliente: ${pedido.cliente_nome}`));
        if (pedido.cliente_telefone) info.append(criar("span", "", `Telefone: ${pedido.cliente_telefone}`));
        if (pedido.endereco) info.append(criar("span", "", `Entrega: ${pedido.endereco}`));
        if (pedido.total !== null && pedido.total !== undefined) info.append(criar("span", "", `Total: ${App.dinheiro(pedido.total)}`));
        if (pedido.pagamento) info.append(criar("span", "", `Pagamento: ${pedido.pagamento} • ${pedido.pagamento_status || "pendente"}`));
        if (pedido.preparo_estimado_minutos) info.append(criar("span", "", `SLA: ${pedido.preparo_estimado_minutos} min`));
        card.append(info);

        const itens = criar("ul", "order-items");
        (Array.isArray(pedido.itens) ? pedido.itens : []).forEach((item) => {
            const linha = criar("li");
            const nome = `${item.quantidade || 1}× ${item.nome_produto || "Produto"}${item.variante_nome ? ` • ${item.variante_nome}` : ""}`;
            linha.append(criar("strong", "", nome));
            const extras = adicionaisTexto(item.adicionais);
            if (extras) linha.append(criar("small", "", `Adicionais: ${extras}`));
            if (item.observacao) linha.append(criar("small", "", `Obs.: ${item.observacao}`));
            itens.append(linha);
        });
        card.append(itens);
        if (pedido.observacoes) card.append(criar("p", "privacy-note", `Observação do pedido: ${pedido.observacoes}`));
        card.append(acoesPedido(pedido));
        return card;
    }

    function renderizarPedidos() {
        const container = $("colaboradorConteudo");
        container.replaceChildren();
        if (!pedidos.length) return container.append(criar("div", "empty-panel", "Nenhum pedido disponível para este papel."));
        pedidos.forEach((pedido) => container.append(renderizarPedido(pedido)));
    }

    async function carregarPedidos() {
        const dados = await rpc("empresa_operador_pedidos", { p_empresa_id: acesso.empresa_id, p_limite: 100 });
        pedidos = Array.isArray(dados) ? dados : [];
        renderizarPedidos();
    }

    function cardFinanceiro(rotulo, valor) {
        const card = criar("article", "finance-card");
        card.append(criar("small", "", rotulo), criar("strong", "", valor));
        return card;
    }

    async function carregarFinanceiro() {
        const dados = await rpc("empresa_relatorio_financeiro_acesso", { p_empresa_id: acesso.empresa_id, p_dias: 30 });
        const container = $("colaboradorConteudo");
        const grade = criar("div", "finance-cards");
        grade.append(
            cardFinanceiro("Vendas brutas", App.dinheiro(dados?.bruto || 0)),
            cardFinanceiro("Taxa da plataforma", App.dinheiro(dados?.taxa_plataforma || 0)),
            cardFinanceiro("Saldo líquido estimado", App.dinheiro(dados?.liquido || 0)),
            cardFinanceiro("Online pendente", App.dinheiro(dados?.online_pendente || 0)),
            cardFinanceiro("Reembolsos pendentes", String(dados?.reembolsos_pendentes || 0)),
            cardFinanceiro("Pedidos entregues", String(dados?.pedidos_entregues || 0))
        );
        container.replaceChildren(grade);
    }

    async function carregarConteudo() {
        status("");
        $("colaboradorConteudo")?.replaceChildren(criar("div", "empty-panel", "Atualizando dados autorizados..."));
        try {
            if (acesso.papel === "financeiro") await carregarFinanceiro();
            else await carregarPedidos();
        } catch (erro) {
            console.error("Erro ao carregar área do colaborador:", erro);
            status(App.mensagemErro(erro), "error");
            $("colaboradorConteudo")?.replaceChildren(criar("div", "empty-panel", "Não foi possível carregar os dados permitidos."));
        }
    }

    async function carregarAcesso() {
        const { data: { user }, error } = await window.db.auth.getUser();
        if (error || !user) return window.location.replace("empresa-login.html"), false;
        const acessos = await rpc("empresa_meu_acesso");
        const lista = Array.isArray(acessos) ? acessos : [];
        const proprietario = lista.find((item) => item.proprietario === true);
        const salvo = App.lerJSON("empresaAcesso", null);
        acesso = lista.find((item) => item.proprietario !== true && salvo && String(item.empresa_id) === String(salvo.empresa_id))
            || lista.find((item) => item.proprietario !== true)
            || null;
        if (!acesso) {
            if (proprietario) window.location.replace("empresa-dashboard.html");
            else window.location.replace("empresa-login.html");
            return false;
        }

        App.salvarJSON("empresaAcesso", acesso);
        $("colaboradorEmpresa").textContent = acesso.empresa_nome || "Restaurante";
        $("colaboradorPapel").textContent = ROTULOS[acesso.papel] || acesso.papel;
        if (acesso.papel === "financeiro") {
            $("colaboradorAreaRotulo").textContent = "Financeiro";
            $("colaboradorAreaTitulo").textContent = "Resumo dos últimos 30 dias";
            $("colaboradorPrivacidade").textContent = "Este perfil recebe somente indicadores agregados, sem dados pessoais dos clientes.";
        } else if (acesso.papel === "cozinha") {
            $("colaboradorAreaRotulo").textContent = "Produção";
            $("colaboradorAreaTitulo").textContent = "Fila da cozinha";
            $("colaboradorPrivacidade").textContent = "Telefone, endereço, valores e pagamento são removidos no banco antes de os pedidos chegarem a esta tela.";
        } else {
            $("colaboradorAreaRotulo").textContent = acesso.papel === "gerente" ? "Gestão operacional" : "Atendimento";
            $("colaboradorAreaTitulo").textContent = "Pedidos do restaurante";
            $("colaboradorPrivacidade").textContent = "As ações disponíveis nesta tela também são validadas no banco conforme o papel atual.";
        }
        return true;
    }

    $("colaboradorAtualizar")?.addEventListener("click", carregarConteudo);
    $("colaboradorLogout")?.addEventListener("click", async () => {
        await window.db.auth.signOut();
        localStorage.removeItem("empresaAcesso");
        window.location.replace("empresa-login.html");
    });

    (async () => {
        try {
            if (await carregarAcesso()) await carregarConteudo();
        } catch (erro) {
            console.error("Falha ao iniciar área do colaborador:", erro);
            status(App.mensagemErro(erro), "error");
        }
    })();
})();
