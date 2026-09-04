"use strict";

(() => {
    const endereco = document.getElementById("enderecoEntrega");
    const enderecoStatus = document.getElementById("enderecoStatus");
    const area = document.getElementById("areaCheckout");
    const previsao = document.getElementById("previsaoCheckout");
    const pagamentoResumo = document.getElementById("pagamentoSelecionadoResumo");
    const pagamentoCard = document.querySelector("[aria-labelledby='tituloPagamento']");
    const opcoesPagamento = [...document.querySelectorAll("input[name='pagamento']")];
    const cupom = document.getElementById("cupom");
    const cupomFeedback = document.getElementById("cupomFeedback");
    const btnCupom = document.getElementById("btnCupom");
    const resumo = document.getElementById("summaryContext");
    const btnFinalizar = document.getElementById("finalizarPedido");
    const submitStatus = document.getElementById("checkoutSubmitStatus");
    const troco = document.getElementById("trocoPara");
    const trocoField = document.getElementById("trocoField");
    const taxa = document.getElementById("taxa");
    const total = document.getElementById("total");
    const footerTotal = document.getElementById("footerTotal");
    const finalizarTotal = document.getElementById("finalizarPedidoTotal");
    const stepEndereco = document.getElementById("stepEndereco");
    const stepPagamento = document.getElementById("stepPagamento");
    const stepRevisao = document.getElementById("stepRevisao");
    const fastLane = document.getElementById("checkoutFastLane");
    const fastStatus = document.getElementById("checkoutFastStatus");
    const fastBadge = document.getElementById("checkoutFastBadge");
    const observacoes = document.getElementById("observacoesPedido");
    const observacoesStatus = document.getElementById("observacoesStatus");
    const cupomStatus = document.getElementById("cupomStatus");
    if (!btnFinalizar) return;

    let cliqueProtegido = false;
    opcoesPagamento.forEach((input) => {
        input.dataset.checkoutDisabledOriginal = input.disabled ? "true" : "false";
    });

    const cart = () => window.CartStore?.ler?.() || App.lerJSON("carrinho", []) || [];
    const meta = () => window.CartStore?.meta?.() || App.lerJSON("carrinhoMeta", null) || {};
    const definirTexto = (elemento, texto) => {
        if (elemento && elemento.textContent !== texto) elemento.textContent = texto;
    };
    const textoEndereco = () => String(endereco?.textContent || "").trim();
    const temEndereco = () => {
        const texto = textoEndereco().toLowerCase();
        return Boolean(texto)
            && !texto.includes("nenhum endereço")
            && !texto.includes("entre na sua conta")
            && !texto.includes("adicione um endereço");
    };
    const areaInvalida = () => /fora da área|não atend/i.test(String(area?.textContent || ""));
    const pagamento = () => document.querySelector("input[name='pagamento']:checked:not(:disabled)")?.value || "";
    const rotuloPagamento = (valor) => ({
        PIX: "PIX na entrega",
        "Cartão": "Cartão na entrega",
        Dinheiro: "Dinheiro",
        Online: "Pagamento online"
    })[valor] || "Não selecionado";

    function bloquearPagamento(bloqueado) {
        opcoesPagamento.forEach((input) => {
            const indisponivelOriginal = input.dataset.checkoutDisabledOriginal === "true";
            input.disabled = bloqueado || indisponivelOriginal;
        });
        if (pagamentoCard) {
            pagamentoCard.dataset.checkoutBloqueado = bloqueado ? "true" : "false";
            pagamentoCard.setAttribute("aria-disabled", bloqueado ? "true" : "false");
        }
        if (trocoField) trocoField.hidden = bloqueado || pagamento() !== "Dinheiro";
    }

    function marcarValorPendente(elemento, pendente, rotulo) {
        if (!elemento) return;
        if (pendente) {
            elemento.dataset.pendente = "true";
            elemento.setAttribute("aria-label", `${rotulo}: a calcular`);
        } else {
            delete elemento.dataset.pendente;
            elemento.removeAttribute("aria-label");
        }
    }

    function restaurarPagamentoPreferido() {
        const preferencia = App.lerJSON("checkoutPreferencias", {});
        const valor = String(preferencia?.pagamento || "PIX");
        const opcao = document.querySelector(`input[name='pagamento'][value='${CSS.escape(valor)}']`);
        if (opcao && !opcao.disabled) opcao.checked = true;
    }

    function salvarPagamentoPreferido(valor) {
        if (valor) App.salvarJSON("checkoutPreferencias", { pagamento: valor });
    }

    function liberarProtecaoClique() {
        cliqueProtegido = false;
        delete btnFinalizar.dataset.checkoutLock;
        atualizar();
    }

    function atualizar() {
        const itens = cart();
        const dados = meta();
        const quantidade = itens.reduce((soma, item) => soma + (Number(item?.quantidade) || 0), 0);
        const possuiEndereco = temEndereco();
        const enderecoValido = possuiEndereco && dados?.regiao_atendida !== false && !areaInvalida();
        const inicializado = document.body.dataset.checkoutInicializado === "true";
        const finalizarTexto = document.getElementById("finalizarPedidoTexto");

        bloquearPagamento(!enderecoValido);
        const formaPagamento = pagamento();
        const totalPendente = !enderecoValido;
        marcarValorPendente(taxa, totalPendente, "Taxa de entrega");
        marcarValorPendente(total, totalPendente, "Total do pedido");
        marcarValorPendente(footerTotal, totalPendente, "Total do pedido");
        marcarValorPendente(finalizarTotal, totalPendente, "Total do pedido");

        if (previsao) {
            if (!possuiEndereco) definirTexto(previsao, "Selecione um endereço para calcular a entrega");
            else if (!enderecoValido) definirTexto(previsao, "Entrega indisponível neste endereço");
            else {
                const minimo = Number(dados?.tempo_estimado_min || 25);
                const maximo = Number(dados?.tempo_estimado_max || 45);
                definirTexto(previsao, `Previsão de ${minimo}–${maximo} minutos`);
            }
        }

        if (stepEndereco) stepEndereco.dataset.estado = possuiEndereco ? (enderecoValido ? "ok" : "erro") : "pendente";
        if (stepPagamento) stepPagamento.dataset.estado = enderecoValido ? (formaPagamento ? "ok" : "pendente") : "bloqueado";
        if (stepRevisao) stepRevisao.dataset.estado = quantidade > 0 && enderecoValido && formaPagamento ? "ok" : "pendente";

        if (enderecoStatus) {
            enderecoStatus.dataset.tipo = possuiEndereco ? (enderecoValido ? "success" : "error") : "info";
            definirTexto(enderecoStatus, possuiEndereco
                ? (enderecoValido
                    ? `Endereço selecionado. Frete exibido no resumo: ${taxa?.textContent || "a calcular"}.`
                    : "Este endereço está fora da área de entrega. Escolha outro endereço.")
                : "O frete e o total final serão confirmados depois que você selecionar o endereço.");
        }

        if (pagamentoResumo) {
            pagamentoResumo.dataset.tipo = enderecoValido ? (formaPagamento ? "success" : "info") : "info";
            definirTexto(pagamentoResumo, enderecoValido
                ? `Selecionado: ${rotuloPagamento(formaPagamento)}.`
                : "Pagamento bloqueado até confirmar um endereço atendido.");
        }

        definirTexto(resumo, `${dados.empresa_nome || "Restaurante"} • ${quantidade} ${quantidade === 1 ? "item" : "itens"}`);
        if (!inicializado) {
            if (fastLane) fastLane.dataset.estado = "carregando";
            definirTexto(fastStatus, "Carregando endereço, frete e valores atualizados...");
            definirTexto(fastBadge, "Preparando");
            definirTexto(finalizarTexto, "Preparando checkout...");
        } else if (!quantidade) {
            if (fastLane) fastLane.dataset.estado = "pendente";
            definirTexto(fastStatus, "Volte ao restaurante e adicione itens ao carrinho.");
            definirTexto(fastBadge, "Carrinho vazio");
            definirTexto(finalizarTexto, "Carrinho vazio");
        } else if (!possuiEndereco) {
            if (fastLane) fastLane.dataset.estado = "pendente";
            definirTexto(fastStatus, "Escolha um endereço para calcular entrega, frete e total.");
            definirTexto(fastBadge, "Falta endereço");
            definirTexto(finalizarTexto, "Entrar e escolher endereço");
        } else if (!enderecoValido) {
            if (fastLane) fastLane.dataset.estado = "erro";
            definirTexto(fastStatus, "Este endereço não é atendido. Troque o endereço para continuar.");
            definirTexto(fastBadge, "Revisar entrega");
            definirTexto(finalizarTexto, "Trocar endereço");
        } else {
            if (fastLane) fastLane.dataset.estado = "ok";
            definirTexto(fastStatus, `${rotuloPagamento(formaPagamento)} e endereço já preenchidos. Confira o total e confirme.`);
            definirTexto(fastBadge, "Pronto para enviar");
            definirTexto(finalizarTexto, "Fazer pedido");
        }
        if (submitStatus && !cliqueProtegido) {
            if (!quantidade) definirTexto(submitStatus, "Seu carrinho precisa ter pelo menos um item.");
            else if (!possuiEndereco) definirTexto(submitStatus, "Escolha um endereço para calcular a entrega antes de continuar.");
            else if (!enderecoValido) definirTexto(submitStatus, "Escolha outro endereço antes de enviar o pedido.");
            else if (!formaPagamento) definirTexto(submitStatus, "Selecione uma forma de pagamento para continuar.");
            else definirTexto(submitStatus, "Revise o total e confirme quando estiver pronto.");
        }
    }

    cupom?.addEventListener("input", () => {
        const posicao = cupom.selectionStart;
        cupom.value = cupom.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
        try { cupom.setSelectionRange(posicao, posicao); } catch {}
        if (!cupom.value && cupomFeedback) {
            cupomFeedback.dataset.tipo = "info";
            definirTexto(cupomFeedback, "Cupom é opcional e será validado novamente ao enviar o pedido.");
            definirTexto(cupomStatus, "Adicionar");
            document.getElementById("cupomDetalhes")?.removeAttribute("data-filled");
        }
    });

    btnCupom?.addEventListener("click", () => {
        if (!cupomFeedback) return;
        cupomFeedback.dataset.tipo = "info";
        definirTexto(cupomFeedback, "Validando cupom...");
        setTimeout(() => {
            const descontoAtual = document.getElementById("desconto")?.textContent || "";
            if (cupom?.value && !/0,00/.test(descontoAtual)) {
                cupomFeedback.dataset.tipo = "success";
                definirTexto(cupomFeedback, `Cupom aplicado. Desconto atual: ${descontoAtual}.`);
                definirTexto(cupomStatus, "Aplicado");
                document.getElementById("cupomDetalhes")?.setAttribute("data-filled", "");
            } else if (cupom?.value) {
                definirTexto(cupomFeedback, "Confira a mensagem de validação do cupom antes de continuar.");
            }
        }, 450);
    });

    opcoesPagamento.forEach((input) => input.addEventListener("change", () => {
        if (input.checked) salvarPagamentoPreferido(input.value);
        atualizar();
    }));
    observacoes?.addEventListener("input", () => {
        const preenchido = Boolean(observacoes.value.trim());
        definirTexto(observacoesStatus, preenchido ? "Adicionado" : "Adicionar");
        document.getElementById("observacoesDetalhes")?.toggleAttribute("data-filled", preenchido);
    });
    troco?.addEventListener("blur", () => {
        const texto = troco.value.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
        const valor = Number(texto);
        if (texto && Number.isFinite(valor)) {
            troco.value = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    });

    btnFinalizar.addEventListener("click", (event) => {
        if (cliqueProtegido) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        cliqueProtegido = true;
        btnFinalizar.dataset.checkoutLock = "true";
        definirTexto(submitStatus, "Confirmando e enviando com proteção contra pedido duplicado...");
        setTimeout(() => {
            if (!btnFinalizar.disabled && !document.querySelector(".app-confirm")) {
                liberarProtecaoClique();
            }
        }, 1200);
    }, true);

    const observer = new MutationObserver(atualizar);
    [endereco, area].filter(Boolean).forEach((elemento) => observer.observe(elemento, {
        subtree: true,
        childList: true,
        characterData: true
    }));
    observer.observe(btnFinalizar, { attributes: true, attributeFilter: ["disabled"] });

    restaurarPagamentoPreferido();
    window.addEventListener("checkout-inicializado", atualizar);
    window.addEventListener("checkout-envio-finalizado", liberarProtecaoClique);
    atualizar();
})();
