# Audax Tracker

A web app that pulls cycling activities from Strava, classifies qualifying audax/randonneuring events, and tracks progress toward ACP awards. Also provides a yearly summary of all audax rides.

## Features

- **Strava sync** — OAuth login, bulk sync of ride history, incremental sync on return visits
- **Auto-classification** — detects BRM brevets, PBP, Flèche, and other events by name/description regex or distance heuristic
- **Manual override** — reclassify any ride and add a homologation number
- **DNF detection** — auto-detects Did Not Finish from activity names, with manual override
- **ACP Randonneur 5000 & 10,000 tracking** — checklist of requirements, km progress bar, best qualifying window, expiry warnings
- **Annual awards** — RRTY (Randonneur Round The Year), Brevet 2000/5000, 4 Provinces of Ireland, Easter Flèche
- **Lifetime awards** — 4 Nations Super Randonneur, International Super Randonneur (ISR), international rides log
- **Yearly summary** — per-year totals and qualifying event tables
- **Offline-first** — all data cached locally in IndexedDB (Dexie.js); no server-side database

## Architecture

```
Browser (React SPA)
  ├── Strava OAuth flow
  ├── Activity sync & classification
  ├── ACP 5000 / 10,000 tracker
  └── IndexedDB (Dexie.js) — persistent local cache

Cloudflare Worker  ←  OAuth callback handler + token refresh (keeps client_secret server-side)
Cloudflare Pages   ←  hosts the static SPA
Strava API         ←  activity data fetched directly from the browser
```

### OAuth flow

The worker is the single Strava OAuth callback endpoint for all origins (production and localhost):

1. Frontend builds Strava auth URL with `redirect_uri=<worker>/oauth/callback` and `state=btoa(window.location.origin)`
2. Strava redirects to the worker with `?code=...&state=<base64-origin>`
3. Worker decodes origin from `state`, validates it against `ALLOWED_ORIGINS`, exchanges the code, then redirects to `<origin>/callback#tokens=<base64-json>`
4. Frontend `OAuthCallbackPage` reads tokens from the URL fragment and stores them locally

This means **no local OAuth worker is needed** — local dev points at the production worker.

## Tech Stack

| Component      | Technology                |
|----------------|---------------------------|
| Frontend       | React + TypeScript + Vite |
| Styling        | Tailwind CSS              |
| Routing        | React Router              |
| Local storage  | Dexie.js (IndexedDB)      |
| OAuth server   | Cloudflare Worker         |
| Hosting        | Cloudflare Pages          |

## Project Structure

```
audax_tracker/
├── frontend/          # React SPA
│   └── src/
│       ├── classification/  # Activity classifier
│       ├── qualification/   # ACP 5000/10000 tracker
│       ├── awards/          # Annual & lifetime awards logic
│       ├── strava/          # Strava API client & auth
│       ├── db/              # Dexie database schema & helpers
│       ├── pages/           # Route-level components
│       └── components/      # Shared UI components
└── worker/            # Cloudflare Worker (OAuth token exchange)
    └── src/index.ts
```

## Setup

### Prerequisites

- Node.js (check `.tool-versions` or `.mise.toml` for the required version)
- A [Strava API application](https://www.strava.com/settings/api) (for Client ID and Client Secret)
- A Cloudflare account (for the Worker and Pages hosting)

### 1. Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler deploy
npx wrangler secret put STRAVA_CLIENT_SECRET
npx wrangler secret put ALLOWED_ORIGINS
# Enter comma-separated allowed origins, e.g.:
# https://your-pages-domain.pages.dev,http://localhost:5173
```

Set `STRAVA_CLIENT_ID` in `worker/wrangler.toml` under `[vars]`.

In your [Strava API settings](https://www.strava.com/settings/api), set **Authorization Callback Domain** to your worker's domain (e.g. `api.audax-tracker.angelofailla.com`).

### 2. Configure the Frontend

Create `frontend/.env.local`:

```env
VITE_STRAVA_CLIENT_ID=your_strava_client_id
VITE_OAUTH_WORKER_URL=https://your-worker.your-account.workers.dev
VITE_OAUTH_CALLBACK_URL=https://your-worker.your-account.workers.dev/oauth/callback
```

### 3. Run locally

```bash
cd frontend
npm install
npm run dev
```

The full Strava OAuth flow works in local dev — the browser is redirected to the production worker, which exchanges the code and redirects back to `http://localhost:5173/callback` with tokens in the URL fragment. No local worker is needed as long as `http://localhost:5173` is in the worker's `ALLOWED_ORIGINS` secret.

### 4. Deploy to Cloudflare Pages

Deployments are handled automatically via GitHub Actions on push to `main`. The workflow deploys the worker and builds + deploys the frontend.

Set these secrets in your GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers and Pages permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `VITE_STRAVA_CLIENT_ID` | Strava app client ID |
| `VITE_OAUTH_WORKER_URL` | Worker base URL (e.g. `https://api.audax-tracker.angelofailla.com`) |
| `VITE_OAUTH_CALLBACK_URL` | Worker callback URL (e.g. `https://api.audax-tracker.angelofailla.com/oauth/callback`) |

## Classification Logic

Activities are classified in order:

1. **Name/description parsing** — regex match on ride name for patterns like `BRM`, `Brevet`, `PBP`, `Paris-Brest`, `Fleche`, etc.
2. **Distance heuristic** — rides in qualifying distance ranges flagged as candidates (e.g. 195–210 km → BRM200)
3. **Manual override** — user can reclassify any ride and add a homologation number via the Activities page

## ACP Qualification Rules

### Randonneur 5000 (4-year window)

| Requirement      | Rule                                            |
|------------------|-------------------------------------------------|
| Full BRM series  | 200 + 300 + 400 + 600 + 1000 km (all required) |
| PBP              | 1× Paris-Brest-Paris                            |
| Flèche           | 1× Flèche Vélocio or Flèche Nationale           |
| Total distance   | ≥ 5,000 km from qualifying events               |
| Time window      | 4 years from first qualifying event             |

### Randonneur 10,000 (6-year window)

| Requirement       | Rule                                                  |
|-------------------|-------------------------------------------------------|
| 2× Full BRM series| Two complete 200+300+400+600+1000 km sets             |
| PBP               | 1× Paris-Brest-Paris                                  |
| RM 1200+          | 1× additional 1200+ km event (not PBP)                |
| Mountain 600      | 1× BRM 600 km with ≥ 8,000 m elevation gain           |
| Flèche            | 1× Flèche Vélocio or Flèche Nationale                 |
| Total distance    | ≥ 10,000 km from qualifying events                    |
| Time window       | 6 years from first qualifying event                   |
