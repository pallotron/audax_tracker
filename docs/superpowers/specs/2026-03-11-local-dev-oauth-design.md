# Local Dev OAuth Design

**Date:** 2026-03-11
**Goal:** Enable full local development (UI + Strava sync) without manual token copying and without breaking production.

---

## Problem

Strava allows one callback domain per API application. The current `redirect_uri` is `window.location.origin/callback`, so OAuth login only works from the production domain. Localhost cannot complete the login flow.

---

## Solution: Worker-mediated OAuth callback

The Cloudflare worker becomes the single OAuth callback endpoint for all origins. The frontend encodes its own origin in the `state` parameter. Strava sends the code to the worker; the worker validates the origin against an allowlist, exchanges the code, and redirects back to the requesting origin with tokens in the URL fragment.

### Flow

```
1. Frontend (any origin) builds Strava auth URL:
   - redirect_uri = https://api.audax-tracker.angelofailla.com/oauth/callback
   - state = base64(window.location.origin)

2. User authenticates on Strava

3. Strava redirects to:
   https://api.audax-tracker.angelofailla.com/oauth/callback?code=...&state=<base64origin>

4. Worker:
   - Decodes origin from state
   - Validates origin against ALLOWED_ORIGINS — rejects if not listed
   - Exchanges code with Strava for tokens
   - Redirects to <origin>/callback#tokens=<base64json>
   - On error: redirects to <origin>/callback#error=<message>

5. Frontend OAuthCallbackPage reads #tokens from fragment, calls login(), clears fragment from URL
```

### Strava app config change
- **Authorization Callback Domain**: change from `audax-tracker.angelofailla.com` → `api.audax-tracker.angelofailla.com`

---

## Worker changes

### New route: `GET /oauth/callback`

Parameters: `code` (query), `state` (query, base64-encoded origin)

Logic:
1. Decode `state` → origin
2. Check origin against `ALLOWED_ORIGINS` list — return 403 if not found
3. Exchange `code` with Strava (`/oauth/token`)
4. On success: redirect to `<origin>/callback#tokens=<base64(JSON)>`
5. On failure: redirect to `<origin>/callback#error=<message>`

### Updated `Env` interface

```typescript
export interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string; // comma-separated, e.g. "https://audax-tracker.angelofailla.com,http://localhost:5173"
}
```

### Updated CORS handling

`corsHeaders()` accepts the request `Origin` and checks it against the `ALLOWED_ORIGINS` list. If the origin is in the list, it is echoed back in `Access-Control-Allow-Origin`. If the origin is **not** in the list, the header is omitted entirely — the browser will block the request. Do **not** fall back to `"*"`.

```typescript
function corsHeaders(origin: string, allowedOrigins: string[]): HeadersInit {
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  // Origin not allowed — return no CORS headers; browser will block
  return {};
}
```

This fixes token refresh calls from localhost on existing `/oauth/token` and `/oauth/refresh` routes.

### New secret

```bash
wrangler secret put ALLOWED_ORIGINS
# value: https://audax-tracker.angelofailla.com,http://localhost:5173
```

Remove the old `ALLOWED_ORIGIN` secret after migration. Also update the comment in `worker/wrangler.toml` from `# Secret: ALLOWED_ORIGIN` to `# Secret: ALLOWED_ORIGINS`.

---

## Frontend changes

### `frontend/src/config.ts`

Add `oauthCallbackUrl`:

```typescript
export const config = {
  stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL as string,
  oauthCallbackUrl: import.meta.env.VITE_OAUTH_CALLBACK_URL as string,
};
```

(`redirectUri` is removed — it is no longer used anywhere.)

### `.env.example`

Replace the entire current `.env.example` (which defaults `VITE_OAUTH_WORKER_URL` to `http://localhost:8787` — no longer correct) with:

```
VITE_STRAVA_CLIENT_ID=your_strava_client_id
VITE_OAUTH_WORKER_URL=https://api.audax-tracker.angelofailla.com
VITE_OAUTH_CALLBACK_URL=https://api.audax-tracker.angelofailla.com/oauth/callback
```

Both local and prod point `VITE_OAUTH_WORKER_URL` and `VITE_OAUTH_CALLBACK_URL` at the production worker. No local worker is needed.

### `frontend/src/strava/auth.ts`

`exchangeCode()` becomes dead code after this change (the worker now exchanges the code itself). Delete it. The worker's `POST /oauth/token` route also becomes unused — it can be retained for now or deleted; the spec does not require removing it.

Update `getStravaAuthUrl()` to accept `callbackUrl` and encode origin in `state`:

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

Remove the `redirectUri` parameter (no longer needed for auth URL construction — `redirectUri` on `config` can be removed).

### `frontend/src/pages/OAuthCallbackPage.tsx`

Replace code-exchange logic with fragment-reading logic:

- Read `#tokens=<base64>` from `window.location.hash`
- Parse and call `login(tokens)`
- Clear the fragment from the URL (`history.replaceState`)
- Handle `#error=<message>` — display error to user

### `frontend/src/pages/LoginPage.tsx`

Update the call to `getStravaAuthUrl()` to pass `config.oauthCallbackUrl` instead of `config.redirectUri`.

---

## Local dev setup

```bash
# frontend/.env.local
VITE_STRAVA_CLIENT_ID=74768
VITE_OAUTH_WORKER_URL=https://api.audax-tracker.angelofailla.com
VITE_OAUTH_CALLBACK_URL=https://api.audax-tracker.angelofailla.com/oauth/callback
```

No local worker needed. Login and token refresh go through the production worker. `localhost:5173` must be in `ALLOWED_ORIGINS`.

---

## Security notes

- Origins in URL fragment are not sent to servers but are visible in browser history. Acceptable for a personal single-user app.
- The allowlist prevents the worker from redirecting tokens to arbitrary origins.
- No CSRF nonce in `state` — acceptable for a personal app; could be added later.
- The old `ALLOWED_ORIGIN` secret (single value) is replaced by `ALLOWED_ORIGINS` (comma-separated list).
