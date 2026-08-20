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
    const areaInvalida = () => /fora da área|não atend/i.test(String(area?.textContent || ""));
    const pagamento = () => document.querySelector("input[name='pagamento']:checked")?.value || "";
    const rotuloPagamento = (valor) => ({
        PIX: "PIX na entrega",
        "Cartão": "Cartão na entrega",
        Dinheiro: "Dinheiro",
        Online: "Pagamento online"
    })[valor] || "Não selecionado";

    function atualizar() {
        const itens = cart();
        const dados = meta();
        const quantidade = itens.reduce((soma, item) => soma + (Number(item?.quantidade) || 0), 0);
        const possuiEndereco = temEndereco();
        const enderecoValido = possuiEndereco && !areaInvalida();
        const formaPagamento = pagamento();

        if (stepEndereco) stepEndereco.dataset.estado = possuiEndereco ? (enderecoValido ? "ok" : "erro") : "pendente";
        if (stepPagamento) stepPagamento.dataset.estado = formaPagamento ? "ok" : "pendente";
        if (stepRevisao) stepRevisao.dataset.estado = quantidade > 0 && enderecoValido && formaPagamento ? "ok" : "pendente";

        if (enderecoStatus) {
            enderecoStatus.dataset.tipo = possuiEndereco ? (enderecoValido ? "success" : "error") : "info";
            definirTexto(enderecoStatus, possuiEndereco
                ? (enderecoValido
                    ? `Endereço selecionado. Frete exibido no resumo: ${taxa?.textContent || "a calcular"}.`
                    : "Este endereço está fora da área de entrega. Escolha outro endereço.")
                : "O frete e o total final serão confirmados depois que você selecionar o endereço.");
        }
        if (taxa) {
            if (!possuiEndereco) taxa.dataset.pendente = "true";
            else delete taxa.dataset.pendente;
        }

        definirTexto(pagamentoResumo, `Selecionado: ${rotuloPagamento(formaPagamento)}.`);
        definirTexto(resumo, `${dados.empresa_nome || "Restaurante"} • ${quantidade} ${quantidade === 1 ? "item" : "itens"}`);
        if (submitStatus && !cliqueProtegido) {
            if (!quantidade) definirTexto(submitStatus, "Seu carrinho precisa ter pelo menos um item.");
            else if (!possuiEndereco) definirTexto(submitStatus, "Ao continuar, entre na conta e selecione o endereço de entrega.");
            else if (!enderecoValido) definirTexto(submitStatus, "Escolha outro endereço antes de enviar o pedido.");
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
                cliqueProtegido = false;
                delete btnFinalizar.dataset.checkoutLock;
                atualizar();
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

    atualizar();
})();
