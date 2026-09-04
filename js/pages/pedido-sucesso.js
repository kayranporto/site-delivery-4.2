"use strict";

const pedido = App.lerJSON("pedidoAtual", null);
const numero = document.getElementById("numeroPedido");
numero.textContent = pedido?.numero ? `#${pedido.numero}` : "—";

const previsao = document.getElementById("previsaoPedido");
if (previsao && pedido) {
    const minimo = Number(pedido.previsao_min || 25);
    const maximo = Number(pedido.previsao_max || 45);
    previsao.textContent = `${minimo}–${maximo} minutos`;
}

const acompanhar = document.getElementById("acompanharPedido");
if (acompanhar && pedido?.id) acompanhar.href = `acompanhamento.html?id=${encodeURIComponent(pedido.id)}`;

function renderizarResumoPedido() {
    const resumo = document.getElementById("resumoPedidoSucesso");
    const itens = Array.isArray(pedido?.pedido_itens) ? pedido.pedido_itens : [];
    if (!resumo || !itens.length) return;
    const lista = document.getElementById("itensPedidoSucesso");
    lista.replaceChildren();
    itens.forEach((item) => {
        const linha = document.createElement("div");
        const nome = document.createElement("span");
        nome.textContent = `${Number(item.quantidade || 1)}x ${item.nome_produto || "Produto"}`;
        const valor = document.createElement("strong");
        const adicionais = Array.isArray(item.adicionais) ? item.adicionais : [];
        const extras = adicionais.reduce((total, adicional) => total + Number(adicional.preco || 0), 0);
        valor.textContent = App.dinheiro((Number(item.preco_unitario || 0) + extras) * Number(item.quantidade || 1));
        linha.append(nome, valor);
        lista.append(linha);
    });
    document.getElementById("subtotalPedidoSucesso").textContent = App.dinheiro(pedido.subtotal);
    document.getElementById("taxaPedidoSucesso").textContent = Number(pedido.taxa_entrega || 0) === 0 ? "Grátis" : App.dinheiro(pedido.taxa_entrega);
    document.getElementById("totalPedidoSucesso").textContent = App.dinheiro(pedido.total);
    resumo.hidden = false;
}

renderizarResumoPedido();

if (!pedido) {
    const texto = document.querySelector(".sucesso > p");
    if (texto) texto.textContent = "Consulte seus pedidos para acompanhar o status e ver o recibo.";
}
