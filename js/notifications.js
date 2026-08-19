"use strict";

(() => {
    let usuario = null;
    let canal = null;
    let notificacoes = [];

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
            ? `acompanhamento.html?id=${encodeURIComponent(item.pedido_id)}`
            : "#";
        const informado = String(item?.destino || "").trim();
        if (!informado) return fallback;
        try {
            const url = new URL(informado, location.href);
            if (url.origin !== location.origin) return fallback;
            return `${url.pathname}${url.search}${url.hash}`;
        } catch {
            return fallback;
        }
    }

    function montarInterface() {
        if (document.getElementById("notificationCenter")) return;
        const centro = criar("div", "notification-center"); centro.id = "notificationCenter";
        const botao = criar("button", "notification-trigger", "🔔"); botao.type = "button"; botao.id = "notificationTrigger"; botao.setAttribute("aria-label", "Abrir notificações");
        const contador = criar("span", "", "0"); contador.id = "notificationCount"; botao.append(contador);
        const painel = criar("section", "notification-panel"); painel.id = "notificationPanel"; painel.hidden = true; painel.setAttribute("aria-label", "Notificações");
        const header = criar("header"); header.append(criar("strong", "", "Notificações"));
        const marcar = criar("button", "", "Marcar como lidas"); marcar.type = "button"; marcar.id = "markNotificationsRead"; header.append(marcar);
        const lista = criar("div", "notification-list"); lista.id = "notificationList";
        const ativar = criar("button", "notification-permission", "Ativar alertas no dispositivo"); ativar.type = "button"; ativar.id = "enablePushNotifications";
        painel.append(header, lista, ativar); centro.append(botao, painel); document.body.append(centro);
        botao.addEventListener("click", () => { painel.hidden = !painel.hidden; if (!painel.hidden) botao.setAttribute("aria-expanded", "true"); else botao.removeAttribute("aria-expanded"); });
        document.addEventListener("click", (event) => { if (!centro.contains(event.target)) painel.hidden = true; });
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
        const { data, error } = await db.from("notificacoes").select("*").eq("usuario_id", usuario.id).order("created_at", { ascending: false }).limit(50);
        if (!error) { notificacoes = data || []; renderizar(); }
    }

    async function marcarLidas() {
        const ids = notificacoes.filter((item) => !item.lida).map((item) => item.id);
        if (!ids.length) {
            avisar("Tudo em dia", "Você não possui notificações novas.", "info", 3500);
            return;
        }
        const { error } = await db.from("notificacoes").update({ lida: true }).in("id", ids).eq("usuario_id", usuario.id);
        if (error) {
            avisar("Não foi possível atualizar", "Tente marcar as notificações como lidas novamente.", "error");
            return;
        }
        notificacoes.forEach((item) => { if (ids.includes(item.id)) item.lida = true; });
        renderizar();
        avisar("Notificações atualizadas", "Todas foram marcadas como lidas.", "success", 3500);
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
        return navigator.serviceWorker.register("./sw.js?v=4.4.5", { updateViaCache: "none" });
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
        if (!ativar || !("Notification" in window) || !("serviceWorker" in navigator)) return;
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
        if (Notification.permission !== "granted" || !document.hidden) return;
        const destino = destinoSeguro(item);
        const alerta = new Notification(item.titulo || "Multi Delivery", {
            body: item.mensagem || "Você tem uma nova atualização.",
            icon: "assets/favicon.svg",
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

        if (Notification.permission === "granted") {
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
    iniciar();
})();
