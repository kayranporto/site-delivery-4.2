"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const OrderUtils = require("../js/core/order-utils.js");

test("aceita somente transições válidas do pedido", () => {
    assert.equal(OrderUtils.validarTransicao("recebido", "preparando"), true);
    assert.equal(OrderUtils.validarTransicao("preparando", "entregue"), false);
    assert.equal(OrderUtils.validarTransicao("entregue", "cancelado"), false);
});

test("calcula percentual, teto e frete grátis", () => {
    assert.equal(OrderUtils.calcularDesconto({ tipo: "percentual", valor: 20, subtotal: 100 }), 20);
    assert.equal(OrderUtils.calcularDesconto({ tipo: "percentual", valor: 50, subtotal: 100, maximo: 15 }), 15);
    assert.equal(OrderUtils.calcularDesconto({ tipo: "frete", taxa: 8.5, subtotal: 50 }), 8.5);
});

test("agendamento fica entre 30 minutos e 7 dias", () => {
    const agora = Date.UTC(2026, 7, 4, 12);
    assert.equal(OrderUtils.validarAgendamento(new Date(agora + 31 * 60000), agora), true);
    assert.equal(OrderUtils.validarAgendamento(new Date(agora + 10 * 60000), agora), false);
    assert.equal(OrderUtils.validarAgendamento(new Date(agora + 8 * 86400000), agora), false);
});

