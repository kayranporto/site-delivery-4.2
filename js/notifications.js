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
            const link = criar("a", `notification-item ${item.lida ? "read" : ""}`); link.href = item.pedido_id ? `acompanhamento.html?id=${encodeURIComponent(item.pedido_id)}` : "#";
            link.append(criar("strong", "", item.titulo), criar("span", "", item.mensagem), criar("small", "", new Date(item.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })));
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

    async function ativarPush() {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
            avisar("Alertas indisponíveis", "Este navegador não oferece suporte às notificações do dispositivo.", "warning", 6500);
            return;
        }
        const permissao = await Notification.requestPermission();
        if (permissao !== "granted") {
            avisar("Permissão não concedida", "Você pode ativar as notificações depois nas configurações do navegador.", "warning", 6500);
            return;
        }
        try {
            const registro = await navigator.serviceWorker.ready;
            const chave = window.DELIVERY_CONFIG?.vapidPublicKey || "";
            if (chave && "PushManager" in window) {
                let subscription = await registro.pushManager.getSubscription();
                subscription ||= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Uint8(chave) });
                const payload = subscription.toJSON();
                const { error } = await db.from("push_subscriptions").upsert({ usuario_id: usuario.id, endpoint: payload.endpoint, subscription: payload }, { onConflict: "usuario_id,endpoint" });
                if (error) throw error;
            }
            avisar("Alertas ativados", "Você receberá atualizações importantes dos seus pedidos.", "success", 5500);
            new Notification("Alertas ativados", { body: "Você receberá atualizações importantes dos seus pedidos.", icon: "assets/favicon.svg" });
        } catch (erro) {
            console.error("Erro ao ativar notificações:", erro);
            avisar("Não foi possível ativar os alertas", "Revise as permissões do navegador e tente novamente.", "error", 6500);
        }
    }

    async function iniciar() {
        if (!window.db) return;
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        usuario = user; montarInterface(); await carregar();
        canal = db.channel(`notificacoes-${user.id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${user.id}` }, (payload) => {
                notificacoes.unshift(payload.new); renderizar();
                if (Notification.permission === "granted" && document.hidden) new Notification(payload.new.titulo, { body: payload.new.mensagem, icon: "assets/favicon.svg" });
            }).subscribe();
    }

    addEventListener("beforeunload", () => { if (canal) db.removeChannel(canal); });
    iniciar();
})();
