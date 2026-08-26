"use strict";
(() => {
    const lista = document.querySelector(".carrinho-itens");
    const btnCheckout = document.getElementById("btnCheckout");
    const modal = document.getElementById("produtoModal");
    const drawer = document.getElementById("carrinho");
    const confirmar = document.getElementById("confirmarProduto");
    const precoFinal = document.getElementById("precoFinal");
    const fecharModal = document.querySelector(".fechar-modal");
    if (!lista || !btnCheckout || !modal || !confirmar || !precoFinal) return;

    const estadoCatalogo = new Map();
    let sincronizacao = null;
    let contextoEdicao = null;

    const lerCarrinho = () => window.CartStore?.ler?.() || App.lerJSON("carrinho", []) || [];
    const lerMeta = () => window.CartStore?.meta?.() || App.lerJSON("carrinhoMeta", null) || null;
    const salvar = (itens, meta) => {
        if (window.CartStore?.salvar) window.CartStore.salvar(itens, meta);
        else {
            App.salvarJSON("carrinho", itens);
            if (meta) App.salvarJSON("carrinhoMeta", meta); else localStorage.removeItem("carrinhoMeta");
            window.dispatchEvent(new CustomEvent("carrinho-sincronizar"));
        }
    };
    const chave = (item) => {
        const adicionais = (item.adicionais || []).map((adicional) => String(adicional.id)).sort().join("-");
        return `${item.id}|${item.variante_id || "sem-variante"}|${adicionais}|${item.observacao || ""}`;
    };
    const precoUnitario = (item) => Number(item.preco || 0) + (item.adicionais || []).reduce((soma, adicional) => soma + Number(adicional.preco || 0), 0);
    const itemPorChave = (chaveItem) => lerCarrinho().find((item) => String(item.chave || chave(item)) === String(chaveItem));

    function feedbackModal(texto, tipo = "info") {
        modal.querySelector(".edicao-feedback-425")?.remove();
        const p = document.createElement("p");
        p.className = "edicao-feedback-425";
        p.dataset.tipo = tipo;
        p.textContent = texto;
        document.getElementById("modalDescricao")?.insertAdjacentElement("afterend", p);
    }

    function esperarModalCarregar(timeout = 4000) {
        return new Promise((resolve) => {
            const inicio = Date.now();
            const checar = () => {
                if (!modal.classList.contains("aberto")) return resolve(false);
                if (!confirmar.disabled) return resolve(true);
                if (Date.now() - inicio >= timeout) return resolve(false);
                setTimeout(checar, 35);
            };
            checar();
        });
    }

    function preencherEdicao(item) {
        const variante = item.variante_id
            ? modal.querySelector(`input[name="produto-variante"][value="${CSS.escape(String(item.variante_id))}"]`)
            : null;
        if (item.variante_id && !variante) {
            feedbackModal("A opção escolhida anteriormente não está mais disponível. Selecione uma nova opção para salvar.", "error");
        } else if (variante) {
            variante.checked = true;
            variante.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const adicionaisIds = new Set((item.adicionais || []).map((adicional) => String(adicional.id)));
        modal.querySelectorAll("#listaAdicionais input").forEach((input) => {
            input.checked = adicionaisIds.has(String(input.value));
        });
        modal.querySelector("#listaAdicionais input")?.dispatchEvent(new Event("change", { bubbles: true }));
        const observacao = document.getElementById("observacao");
        if (observacao) observacao.value = item.observacao || "";

        const alvo = Math.min(99, Math.max(1, Number(item.quantidade || 1)));
        const quantidade = document.getElementById("quantidade");
        const mais = document.getElementById("maisQtd");
        let atual = Number(quantidade?.textContent || 1);
        while (mais && atual < alvo) {
            mais.click();
            atual += 1;
        }
        confirmar.firstChild && (confirmar.firstChild.textContent = "Salvar alterações • ");
        feedbackModal("Altere a opção, os adicionais, a observação ou a quantidade e salve.");
    }

    async function abrirEdicao(chaveItem) {
        const item = itemPorChave(chaveItem);
        if (!item) return;
        if (typeof window.abrirModalProduto !== "function") {
            return window.AppToast?.("Carrinho", "Não foi possível abrir a edição deste item.", "error");
        }
        const produto = {
            id: item.id,
            nome: item.nome,
            imagem: item.imagem,
            descricao: "Edite a configuração deste item.",
            preco: item.preco,
            promocao: null,
        };
        contextoEdicao = { chaveOriginal: String(item.chave || chave(item)), itemOriginal: structuredClone(item) };
        modal.dataset.modo = "editar";
        drawer?.classList.remove("aberto");
        document.getElementById("overlay")?.classList.remove("aberto");
        window.abrirModalProduto(produto);
        const carregou = await esperarModalCarregar();
        if (carregou && contextoEdicao) preencherEdicao(contextoEdicao.itemOriginal);
    }

    function fecharModoEdicao() {
        contextoEdicao = null;
        delete modal.dataset.modo;
        modal.querySelector(".edicao-feedback-425")?.remove();
    }

    function mesclarEdicao(itemNovo) {
        const itens = lerCarrinho();
        const meta = lerMeta();
        const indice = itens.findIndex((item) => String(item.chave || chave(item)) === contextoEdicao?.chaveOriginal);
        if (indice < 0) return false;
        const novo = {
            ...itens[indice],
            ...itemNovo,
            empresa_id: itens[indice].empresa_id || meta?.empresa_id || null,
            indisponivel: false,
            indisponivel_motivo: "",
            preco_alterado: false,
            preco_anterior: null,
        };
        novo.chave = chave(novo);
        const repetido = itens.findIndex((item, posicao) => posicao !== indice && String(item.chave || chave(item)) === novo.chave);
        if (repetido >= 0) {
            itens[repetido].quantidade = Math.min(99, Number(itens[repetido].quantidade || 1) + Number(novo.quantidade || 1));
            itens.splice(indice, 1);
        } else {
            itens[indice] = novo;
        }
        salvar(itens, meta);
        return true;
    }

    document.addEventListener("click", (event) => {
        const botao = event.target.closest(".editar-item-425");
        if (!botao) return;
        event.preventDefault();
        event.stopPropagation();
        abrirEdicao(botao.dataset.chave);
    });

    const confirmarBase = confirmar.onclick;
    confirmar.addEventListener("click", (event) => {
        if (!contextoEdicao || modal.dataset.modo !== "editar") return;
        event.stopImmediatePropagation();
        event.preventDefault();

        const varianteInput = modal.querySelector("input[name='produto-variante']:checked");
        const temVariantes = modal.querySelectorAll("input[name='produto-variante']").length > 0;
        if (temVariantes && !varianteInput) return feedbackModal("Selecione uma opção para continuar.", "error");

        const adicionais = [...modal.querySelectorAll("#listaAdicionais input:checked")].map((input) => ({
            id: String(input.value),
            nome: input.dataset.nome || input.closest("label")?.textContent?.split("(+")[0]?.trim() || "Adicional",
            preco: Number(input.dataset.preco || 0),
        }));
        const precoVariante = varianteInput
            ? Number(varianteInput.closest("label")?.querySelector("small")?.textContent?.replace(/[^\d,.-]/g, "").replace(".", "").replace(",", "."))
            : Number(contextoEdicao.itemOriginal.preco || 0);
        const novo = {
            id: contextoEdicao.itemOriginal.id,
            nome: contextoEdicao.itemOriginal.nome,
            imagem: contextoEdicao.itemOriginal.imagem,
            preco: Number.isFinite(precoVariante) ? precoVariante : Number(contextoEdicao.itemOriginal.preco || 0),
            variante_id: varianteInput ? String(varianteInput.value) : null,
            variante_nome: varianteInput ? varianteInput.closest("label")?.querySelector("span")?.textContent?.trim() || null : null,
            quantidade: Math.min(99, Math.max(1, Number(document.getElementById("quantidade")?.textContent || 1))),
            observacao: String(document.getElementById("observacao")?.value || "").trim().slice(0, 300),
            adicionais,
        };
        if (mesclarEdicao(novo)) {
            fecharModal?.click();
            fecharModoEdicao();
            setTimeout(() => window.abrirCarrinho?.(), 0);
            window.AppToast?.("Carrinho", "Item atualizado.", "success");
        }
    }, true);

    fecharModal?.addEventListener("click", fecharModoEdicao);
    modal.addEventListener("click", (event) => { if (event.target === modal) fecharModoEdicao(); });

    function adicionarControles() {
        lista.querySelectorAll(".item-carrinho").forEach((card) => {
            const item = itemPorChave(card.dataset.chave);
            if (!item || card.querySelector(".editar-item-425")) return;
            const info = card.querySelector(".info-item");
            if (!info) return;
            const editar = document.createElement("button");
            editar.type = "button";
            editar.className = "editar-item-425";
            editar.dataset.chave = String(item.chave || chave(item));
            editar.textContent = "Editar item";
            editar.setAttribute("aria-label", `Editar ${item.nome}`);
            const quantidade = info.querySelector(".quantidade");
            quantidade?.insertAdjacentElement("beforebegin", editar);

            const estado = estadoCatalogo.get(String(item.chave || chave(item)));
            card.classList.toggle("item-carrinho--indisponivel-425", estado?.indisponivel === true);
            card.classList.toggle("item-carrinho--preco-425", estado?.precoAlterado === true && estado?.indisponivel !== true);
            if (estado?.mensagem) {
                const aviso = document.createElement("p");
                aviso.className = `item-status-425${estado.indisponivel ? " item-status-425--erro" : ""}`;
                aviso.textContent = estado.mensagem;
                editar.insertAdjacentElement("beforebegin", aviso);
            }
        });

        lista.querySelector(".carrinho-alerta-425")?.remove();
        const estados = [...estadoCatalogo.values()];
        const indisponiveis = estados.filter((estado) => estado.indisponivel).length;
        const alterados = estados.filter((estado) => estado.precoAlterado && !estado.indisponivel).length;
        if (indisponiveis || alterados) {
            const alerta = document.createElement("div");
            alerta.className = `carrinho-alerta-425${indisponiveis ? " carrinho-alerta-425--erro" : ""}`;
            alerta.textContent = indisponiveis
                ? `${indisponiveis} ${indisponiveis === 1 ? "item precisa" : "itens precisam"} ser revisado antes do checkout.`
                : `${alterados} ${alterados === 1 ? "item teve" : "itens tiveram"} preço atualizado. Revise o total.`;
            lista.prepend(alerta);
        }
        btnCheckout.disabled = !lerCarrinho().length || indisponiveis > 0;
        const textoCheckout = document.getElementById("btnCheckoutTexto");
        if (textoCheckout) textoCheckout.textContent = indisponiveis ? "Revise os itens para continuar" : "Ir para o checkout";
    }

    const observer = new MutationObserver(() => queueMicrotask(adicionarControles));
    observer.observe(lista, { childList: true, subtree: true });

    async function sincronizarCatalogo({ avisar = false } = {}) {
        if (sincronizacao) return sincronizacao;
        const itens = lerCarrinho();
        if (!itens.length || !window.db) return { indisponiveis: 0, precosAlterados: 0 };
        sincronizacao = (async () => {
            const ids = [...new Set(itens.map((item) => String(item.id)).filter(Boolean))];
            const adicionaisIds = [...new Set(itens.flatMap((item) => (item.adicionais || []).map((adicional) => String(adicional.id))))];
            const [produtosRes, variantesRes, adicionaisRes] = await Promise.all([
                window.db.from("produtos").select("id,nome,imagem,preco,promocao,disponivel").in("id", ids),
                window.db.from("produto_variantes").select("id,produto_id,nome,preco,promocao,ativo").in("produto_id", ids),
                adicionaisIds.length ? window.db.from("adicionais").select("id,nome,preco,ativo").in("id", adicionaisIds) : Promise.resolve({ data: [], error: null }),
            ]);
            if (produtosRes.error) throw produtosRes.error;
            if (variantesRes.error) throw variantesRes.error;
            if (adicionaisRes.error) throw adicionaisRes.error;

            const produtos = new Map((produtosRes.data || []).map((produto) => [String(produto.id), produto]));
            const variantes = new Map((variantesRes.data || []).map((variante) => [String(variante.id), variante]));
            const adicionais = new Map((adicionaisRes.data || []).map((adicional) => [String(adicional.id), adicional]));
            let indisponiveis = 0;
            let precosAlterados = 0;
            estadoCatalogo.clear();

            itens.forEach((item) => {
                const produto = produtos.get(String(item.id));
                const estado = { indisponivel: false, precoAlterado: false, mensagem: "" };
                if (!produto || produto.disponivel === false) {
                    estado.indisponivel = true;
                    estado.mensagem = "Produto indisponível no momento. Edite ou remova este item.";
                } else {
                    let novoPreco = Number(produto.promocao || 0) > 0 ? Number(produto.promocao) : Number(produto.preco || 0);
                    if (item.variante_id) {
                        const variante = variantes.get(String(item.variante_id));
                        if (!variante || variante.ativo === false || String(variante.produto_id) !== String(item.id)) {
                            estado.indisponivel = true;
                            estado.mensagem = "A opção escolhida não está mais disponível. Edite este item.";
                        } else {
                            novoPreco = Number(variante.promocao || 0) > 0 ? Number(variante.promocao) : Number(variante.preco || 0);
                        }
                    }
                    const adicionaisAtuais = [];
                    for (const adicionalItem of item.adicionais || []) {
                        const adicional = adicionais.get(String(adicionalItem.id));
                        if (!adicional || adicional.ativo === false) {
                            estado.indisponivel = true;
                            estado.mensagem = "Um adicional escolhido não está mais disponível. Edite este item.";
                            break;
                        }
                        adicionaisAtuais.push({ id: String(adicional.id), nome: adicional.nome || adicionalItem.nome, preco: Number(adicional.preco || 0) });
                    }
                    if (!estado.indisponivel) {
                        const anterior = precoUnitario(item);
                        const depois = novoPreco + adicionaisAtuais.reduce((soma, adicional) => soma + adicional.preco, 0);
                        if (Math.abs(anterior - depois) > 0.009) {
                            estado.precoAlterado = true;
                            estado.mensagem = `Preço atualizado de ${App.dinheiro(anterior)} para ${App.dinheiro(depois)} por unidade.`;
                            item.preco = novoPreco;
                            item.adicionais = adicionaisAtuais;
                        }
                    }
                }
                if (estado.indisponivel) indisponiveis += 1;
                if (estado.precoAlterado) precosAlterados += 1;
                estadoCatalogo.set(String(item.chave || chave(item)), estado);
            });
            salvar(itens, lerMeta());
            adicionarControles();
            if (avisar && indisponiveis) window.AppToast?.("Carrinho", "Há itens indisponíveis que precisam ser revisados.", "error");
            else if (avisar && precosAlterados) window.AppToast?.("Carrinho", "Alguns preços foram atualizados. Revise o total.", "info");
            return { indisponiveis, precosAlterados };
        })().finally(() => { sincronizacao = null; });
        return sincronizacao;
    }

    btnCheckout.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
            const resultado = await sincronizarCatalogo({ avisar: true });
            if (resultado.indisponiveis > 0) return window.abrirCarrinho?.();
            if (resultado.precosAlterados > 0) return window.abrirCarrinho?.();
            const itens = lerCarrinho();
            const minimo = Number(lerMeta()?.pedido_minimo || 0);
            const subtotal = itens.reduce((total, item) => total + precoUnitario(item) * Number(item.quantidade || 1), 0);
            if (subtotal < minimo) return window.AppToast?.("Carrinho", `O pedido mínimo deste restaurante é ${App.dinheiro(minimo)}.`, "error");
            window.location.href = "checkout.html";
        } catch (error) {
            window.AppToast?.("Carrinho", `Não foi possível confirmar o catálogo atual: ${App.mensagemErro(error)}`, "error");
        }
    }, true);

    window.addEventListener("empresa-carregada", () => sincronizarCatalogo().catch(console.error));
    window.addEventListener("carrinho-atualizado", () => queueMicrotask(adicionarControles));
    window.editarItemCarrinho = abrirEdicao;
    window.sincronizarCatalogoCarrinho = sincronizarCatalogo;
    adicionarControles();
})();
