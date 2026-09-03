"use strict";

let desconto = 0;
let cupomAplicado = "";
let cupomDados = null;
let enderecoSelecionado = null;
let checkoutInicializado = false;
let carrinho = window.CartStore?.ler() || App.lerJSON("carrinho", []);
let carrinhoMeta = window.CartStore?.meta() || App.lerJSON("carrinhoMeta", null);
carrinho = Array.isArray(carrinho) ? carrinho : [];
carrinhoMeta = carrinhoMeta && typeof carrinhoMeta === "object" && !Array.isArray(carrinhoMeta) ? carrinhoMeta : null;

const listaResumo = document.getElementById("listaResumo");
const subtotalElemento = document.getElementById("subtotal");
const taxaElemento = document.getElementById("taxa");
const descontoElemento = document.getElementById("desconto");
const totalElemento = document.getElementById("total");
const enderecoElemento = document.getElementById("enderecoEntrega");
const pedidoMinimoMensagem = document.getElementById("pedidoMinimoMensagem");
const btnCupom = document.getElementById("btnCupom");
const campoCupom = document.getElementById("cupom");
const btnFinalizar = document.getElementById("finalizarPedido");
const btnVoltar = document.querySelector(".checkout-header .voltar");
const observacoes = document.getElementById("observacoesPedido");
const observacoesContador = document.getElementById("observacoesContador");
const trocoField = document.getElementById("trocoField");
const trocoPara = document.getElementById("trocoPara");
const pagamentoNota = document.getElementById("pagamentoNota");
const footerTotalElemento = document.getElementById("footerTotal");

function avisarCheckout(mensagem, tipo = "error", titulo = "Finalizar pedido") {
    if (window.AppToast) window.AppToast(titulo, mensagem, tipo);
    else alert(mensagem);
}

