"use strict";

const pedido = App.lerJSON("pedidoAtual", null);
const numero = document.getElementById("numeroPedido");
numero.textContent = pedido?.numero ? `#${pedido.numero}` : "";

const previsao = document.querySelector(".pedido-info strong");
if (previsao && pedido) {
    const minimo = Number(pedido.previsao_min || 25);
    const maximo = Number(pedido.previsao_max || 45);
    previsao.textContent = `${minimo}–${maximo} minutos`;
}

if (!pedido) {
    const texto = document.querySelector(".pedido-info p");
    if (texto) texto.textContent = "Consulte seus pedidos para acompanhar o status.";
}
