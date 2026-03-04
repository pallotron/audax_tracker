# Audax Tracker — Design Document

## Purpose

A web app that pulls cycling activities from Strava, classifies qualifying audax/randonneuring events, and tracks progress toward ACP Randonneur 5000 and Randonneur 10,000 awards. Also provides a yearly summary of all audax rides.

## Architecture

```
+------------------------------------------------+
|  Browser (React SPA)                           |
|                                                |
|  +----------+  +----------+  +--------------+  |
|  | Strava   |  | Activity |  | ACP 5000 /   |  |
|  | Auth Flow|  | Fetcher  |  | 10000 Tracker|  |
|  +----+-----+  +----+-----+  +--------------+  |
|       |              |        +--------------+  |
|  +----+-----+        |        | IndexedDB    |  |
|  | Token    |        |        | (persistent) |  |
|  | Storage  |        |        +--------------+  |
|  +----------+        |                          |
+-------+--------------+-------------------------+
        |              |
        v              v
+---------------+  +--------------+
| CF Worker     |  | Strava API   |
| (OAuth token  |  | (activities) |
|  exchange)    |  +--------------+
+---------------+
```

- **React + TypeScript SPA** (Vite) — all logic runs in the browser
- **Cloudflare Worker** — handles OAuth token exchange only (client_secret stays server-side)
- **IndexedDB** (via Dexie.js) — persistent local cache of activities and user metadata
- **Cloudflare Pages** — hosts the static SPA
- No server-side database

## Data Model

```typescript
interface Activity {
  stravaId: string;
  name: string;
  date: Date;
  distance: number;           // km
  elevationGain: number;      // meters
  movingTime: number;         // seconds
  elapsedTime: number;        // seconds
  type: string;               // "Ride" | "GravelRide" | ...

  // Classification
  eventType:
    | null
    | "BRM200" | "BRM300" | "BRM400" | "BRM600" | "BRM1000"
    | "PBP"
    | "RM1200+"
    | "Fleche"
    | "SuperRandonneur"
    | "TraceVelocio"
    | "FlecheDeFrance"
    | "Other";
  classificationSource: "auto-name" | "auto-distance" | "manual";
  manualOverride: boolean;

  // Validation
  homologationNumber: string | null;
}
```

## Classification Logic

Layered detection, applied in order:

1. **Name/description parsing** — regex match on ride name for patterns like "BRM", "Brevet", "PBP", "Paris-Brest", "Fleche", etc.
2. **Distance heuristic** — rides in qualifying distance ranges (e.g. 195-210 km -> candidate BRM200, 290-320 km -> BRM300, etc.) flagged for user confirmation.
3. **Manual override** — user can reclassify any ride and add homologation number via the UI.

## Qualification Rules

### ACP Randonneur 5000 (4-year window)

| Requirement           | Rule                                              |
|-----------------------|---------------------------------------------------|
| Full BRM series       | 200 + 300 + 400 + 600 + 1000 km (all required)   |
| PBP                   | 1x Paris-Brest-Paris                              |
| Fleche                | 1x Fleche Velocio or Fleche Nationale             |
| Total distance        | >= 5,000 km from qualifying events                |
| Time window           | 4 years from first qualifying event               |

### ACP Randonneur 10,000 (6-year window)

| Requirement           | Rule                                              |
|-----------------------|---------------------------------------------------|
| 2x Full BRM series   | Two complete 200+300+400+600+1000 km sets         |
| PBP                   | 1x Paris-Brest-Paris                              |
| Separate RM 1200+    | 1x additional 1200+ km event (not PBP)            |
| Mountain 600          | 1x BRM 600 km with >= 8,000m elevation gain       |
| Fleche                | 1x Fleche Velocio or Fleche Nationale             |
| Total distance        | >= 10,000 km from qualifying events               |
| Time window           | 6 years from first qualifying event               |

### Tracker Logic

- Scan all classified activities and find the best qualifying window.
- Display a checklist: completed requirements (with dates), missing requirements, km progress bar.
- Highlight the "mountain 600" for ACP 10,000 (uses elevationGain >= 8000).
- Warn if a window is about to expire (events aging out).

## UI / Pages

### 1. Login
- "Connect with Strava" OAuth button.

### 2. Dashboard
- ACP 5000 progress checklist + km progress bar.
- ACP 10,000 progress checklist + km progress bar.
- Current year summary stats.

### 3. Activities
- Paginated table of all synced rides.
- Filterable by year, event type.
- Inline editing for event type classification and homologation number.
- Visual badges for auto-detected vs manually classified.
- "Sync from Strava" button to fetch new activities.

### 4. Yearly Summary
- Year selector/tabs.
- Per-year: total km, elevation, ride count, table of qualifying events.
- Multi-year comparison view.

### 5. Qualification Detail
- Dedicated view per award (5000 / 10,000).
- Checklist of requirements with status.
- Best qualifying window highlighted.
- Timeline visualization of events in the window.
- Expiring event warnings.

## Strava Integration

- OAuth via Cloudflare Worker (token exchange with client_secret).
- SPA fetches activities directly from Strava API using access token.
- First visit: bulk sync all ride history, auto-classify, land on dashboard.
- Return visits: incremental sync (activities since last fetch).
- All data persisted in IndexedDB indefinitely (pragmatic caching).
- "Sync" button to pull new activities on demand.

## Tech Stack

| Component        | Technology                  |
|------------------|-----------------------------|
| Frontend         | React + TypeScript + Vite   |
| Styling          | Tailwind CSS                |
| Routing          | React Router                |
| Local storage    | Dexie.js (IndexedDB)        |
| OAuth server     | Cloudflare Worker           |
| Hosting          | Cloudflare Pages            |

## Future Enhancements (not in v1)

- RideWithGPS integration
- Komoot integration
- Export qualification data as PDF for ACP submission
- Share qualification status (public profile link)
