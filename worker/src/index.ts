export interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string;
  OVERRIDES_KV: KVNamespace;
}

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

function corsHeaders(origin: string, allowedOrigins: string[]): HeadersInit {
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }
  // Origin not in allowlist — return no CORS headers; browser blocks the request
  return {};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
      : [];
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);

    if (url.pathname === "/oauth/token" && request.method === "POST") {
      return handleTokenExchange(request, env, headers);
    }

    if (url.pathname === "/oauth/refresh" && request.method === "POST") {
      return handleTokenRefresh(request, env, headers);
    }

    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      return handleOAuthCallback(request, env, allowedOrigins);
    }

    if (url.pathname === "/overrides") {
      if (request.method === "GET") return handleGetOverrides(request, env, headers);
      if (request.method === "PUT") return handlePutOverrides(request, env, headers);
      if (request.method === "DELETE") return handleDeleteOverrides(request, env, headers);
    }

    return new Response("Not Found", { status: 404, headers });
  },
};

async function handleTokenExchange(
  request: Request,
  env: Env,
  headers: HeadersInit
): Promise<Response> {
  const body = (await request.json()) as { code?: string };

  if (!body.code) {
    return new Response(JSON.stringify({ error: "Missing code" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code: body.code,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleTokenRefresh(
  request: Request,
  env: Env,
  headers: HeadersInit
): Promise<Response> {
  const body = (await request.json()) as { refresh_token?: string };

  if (!body.refresh_token) {
    return new Response(JSON.stringify({ error: "Missing refresh_token" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token: body.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleOAuthCallback(
  request: Request,
  env: Env,
  allowedOrigins: string[]
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!state) {
    return new Response("Missing state parameter", { status: 400 });
  }

  let origin: string;
  try {
    origin = atob(state);
  } catch {
    return new Response("Invalid state parameter", { status: 400 });
  }

  if (!allowedOrigins.includes(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  const callbackBase = `${origin}/callback`;

  if (!code) {
    const error = url.searchParams.get("error") || "no_code";
    return Response.redirect(`${callbackBase}#error=${encodeURIComponent(error)}`, 302);
  }

  const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const error = encodeURIComponent(`Token exchange failed: ${tokenResponse.status}`);
    return Response.redirect(`${callbackBase}#error=${error}`, 302);
  }

  const tokens = await tokenResponse.text();
  const bytes = new TextEncoder().encode(tokens);
  const binString = Array.from(bytes).map((b) => String.fromCodePoint(b)).join("");
  const encoded = btoa(binString);
  return Response.redirect(`${callbackBase}#tokens=${encodeURIComponent(encoded)}`, 302);
}

// Rate limit state (resets on Worker restart)
const writeCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(athleteId: string): boolean {
  const now = Date.now();
  const entry = writeCounts.get(athleteId);
  if (!entry || now > entry.resetAt) {
    writeCounts.set(athleteId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

async function resolveAthleteId(
  request: Request,
  headers: HeadersInit
): Promise<{ id: string } | Response> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const token = auth.slice(7);
  const res = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const athlete = (await res.json()) as { id: number };
  return { id: String(athlete.id) };
}

async function handleGetOverrides(
  request: Request,
  env: Env,
  headers: HeadersInit
): Promise<Response> {
  const result = await resolveAthleteId(request, headers);
  if (result instanceof Response) return result;
  const value = await env.OVERRIDES_KV.get(`overrides:${result.id}`);
  if (!value) return new Response(null, { status: 204, headers });
  return new Response(value, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handlePutOverrides(
  request: Request,
  env: Env,
  headers: HeadersInit
): Promise<Response> {
  const result = await resolveAthleteId(request, headers);
  if (result instanceof Response) return result;
  if (!checkRateLimit(result.id)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const body = await request.text();
  await env.OVERRIDES_KV.put(`overrides:${result.id}`, body);
  return new Response(null, { status: 200, headers });
}

async function handleDeleteOverrides(
  request: Request,
  env: Env,
  headers: HeadersInit
): Promise<Response> {
  const result = await resolveAthleteId(request, headers);
  if (result instanceof Response) return result;
  if (!checkRateLimit(result.id)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  await env.OVERRIDES_KV.delete(`overrides:${result.id}`);
  return new Response(null, { status: 200, headers });
}
