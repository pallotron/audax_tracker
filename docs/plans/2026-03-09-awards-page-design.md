# Awards Page Design

## Goal

Add an Awards page to Audax Tracker that tracks and displays progress toward all major Audax Ireland and ACP awards, using Strava activity data supplemented by Nominatim reverse geocoding for geographic awards.

## Awards Included

### ACP Awards (linking to existing detail pages)
- **Randonneur 5000** — existing `/qualification/5000`
- **Randonneur 10000** — existing `/qualification/10000`

### Annual Awards (year-badge rows)
- **RRTY** — ✓/✗ per calendar year (12 consecutive months with 200km+ brevet)
- **Brevet 2000** — ✓/✗ per audax season (Nov 1–Oct 31), BRM + Permanent km ≥ 2000
- **Brevet 5000** — ✓/✗ per audax season, BRM + Permanent km ≥ 5000
- **4 Provinces** — ✓/✗ per calendar year (200km+ brevet started in each of Ulster, Leinster, Munster, Connacht)
- **Easter Flèche** — ✓ badge per year a Flèche was completed during Easter weekend (Good Friday–Easter Monday)

### Lifetime Awards (checklist-style)
- **4 Nations SR** — BRM 200+300+400+600, each starting and finishing in a different nation (England, Ireland, Scotland, Wales); 4-season window from 2024–25 season
- **ISR (International SR)** — BRM 200+300+400+600, each in a different country (any countries, no time window)
- **International Rides** — list of all brevets started outside Ireland + manually flagged notable events

---

## Data Model Changes

### New Activity fields (`src/db/database.ts`)

```ts
startLat: number | null         // Strava start_latlng[0]
startLng: number | null         // Strava start_latlng[1]
endLat: number | null           // Strava end_latlng[0]
endLng: number | null           // Strava end_latlng[1]
startCountry: string | null     // Nominatim address.country
startRegion: string | null      // Province (Ireland) or nation (UK) or raw state
endCountry: string | null       // Nominatim on end point
endRegion: string | null        // Same mapping as startRegion
isNotableInternational: boolean // Manual flag for named international events
```

### New EventType value
`"Permanent"` added to the `EventType` union.
- Counts toward: RRTY, Brevet 2000/5000
- Does NOT count toward: ACP R5000, R10000

### Database migration
Dexie version bump with migration setting all new fields to `null`/`false` on existing records.

---

## Geocoding Integration (`src/geo/geocoder.ts`)

### When it runs
After each Strava sync completes, a background pass geocodes any activity with lat/lng but no `startCountry` yet. Sync UI shows completion first; geocoding runs silently behind it.

### Nominatim API
`GET https://nominatim.openstreetmap.org/reverse?lat=X&lon=Y&format=json&zoom=6`

- Zoom level 6 = state/county granularity
- Called for both start and end points
- Rate-limited: 1 request/second via a simple async queue
- User-Agent header set to `AudaxTracker/1.0`

### Ireland province mapping (county → province)
```ts
const PROVINCE_MAP: Record<string, string> = {
  // Munster
  Cork: "Munster", Kerry: "Munster", Limerick: "Munster",
  Tipperary: "Munster", Waterford: "Munster", Clare: "Munster",
  // Leinster
  Dublin: "Leinster", Wicklow: "Leinster", Wexford: "Leinster",
  Carlow: "Leinster", Kilkenny: "Leinster", Laois: "Leinster",
  Offaly: "Leinster", Kildare: "Leinster", Meath: "Leinster",
  Westmeath: "Leinster", Longford: "Leinster", Louth: "Leinster",
  // Connacht
  Galway: "Connacht", Mayo: "Connacht", Sligo: "Connacht",
  Roscommon: "Connacht", Leitrim: "Connacht",
  // Ulster
  Donegal: "Ulster", Cavan: "Ulster", Monaghan: "Ulster",
  Antrim: "Ulster", Armagh: "Ulster", Down: "Ulster",
  Fermanagh: "Ulster", Tyrone: "Ulster", Derry: "Ulster",
};
```

