(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.OrderUtils = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const transicoes = Object.freeze({
        recebido: Object.freeze(["preparando", "cancelado"]),
        preparando: Object.freeze(["saiu_para_entrega", "cancelado"]),
        saiu_para_entrega: Object.freeze(["entregue"]),
        entregue: Object.freeze([]),
        cancelado: Object.freeze([])
    });

    function validarTransicao(origem, destino) {
        return (transicoes[origem] || []).includes(destino);
    }

    function calcularDesconto({ tipo, valor = 0, subtotal = 0, taxa = 0, maximo = null } = {}) {
        const base = Math.max(0, Number(subtotal) || 0);
        let desconto = 0;
        if (tipo === "percentual") desconto = Math.round(base * Math.min(100, Math.max(0, Number(valor) || 0))) / 100;
        if (tipo === "fixo") desconto = Math.min(base, Math.max(0, Number(valor) || 0));
        if (tipo === "frete") desconto = Math.max(0, Number(taxa) || 0);
        if (maximo !== null && maximo !== undefined && maximo !== "") desconto = Math.min(desconto, Math.max(0, Number(maximo) || 0));
        return Math.round(desconto * 100) / 100;
    }

    function validarAgendamento(valor, agora = Date.now()) {
        if (!valor) return true;
        const momento = new Date(valor).getTime();
        return Number.isFinite(momento)
            && momento >= agora + 30 * 60 * 1000
            && momento <= agora + 7 * 24 * 60 * 60 * 1000;
    }

    return { transicoes, validarTransicao, calcularDesconto, validarAgendamento };
});