function atualizarPrevisaoEndereco() {
    const minimo = Number(carrinhoMeta?.tempo_estimado_min || 25);
    const maximo = Number(carrinhoMeta?.tempo_estimado_max || 45);
    document.getElementById("previsaoCheckout").textContent = `Previsão de ${minimo}–${maximo} minutos`;
    document.getElementById("areaCheckout").textContent = enderecoSelecionado
        ? (carrinhoMeta?.regiao_atendida === false ? (carrinhoMeta.mensagem_entrega || "Endereço fora da área de entrega") : `${enderecoSelecionado.bairro || "Bairro"} • ${enderecoSelecionado.cidade || "Cidade"}`)
        : "Cadastre ou selecione um endereço para continuar.";
    const mapa = document.getElementById("abrirMapaEndereco");
    mapa.href = enderecoSelecionado
        ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(enderecoCompleto(enderecoSelecionado))}`
        : "https://www.openstreetmap.org";
}

function itensValidos() {
    return carrinho.length > 0 && carrinho.every((item) => {
        const quantidade = Number(item?.quantidade);
        const preco = Number(item?.preco);
        const adicionais = Array.isArray(item?.adicionais) ? item.adicionais : [];
        return Boolean(item?.id)
            && item.indisponivel !== true
            && Number.isInteger(quantidade)
            && quantidade >= 1
            && quantidade <= 99
            && Number.isFinite(preco)
            && preco >= 0
            && adicionais.every((adicional) => {
                const valor = Number(adicional?.preco);
                return Boolean(adicional?.id) && Number.isFinite(valor) && valor >= 0;
            });
    });
}

function valorUnitario(item) {
    const adicionais = Array.isArray(item.adicionais) ? item.adicionais : [];
    return Number(item.preco || 0) + adicionais.reduce((soma, adicional) => soma + Number(adicional.preco || 0), 0);
}

function calcularSubtotal() {
    if (!itensValidos()) return 0;
    return carrinho.reduce((total, item) => total + valorUnitario(item) * Number(item.quantidade), 0);
}

function taxaEntrega() {
    const taxa = Number(carrinhoMeta?.taxa_entrega || 0);
    return itensValidos() && Number.isFinite(taxa) && taxa >= 0 ? taxa : 0;
}

function recalcularDesconto() {
    const subtotal = calcularSubtotal();
    desconto = cupomDados ? OrderUtils.calcularDesconto({ tipo: cupomDados.tipo, valor: cupomDados.valor, subtotal, taxa: taxaEntrega(), maximo: cupomDados.max_desconto }) : 0;
}

function calcularTotal() {
    return Math.max(0, calcularSubtotal() + taxaEntrega() - desconto);
}

function enderecoCompleto(endereco) {
    const base = App.formatarEndereco(endereco);
    return endereco?.referencia ? `${base} — Ref.: ${endereco.referencia}` : base;
}

async function carregarEndereco() {
    const { data: { user } } = await window.db.auth.getUser();
    if (!user) {
        enderecoSelecionado = null;
        enderecoElemento.textContent = "Entre na sua conta para selecionar um endereço.";
        atualizarMensagemPedidoMinimo();
        return;
    }

    App.vincularUsuarioLocal(user.id);
    const { data, error } = await window.db.from("enderecos")
        .select("*")
        .eq("usuario_id", user.id)
        .order("principal", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    enderecoSelecionado = data || null;
    enderecoElemento.textContent = enderecoSelecionado
        ? enderecoCompleto(enderecoSelecionado)
        : "Nenhum endereço cadastrado. Adicione um endereço antes de finalizar.";
    if (enderecoSelecionado && carrinhoMeta?.empresa_id) await aplicarRegiaoEntrega();
    atualizarPrevisaoEndereco();
    atualizarMensagemPedidoMinimo();
}

function atualizarMensagemPedidoMinimo() {
    if (!pedidoMinimoMensagem) return;
    const subtotal = calcularSubtotal();
    const minimo = Number(carrinhoMeta?.pedido_minimo || 0);
    if (!carrinho.length) {
        pedidoMinimoMensagem.textContent = "Adicione itens ao seu carrinho para ver o pedido mínimo.";
    } else if (!minimo) {
        pedidoMinimoMensagem.textContent = "Este restaurante não exige pedido mínimo.";
    } else if (subtotal < minimo) {
        pedidoMinimoMensagem.textContent = `Faltam ${App.dinheiro(minimo - subtotal)} para atingir o pedido mínimo de ${App.dinheiro(minimo)}.`;
    } else {
        pedidoMinimoMensagem.textContent = `Você atingiu o pedido mínimo de ${App.dinheiro(minimo)}.`;
    }
}

async function aplicarRegiaoEntrega() {
    if (!enderecoSelecionado || !carrinhoMeta?.empresa_id) return false;
    const { data, error } = await window.db.rpc("calcular_entrega_empresa", {
        p_empresa_id: String(carrinhoMeta.empresa_id),
        p_cidade: enderecoSelecionado.cidade || "",
        p_uf: enderecoSelecionado.uf || enderecoSelecionado.estado || "",
        p_bairro: enderecoSelecionado.bairro || ""
    });
    if (error) throw new Error(`A operação por região ainda não está disponível: ${App.mensagemErro(error)}`);
    carrinhoMeta.regiao_atendida = data?.atendido === true;
    carrinhoMeta.aberto_por_horario = data?.aberto !== false;
    carrinhoMeta.mensagem_entrega = data?.mensagem || "";
    if (data?.atendido) {
        carrinhoMeta.taxa_entrega = Number(data.taxa_entrega || 0);
        carrinhoMeta.pedido_minimo = Number(data.pedido_minimo || 0);
        carrinhoMeta.tempo_estimado_min = Number(data.tempo_min || 25);
        carrinhoMeta.tempo_estimado_max = Number(data.tempo_max || 45);
    }
    if (window.CartStore) window.CartStore.salvar(carrinho, carrinhoMeta);
    atualizarPrevisaoEndereco();
    atualizarTotais();
    return data?.atendido === true;
}

function criarResumo(item) {
    const container = document.createElement("article");
    container.className = "item-resumo";
    const info = document.createElement("div");
    info.className = "item-info";
    const titulo = document.createElement("h4");
    titulo.textContent = `${item.quantidade}x ${item.nome || "Produto"}`;
    info.append(titulo);

    if (item.variante_nome) {
        const variante = document.createElement("small");
        variante.textContent = item.variante_nome;
        info.append(variante);
    }

    if (item.indisponivel) {
        const aviso = document.createElement("strong");
        aviso.className = "item-indisponivel";
        aviso.textContent = "Produto indisponível";
        info.append(aviso);
    }

    (Array.isArray(item.adicionais) ? item.adicionais : []).forEach((adicional) => {
        const texto = document.createElement("small");
        texto.textContent = `+ ${adicional.nome || "Adicional"} (${App.dinheiro(adicional.preco)})`;
        info.append(texto, document.createElement("br"));
    });

    if (item.observacao) {
        const texto = document.createElement("small");
        texto.textContent = `Obs: ${item.observacao}`;
        info.append(texto);
    }

    const preco = document.createElement("div");
    preco.className = "item-preco";
    preco.textContent = App.dinheiro(valorUnitario(item) * Number(item.quantidade || 0));
    container.append(info, preco);
    return container;
}

function atualizarTotais() {
    recalcularDesconto();
    subtotalElemento.textContent = App.dinheiro(calcularSubtotal());
    taxaElemento.textContent = App.dinheiro(taxaEntrega());
    descontoElemento.textContent = `− ${App.dinheiro(desconto)}`;
    totalElemento.textContent = App.dinheiro(calcularTotal());
    if (footerTotalElemento) footerTotalElemento.textContent = App.dinheiro(calcularTotal());
    atualizarMensagemPedidoMinimo();
}

function renderizarResumo() {
    listaResumo.replaceChildren();
    if (!carrinho.length || !itensValidos()) {
        const vazio = document.createElement("p");
        vazio.textContent = carrinho.length
            ? "O carrinho possui um produto indisponível ou dados inválidos. Volte ao restaurante e revise os itens."
            : "Seu carrinho está vazio.";
        listaResumo.append(vazio);
        btnFinalizar.disabled = true;
    } else {
        btnFinalizar.disabled = !checkoutInicializado;
        carrinho.forEach((item) => listaResumo.append(criarResumo(item)));
    }
    atualizarTotais();
}

function snapshotValores() {
    return JSON.stringify({
        empresa: carrinhoMeta ? {
            taxa: Number(carrinhoMeta.taxa_entrega || 0),
            minimo: Number(carrinhoMeta.pedido_minimo || 0),
            status: carrinhoMeta.status
        } : null,
        itens: carrinho.map((item) => ({
            id: String(item.id),
            variante: item.variante_id ? String(item.variante_id) : null,
            preco: Number(item.preco || 0),
            adicionais: (item.adicionais || []).map((adicional) => [String(adicional.id), Number(adicional.preco || 0)])
        }))
    });
}

async function sincronizarValores() {
    if (!carrinho.length || !carrinhoMeta?.empresa_id) return false;
    const antes = snapshotValores();
    const produtoIds = [...new Set(carrinho.map((item) => String(item.id)).filter(Boolean))];
    const adicionalIds = [...new Set(carrinho.flatMap((item) => (item.adicionais || []).map((adicional) => String(adicional.id))).filter(Boolean))];

    const [empresaResposta, produtosResposta, adicionaisResposta, variantesResposta] = await Promise.all([
        window.db.from("empresas_catalogo")
            .select("id,nome,taxa_entrega,pedido_minimo,status,cidade_atendimento,uf_atendimento,bairros_atendidos,tempo_estimado_min,tempo_estimado_max")
            .eq("id", String(carrinhoMeta.empresa_id))
            .maybeSingle(),
        window.db.from("produtos")
            .select("id,nome,imagem,preco,promocao,disponivel")
            .in("id", produtoIds),
        adicionalIds.length
            ? window.db.from("adicionais").select("id,nome,preco,ativo").in("id", adicionalIds)
            : Promise.resolve({ data: [], error: null }),
        window.db.from("produto_variantes").select("id,produto_id,nome,preco,promocao,ativo").in("produto_id", produtoIds).eq("ativo", true)
    ]);

    if (empresaResposta.error) throw empresaResposta.error;
    if (produtosResposta.error) throw produtosResposta.error;
    if (adicionaisResposta.error) throw adicionaisResposta.error;
    if (variantesResposta.error) throw variantesResposta.error;
    if (!empresaResposta.data) throw new Error("O restaurante não está publicado ou não foi encontrado.");

    const empresa = empresaResposta.data;
    carrinhoMeta = {
        ...carrinhoMeta,
        empresa_nome: empresa.nome,
        taxa_entrega: Number(empresa.taxa_entrega || 0),
        pedido_minimo: Number(empresa.pedido_minimo || 0),
        status: empresa.status !== false,
        cidade_atendimento: empresa.cidade_atendimento || null,
        uf_atendimento: empresa.uf_atendimento || null,
        bairros_atendidos: empresa.bairros_atendidos || [],
        tempo_estimado_min: Number(empresa.tempo_estimado_min || 25),
        tempo_estimado_max: Number(empresa.tempo_estimado_max || 45)
    };

    if (enderecoSelecionado) await aplicarRegiaoEntrega();

    const produtosServidor = new Map((produtosResposta.data || []).map((produto) => [String(produto.id), produto]));
    const adicionaisServidor = new Map((adicionaisResposta.data || []).map((adicional) => [String(adicional.id), adicional]));
    const variantesPorProduto = new Map();
    (variantesResposta.data || []).forEach((variante) => {
        const chave = String(variante.produto_id);
        if (!variantesPorProduto.has(chave)) variantesPorProduto.set(chave, []);
        variantesPorProduto.get(chave).push(variante);
    });
    carrinho.forEach((item) => {
        const produto = produtosServidor.get(String(item.id));
        item.indisponivel = !produto || produto.disponivel === false;
        if (produto) {
            item.nome = produto.nome || item.nome;
            item.imagem = produto.imagem || item.imagem;
            const variantesAtivas = variantesPorProduto.get(String(item.id)) || [];
            const variante = item.variante_id ? variantesAtivas.find((opcao) => String(opcao.id) === String(item.variante_id)) : null;
            if (variantesAtivas.length && !variante) item.indisponivel = true;
            if (variante) {
                item.variante_nome = variante.nome || item.variante_nome;
                item.preco = Number(variante.promocao || 0) > 0 ? Number(variante.promocao) : Number(variante.preco || 0);
            } else if (!variantesAtivas.length) {
                item.variante_id = null;
                item.variante_nome = null;
                item.preco = Number(produto.promocao || 0) > 0 ? Number(produto.promocao) : Number(produto.preco || 0);
            }
        }
        item.adicionais = (item.adicionais || []).map((adicional) => {
            const servidor = adicionaisServidor.get(String(adicional.id));
            if (!servidor || servidor.ativo === false) return { ...adicional, indisponivel: true };
            return { ...adicional, nome: servidor.nome || adicional.nome, preco: Number(servidor.preco || 0) };
        });
        if (item.adicionais.some((adicional) => adicional.indisponivel)) item.indisponivel = true;
    });

    if (window.CartStore) window.CartStore.salvar(carrinho, carrinhoMeta);
    else { App.salvarJSON("carrinho", carrinho); App.salvarJSON("carrinhoMeta", carrinhoMeta); }
    return antes !== snapshotValores();
}

async function aplicarCupom() {
    const cupom = campoCupom.value.trim().toUpperCase();
    cupomAplicado = "";
    cupomDados = null;
    desconto = 0;

    if (!cupom) return avisarCheckout("Digite um cupom.", "info", "Cupom");

    const { data, error } = await window.db.from("cupons")
        .select("id,empresa_id,codigo,tipo,valor,pedido_minimo,max_desconto,primeiro_pedido,inicio,fim,dias_semana,horario_inicio,horario_fim")
        .ilike("codigo", cupom)
        .limit(10);
    if (error) return avisarCheckout(`Não foi possível validar o cupom: ${App.mensagemErro(error)}`, "error", "Cupom");
    const opcoes = (data || []).filter((item) => item.empresa_id === null || String(item.empresa_id) === String(carrinhoMeta?.empresa_id));
    cupomDados = opcoes.find((item) => String(item.empresa_id) === String(carrinhoMeta?.empresa_id)) || opcoes.find((item) => item.empresa_id === null) || null;
    if (!cupomDados) return avisarCheckout("Cupom inválido, expirado ou indisponível para este restaurante.", "error", "Cupom");
    if (calcularSubtotal() < Number(cupomDados.pedido_minimo || 0)) { cupomDados = null; return avisarCheckout(`Este cupom exige pedido mínimo de ${App.dinheiro(opcoes[0]?.pedido_minimo)}.`, "info", "Cupom"); }

    if (cupomDados.primeiro_pedido) {
        const { data: { user } } = await window.db.auth.getUser();
        if (user) {
            const resposta = await window.db.from("pedidos").select("id").eq("usuario_id", user.id).neq("status", "cancelado").limit(1);
            if (resposta.error) return avisarCheckout(`Não foi possível validar o cupom: ${App.mensagemErro(resposta.error)}`, "error", "Cupom");
            if (resposta.data?.length) { cupomDados = null; return avisarCheckout("Este cupom é válido somente no primeiro pedido.", "info", "Cupom"); }
        }
    }

    cupomAplicado = cupom;
    recalcularDesconto();
    atualizarTotais();
    window.AppToast?.("Cupom aplicado", "A validação final será feita com segurança ao enviar o pedido.", "success");
}

async function verificarUsuario() {
    const { data: { user }, error } = await window.db.auth.getUser();
    if (error || !user) {
        localStorage.setItem("redirect", "checkout.html");
        window.location.href = "login.html";
        return null;
    }
    App.vincularUsuarioLocal(user.id);
    return user;
}

function validarAreaEntrega() {
    if (!enderecoSelecionado) return false;
    if (typeof carrinhoMeta?.regiao_atendida === "boolean") return carrinhoMeta.regiao_atendida;
    const cidade = String(carrinhoMeta?.cidade_atendimento || "").trim().toLowerCase();
    const uf = String(carrinhoMeta?.uf_atendimento || "").trim().toUpperCase();
    const bairros = Array.isArray(carrinhoMeta?.bairros_atendidos) ? carrinhoMeta.bairros_atendidos : [];
    if (cidade && String(enderecoSelecionado.cidade || "").trim().toLowerCase() !== cidade) return false;
    if (uf && String(enderecoSelecionado.uf || "").trim().toUpperCase() !== uf) return false;
    if (bairros.length && !bairros.some((bairro) => String(bairro).trim().toLowerCase() === String(enderecoSelecionado.bairro || "").trim().toLowerCase())) return false;
    return true;
}

function valorTroco() {
    const texto = trocoPara.value.trim();
    if (!texto) return null;
    const numero = Number(texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
    return Number.isFinite(numero) ? numero : null;
}


function limparCheckoutConcluido() {
    sessionStorage.removeItem("checkoutIdempotencia");
    sessionStorage.removeItem("checkoutAssinatura");
    if (window.CartStore) window.CartStore.limpar();
    else { localStorage.removeItem("carrinho"); localStorage.removeItem("carrinhoMeta"); }
}

function chaveIdempotenciaCheckout() {
    const assinatura = JSON.stringify({ empresa: carrinhoMeta?.empresa_id, itens: carrinho.map((item) => [item.id, item.variante_id || null, item.quantidade, item.observacao || "", (item.adicionais || []).map((adicional) => adicional.id).sort()]) });
    const chaveAssinatura = "checkoutAssinatura";
    const chaveId = "checkoutIdempotencia";
    if (sessionStorage.getItem(chaveAssinatura) !== assinatura) {
        sessionStorage.setItem(chaveAssinatura, assinatura);
        sessionStorage.setItem(chaveId, crypto.randomUUID());
    }
    if (!sessionStorage.getItem(chaveId)) sessionStorage.setItem(chaveId, crypto.randomUUID());
    return sessionStorage.getItem(chaveId);
}

async function finalizarPedido() {
    if (!carrinho.length || !itensValidos() || !carrinhoMeta?.empresa_id) return avisarCheckout("Seu carrinho está vazio ou possui dados inválidos.");

    try {
        const valoresAlterados = await sincronizarValores();
        renderizarResumo();
        if (valoresAlterados) {
            avisarCheckout("Os preços ou a taxa de entrega foram atualizados. Revise o novo total antes de continuar.", "info");
            return;
        }
    } catch (erro) {
        avisarCheckout(`Não foi possível confirmar os valores atuais: ${App.mensagemErro(erro)}`);
        return;
    }

    if (carrinhoMeta.status === false) return avisarCheckout("Este restaurante está fechado e não está recebendo pedidos.");
    const subtotal = calcularSubtotal();
    const minimo = Number(carrinhoMeta.pedido_minimo || 0);
    if (subtotal < minimo) return avisarCheckout(`O pedido mínimo é ${App.dinheiro(minimo)}.`);

    const user = await verificarUsuario();
    if (!user) return;
    try { await carregarEndereco(); } catch (erro) { return avisarCheckout(`Não foi possível carregar o endereço: ${App.mensagemErro(erro)}`); }
    if (!enderecoSelecionado) {
        const cadastrar = window.AppConfirm ? await window.AppConfirm({ titulo: "Endereço necessário", mensagem: "Cadastre um endereço para receber seu pedido.", confirmar: "Cadastrar endereço" }) : confirm("Você ainda não possui um endereço. Deseja cadastrar agora?");
        if (cadastrar) window.location.href = "enderecos.html?redirect=checkout.html";
        return;
    }
    if (!validarAreaEntrega()) return avisarCheckout("O endereço selecionado está fora da área de entrega deste restaurante.");

    const pagamento = document.querySelector("input[name='pagamento']:checked")?.value;
    if (!pagamento) return avisarCheckout("Selecione uma forma de pagamento.", "info");
    if (pagamento === "Online" && window.DELIVERY_CONFIG?.pagamentoOnlineAtivo !== true) {
        return avisarCheckout("O pagamento online está temporariamente indisponível. Escolha uma forma de pagamento na entrega.", "info");
    }

    const troco = pagamento === "Dinheiro" ? valorTroco() : null;
    if (pagamento === "Dinheiro" && trocoPara.value.trim() && (troco === null || troco < calcularTotal())) {
        return avisarCheckout("Informe um valor de troco maior ou igual ao total do pedido.", "info");
    }

    const endereco = enderecoCompleto(enderecoSelecionado);
    const observacoesPartes = [observacoes.value.trim()];
    if (troco !== null) observacoesPartes.push(`Troco para ${App.dinheiro(troco)}`);
    const observacoesFinais = observacoesPartes.filter(Boolean).join(" • ").slice(0, 500) || null;

    App.definirCarregando(btnFinalizar, true, "Enviando pedido...");
    const itens = carrinho.map((item) => ({
        produto_id: String(item.id),
        variante_id: item.variante_id ? String(item.variante_id) : null,
        quantidade: Math.min(99, Math.max(1, Number.parseInt(item.quantidade, 10) || 1)),
        observacao: String(item.observacao || "").trim().slice(0, 300) || null,
        adicionais: (Array.isArray(item.adicionais) ? item.adicionais : []).map((adicional) => ({ id: String(adicional.id) }))
    }));

    try {
        const { data: pedidoCriado, error: erroPedido } = await window.db.rpc("criar_pedido_operacional", {
            p_empresa_id: String(carrinhoMeta.empresa_id),
            p_endereco_id: enderecoSelecionado.id,
            p_pagamento: pagamento === "Online" ? "Cartão" : pagamento,
            p_observacoes: observacoesFinais,
            p_cupom: cupomAplicado || null,
            p_itens: itens,
            p_agendado_para: null,
            p_chave_cliente: chaveIdempotenciaCheckout()
        });
        if (erroPedido) throw erroPedido;
        if (!pedidoCriado?.id) throw new Error("O banco não retornou o pedido criado.");

        const { data: pedidoBanco, error: erroLeitura } = await window.db.from("pedidos")
            .select("*, pedido_itens(*)")
            .eq("id", pedidoCriado.id)
            .eq("usuario_id", user.id)
            .single();
        if (erroLeitura) throw erroLeitura;

        App.salvarJSON("pedidoAtual", pedidoBanco);
        if (pagamento === "Online") {
            const { error: erroModalidade } = await window.db.rpc("pedido_definir_pagamento_online", { p_pedido_id: pedidoBanco.id });
            if (erroModalidade) throw erroModalidade;
            pedidoBanco.pagamento_modalidade = "online";
            App.salvarJSON("pedidoAtual", pedidoBanco);
            const { data: pagamentoCriado, error: erroPagamento } = await window.db.functions.invoke("criar-pagamento", { body: { pedido_id: pedidoBanco.id } });
            limparCheckoutConcluido();
            if (erroPagamento || !pagamentoCriado?.checkout_url) {
                avisarCheckout("O pedido foi criado, mas o pagamento online não pôde ser iniciado. Você poderá tentar novamente no acompanhamento.", "info", "Pedido criado");
                window.location.href = `acompanhamento.html?id=${encodeURIComponent(pedidoBanco.id)}`;
                return;
            }
            window.location.href = pagamentoCriado.checkout_url;
            return;
        }
        limparCheckoutConcluido();
        window.location.href = "pedido-sucesso.html";
    } catch (error) {
        console.error("Erro ao enviar pedido:", error);
        avisarCheckout(`O pedido não foi enviado e o carrinho foi preservado. ${App.mensagemErro(error, "Erro desconhecido")}`);
    } finally {
        App.definirCarregando(btnFinalizar, false);
    }
}

btnCupom.addEventListener("click", aplicarCupom);
campoCupom.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        aplicarCupom();
    }
});
document.getElementById("alterarEndereco").addEventListener("click", () => {
    window.location.href = "enderecos.html?redirect=checkout.html";
});
document.querySelectorAll("input[name='pagamento']").forEach((input) => {
    input.addEventListener("change", () => {
        trocoField.hidden = input.value !== "Dinheiro" || !input.checked;
        if (trocoField.hidden) trocoPara.value = "";
        if (input.checked) pagamentoNota.textContent = input.value === "Online"
            ? "Você será redirecionado para o ambiente seguro do Mercado Pago. O restaurante só verá a confirmação do pagamento."
            : "O pagamento será realizado diretamente ao restaurante na entrega. Nenhum dado de cartão é solicitado neste site.";
    });
});

const pagamentoOnline = document.querySelector("input[name='pagamento'][value='Online']");
const pagamentoOnlineAtivo = window.DELIVERY_CONFIG?.pagamentoOnlineAtivo === true;
if (pagamentoOnline) {
    pagamentoOnline.disabled = !pagamentoOnlineAtivo;
    pagamentoOnline.closest(".payment-option")?.toggleAttribute("data-pagamento-indisponivel", !pagamentoOnlineAtivo);
    const statusOnline = document.getElementById("pagamentoOnlineStatus");
    const badgeOnline = document.getElementById("pagamentoOnlineBadge");
    if (statusOnline) statusOnline.textContent = pagamentoOnlineAtivo ? "PIX ou cartão pelo Mercado Pago" : "Temporariamente indisponível";
    if (badgeOnline) badgeOnline.textContent = pagamentoOnlineAtivo ? "ONLINE" : "EM BREVE";
    if (!pagamentoOnlineAtivo && pagamentoOnline.checked) {
        pagamentoOnline.checked = false;
        const pix = document.querySelector("input[name='pagamento'][value='PIX']");
        if (pix) pix.checked = true;
    }
}
observacoes.addEventListener("input", () => {
    if (observacoesContador) observacoesContador.textContent = `${observacoes.value.length}/500`;
});
btnFinalizar.addEventListener("click", async () => {
    if (!checkoutInicializado) return;
    if (!enderecoSelecionado) {
        const user = await verificarUsuario();
        if (user) window.location.href = "enderecos.html?redirect=checkout.html";
        return;
    }
    if (!validarAreaEntrega()) {
        window.location.href = "enderecos.html?redirect=checkout.html";
        return;
    }
    try {
        await finalizarPedido();
    } finally {
        window.dispatchEvent(new CustomEvent("checkout-envio-finalizado"));
    }
});

if (btnVoltar) btnVoltar.href = App.destinoInterno(localStorage.getItem("ultimaPaginaRestaurante"), "../index.html");
renderizarResumo();
const avisoCarrinho = sessionStorage.getItem("avisoCarrinho");
if (avisoCarrinho) {
    sessionStorage.removeItem("avisoCarrinho");
    setTimeout(() => window.AppToast?.("Carrinho atualizado", avisoCarrinho, "info"), 0);
}
(async function iniciarCheckout() {
    try {
        await sincronizarValores();
        renderizarResumo();
    } catch (erro) {
        App.mostrarErroPagina(`Não foi possível atualizar os valores: ${App.mensagemErro(erro)}`);
    }
    try {
        await carregarEndereco();
    } catch (erro) {
        App.mostrarErroPagina(`Não foi possível carregar o endereço: ${App.mensagemErro(erro)}`);
    }
    checkoutInicializado = true;
    document.body.dataset.checkoutInicializado = "true";
    renderizarResumo();
    window.dispatchEvent(new CustomEvent("checkout-inicializado"));
})();