### UK nation extraction
Nominatim `address.state` returns "England", "Scotland", "Wales", or "Northern Ireland" directly — stored as-is in `startRegion`/`endRegion`.

### Region resolution logic
1. If `address.country` === "Ireland" → map `address.county` through `PROVINCE_MAP`
2. If `address.country` === "United Kingdom" → use `address.state` directly
3. Otherwise → store `address.state` as-is (handles other countries)

---

## Award Logic (`src/awards/awards.ts`)

### RRTY per year
For each calendar year Y: check if any completed 12-month consecutive streak (from existing `checkRrty` logic) ended during year Y. Returns a `Set<number>` of achieved years.

### Brevet 2000 / Brevet 5000
For each audax season (Nov 1–Oct 31):
- Sum `distance` of all non-DNF activities where `eventType` ∈ {BRM200, BRM300, BRM400, BRM600, BRM1000, Permanent}
- Season key: `"2024-25"` format
- Returns map of season → km total

### 4 Provinces
For each calendar year:
- Filter activities: 200km+, non-DNF, classified (eventType not null), `startRegion` is a province name
- Check if all four provinces covered: Ulster, Leinster, Munster, Connacht
- Returns map of year → `{ met: boolean, provinces: Record<string, Activity[]> }`

### Easter Flèche
For each Flèche activity:
- Compute Easter Sunday for that year using the Anonymous Gregorian algorithm
- Check if activity date falls on [EasterSunday − 2, EasterSunday + 1] (Good Friday–Easter Monday)
- Returns list of `{ year, activity }`

### 4 Nations SR
- Filter activities from 2024-11-01 onward
- Required: one BRM200, BRM300, BRM400, BRM600 — each with `startCountry` = `endCountry` = same nation, all four nations covered
- Check via assignment: try all permutations of (BRM distance → nation) to find a valid covering set within the 4-season window
- Returns `{ met: boolean, assignments: Record<nation, Activity | null> }`

### ISR (International SR)
- Same logic as 4 Nations SR but any countries (no time window, no start date restriction)
- Returns `{ met: boolean, assignments: Record<country, Activity | null> }`

### International Rides list
- Activities where `startCountry` ≠ "Ireland" AND `startCountry` is not null
- Plus activities with `isNotableInternational: true` (regardless of country)
- Sorted by date descending

---

## Permanent Event Classification

### Name pattern matching (in `src/classification/classifier.ts`)
New patterns added before distance fallback:
- `/\bpermanent\b/i`
- `/\bperm\b/i`
- `/\bdiy\b.*brevet/i`
- `/\bbrevet.*diy\b/i`

Classified as `"Permanent"` with `needsConfirmation: true` (since detection is uncertain).

---

## Page Structure (`src/pages/AwardsPage.tsx`)

Route: `/awards`, added to nav between "Activities" and "Yearly Summary".

```
Awards
├── ACP Awards
│   ├── R5000 card (status + link)
│   └── R10000 card (status + link)
├── Annual Awards
│   ├── RRTY row (year badges)
│   ├── Brevet 2000 row (season badges)
│   ├── Brevet 5000 row (season badges)
│   ├── 4 Provinces row (year badges, with province breakdown on hover/expand)
│   └── Easter Flèche row (year badges, only years with qualifying ride shown)
└── Lifetime Awards
    ├── 4 Nations SR (4-slot checklist: 200/300/400/600 per nation, progress bar)
    ├── ISR (same layout, any countries)
    └── International Rides (list of activities, with notable flag toggle)
```

---

## Navigation

Add "Awards" link to `Layout.tsx` nav bar between "Activities" and "Yearly Summary".

---

## Testing

- Unit tests for each award computation function in `src/__tests__/awards/awards.test.ts`
- Unit test for province/region mapping in `src/__tests__/geo/geocoder.test.ts`
- Unit test for Easter date calculation
- Unit test for Permanent classification patterns
- Tests use mock activity data — no Nominatim calls in unit tests (geocoder is injected/mockable)
