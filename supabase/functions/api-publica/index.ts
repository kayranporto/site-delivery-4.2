import { createClient } from "supabase";
import { corsHeaders } from "../_shared/cors.ts";
import openApiDocument from "./openapi.json" with { type: "json" };

const API_VERSION = "1.0.0";
const API_METHODS = ["GET", "HEAD", "OPTIONS"] as const;
const RESTAURANT_FIELDS = [
  "id",
  "nome",
  "descricao",
  "categoria",
  "tipo",
  "logo",
  "banner",
  "taxa_entrega",
  "pedido_minimo",
  "status",
  "cidade_atendimento",
  "uf_atendimento",
  "bairros_atendidos",
  "tempo_estimado_min",
  "tempo_estimado_max",
].join(",");

type JsonBody = Record<string, unknown>;
type CatalogProduct = {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  imagem: string | null;
  preco: number | string;
  promocao: number | string | null;
};
type AdditionGroup = {
  id: string;
  nome: string;
  minimo: number;
  maximo: number;
};

function requestId(request: Request) {
  return request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
}

function responseJson(
  request: Request,
  body: JsonBody,
  status = 200,
  cacheControl = "no-store",
) {
  const id = requestId(request);
  const payload = request.method === "HEAD" ? null : JSON.stringify({ ...body, request_id: id });

  return new Response(payload, {
    status,
    headers: {
      ...corsHeaders(request, API_METHODS),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-API-Version": API_VERSION,
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": id,
    },
  });
}

