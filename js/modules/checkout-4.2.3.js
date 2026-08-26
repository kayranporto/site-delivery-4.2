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
    const fastStatus = document.getElementById("checkoutFastStatus");
    const fastBadge = document.getElementById("checkoutFastBadge");
    const observacoes = document.getElementById("observacoesPedido");
    const observacoesStatus = document.getElementById("observacoesStatus");
    const cupomStatus = document.getElementById("cupomStatus");
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
        const enderecoValido = possuiEndereco && !areaInvalida();
        const formaPagamento = pagamento();
        const inicializado = document.body.dataset.checkoutInicializado === "true";
        const finalizarTexto = document.getElementById("finalizarPedidoTexto");

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
        if (!inicializado) {
            definirTexto(fastStatus, "Carregando endereço, frete e valores atualizados...");
            definirTexto(fastBadge, "Preparando");
            definirTexto(finalizarTexto, "Preparando checkout...");
        } else if (!quantidade) {
            definirTexto(fastStatus, "Volte ao restaurante e adicione itens ao carrinho.");
            definirTexto(fastBadge, "Carrinho vazio");
            definirTexto(finalizarTexto, "Carrinho vazio");
        } else if (!possuiEndereco) {
            definirTexto(fastStatus, "Seu pedido está pronto; falta apenas escolher onde entregar.");
            definirTexto(fastBadge, "Falta endereço");
            definirTexto(finalizarTexto, "Entrar e escolher endereço");
        } else if (!enderecoValido) {
            definirTexto(fastStatus, "Troque o endereço para continuar com este restaurante.");
            definirTexto(fastBadge, "Revisar entrega");
            definirTexto(finalizarTexto, "Trocar endereço");
        } else {
            definirTexto(fastStatus, `${rotuloPagamento(formaPagamento)} e endereço já preenchidos. Confira o total e confirme.`);
            definirTexto(fastBadge, "Pronto para enviar");
            definirTexto(finalizarTexto, "Confirmar pedido");
        }
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

    document.querySelectorAll("input[name='pagamento']").forEach((input) => input.addEventListener("change", () => {
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
