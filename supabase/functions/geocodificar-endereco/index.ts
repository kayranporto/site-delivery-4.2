import { corsHeaders, json } from "../_shared/cors.ts";

type EnderecoEntrada = {
  cep?: unknown;
  logradouro?: unknown;
  numero?: unknown;
  bairro?: unknown;
  cidade?: unknown;
  uf?: unknown;
};

type NominatimResultado = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

const NOMINATIM_PADRAO = "https://nominatim.openstreetmap.org/search";
const USER_AGENT_PADRAO = "MultiDelivery/4.4.5 (https://site-delivery-42.vercel.app)";
let proximaConsultaPermitidaEm = 0;

function texto(valor: unknown, limite: number) {
  return String(valor ?? "").trim().slice(0, limite);
}

function enderecoValido(endereco: EnderecoEntrada) {
  const cep = texto(endereco.cep, 9);
  const logradouro = texto(endereco.logradouro, 160);
  const numero = texto(endereco.numero, 20);
  const cidade = texto(endereco.cidade, 100);
  const uf = texto(endereco.uf, 2).toUpperCase();

  return /^\d{5}-?\d{3}$/.test(cep)
    && logradouro.length >= 2
    && numero.length >= 1
    && cidade.length >= 2
    && /^[A-Z]{2}$/.test(uf);
}

function consultaLivre(endereco: EnderecoEntrada) {
  const partes = [
    [texto(endereco.logradouro, 160), texto(endereco.numero, 20)].filter(Boolean).join(", "),
    texto(endereco.bairro, 100),
    texto(endereco.cidade, 100),
    texto(endereco.uf, 2).toUpperCase(),
    texto(endereco.cep, 9),
    "Brasil",
  ].filter(Boolean);

  return partes.join(", ");
}

async function respeitarLimitePublico() {
  const agora = Date.now();
  const inicio = Math.max(agora, proximaConsultaPermitidaEm);
  proximaConsultaPermitidaEm = inicio + 1100;
  const espera = inicio - agora;
  if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Método não permitido." }, 405);

  const body = await request.json().catch(() => ({}));
  const endereco = (body?.endereco || body) as EnderecoEntrada;
  if (!enderecoValido(endereco)) {
    return json(request, { error: "Endereço incompleto ou inválido." }, 400);
  }

  const endpoint = Deno.env.get("GEOCODING_BASE_URL") || NOMINATIM_PADRAO;
  const userAgent = Deno.env.get("GEOCODING_USER_AGENT") || USER_AGENT_PADRAO;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return json(request, { error: "Serviço de geocodificação não configurado." }, 503);
  }

  url.searchParams.set("q", consultaLivre(endereco));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    await respeitarLimitePublico();
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      console.error("geocodificar-endereco: provedor indisponível", { status: response.status });
      return json(request, { error: "Serviço de localização indisponível." }, 502);
    }

    const resultados = await response.json() as NominatimResultado[];
    const primeiro = resultados?.[0];
    if (!primeiro) return json(request, { error: "Endereço não localizado." }, 404);

    const latitude = Number(primeiro.lat);
    const longitude = Number(primeiro.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return json(request, { error: "O provedor retornou coordenadas inválidas." }, 502);
    }

    return json(request, {
      ok: true,
      latitude,
      longitude,
      exibicao: texto(primeiro.display_name, 300),
      provedor: "OpenStreetMap Nominatim",
      atribuicao: "© OpenStreetMap contributors",
    });
  } catch (error) {
    const mensagem = error instanceof DOMException && error.name === "AbortError"
      ? "Serviço de localização demorou demais para responder."
      : "Não foi possível consultar a localização agora.";
    console.error("geocodificar-endereco: falha de consulta", { tipo: error instanceof Error ? error.name : "unknown" });
    return json(request, { error: mensagem }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
