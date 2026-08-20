"use strict";

(() => {
    const siteKey = String(window.DELIVERY_CONFIG?.turnstileSiteKey || "").trim();
    const containers = [...document.querySelectorAll("[data-turnstile]")];
    const widgets = new Map();
    let token = "";
    let loadPromise = null;

    function carregarBiblioteca() {
        if (!siteKey) return Promise.resolve(false);
        if (window.turnstile?.render) return Promise.resolve(true);
        if (loadPromise) return loadPromise;
        loadPromise = new Promise((resolve, reject) => {
            const existente = document.querySelector('script[data-turnstile-loader]');
            if (existente) {
                existente.addEventListener("load", () => resolve(true), { once: true });
                existente.addEventListener("error", reject, { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            script.dataset.turnstileLoader = "true";
            script.addEventListener("load", () => resolve(true), { once: true });
            script.addEventListener("error", () => reject(new Error("Não foi possível carregar a verificação anti-robô.")), { once: true });
            document.head.append(script);
        });
        return loadPromise;
    }

    async function renderizar(container) {
        if (!siteKey || !container) return;
        container.hidden = false;
        const note = container.parentElement?.querySelector("[data-captcha-note]");
        if (note) note.hidden = false;
        try {
            await carregarBiblioteca();
            if (widgets.has(container) || !window.turnstile?.render) return;
            const widgetId = window.turnstile.render(container, {
                sitekey: siteKey,
                theme: "auto",
                size: "flexible",
                callback: (value) => { token = String(value || ""); },
                "expired-callback": () => { token = ""; },
                "error-callback": () => { token = ""; }
            });
            widgets.set(container, widgetId);
        } catch (error) {
            console.error(error);
            container.textContent = "A verificação anti-robô não carregou. Atualize a página.";
            container.setAttribute("role", "alert");
        }
    }

    window.DeliveryCaptcha = Object.freeze({
        enabled: Boolean(siteKey),
        getToken: () => token,
        validar() {
            if (!siteKey || token) return true;
            const container = containers[0];
            container?.focus?.();
            window.AppToast?.("Verificação necessária", "Conclua a verificação anti-robô para continuar.", "error");
            return false;
        },
        reset() {
            token = "";
            widgets.forEach((widgetId) => {
                try { window.turnstile?.reset(widgetId); } catch (error) { console.warn("Turnstile:", error); }
            });
        }
    });

    containers.forEach(renderizar);
})();
