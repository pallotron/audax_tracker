# Local Dev OAuth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cloudflare Worker the single OAuth callback endpoint so any allowed origin (prod or localhost) can complete the full Strava login and token refresh flow without manual token copying.

**Architecture:** The worker gains a `GET /oauth/callback` route that receives the Strava code, validates the requesting origin (encoded in `state`) against an allowlist, exchanges the code, and redirects back to the origin with tokens in the URL fragment. CORS on existing routes is updated to check the same allowlist. The frontend stops calling the worker for code exchange — `OAuthCallbackPage` reads tokens from the URL fragment instead.

**Tech Stack:** Cloudflare Workers (TypeScript, Wrangler), React 18, TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-03-11-local-dev-oauth-design.md`

---

## Chunk 1: Worker — CORS update and new callback route

### Task 1: Update CORS handling to use `ALLOWED_ORIGINS` allowlist

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Update `Env` interface and `corsHeaders` function**

In `worker/src/index.ts`, replace the current `Env` interface and `corsHeaders` function:

```typescript
export interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string; // comma-separated, e.g. "https://audax-tracker.angelofailla.com,http://localhost:5173"
}

function corsHeaders(origin: string, allowedOrigins: string[]): HeadersInit {
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  // Origin not in allowlist — return no CORS headers; browser blocks the request
  return {};
}
```

- [ ] **Step 2: Update all call sites of `corsHeaders` to pass the parsed allowlist**

In the `fetch` handler, parse `ALLOWED_ORIGINS` once at the top and thread it through:

```typescript
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

    return new Response("Not Found", { status: 404, headers });
  },
};
```

Also update `handleTokenExchange` and `handleTokenRefresh` signatures — they already accept `headers: HeadersInit`, so no changes needed there.

- [ ] **Step 3: Type-check**

```bash
cd /Users/pallotron/code/audax_tracker/worker && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Update `wrangler.toml` comment**

In `worker/wrangler.toml`, replace:
```toml
# Secret: ALLOWED_ORIGIN (set via `wrangler secret put`)
```
With:
```toml
# Secret: ALLOWED_ORIGINS (set via `wrangler secret put`, comma-separated list of allowed origins)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/pallotron/code/audax_tracker && jj desc -m "feat: update worker CORS to use ALLOWED_ORIGINS allowlist"
jj new
```

---

### Task 2: Add `GET /oauth/callback` route to worker

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Add the callback route to the `fetch` handler**

Add before the `return new Response("Not Found", ...)` line:

```typescript
if (url.pathname === "/oauth/callback" && request.method === "GET") {
  return handleOAuthCallback(request, env, allowedOrigins);
}
```

- [ ] **Step 2: Implement `handleOAuthCallback`**

Add this function after `handleTokenRefresh`:

