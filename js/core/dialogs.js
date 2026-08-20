"use strict";

(function criarDialogos() {
    function confirmar({ titulo = "Confirmar ação", mensagem = "Deseja continuar?", confirmar = "Confirmar", perigoso = false } = {}) {
        return new Promise((resolve) => {
            const fundo = document.createElement("div"); fundo.className = "app-confirm";
            const painel = document.createElement("section"); painel.className = "app-confirm-panel"; painel.setAttribute("role", "dialog"); painel.setAttribute("aria-modal", "true");
            const h = document.createElement("h2"); h.textContent = titulo;
            const p = document.createElement("p"); p.textContent = mensagem;
            const acoes = document.createElement("div"); acoes.className = "app-confirm-actions";
            const cancelar = document.createElement("button"); cancelar.type = "button"; cancelar.textContent = "Voltar";
            const aceitar = document.createElement("button"); aceitar.type = "button"; aceitar.textContent = confirmar; aceitar.className = perigoso ? "danger" : "primary";
            function fechar(valor) { fundo.remove(); resolve(valor); }
            cancelar.addEventListener("click", () => fechar(false)); aceitar.addEventListener("click", () => fechar(true));
            fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(false); });
            fundo.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(false); });
            acoes.append(cancelar, aceitar); painel.append(h, p, acoes); fundo.append(painel); document.body.append(fundo); aceitar.focus();
        });
    }
    window.AppConfirm = confirmar;
})();
