"use strict";

(() => {
    const endereco = document.getElementById("enderecoEntrega");
    const enderecoStatus = document.getElementById("enderecoStatus");
    const area = document.getElementById("areaCheckout");
    const pagamentoResumo = document.getElementById("pagamentoSelecionadoResumo");
    const cupom = document.getElementById("cupom");
    const cupomFeedback = document.getElementById("cupomFeedback");
    const btnCupom = document.getElementById("btnCupom");
    const resumo = document.getElementById("summaryContext");
    const btnFinalizar = document.getElementById("finalizarPedido");
    const submitStatus = document.getElementById("checkoutSubmitStatus");
    const troco = document.getElementById("trocoPara");
    const taxa = document.getElementById("taxa");
    const stepEndereco = document.getElementById("stepEndereco");
    const stepPagamento = document.getElementById("stepPagamento");
    const stepRevisao = document.getElementById("stepRevisao");
    if (!btnFinalizar) return;

    let cliqueProtegido = false;
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
    const areaInvalida = (dados = meta()) => {
        if (dados?.regiao_atendida === false) return true;
        return /fora da área|fora do raio|raio máximo|não atend/i.test(String(area?.textContent || ""));
    };
    const restauranteFechado = (dados = meta()) => dados?.status === false || dados?.aberto_por_horario === false;
    const pagamento = () => document.querySelector("input[name='pagamento']:checked")?.value || "";
    const rotuloPagamento = (valor) => ({
        PIX: "PIX na entrega",
        "Cartão": "Cartão na entrega",
        Dinheiro: "Dinheiro",
        Online: "Pagamento online"
    })[valor] || "Não selecionado";
    const subtotalCarrinho = (itens) => itens.reduce((soma, item) => {
        const quantidade = Number(item?.quantidade) || 0;
        const preco = Number(item?.preco) || 0;
        const adicionais = Array.isArray(item?.adicionais)
            ? item.adicionais.reduce((total, adicional) => total + (Number(adicional?.preco) || 0), 0)
            : 0;
        return soma + ((preco + adicionais) * quantidade);
    }, 0);
    const textoBotao = () => btnFinalizar.querySelector("span:first-child") || btnFinalizar;

    function definirDisponibilidadeBotao(habilitado, motivo = "") {
        if (cliqueProtegido) return;
        const desabilitado = !habilitado;
        const ariaDisabled = String(desabilitado);
        const checkoutReady = habilitado ? "true" : "false";

        if (btnFinalizar.disabled !== desabilitado) btnFinalizar.disabled = desabilitado;
        if (btnFinalizar.getAttribute("aria-disabled") !== ariaDisabled) {
            btnFinalizar.setAttribute("aria-disabled", ariaDisabled);
        }
        if (btnFinalizar.dataset.checkoutReady !== checkoutReady) {
            btnFinalizar.dataset.checkoutReady = checkoutReady;
        }
        definirTexto(textoBotao(), habilitado ? "Confirmar e finalizar" : (motivo || "Revise o pedido"));
    }

    function atualizar() {
        const itens = cart();
        const dados = meta();
        const quantidade = itens.reduce((soma, item) => soma + (Number(item?.quantidade) || 0), 0);
        const subtotal = subtotalCarrinho(itens);
        const minimo = Math.max(0, Number(dados?.pedido_minimo) || 0);
        const minimoValido = subtotal >= minimo;
        const possuiEndereco = temEndereco();
        const foraDaArea = areaInvalida(dados);
        const fechado = restauranteFechado(dados);
        const enderecoValido = possuiEndereco && !foraDaArea;
        const formaPagamento = pagamento();
        const pronto = quantidade > 0 && enderecoValido && formaPagamento && minimoValido && !fechado;

        if (stepEndereco) stepEndereco.dataset.estado = possuiEndereco ? (enderecoValido ? "ok" : "erro") : "pendente";
        if (stepPagamento) stepPagamento.dataset.estado = formaPagamento ? "ok" : "pendente";
        if (stepRevisao) stepRevisao.dataset.estado = pronto ? "ok" : ((foraDaArea || fechado || !minimoValido) ? "erro" : "pendente");

        if (enderecoStatus) {
            enderecoStatus.dataset.tipo = possuiEndereco ? (enderecoValido ? "success" : "error") : "info";
            definirTexto(enderecoStatus, possuiEndereco
                ? (enderecoValido
                    ? `Endereço selecionado. Frete exibido no resumo: ${taxa?.textContent || "a calcular"}.`
                    : (foraDaArea
                        ? "Este endereço está fora da área ou do raio de entrega. Escolha outro endereço."
                        : "Não foi possível validar este endereço para entrega."))
                : "O frete e o total final serão confirmados depois que você selecionar o endereço.");
        }
        if (taxa) {
            if (!possuiEndereco) taxa.dataset.pendente = "true";
            else delete taxa.dataset.pendente;
        }

        definirTexto(pagamentoResumo, `Selecionado: ${rotuloPagamento(formaPagamento)}.`);
        definirTexto(resumo, `${dados.empresa_nome || "Restaurante"} • ${quantidade} ${quantidade === 1 ? "item" : "itens"}`);

        let motivoBotao = "";
        let statusEnvio = "Revise o total e confirme quando estiver pronto.";
        if (!quantidade) {
            motivoBotao = "Carrinho vazio";
            statusEnvio = "Seu carrinho precisa ter pelo menos um item.";
        } else if (fechado) {
            motivoBotao = "Restaurante fechado";
            statusEnvio = "Este restaurante ou unidade está fechado no momento.";
        } else if (!minimoValido) {
            motivoBotao = "Pedido mínimo não atingido";
            statusEnvio = `Faltam ${App.dinheiro(minimo - subtotal)} para atingir o pedido mínimo.`;
        } else if (!possuiEndereco) {
            motivoBotao = "Selecione um endereço";
            statusEnvio = "Selecione o endereço de entrega para calcular o frete e continuar.";
        } else if (!enderecoValido) {
            motivoBotao = "Endereço não atendido";
            statusEnvio = "Escolha outro endereço antes de enviar o pedido.";
        } else if (!formaPagamento) {
            motivoBotao = "Escolha o pagamento";
            statusEnvio = "Selecione uma forma de pagamento para continuar.";
        }

        definirDisponibilidadeBotao(pronto, motivoBotao);
        if (submitStatus && !cliqueProtegido) definirTexto(submitStatus, statusEnvio);
    }

    cupom?.addEventListener("input", () => {
        const posicao = cupom.selectionStart;
        cupom.value = cupom.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
        try { cupom.setSelectionRange(posicao, posicao); } catch {}
        if (!cupom.value && cupomFeedback) {
            cupomFeedback.dataset.tipo = "info";
            definirTexto(cupomFeedback, "Cupom é opcional e será validado novamente ao enviar o pedido.");
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
            } else if (cupom?.value) {
                definirTexto(cupomFeedback, "Confira a mensagem de validação do cupom antes de continuar.");
            }
        }, 450);
    });

    document.querySelectorAll("input[name='pagamento']").forEach((input) => input.addEventListener("change", atualizar));
    troco?.addEventListener("blur", () => {
        const texto = troco.value.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
        const valor = Number(texto);
        if (texto && Number.isFinite(valor)) {
            troco.value = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    });

    btnFinalizar.addEventListener("click", (event) => {
        if (cliqueProtegido || btnFinalizar.dataset.checkoutReady !== "true") {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        cliqueProtegido = true;
        btnFinalizar.dataset.checkoutLock = "true";
        definirTexto(submitStatus, "Confirmando e enviando com proteção contra pedido duplicado...");
        setTimeout(() => {
            if (!btnFinalizar.disabled && !document.querySelector(".app-confirm")) {
                cliqueProtegido = false;
                delete btnFinalizar.dataset.checkoutLock;
                atualizar();
            }
        }, 1200);
    }, true);

    const observer = new MutationObserver(() => atualizar());
    [endereco, area, taxa].filter(Boolean).forEach((elemento) => observer.observe(elemento, {
        subtree: true,
        childList: true,
        characterData: true
    }));
    observer.observe(btnFinalizar, { attributes: true, attributeFilter: ["disabled"] });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) atualizar();
    });
    window.addEventListener("focus", atualizar);

    atualizar();
})();