function apiPath(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const marker = "/api-publica";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return pathname;
  return pathname.slice(markerIndex + marker.length) || "/";
}

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function shortText(value: string | null, maxLength: number) {
  if (value === null || value === "") return "";
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function anonymousClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? Deno.env.get("SUPABASE_ANON_KEY")
    ?? "";

  if (!supabaseUrl || !publishableKey) return null;
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function documentationUrl(request: Request) {
  const publicProjectUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  if (publicProjectUrl) return `${publicProjectUrl}/functions/v1/api-publica/openapi.json`;

  const url = new URL(request.url);
  const marker = "/api-publica";
  const markerIndex = url.pathname.indexOf(marker);
  const basePath = markerIndex >= 0
    ? url.pathname.slice(0, markerIndex + marker.length)
    : "/functions/v1/api-publica";
  return `${url.origin}${basePath}/openapi.json`;
}

function openApiResponse(request: Request) {
  const id = requestId(request);
  return new Response(request.method === "HEAD" ? null : JSON.stringify(openApiDocument), {
    status: 200,
    headers: {
      ...corsHeaders(request, API_METHODS),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-API-Version": API_VERSION,
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": id,
    },
  });
}

async function listRestaurants(request: Request, url: URL) {
  const limit = integerParam(url.searchParams.get("limite"), 20, 1, 50);
  const offset = integerParam(url.searchParams.get("offset"), 0, 0, 10_000);
  const category = shortText(url.searchParams.get("categoria"), 80);
  const city = shortText(url.searchParams.get("cidade"), 120);

  if (limit === null || offset === null || category === null || city === null) {
    return responseJson(request, {
      error: { code: "parametro_invalido", message: "Os filtros ou a paginação são inválidos." },
    }, 400);
  }

  const db = anonymousClient();
  if (!db) {
    return responseJson(request, {
      error: { code: "servico_indisponivel", message: "A API de catálogo não está configurada." },
    }, 503);
  }

  let query = db
    .from("empresas_catalogo")
    .select(RESTAURANT_FIELDS, { count: "exact" })
    .eq("status", true)
    .order("nome")
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("categoria", category);
  if (city) query = query.eq("cidade_atendimento", city);

  const { data, error, count } = await query;
  if (error) {
    console.error("Falha ao listar catálogo público", { code: error.code });
    return responseJson(request, {
      error: { code: "falha_catalogo", message: "Não foi possível consultar os restaurantes." },
    }, 502);
  }

  return responseJson(request, {
    data: data ?? [],
    meta: { limite: limit, offset, total: count ?? 0 },
  }, 200, "public, max-age=30, stale-while-revalidate=60");
}

async function restaurantMenu(request: Request, restaurantId: string) {
  if (!isUuid(restaurantId)) {
    return responseJson(request, {
      error: { code: "id_invalido", message: "O identificador do restaurante é inválido." },
    }, 400);
  }

  const db = anonymousClient();
  if (!db) {
    return responseJson(request, {
      error: { code: "servico_indisponivel", message: "A API de catálogo não está configurada." },
    }, 503);
  }

  const { data: restaurant, error: restaurantError } = await db
    .from("empresas_catalogo")
    .select(RESTAURANT_FIELDS)
    .eq("id", restaurantId)
    .eq("status", true)
    .maybeSingle();

  if (restaurantError) {
    console.error("Falha ao consultar restaurante público", { code: restaurantError.code });
    return responseJson(request, {
      error: { code: "falha_catalogo", message: "Não foi possível consultar o restaurante." },
    }, 502);
  }
  if (!restaurant) {
    return responseJson(request, {
      error: { code: "nao_encontrado", message: "Restaurante não encontrado." },
    }, 404);
  }

  const [categoriesResult, productsResult, groupsResult] = await Promise.all([
    db.from("categorias")
      .select("id,nome,ordem")
      .eq("empresa_id", restaurantId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    db.from("produtos")
      .select("id,categoria_id,nome,descricao,imagem,preco,promocao")
      .eq("empresa_id", restaurantId)
      .eq("disponivel", true)
      .order("nome"),
    db.from("grupos_adicionais")
      .select("id,nome,minimo,maximo")
      .eq("empresa_id", restaurantId)
      .eq("ativo", true)
      .order("nome"),
  ]);

  const firstError = categoriesResult.error || productsResult.error || groupsResult.error;
  if (firstError) {
    console.error("Falha ao carregar cardápio público", { code: firstError.code });
    return responseJson(request, {
      error: { code: "falha_cardapio", message: "Não foi possível consultar o cardápio." },
    }, 502);
  }

  const products = (productsResult.data ?? []) as CatalogProduct[];
  const groups = (groupsResult.data ?? []) as AdditionGroup[];
  const productIds = products.map((product) => String(product.id));
  const groupIds = groups.map((group) => String(group.id));

  const [variantsResult, linksResult, additionsResult] = await Promise.all([
    productIds.length
      ? db.from("produto_variantes")
        .select("id,produto_id,nome,preco,promocao,ordem")
        .in("produto_id", productIds)
        .eq("ativo", true)
        .order("ordem")
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? db.from("produto_grupos").select("produto_id,grupo_id").in("produto_id", productIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? db.from("adicionais")
        .select("id,grupo_id,nome,preco")
        .in("grupo_id", groupIds)
        .eq("ativo", true)
        .order("nome")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = variantsResult.error || linksResult.error || additionsResult.error;
  if (relatedError) {
    console.error("Falha ao carregar complementos públicos", { code: relatedError.code });
    return responseJson(request, {
      error: { code: "falha_cardapio", message: "Não foi possível consultar o cardápio completo." },
    }, 502);
  }

  const variantsByProduct = new Map<string, unknown[]>();
  for (const variant of variantsResult.data ?? []) {
    const key = String(variant.produto_id);
    variantsByProduct.set(key, [...(variantsByProduct.get(key) ?? []), variant]);
  }

  const groupsByProduct = new Map<string, string[]>();
  for (const link of linksResult.data ?? []) {
    const key = String(link.produto_id);
    groupsByProduct.set(key, [...(groupsByProduct.get(key) ?? []), String(link.grupo_id)]);
  }

  const additionsByGroup = new Map<string, unknown[]>();
  for (const addition of additionsResult.data ?? []) {
    const key = String(addition.grupo_id);
    additionsByGroup.set(key, [...(additionsByGroup.get(key) ?? []), addition]);
  }

  return responseJson(request, {
    data: {
      restaurante: restaurant,
      categorias: categoriesResult.data ?? [],
      produtos: products.map((product) => ({
        ...product,
        variantes: variantsByProduct.get(String(product.id)) ?? [],
        grupos_adicionais: groupsByProduct.get(String(product.id)) ?? [],
      })),
      grupos_adicionais: groups.map((group) => ({
        ...group,
        adicionais: additionsByGroup.get(String(group.id)) ?? [],
      })),
    },
  }, 200, "public, max-age=30, stale-while-revalidate=60");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, API_METHODS) });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const response = responseJson(request, {
      error: { code: "metodo_nao_permitido", message: "Use GET ou HEAD neste endpoint." },
    }, 405);
    response.headers.set("Allow", API_METHODS.join(", "));
    return response;
  }

  const url = new URL(request.url);
  const path = apiPath(request);

  if (path === "/openapi.json") return openApiResponse(request);

  if (path === "/" || path === "/v1" || path === "/v1/status") {
    return responseJson(request, {
      data: {
        status: "ok",
        servico: "multi-delivery-api",
        versao: API_VERSION,
        documentacao: documentationUrl(request),
      },
    }, 200, "public, max-age=30");
  }

  if (path === "/v1/restaurantes") return listRestaurants(request, url);

  const menuMatch = path.match(/^\/v1\/restaurantes\/([^/]+)\/cardapio$/);
  if (menuMatch) return restaurantMenu(request, menuMatch[1]);

  return responseJson(request, {
    error: { code: "rota_nao_encontrada", message: "Rota da API não encontrada." },
  }, 404);
});
