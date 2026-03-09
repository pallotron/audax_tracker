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

Cloudflare Worker  ←  OAuth token exchange only (keeps client_secret server-side)
Cloudflare Pages   ←  hosts the static SPA
Strava API         ←  activity data fetched directly from the browser
```

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
npx wrangler secret put STRAVA_CLIENT_SECRET
npx wrangler secret put ALLOWED_ORIGIN   # e.g. https://your-pages-domain.pages.dev
npx wrangler deploy
```

Set `STRAVA_CLIENT_ID` in `worker/wrangler.toml` under `[vars]`.

### 2. Configure the Frontend

Create `frontend/.env.local`:

```env
VITE_STRAVA_CLIENT_ID=your_strava_client_id
VITE_OAUTH_WORKER_URL=https://audax-tracker-oauth.your-account.workers.dev
```

### 3. Run locally

```bash
cd frontend
npm install
npm run dev
```

### 4. Deploy to Cloudflare Pages

```bash
cd frontend
npm run build
# Upload the dist/ directory to Cloudflare Pages
```

Set the same environment variables (`VITE_STRAVA_CLIENT_ID`, `VITE_OAUTH_WORKER_URL`) in the Cloudflare Pages dashboard.

Make sure your Strava app's **Authorization Callback Domain** is set to your Pages domain, and that the Worker's `ALLOWED_ORIGIN` secret matches it.

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
