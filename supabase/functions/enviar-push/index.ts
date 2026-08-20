import { createClient } from "supabase";
import webpush from "web-push";

type RuntimeConfig = {
  webhook_secret?: string;
  vapid_public?: string;
  vapid_private?: string;
  vapid_subject?: string;
};

type PushNotification = {
  usuario_id?: string;
  pedido_id?: string | null;
  titulo?: string | null;
  mensagem?: string | null;
  destino?: string | null;
  tipo?: string | null;
};

function adminKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return String(parsed.default);
    } catch {
      // Compatibilidade com projetos que ainda usam a chave service_role legada.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = adminKey();
  if (!supabaseUrl || !secretKey) return new Response("backend not configured", { status: 503 });

  const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

  try {
    const { data: runtime, error: runtimeError } = await supabase.rpc("push_runtime_config");
    if (runtimeError) throw runtimeError;
    const config = (runtime || {}) as RuntimeConfig;

    const recebido = request.headers.get("x-delivery-webhook-secret") ?? "";
    if (!config.webhook_secret || recebido !== config.webhook_secret) {
      return new Response("unauthorized", { status: 401 });
    }

    const body = await request.json();
    const notification = (body.record || body) as PushNotification;
    if (!notification?.usuario_id) return Response.json({ ok: true, enviados: 0 });

    if (!config.vapid_public || !config.vapid_private) {
      return new Response("push not configured", { status: 503 });
    }

    webpush.setVapidDetails(
      config.vapid_subject || "https://kayranporto.github.io/site-delivery-4.2/",
      config.vapid_public,
      config.vapid_private,
    );

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id,subscription")
      .eq("usuario_id", notification.usuario_id);
    if (error) throw error;

    const destino = notification.destino
      || (notification.pedido_id ? `./html/acompanhamento.html?id=${notification.pedido_id}` : "./html/perfil.html");
    const payload = JSON.stringify({
      title: notification.titulo || "Multi Delivery",
      body: notification.mensagem || "Você tem uma nova atualização.",
      url: destino,
      tag: notification.pedido_id ? `pedido-${notification.pedido_id}` : undefined,
      tipo: notification.tipo || "atualizacao",
    });

    let enviados = 0;
    let removidos = 0;
    for (const item of subscriptions || []) {
      try {
        await webpush.sendNotification(item.subscription, payload, {
          TTL: 180,
          urgency: "high",
        });
        enviados += 1;
      } catch (pushError: unknown) {
        const status = Number((pushError as { statusCode?: number })?.statusCode || 0);
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", item.id);
          removidos += 1;
        } else {
          console.error("Falha Web Push:", pushError);
        }
      }
    }

    return Response.json({ ok: true, enviados, removidos });
  } catch (error) {
    console.error("enviar-push:", error);
    return new Response("error", { status: 500 });
  }
});
