"use strict";

(() => {
    let usuario = null;
    let canal = null;
    let notificacoes = [];
    let origemPainel = null;
    const emPastaHtml = /\/html\/[^/]+\.html$/i.test(location.pathname);

    function paginaAplicacao(caminho) {
        return emPastaHtml ? caminho : `html/${caminho}`;
    }

    function recursoRaiz(caminho) {
        return emPastaHtml ? `../${caminho}` : caminho;
    }

    function criar(tag, classe, texto) {
        const item = document.createElement(tag);
        if (classe) item.className = classe;
        if (texto !== undefined) item.textContent = texto;
        return item;
    }

    function avisar(titulo, mensagem, tipo = "info", tempo = 5500) {
        if (window.AppToast) window.AppToast(titulo, mensagem, tipo, tempo);
    }

    function destinoSeguro(item) {
        const fallback = item?.pedido_id
            ? paginaAplicacao(`acompanhamento.html?id=${encodeURIComponent(item.pedido_id)}`)
            : "#";
        const informado = String(item?.destino || "").trim();
        if (!informado) return fallback;
        try {
            const destino = /^(?:\.\/)?[\w-]+\.html(?:[?#]|$)/i.test(informado)
                ? paginaAplicacao(informado.replace(/^\.\//, ""))
                : informado;
            const url = new URL(destino, location.href);
            if (url.origin !== location.origin) return fallback;
            return `${url.pathname}${url.search}${url.hash}`;
        } catch {
            return fallback;
        }
    }

    function montarInterface() {
        if (document.getElementById("notificationCenter")) return;
        const centro = criar("div", "notification-center"); centro.id = "notificationCenter";
        const botao = criar("button", "notification-trigger"); botao.type = "button"; botao.id = "notificationTrigger"; botao.setAttribute("aria-label", "Abrir notificações");
        const sino = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        sino.setAttribute("viewBox", "0 0 24 24"); sino.setAttribute("width", "24"); sino.setAttribute("height", "24"); sino.setAttribute("fill", "none"); sino.setAttribute("stroke", "currentColor"); sino.setAttribute("stroke-width", "1.8"); sino.setAttribute("aria-hidden", "true");
        sino.innerHTML = '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>';
        botao.append(sino);
        botao.setAttribute("aria-controls", "notificationPanel"); botao.setAttribute("aria-expanded", "false");
        const contador = criar("span", "", "0"); contador.id = "notificationCount"; botao.append(contador);
        const painel = criar("section", "notification-panel"); painel.id = "notificationPanel"; painel.hidden = true; painel.setAttribute("aria-label", "Notificações");
        const header = criar("header"); header.append(criar("strong", "", "Notificações"));
        const marcar = criar("button", "", "Marcar como lidas"); marcar.type = "button"; marcar.id = "markNotificationsRead"; header.append(marcar);
        const fechar = criar("button", "notification-close", "×"); fechar.type = "button"; fechar.id = "closeNotifications"; fechar.setAttribute("aria-label", "Fechar notificações"); header.append(fechar);
        const lista = criar("div", "notification-list"); lista.id = "notificationList"; lista.setAttribute("aria-live", "polite");
        const ativar = criar("button", "notification-permission", "Ativar alertas no dispositivo"); ativar.type = "button"; ativar.id = "enablePushNotifications";
        painel.append(header, lista, ativar); centro.append(botao, painel); document.body.append(centro);
        function fecharPainel(devolverFoco = false) {
            painel.hidden = true;
            botao.setAttribute("aria-expanded", "false");
            document.querySelector("[data-open-notifications]")?.setAttribute("aria-expanded", "false");
            if (devolverFoco) origemPainel?.focus();
        }
        window.AbrirNotificacoes = (origem = botao) => {
            origemPainel = origem;
            painel.hidden = false;
            botao.setAttribute("aria-expanded", "true");
            document.querySelector("[data-open-notifications]")?.setAttribute("aria-expanded", "true");
            fechar.focus({ preventScroll: true });
        };
        botao.addEventListener("click", () => painel.hidden ? window.AbrirNotificacoes(botao) : fecharPainel());
        fechar.addEventListener("click", () => fecharPainel(true));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !painel.hidden) { event.preventDefault(); fecharPainel(true); }
        });
        document.addEventListener("click", (event) => {
            // O alvo pode sair do DOM quando a lista é substituída durante o carregamento.
            if (!event.composedPath().includes(centro) && !event.target.closest?.("[data-open-notifications]")) fecharPainel();
        });
        marcar.addEventListener("click", marcarLidas);
        ativar.addEventListener("click", ativarPush);
    }

    function renderizar() {
        const lista = document.getElementById("notificationList");
        const contador = document.getElementById("notificationCount");
        if (!lista || !contador) return;
        lista.replaceChildren();
        const naoLidas = notificacoes.filter((item) => !item.lida).length;
        contador.textContent = naoLidas > 99 ? "99+" : String(naoLidas);
        contador.hidden = naoLidas === 0;
        document.getElementById("notificationTrigger")?.setAttribute("aria-label", naoLidas ? `Abrir notificações, ${naoLidas} não lidas` : "Abrir notificações");
        document.getElementById("markNotificationsRead").disabled = naoLidas === 0;
        if (!notificacoes.length) { lista.append(criar("p", "notification-empty", "Nenhuma notificação por enquanto.")); return; }
        notificacoes.slice(0, 20).forEach((item) => {
            const link = criar("a", `notification-item ${item.lida ? "read" : ""}`);
            link.href = destinoSeguro(item);
            link.append(
                criar("strong", "", item.titulo),
                criar("span", "", item.mensagem),
                criar("small", "", new Date(item.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))
            );
            lista.append(link);
        });
    }

    async function carregar() {
        const lista = document.getElementById("notificationList");
        lista.setAttribute("aria-busy", "true");
        lista.replaceChildren(criar("p", "notification-empty", "Carregando notificações..."));
        document.getElementById("markNotificationsRead").disabled = true;
        try {
            const { data, error } = await db.from("notificacoes").select("*").eq("usuario_id", usuario.id).order("created_at", { ascending: false }).limit(50);
            if (error) throw error;
            notificacoes = data || [];
            renderizar();
        } catch (erro) {
            console.warn("Notificações indisponíveis:", erro?.message || erro);
            const estado = criar("div", "notification-empty");
            const texto = criar("p", "", "Não foi possível carregar seus avisos.");
            const tentar = criar("button", "notification-retry", "Tentar novamente"); tentar.type = "button";
            tentar.addEventListener("click", async () => { await carregar(); document.getElementById("closeNotifications")?.focus(); });
            estado.append(texto, tentar);
            lista.replaceChildren(estado);
        } finally {
            lista.setAttribute("aria-busy", "false");
        }
    }

    async function marcarLidas() {
        const botao = document.getElementById("markNotificationsRead");
        if (botao.disabled) return;
        const ids = notificacoes.filter((item) => !item.lida).map((item) => item.id);
        if (!ids.length) {
            avisar("Tudo em dia", "Você não possui notificações novas.", "info", 3500);
            return;
        }
        botao.disabled = true;
        botao.setAttribute("aria-busy", "true");
        try {
            const { error } = await db.from("notificacoes").update({ lida: true }).in("id", ids).eq("usuario_id", usuario.id);
            if (error) throw error;
            notificacoes.forEach((item) => { if (ids.includes(item.id)) item.lida = true; });
            renderizar();
            avisar("Notificações atualizadas", "Todas foram marcadas como lidas.", "success", 3500);
        } catch {
            botao.disabled = false;
            avisar("Não foi possível atualizar", "Tente marcar as notificações como lidas novamente.", "error");
        } finally {
            botao.removeAttribute("aria-busy");
        }
    }

    function base64Uint8(base64) {
        const pad = "=".repeat((4 - base64.length % 4) % 4);
        const binario = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
        return Uint8Array.from([...binario].map((char) => char.charCodeAt(0)));
    }

    async function garantirServiceWorker() {
        if (!("serviceWorker" in navigator)) throw new Error("Service Worker indisponível.");
        const existente = await navigator.serviceWorker.getRegistration();
        if (existente) {
            existente.update().catch(() => {});
            return existente;
        }
        return navigator.serviceWorker.register(recursoRaiz("sw.js?v=4.4.6"), { updateViaCache: "none" });
    }

    async function registrarSubscription() {
        const chave = String(window.DELIVERY_CONFIG?.vapidPublicKey || "").trim();
        if (!chave) throw new Error("Chave pública Web Push não configurada.");
        if (!("PushManager" in window)) throw new Error("Web Push não é suportado neste navegador.");
        const registro = await garantirServiceWorker();
        await navigator.serviceWorker.ready;
        let subscription = await registro.pushManager.getSubscription();
        subscription ||= await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64Uint8(chave)
        });
        const payload = subscription.toJSON();
        const { error } = await db.from("push_subscriptions").upsert({
            usuario_id: usuario.id,
            endpoint: payload.endpoint,
            subscription: payload
        }, { onConflict: "usuario_id,endpoint" });
        if (error) throw error;
        return subscription;
    }

    async function atualizarBotaoPush() {
        const ativar = document.getElementById("enablePushNotifications");
        if (!ativar) return;
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
            ativar.textContent = "Seus avisos continuam disponíveis aqui";
            ativar.disabled = true;
            return;
        }
        if (Notification.permission === "denied") {
            ativar.textContent = "Alertas bloqueados no navegador";
            ativar.disabled = true;
            return;
        }
        if (Notification.permission !== "granted") {
            ativar.textContent = "Ativar alertas no dispositivo";
            ativar.disabled = false;
            return;
        }
        try {
            const registro = await navigator.serviceWorker.getRegistration();
            const subscription = await registro?.pushManager?.getSubscription?.();
            ativar.textContent = subscription ? "Alertas ativos neste dispositivo" : "Concluir ativação dos alertas";
            ativar.disabled = Boolean(subscription);
        } catch {
            ativar.textContent = "Ativar alertas no dispositivo";
            ativar.disabled = false;
        }
    }

    async function ativarPush() {
        if (!usuario) return false;
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
            avisar("Alertas indisponíveis", "Este navegador não oferece suporte às notificações Web Push.", "warning", 6500);
            return false;
        }
        const chave = String(window.DELIVERY_CONFIG?.vapidPublicKey || "").trim();
        if (!chave) {
            avisar("Alertas ainda não configurados", "A chave pública Web Push não está disponível neste ambiente.", "warning", 6500);
            return false;
        }

        const permissao = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
        if (permissao !== "granted") {
            avisar("Permissão não concedida", "Ative as notificações deste site nas configurações do navegador para receber novas entregas.", "warning", 6500);
            await atualizarBotaoPush();
            window.dispatchEvent(new CustomEvent("multi-delivery:push-state"));
            return false;
        }

        try {
            await registrarSubscription();
            avisar("Alertas ativados", "Este dispositivo poderá receber novas entregas mesmo com o painel em segundo plano.", "success", 5500);
            await atualizarBotaoPush();
            window.dispatchEvent(new CustomEvent("multi-delivery:push-state"));
            return true;
        } catch (erro) {
            console.error("Erro ao ativar notificações:", erro);
            avisar("Não foi possível ativar os alertas", erro?.message || "Revise as permissões do navegador e tente novamente.", "error", 6500);
            await atualizarBotaoPush();
            window.dispatchEvent(new CustomEvent("multi-delivery:push-state"));
            return false;
        }
    }

    function mostrarNotificacaoLocal(item) {
        if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
        const destino = destinoSeguro(item);
        const alerta = new Notification(item.titulo || "Multi Delivery", {
            body: item.mensagem || "Você tem uma nova atualização.",
            icon: recursoRaiz("assets/favicon.svg"),
            tag: item.pedido_id ? `pedido-${item.pedido_id}` : undefined
        });
        alerta.onclick = () => {
            window.focus();
            if (destino && destino !== "#") location.href = destino;
            alerta.close();
        };
    }

    async function iniciar() {
        if (!window.db) return;
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        usuario = user;
        montarInterface();
        await carregar();
        await atualizarBotaoPush();

        if ("Notification" in window && Notification.permission === "granted") {
            registrarSubscription()
                .then(() => atualizarBotaoPush())
                .then(() => window.dispatchEvent(new CustomEvent("multi-delivery:push-state")))
                .catch((erro) => console.warn("Web Push:", erro?.message || erro));
        }

        canal = db.channel(`notificacoes-${user.id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${user.id}` }, (payload) => {
                notificacoes.unshift(payload.new);
                renderizar();
                mostrarNotificacaoLocal(payload.new);
            }).subscribe();
    }

    window.AtivarPushNotificacoes = ativarPush;
    window.AtualizarEstadoPush = atualizarBotaoPush;

    addEventListener("beforeunload", () => { if (canal) db.removeChannel(canal); });
    iniciar().catch((erro) => console.warn("Não foi possível iniciar notificações:", erro?.message || erro));
})();
