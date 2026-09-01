function allowedOrigins() {
  return (Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("SITE_URL") || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function corsHeaders(request: Request, methods: readonly string[] = ["POST", "OPTIONS"]) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") || "";
  const configured = allowedOrigins();
  const allowedMethods = [...new Set([...methods, "OPTIONS"].map((method) => method.toUpperCase()))];
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Vary": "Origin",
  };

  if (configured.length === 0) headers["Access-Control-Allow-Origin"] = "*";
  else if (origin && configured.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;

  return headers;
}

export function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
