export interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

function corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(
      request.headers.get("Origin") || "",
      env.ALLOWED_ORIGIN
    );

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