```typescript
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

  const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
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
  const encoded = btoa(tokens);
  return Response.redirect(`${callbackBase}#tokens=${encoded}`, 302);
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/pallotron/code/audax_tracker/worker && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/pallotron/code/audax_tracker && jj desc -m "feat: add GET /oauth/callback route to worker"
jj new
```

---

## Chunk 2: Frontend — config, auth, and callback page

### Task 3: Update `config.ts` and `auth.ts`

**Files:**
- Modify: `frontend/src/config.ts`
- Modify: `frontend/src/strava/auth.ts`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Update `config.ts`**

Replace `frontend/src/config.ts` entirely (note: the spec code snippet retains `redirectUri` but the spec prose says to remove it — the prose is correct, remove it):

```typescript
export const config = {
  stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL as string,
  oauthCallbackUrl: import.meta.env.VITE_OAUTH_CALLBACK_URL as string,
};
```

(`redirectUri` is removed — it is no longer used.)

- [ ] **Step 2: Update `.env.example`**

Replace `frontend/.env.example` entirely:

```
VITE_STRAVA_CLIENT_ID=your_strava_client_id
VITE_OAUTH_WORKER_URL=https://api.audax-tracker.angelofailla.com
VITE_OAUTH_CALLBACK_URL=https://api.audax-tracker.angelofailla.com/oauth/callback
```

- [ ] **Step 3: Update `getStravaAuthUrl` in `auth.ts`**

In `frontend/src/strava/auth.ts`, replace the `getStravaAuthUrl` function (rename the second parameter from `redirectUri` to `callbackUrl` and add `state` encoding):

```typescript
export function getStravaAuthUrl(
  clientId: string,
  callbackUrl: string
): string {
  const state = btoa(window.location.origin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "read,activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}
```

- [ ] **Step 4: Delete `exchangeCode` from `auth.ts`**

Remove the `exchangeCode` function entirely — it is dead code after this change. The function starts at `export async function exchangeCode(` and ends at its closing `}`. Note: `OAuthCallbackPage.tsx` still imports `exchangeCode` at this point — that import is removed when that file is replaced in Task 4. The intermediate build error is expected and handled there.

- [ ] **Step 5: Run frontend build to check for TypeScript errors**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: errors referencing `config.redirectUri` and `exchangeCode` — these are used in files not yet updated. That is expected at this stage.

- [ ] **Step 6: Commit**

```bash
cd /Users/pallotron/code/audax_tracker && jj desc -m "feat: add oauthCallbackUrl to config and update getStravaAuthUrl to encode origin in state"
jj new
```

---

### Task 4: Update `OAuthCallbackPage.tsx`

**Files:**
- Modify: `frontend/src/pages/OAuthCallbackPage.tsx`

Current file reads `?code` from search params and calls `exchangeCode`. Replace with reading `#tokens` from the hash fragment.

- [ ] **Step 1: Rewrite `OAuthCallbackPage.tsx`**

Replace the entire file:

```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { StravaTokens } from "../strava/auth";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1); // remove leading #
    const params = new URLSearchParams(hash);

    const errorParam = params.get("error");
    if (errorParam) {
      setError(`Strava authentication failed: ${errorParam}`);
      // Clear the fragment from the URL
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const tokensParam = params.get("tokens");
    if (!tokensParam) {
      setError("No tokens received from authentication.");
      return;
    }

    try {
      const tokens = JSON.parse(atob(tokensParam)) as StravaTokens;
      // Clear the fragment from the URL before navigating
      window.history.replaceState(null, "", window.location.pathname);
      login(tokens);
      navigate("/dashboard");
    } catch {
      setError("Failed to parse authentication tokens.");
    }
  }, [login, navigate]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <p className="text-lg text-gray-600">Connecting to Strava...</p>
    </div>
  );
}
```

- [ ] **Step 2: Run frontend build**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: error only about `config.redirectUri` in `LoginPage.tsx` — the `exchangeCode` error should now be gone.

- [ ] **Step 3: Commit**

```bash
cd /Users/pallotron/code/audax_tracker && jj desc -m "feat: update OAuthCallbackPage to read tokens from URL fragment"
jj new
```

---

### Task 5: Update `LoginPage.tsx` and verify full build

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Update `LoginPage.tsx`**

In `frontend/src/pages/LoginPage.tsx`, replace the `authUrl` line (this is the last reference to `config.redirectUri`, which was removed in Task 3):

```typescript
// BEFORE:
const authUrl = getStravaAuthUrl(config.stravaClientId, config.redirectUri);

// AFTER:
const authUrl = getStravaAuthUrl(config.stravaClientId, config.oauthCallbackUrl);
```

- [ ] **Step 2: Run full build and tests**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: clean build, no TypeScript errors. (This is only clean because `redirectUri` was removed from `config.ts` in Task 3 and `OAuthCallbackPage.tsx` was fully replaced in Task 4.)

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test 2>&1 | tail -10
```

Expected: all tests pass (no logic changes, count should be same as before).

- [ ] **Step 3: Commit**

```bash
cd /Users/pallotron/code/audax_tracker && jj desc -m "feat: update LoginPage to use oauthCallbackUrl"
jj new
```

---

## Post-implementation steps (manual)

These are one-time configuration changes required after the code is deployed.

### Deploy the worker

```bash
cd /Users/pallotron/code/audax_tracker/worker && npx wrangler deploy
```

### Set the new `ALLOWED_ORIGINS` secret

```bash
npx wrangler secret put ALLOWED_ORIGINS
# Enter: https://audax-tracker.angelofailla.com,http://localhost:5173
```

### Delete the old `ALLOWED_ORIGIN` secret

```bash
npx wrangler secret delete ALLOWED_ORIGIN
```

### Update Strava app callback domain

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and change **Authorization Callback Domain** from `audax-tracker.angelofailla.com` to `api.audax-tracker.angelofailla.com`.

### Local dev setup

Create `frontend/.env.local`:

```
VITE_STRAVA_CLIENT_ID=74768
VITE_OAUTH_WORKER_URL=https://api.audax-tracker.angelofailla.com
VITE_OAUTH_CALLBACK_URL=https://api.audax-tracker.angelofailla.com/oauth/callback
```

Then:

```bash
cd frontend && npm run dev
# → http://localhost:5173
# Login with Strava — full OAuth flow works, no local worker needed
```
