"use strict";

(() => {
    let enviados = 0;
    const limitePorPagina = 10;
    const appVersion = window.DELIVERY_CONFIG?.appVersion || "desconhecida";
    const correlationId = (() => {
        const chave = "delivery_correlation_id";
        const atual = sessionStorage.getItem(chave);
        if (atual) return atual;
        const novo = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(chave, novo);
        return novo;
    })();

    function limpar(texto, maximo = 500) {
        return String(texto || "")
            .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
            .replace(/\b\d{10,14}\b/g, "[numero]")
            .slice(0, maximo);
    }

    async function registrar(nivel, contexto, mensagem, detalhes = {}) {
        if (!window.db || enviados >= limitePorPagina) return false;
        enviados += 1;
        try {
            const { data: { user } } = await window.db.auth.getUser();
            if (!user) return false;
            const seguros = {
                app_version: appVersion,
                correlation_id: correlationId
            };
            Object.entries(detalhes || {}).slice(0, 8).forEach(([chave, valor]) => {
                seguros[limpar(chave, 60)] = limpar(typeof valor === "object" ? JSON.stringify(valor) : valor, 300);
            });
            const { error } = await window.db.from("app_logs").insert({
                usuario_id: user.id,
                nivel: ["info", "warning", "error"].includes(nivel) ? nivel : "error",
                contexto: limpar(contexto, 120) || "frontend",
                mensagem: limpar(mensagem),
                pagina: location.pathname.split("/").pop() || "index.html",
                detalhes: seguros
            });
            return !error;
        } catch {
            return false;
        }
    }

    addEventListener("error", (event) => {
        registrar("error", "javascript", event.message, { arquivo: event.filename, linha: event.lineno });
    });
    addEventListener("unhandledrejection", (event) => {
        registrar("error", "promise", event.reason?.message || event.reason || "Falha assíncrona");
    });

    window.Monitoramento = Object.freeze({ registrar, correlationId, appVersion });
})();
