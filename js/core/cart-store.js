"use strict";

(function criarArmazenamentoCarrinho() {
    const CHAVE = "carrinho";
    const BACKUP = "carrinhoBackup";
    const META = "carrinhoMeta";
    function valido(lista) { return Array.isArray(lista) && lista.every((item) => item && item.id && Number(item.quantidade) > 0); }
    function ler() {
        const principal = window.App.lerJSON(CHAVE, []);
        if (valido(principal)) return principal;
        const backup = window.App.lerJSON(BACKUP, []);
        if (valido(backup)) {
            window.App.salvarJSON(CHAVE, backup);
            sessionStorage.setItem("avisoCarrinho", "Recuperamos os itens salvos anteriormente.");
            return backup;
        }
        return [];
    }
    function meta() { return window.App.lerJSON(META, null); }
    function salvar(lista, dados) {
        if (valido(lista) && lista.length) {
            window.App.salvarJSON(CHAVE, lista);
            window.App.salvarJSON(BACKUP, lista);
        } else {
            localStorage.removeItem(CHAVE); localStorage.removeItem(BACKUP);
        }
        if (dados && lista?.length) window.App.salvarJSON(META, dados);
        else localStorage.removeItem(META);
        dispatchEvent(new CustomEvent("carrinho-atualizado", { detail: { itens: lista || [], meta: dados || null } }));
    }
    function limpar() { salvar([], null); }
    addEventListener("storage", (evento) => { if ([CHAVE, META].includes(evento.key)) dispatchEvent(new Event("carrinho-sincronizar")); });
    window.CartStore = { ler, meta, salvar, limpar };
})();
