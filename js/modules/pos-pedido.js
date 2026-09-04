"use strict";

(function iniciarPosPedido() {
    const emPastaHtml = /\/html\/[^/]+\.html$/i.test(location.pathname);
    const paginaCliente = (caminho) => emPastaHtml ? caminho : `html/${caminho}`;

    function chaveProduto(produto) {
        const adicionais = (produto.adicionais || [])
            .map((item) => String(item.id))
            .sort()
            .join("-");
        return `${produto.id}|${produto.variante_id || "sem-variante"}|${adicionais}|${produto.observacao || ""}`;
    }

    function avisar(titulo, mensagem, tipo = "info", tempo = 5500) {
        if (window.AppToast) window.AppToast(titulo, mensagem, tipo, tempo);
    }

    function alterarBotao(botao, carregando) {
        if (!botao) return;
        if (carregando) {
            botao.dataset.textoOriginal = botao.textContent;
            botao.textContent = "Montando carrinho...";
            botao.disabled = true;
        } else {
            botao.textContent = botao.dataset.textoOriginal || "Pedir novamente";
            botao.disabled = false;
        }
    }

    async function pedirNovamente(pedido, botao) {
        if (!pedido?.empresa_id || !Array.isArray(pedido.pedido_itens) || !pedido.pedido_itens.length) {
            avisar("Pedido indisponível", "Não foi possível recuperar os itens deste pedido.", "error");
            return;
        }

        const carrinhoExistente = App.lerJSON("carrinho", []);
        if (Array.isArray(carrinhoExistente) && carrinhoExistente.length) {
            const substituir = window.AppConfirm
                ? await window.AppConfirm({
                    titulo: "Substituir o carrinho atual?",
                    mensagem: "Ao pedir novamente, os itens que já estão no carrinho serão removidos e substituídos pelos itens deste pedido.",
                    confirmar: "Substituir e continuar",
                    cancelar: "Manter carrinho",
                    perigoso: true,
                    icone: "↻",
                    etiqueta: "Pedir novamente",
                    nota: "Você ainda poderá revisar itens, valores e endereço antes de finalizar o novo pedido."
                })
                : false;
            if (!substituir) return;
        }

        alterarBotao(botao, true);

        try {
            const produtoIds = [...new Set(pedido.pedido_itens
                .map((item) => String(item?.produto_id || ""))
                .filter(Boolean))];
            const adicionalIds = [...new Set(pedido.pedido_itens
                .flatMap((item) => Array.isArray(item?.adicionais) ? item.adicionais : [])
                .map((adicional) => String(adicional?.id || ""))
                .filter(Boolean))];

            const [empresaResposta, produtosResposta, adicionaisResposta, vinculosResposta, variantesResposta] = await Promise.all([
                db.from("empresas_catalogo")
                    .select("id,nome,taxa_entrega,pedido_minimo,status,cidade_atendimento,uf_atendimento,bairros_atendidos,tempo_estimado_min,tempo_estimado_max")
                    .eq("id", String(pedido.empresa_id))
                    .maybeSingle(),
                produtoIds.length
                    ? db.from("produtos")
                        .select("id,nome,imagem,preco,promocao,disponivel")
                        .in("id", produtoIds)
                    : Promise.resolve({ data: [], error: null }),
                adicionalIds.length
                    ? db.from("adicionais")
                        .select("id,grupo_id,nome,preco,ativo")
                        .in("id", adicionalIds)
                    : Promise.resolve({ data: [], error: null }),
                produtoIds.length
                    ? db.from("produto_grupos")
                        .select("produto_id,grupo_id")
                        .in("produto_id", produtoIds)
                    : Promise.resolve({ data: [], error: null }),
                produtoIds.length
                    ? db.from("produto_variantes")
                        .select("id,produto_id,nome,preco,promocao,ativo")
                        .in("produto_id", produtoIds)
                        .eq("ativo", true)
                    : Promise.resolve({ data: [], error: null })
            ]);

            if (empresaResposta.error) throw empresaResposta.error;
            if (produtosResposta.error) throw produtosResposta.error;
            if (adicionaisResposta.error) throw adicionaisResposta.error;
            if (vinculosResposta.error) throw vinculosResposta.error;
            if (variantesResposta.error) throw variantesResposta.error;
            if (!empresaResposta.data) throw new Error("O restaurante não está disponível no catálogo.");

            const empresa = empresaResposta.data;
            if (empresa.status === false) {
                avisar("Restaurante fechado", "Você poderá repetir este pedido quando o restaurante voltar a receber pedidos.", "warning", 6500);
                return;
            }

            const produtos = new Map((produtosResposta.data || []).map((produto) => [String(produto.id), produto]));
            const adicionais = new Map((adicionaisResposta.data || []).map((adicional) => [String(adicional.id), adicional]));
            const vinculos = new Set((vinculosResposta.data || [])
                .map((vinculo) => `${String(vinculo.produto_id)}|${String(vinculo.grupo_id)}`));
            const variantesPorProduto = new Map();
            (variantesResposta.data || []).forEach((variante) => {
                const chave = String(variante.produto_id);
                if (!variantesPorProduto.has(chave)) variantesPorProduto.set(chave, []);
                variantesPorProduto.get(chave).push(variante);
            });
            let itensIgnorados = 0;

            const carrinho = pedido.pedido_itens.flatMap((item) => {
                const produto = produtos.get(String(item?.produto_id || ""));
                if (!produto || produto.disponivel === false) {
                    itensIgnorados += 1;
                    return [];
                }

                const extras = (Array.isArray(item.adicionais) ? item.adicionais : []).flatMap((adicionalAntigo) => {
                    const adicional = adicionais.get(String(adicionalAntigo?.id || ""));
                    const pertenceAoProduto = adicional && vinculos.has(`${String(produto.id)}|${String(adicional.grupo_id)}`);
                    if (!adicional || adicional.ativo === false || !pertenceAoProduto) return [];
                    return [{
                        id: String(adicional.id),
                        nome: adicional.nome || adicionalAntigo.nome || "Adicional",
                        preco: Number(adicional.preco || 0)
                    }];
                });

                const variantesAtivas = variantesPorProduto.get(String(produto.id)) || [];
                const variante = item.variante_id ? variantesAtivas.find((opcao) => String(opcao.id) === String(item.variante_id)) : null;
                if (variantesAtivas.length && !variante) {
                    itensIgnorados += 1;
                    return [];
                }
                const promocao = Number(produto.promocao || 0);
                const precoVariante = variante ? (Number(variante.promocao || 0) > 0 ? Number(variante.promocao) : Number(variante.preco || 0)) : null;
                const novoItem = {
                    id: String(produto.id),
                    nome: produto.nome || item.nome_produto || "Produto",
                    imagem: produto.imagem || "../assets/produto-padrao.svg",
                    preco: variante ? precoVariante : (promocao > 0 ? promocao : Number(produto.preco || 0)),
                    variante_id: variante ? String(variante.id) : null,
                    variante_nome: variante?.nome || null,
                    quantidade: Math.min(99, Math.max(1, Number.parseInt(item.quantidade, 10) || 1)),
                    observacao: String(item.observacao || "").trim().slice(0, 300),
                    adicionais: extras,
                    empresa_id: String(empresa.id)
                };
                novoItem.chave = chaveProduto(novoItem);
                return [novoItem];
            });

            if (!carrinho.length) {
                avisar("Itens indisponíveis", "Os itens deste pedido não estão mais disponíveis. Vamos abrir o cardápio para você escolher outras opções.", "warning", 6500);
                setTimeout(() => { location.href = paginaCliente(`restaurante.html?id=${encodeURIComponent(empresa.id)}`); }, 900);
                return;
            }

            const meta = {
                empresa_id: String(empresa.id),
                empresa_nome: empresa.nome || pedido.empresa_nome || "Restaurante",
                taxa_entrega: Number(empresa.taxa_entrega || 0),
                pedido_minimo: Number(empresa.pedido_minimo || 0),
                status: empresa.status !== false,
                cidade_atendimento: empresa.cidade_atendimento || null,
                uf_atendimento: empresa.uf_atendimento || null,
                bairros_atendidos: Array.isArray(empresa.bairros_atendidos) ? empresa.bairros_atendidos : [],
                tempo_estimado_min: Number(empresa.tempo_estimado_min || 25),
                tempo_estimado_max: Number(empresa.tempo_estimado_max || 45)
            };

            App.salvarJSON("carrinho", carrinho);
            App.salvarJSON("carrinhoMeta", meta);
            App.salvarJSON("empresaAtual", meta);
            localStorage.setItem("ultimaPaginaRestaurante", `restaurante.html?id=${encodeURIComponent(empresa.id)}`);

            if (itensIgnorados) {
                sessionStorage.setItem(
                    "avisoCarrinho",
                    `${itensIgnorados} ${itensIgnorados === 1 ? "item indisponível foi removido" : "itens indisponíveis foram removidos"} do pedido repetido.`
                );
            }
            location.href = paginaCliente("checkout.html");
        } catch (error) {
            console.error("Erro ao repetir pedido:", error);
            avisar("Não foi possível repetir o pedido", App.mensagemErro(error), "error", 6500);
        } finally {
            alterarBotao(botao, false);
        }
    }

    window.PosPedido = Object.freeze({ pedirNovamente });
})();
