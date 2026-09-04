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

if (!pedido) {
    const texto = document.querySelector(".sucesso > p");
    if (texto) texto.textContent = "Consulte seus pedidos para acompanhar o status e ver o recibo.";
}
