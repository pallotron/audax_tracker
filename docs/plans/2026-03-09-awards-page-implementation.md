# Awards Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Awards page to Audax Tracker tracking ACP, RRTY, Brevet 2000/5000, 4 Provinces, Easter Flèche, 4 Nations SR, ISR, and International Rides awards.

**Architecture:** Eight sequential tasks: add Permanent event type, extend the DB schema with geo fields (v6 migration), enrich Strava sync with lat/lng, build a Nominatim geocoder, wire geocoding into useSync, implement all award computations, build the Awards page UI, and wire routing/nav.

**Tech Stack:** React 19 + TypeScript, Dexie v4 (IndexedDB), Vitest, Tailwind CSS 4, Nominatim (OpenStreetMap) reverse-geocoding API.

---

### Task 1: Add `Permanent` event type and classifier patterns

**Files:**
- Modify: `frontend/src/db/types.ts`
- Modify: `frontend/src/classification/classifier.ts`
- Modify: `frontend/src/__tests__/classification/classifier.test.ts`

**Context:** Permanent events are self-scheduled brevets. They count toward RRTY and Brevet 2000/5000 but NOT toward ACP awards. Detection via name patterns is uncertain, so `needsConfirmation: true`.

**Step 1: Write the failing tests**

Add to `frontend/src/__tests__/classification/classifier.test.ts` inside the `describe("classifyActivity"` block, after existing tests:

```ts
describe("Permanent events", () => {
  it("classifies 'Permanent 200' as Permanent with needsConfirmation", () => {
    const result = classifyActivity(makeRaw({ name: "Permanent 200", distance: 200_000 }));
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("Permanent");
    expect(result!.classificationSource).toBe("auto-name");
    expect(result!.needsConfirmation).toBe(true);
  });

  it("classifies 'perm 300' as Permanent", () => {
    const result = classifyActivity(makeRaw({ name: "perm 300", distance: 300_000 }));
    expect(result!.eventType).toBe("Permanent");
  });

  it("classifies 'DIY Brevet 200' as Permanent", () => {
    const result = classifyActivity(makeRaw({ name: "DIY Brevet 200km", distance: 200_000 }));
    expect(result!.eventType).toBe("Permanent");
  });

  it("classifies 'Brevet Permanent' as Permanent", () => {
    const result = classifyActivity(makeRaw({ name: "Brevet Permanent 300", distance: 300_000 }));
    expect(result!.eventType).toBe("Permanent");
  });

  it("does not classify 'permanently tired' as Permanent", () => {
    const result = classifyActivity(makeRaw({ name: "permanently tired", distance: 50_000 }));
    expect(result?.eventType).not.toBe("Permanent");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/classification/classifier.test.ts
```

Expected: FAIL — `"Permanent"` not a valid EventType.

**Step 3: Add `Permanent` to EventType in `frontend/src/db/types.ts`**

```ts
export type EventType =
  | null
  | "BRM200"
  | "BRM300"
  | "BRM400"
  | "BRM600"
  | "BRM1000"
  | "PBP"
  | "RM1200+"
  | "Fleche"
  | "SuperRandonneur"
  | "TraceVelocio"
  | "FlecheDeFrance"
  | "Permanent"
  | "Other";

export type ClassificationSource = "auto-name" | "auto-distance" | "manual";
```

**Step 4: Add `needsConfirmation` to `NamePattern` and Permanent patterns in `frontend/src/classification/classifier.ts`**

Change the `NamePattern` interface to:
```ts
interface NamePattern {
  pattern: RegExp;
  eventType: EventType;
  minDistanceKm?: number;
  needsConfirmation?: boolean;
}
```

Add at the START of `NAME_PATTERNS` (before BRM patterns — more specific wins):
```ts
// Permanent events (self-scheduled brevets)
{ pattern: /\bpermanent\b/i, eventType: "Permanent", needsConfirmation: true },
{ pattern: /\bperm\s+\d/i, eventType: "Permanent", needsConfirmation: true },
{ pattern: /\bdiy\s+brevet\b/i, eventType: "Permanent", needsConfirmation: true },
{ pattern: /\bbrevet\s+permanent\b/i, eventType: "Permanent", needsConfirmation: true },
```

In the name-pattern loop, use the pattern's `needsConfirmation`:
```ts
for (const { pattern, eventType, minDistanceKm, needsConfirmation } of NAME_PATTERNS) {
  if (pattern.test(raw.name)) {
    if (minDistanceKm && distanceKm < minDistanceKm) continue;
    const dnf = detectDnf(raw.name, eventType, distanceKm);
    return {
      eventType,
      classificationSource: "auto-name",
      needsConfirmation: needsConfirmation ?? false,
      dnf,
    };
  }
}
```

**Step 5: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/__tests__/classification/classifier.test.ts
```

Expected: All tests pass.

**Step 6: Commit**

```bash
jj describe -m "feat: add Permanent event type and classifier patterns"
```

---

### Task 2: Add geo fields to DB schema (version 6 migration)

**Files:**
- Modify: `frontend/src/db/database.ts`

**Context:** Strava activity summaries include `start_latlng` and `end_latlng` arrays. After Nominatim geocoding, we store country + region (province for Ireland, nation for UK). The `isNotableInternational` flag lets users manually mark notable named events.

**Step 1: Add fields to the `Activity` interface in `frontend/src/db/database.ts`**

After `sourceUrl: string;` add:
```ts
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  startCountry: string | null;
  startRegion: string | null;
  endCountry: string | null;
  endRegion: string | null;
  isNotableInternational: boolean;
```

**Step 2: Add version 6 to `frontend/src/db/database.ts`**

After the existing `db.version(5)` block, add:

```ts
db.version(6).stores({
  activities: "stravaId, date, eventType, type, startCountry, startRegion",
}).upgrade(tx => {
  return tx.table("activities").toCollection().modify(activity => {
    activity.startLat = null;
    activity.startLng = null;
    activity.endLat = null;
    activity.endLng = null;
    activity.startCountry = null;
    activity.startRegion = null;
    activity.endCountry = null;
    activity.endRegion = null;
    activity.isNotableInternational = false;
  });
});
```

Note: the index string adds `startCountry` and `startRegion` to the Dexie schema for indexed queries.

**Step 3: Verify TypeScript compiles (no test file needed — type errors are caught at build)**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
jj describe -m "feat: add geo fields to Activity schema (DB v6)"
```

---

### Task 3: Update Strava sync to capture lat/lng

**Files:**
- Modify: `frontend/src/strava/client.ts`
- Modify: `frontend/src/__tests__/strava/client.test.ts`

**Context:** Strava activity list responses include `start_latlng` and `end_latlng` as `[lat, lng]` arrays (empty array `[]` if the activity has no GPS data). We must handle the empty-array case.

**Step 1: Write failing tests**

In `frontend/src/__tests__/strava/client.test.ts`, add a new `describe` block:

```ts
describe("mapStravaActivity — geo fields", () => {
  function makeRawWithGeo(overrides = {}) {
    return {
      id: 12345,
      name: "BRM 200",
      distance: 200000,
      moving_time: 28800,
      elapsed_time: 30000,
      total_elevation_gain: 1200,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-06-01T07:00:00Z",
      start_latlng: [53.3498, -6.2603],
      end_latlng: [53.3498, -6.2603],
      ...overrides,
    };
  }

  it("stores start and end lat/lng when present", () => {
    const result = mapStravaActivity(makeRawWithGeo());
    expect(result.startLat).toBe(53.3498);
    expect(result.startLng).toBe(-6.2603);
    expect(result.endLat).toBe(53.3498);
    expect(result.endLng).toBe(-6.2603);
  });

  it("stores null for lat/lng when Strava returns empty array", () => {
    const result = mapStravaActivity(makeRawWithGeo({ start_latlng: [], end_latlng: [] }));
    expect(result.startLat).toBeNull();
    expect(result.startLng).toBeNull();
    expect(result.endLat).toBeNull();
    expect(result.endLng).toBeNull();
  });

  it("initializes country/region/notableInternational as null/false", () => {
    const result = mapStravaActivity(makeRawWithGeo());
    expect(result.startCountry).toBeNull();
    expect(result.startRegion).toBeNull();
    expect(result.endCountry).toBeNull();
    expect(result.endRegion).toBeNull();
    expect(result.isNotableInternational).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/strava/client.test.ts
```

Expected: FAIL — `mapStravaActivity` doesn't set geo fields.

**Step 3: Update `StravaActivityResponse` and `mapStravaActivity` in `frontend/src/strava/client.ts`**

Add to `StravaActivityResponse` interface:
```ts
  start_latlng: [number, number] | [];
  end_latlng: [number, number] | [];
```

Add to the return object of `mapStravaActivity`:
```ts
    startLat: raw.start_latlng[0] ?? null,
    startLng: raw.start_latlng[1] ?? null,
    endLat: raw.end_latlng[0] ?? null,
    endLng: raw.end_latlng[1] ?? null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/__tests__/strava/client.test.ts
```

Expected: All tests pass.

**Step 5: Commit**

```bash
jj describe -m "feat: capture start/end lat-lng from Strava activity sync"
```

---

### Task 4: Build Nominatim geocoder module

**Files:**
- Create: `frontend/src/geo/geocoder.ts`
- Create: `frontend/src/__tests__/geo/geocoder.test.ts`

**Context:** Nominatim reverse-geocode endpoint returns a JSON object with an `address` field. For Ireland, `address.county` gives the county (e.g. "County Cork" or "Cork"). For UK, `address.state` gives "England", "Scotland", "Wales", or "Northern Ireland" directly. Rate limit: 1 request/second max.

**Step 1: Write failing tests**

Create `frontend/src/__tests__/geo/geocoder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countyToProvince, parseNominatimRegion } from "../../geo/geocoder";

describe("countyToProvince", () => {
  it.each([
    ["Cork", "Munster"],
    ["Kerry", "Munster"],
    ["Limerick", "Munster"],
    ["Tipperary", "Munster"],
    ["Waterford", "Munster"],
    ["Clare", "Munster"],
    ["Dublin", "Leinster"],
    ["Wicklow", "Leinster"],
    ["Kildare", "Leinster"],
    ["Galway", "Connacht"],
    ["Mayo", "Connacht"],
    ["Sligo", "Connacht"],
    ["Roscommon", "Connacht"],
    ["Leitrim", "Connacht"],
    ["Donegal", "Ulster"],
    ["Cavan", "Ulster"],
    ["Monaghan", "Ulster"],
    ["Antrim", "Ulster"],
    ["Down", "Ulster"],
    ["Derry", "Ulster"],
  ])("maps %s to %s", (county, province) => {
    expect(countyToProvince(county)).toBe(province);
  });

  it("strips 'County ' prefix before mapping", () => {
    expect(countyToProvince("County Cork")).toBe("Munster");
    expect(countyToProvince("County Dublin")).toBe("Leinster");
  });

  it("returns null for unknown county", () => {
    expect(countyToProvince("Yorkshire")).toBeNull();
  });
});

describe("parseNominatimRegion", () => {
  it("returns province for Irish county", () => {
    const result = parseNominatimRegion({ country: "Ireland", county: "County Cork" });
    expect(result.country).toBe("Ireland");
    expect(result.region).toBe("Munster");
  });

  it("returns state directly for UK activities", () => {
    const result = parseNominatimRegion({ country: "United Kingdom", state: "Scotland" });
    expect(result.country).toBe("United Kingdom");
    expect(result.region).toBe("Scotland");
  });

  it("returns state for non-IE/UK countries", () => {
    const result = parseNominatimRegion({ country: "France", state: "Bretagne" });
    expect(result.country).toBe("France");
    expect(result.region).toBe("Bretagne");
  });

  it("returns null country and region when address is empty", () => {
    const result = parseNominatimRegion({});
    expect(result.country).toBeNull();
    expect(result.region).toBeNull();
  });

  it("returns null region when Irish county is unknown", () => {
    const result = parseNominatimRegion({ country: "Ireland", county: "Unknown" });
    expect(result.country).toBe("Ireland");
    expect(result.region).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/geo/geocoder.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create `frontend/src/geo/geocoder.ts`**

```ts
import { db } from "../db/database";

const COUNTY_TO_PROVINCE: Record<string, string> = {
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

export function countyToProvince(county: string): string | null {
  const bare = county.replace(/^County\s+/i, "").trim();
  return COUNTY_TO_PROVINCE[bare] ?? null;
}

export interface GeoLocation {
  country: string | null;
  region: string | null;
}

export function parseNominatimRegion(address: {
  country?: string;
  state?: string;
  county?: string;
}): GeoLocation {
  const country = address.country ?? null;
  if (!country) return { country: null, region: null };

  if (country === "Ireland") {
    const region = address.county ? countyToProvince(address.county) : null;
    return { country, region };
  }

  if (country === "United Kingdom") {
    return { country, region: address.state ?? null };
  }

  return { country, region: address.state ?? null };
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoLocation> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=6`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "AudaxTracker/1.0 (personal tool)" },
    });
    if (!response.ok) return { country: null, region: null };
    const data = await response.json();
    return parseNominatimRegion(data.address ?? {});
  } catch {
    return { country: null, region: null };
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode all activities that have lat/lng but no country yet.
 * Calls Nominatim for start and (if available) end points, rate-limited to 1 req/sec.
 * Writes results back to the DB.
 */
export async function geocodeActivities(): Promise<void> {
  const all = await db.activities.toArray();
  const toGeocode = all.filter(
    (a) => a.startLat !== null && a.startCountry === null
  );
  if (toGeocode.length === 0) return;

  for (const activity of toGeocode) {
    await sleep(1000);
    const startGeo = await reverseGeocode(activity.startLat!, activity.startLng!);

    let endGeo: GeoLocation = { country: null, region: null };
    if (activity.endLat !== null) {
      await sleep(1000);
      endGeo = await reverseGeocode(activity.endLat, activity.endLng!);
    }

    await db.activities.update(activity.stravaId, {
      startCountry: startGeo.country,
      startRegion: startGeo.region,
      endCountry: endGeo.country,
      endRegion: endGeo.region,
    });
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/__tests__/geo/geocoder.test.ts
```

Expected: All tests pass.

**Step 5: Commit**

```bash
jj describe -m "feat: add Nominatim geocoder with Irish province and UK nation mapping"
```

---

### Task 5: Wire geocoding into useSync

**Files:**
- Modify: `frontend/src/hooks/useSync.ts`

**Context:** After the sync loop stores activities, kick off `geocodeActivities()` as a non-blocking background task (`.catch(console.error)`). Don't await it — the sync completes immediately and geocoding runs in the background. No UI feedback needed for geocoding at this stage.

**Step 1: Import `geocodeActivities` and wire it in `frontend/src/hooks/useSync.ts`**

Add import at the top:
```ts
import { geocodeActivities } from "../geo/geocoder";
```

In the `sync` callback, after `setLastSync(now)` and before `setHasPending(false)`, add:
```ts
      // Geocode new activities in the background (non-blocking)
      geocodeActivities().catch(console.error);
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
jj describe -m "feat: run Nominatim geocoding after each Strava sync"
```

---

### Task 6: Build awards computation module

**Files:**
- Create: `frontend/src/awards/awards.ts`
- Create: `frontend/src/__tests__/awards/awards.test.ts`

**Context:** All award functions take an array of `AwardsActivity` (Activity enriched with geo fields). They are pure functions — no DB access. The AwardsPage will call these after fetching all activities via `useLiveQuery`.

The `addMonths` helper is duplicated from `tracker.ts` (it's a one-liner).

**Step 1: Write failing tests**

Create `frontend/src/__tests__/awards/awards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  checkRrtyYears,
  checkBrevetKm,
  checkFourProvinces,
  checkEasterFleche,
  checkFourNations,
  checkIsr,
  getInternationalRides,
  type AwardsActivity,
} from "../../awards/awards";

function makeActivity(overrides: Partial<AwardsActivity> = {}): AwardsActivity {
  const id = Math.random().toString(36).slice(2);
  return {
    stravaId: id,
    name: "BRM 200",
    date: "2025-06-15",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    dnf: false,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    startCountry: "Ireland",
    startRegion: "Leinster",
    endCountry: "Ireland",
    endRegion: "Leinster",
    isNotableInternational: false,
    ...overrides,
  };
}

// Generate "YYYY-MM" relative to current month
function relMonth(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── RRTY Years ──────────────────────────────────────────────────────────────

describe("checkRrtyYears", () => {
  it("returns empty set when no activities", () => {
    expect(checkRrtyYears([])).toEqual(new Set());
  });

  it("returns the year a 12-month streak ends", () => {
    // Build 12 consecutive months ending December of last year
    const lastYear = new Date().getFullYear() - 1;
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeActivity({ date: `${lastYear}-${String(i + 1).padStart(2, "0")}-15` })
    );
    const result = checkRrtyYears(activities);
    expect(result.has(lastYear)).toBe(true);
  });

  it("does not count a broken streak (gap = no year awarded)", () => {
    const lastYear = new Date().getFullYear() - 1;
    // Months 1-5, gap at 6, months 7-12 (two 5-month streaks — neither is 12)
    const activities = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeActivity({ date: `${lastYear}-${String(i + 1).padStart(2, "0")}-15` })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeActivity({ date: `${lastYear}-${String(i + 7).padStart(2, "0")}-15` })
      ),
    ];
    expect(checkRrtyYears(activities)).toEqual(new Set());
  });

  it("excludes DNF activities", () => {
    const lastYear = new Date().getFullYear() - 1;
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeActivity({
        date: `${lastYear}-${String(i + 1).padStart(2, "0")}-15`,
        dnf: i === 5,
      })
    );
    expect(checkRrtyYears(activities)).toEqual(new Set());
  });
});

// ── Brevet km ───────────────────────────────────────────────────────────────

describe("checkBrevetKm", () => {
  it("returns empty map when no activities", () => {
    expect(checkBrevetKm([])).toEqual(new Map());
  });

  it("counts BRM activities into the correct audax season", () => {
    // Nov 2024 → season "2024-25"
    const a = makeActivity({ date: "2024-11-15", eventType: "BRM300", distance: 300 });
    const result = checkBrevetKm([a]);
    expect(result.get("2024-25")).toBe(300);
  });

  it("counts Permanent activities", () => {
    const a = makeActivity({ date: "2025-03-15", eventType: "Permanent", distance: 200 });
    const result = checkBrevetKm([a]);
    expect(result.get("2024-25")).toBe(200);
  });

  it("does not count PBP toward Brevet 2000/5000", () => {
    const a = makeActivity({ date: "2025-03-15", eventType: "PBP", distance: 1200 });
    const result = checkBrevetKm([a]);
    expect(result.size).toBe(0);
  });

  it("assigns Jan 2025 to season 2024-25 (not 2025-26)", () => {
    const a = makeActivity({ date: "2025-01-15", eventType: "BRM200", distance: 200 });
    expect(checkBrevetKm([a]).get("2024-25")).toBe(200);
  });

  it("assigns Nov 2025 to season 2025-26", () => {
    const a = makeActivity({ date: "2025-11-15", eventType: "BRM200", distance: 200 });
    expect(checkBrevetKm([a]).get("2025-26")).toBe(200);
  });

  it("skips DNF activities", () => {
    const a = makeActivity({ date: "2025-03-15", eventType: "BRM200", distance: 200, dnf: true });
    expect(checkBrevetKm([a]).size).toBe(0);
  });
});

// ── 4 Provinces ─────────────────────────────────────────────────────────────

describe("checkFourProvinces", () => {
  it("returns empty map with no activities", () => {
    expect(checkFourProvinces([])).toEqual(new Map());
  });

  it("marks year as met when all 4 provinces covered", () => {
    const activities = [
      makeActivity({ date: "2025-03-01", startRegion: "Leinster" }),
      makeActivity({ date: "2025-04-01", startRegion: "Munster" }),
      makeActivity({ date: "2025-05-01", startRegion: "Connacht" }),
      makeActivity({ date: "2025-06-01", startRegion: "Ulster" }),
    ];
    const result = checkFourProvinces(activities);
    expect(result.get(2025)?.met).toBe(true);
  });

  it("marks year as not met when only 3 provinces covered", () => {
    const activities = [
      makeActivity({ date: "2025-03-01", startRegion: "Leinster" }),
      makeActivity({ date: "2025-04-01", startRegion: "Munster" }),
      makeActivity({ date: "2025-05-01", startRegion: "Connacht" }),
    ];
    const result = checkFourProvinces(activities);
    expect(result.get(2025)?.met).toBe(false);
  });

  it("tracks which activities covered each province", () => {
    const act = makeActivity({ date: "2025-03-01", startRegion: "Munster" });
    const result = checkFourProvinces([act]);
    expect(result.get(2025)?.provinces["Munster"]).toHaveLength(1);
  });

  it("ignores activities without region data", () => {
    const act = makeActivity({ date: "2025-03-01", startRegion: null });
    expect(checkFourProvinces([act]).size).toBe(0);
  });
});

// ── Easter Flèche ────────────────────────────────────────────────────────────

describe("checkEasterFleche", () => {
  it("returns empty array when no Flèche activities", () => {
    expect(checkEasterFleche([])).toEqual([]);
  });

  it("detects Easter 2025 Flèche (Easter Sunday = 20 April 2025)", () => {
    // Good Friday 18 Apr → Easter Monday 21 Apr
    const a = makeActivity({ date: "2025-04-19", eventType: "Fleche" }); // Holy Saturday
    const result = checkEasterFleche([a]);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2025);
  });

  it("does not count a Flèche outside Easter weekend", () => {
    const a = makeActivity({ date: "2025-06-01", eventType: "Fleche" });
    expect(checkEasterFleche([a])).toHaveLength(0);
  });

  it("does not count a DNF Flèche", () => {
    const a = makeActivity({ date: "2025-04-19", eventType: "Fleche", dnf: true });
    expect(checkEasterFleche([a])).toHaveLength(0);
  });
});

// ── 4 Nations SR ─────────────────────────────────────────────────────────────

describe("checkFourNations", () => {
  function makeNationActivity(
    distance: AwardsActivity["eventType"],
    nation: string,
    date = "2025-03-01"
  ): AwardsActivity {
    const country = nation === "Ireland" ? "Ireland" : "United Kingdom";
    return makeActivity({
      date,
      eventType: distance,
      distance: distance === "BRM200" ? 200 : distance === "BRM300" ? 300 : distance === "BRM400" ? 400 : 600,
      startCountry: country,
      startRegion: nation,
      endCountry: country,
      endRegion: nation,
    });
  }

  it("returns not met with no activities", () => {
    expect(checkFourNations([]).met).toBe(false);
  });

  it("qualifies with one SR distance per nation", () => {
    const activities = [
      makeNationActivity("BRM200", "Ireland"),
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
      makeNationActivity("BRM600", "Wales"),
    ];
    expect(checkFourNations(activities).met).toBe(true);
  });

  it("does not qualify with only 3 nations", () => {
    const activities = [
      makeNationActivity("BRM200", "Ireland"),
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
    ];
    expect(checkFourNations(activities).met).toBe(false);
  });

  it("does not count activities before 2024-11-01", () => {
    const activities = [
      makeNationActivity("BRM200", "Ireland", "2024-10-31"),
      makeNationActivity("BRM300", "England", "2025-01-01"),
      makeNationActivity("BRM400", "Scotland", "2025-02-01"),
      makeNationActivity("BRM600", "Wales", "2025-03-01"),
    ];
    // BRM200 is before the 2024-25 season start, so Ireland is missing
    expect(checkFourNations(activities).met).toBe(false);
  });

  it("requires start and end in same nation", () => {
    const crossBorder = makeActivity({
      eventType: "BRM200",
      distance: 200,
      date: "2025-03-01",
      startCountry: "Ireland",
      startRegion: "Ulster",
      endCountry: "United Kingdom",
      endRegion: "Northern Ireland",
    });
    const activities = [
      crossBorder,
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
      makeNationActivity("BRM600", "Wales"),
    ];
    // crossBorder doesn't count (start ≠ end country)
    expect(checkFourNations(activities).met).toBe(false);
  });
});

// ── ISR ───────────────────────────────────────────────────────────────────────

describe("checkIsr", () => {
  function makeCountryActivity(
    distance: AwardsActivity["eventType"],
    country: string
  ): AwardsActivity {
    return makeActivity({
      eventType: distance,
      distance: distance === "BRM200" ? 200 : distance === "BRM300" ? 300 : distance === "BRM400" ? 400 : 600,
      startCountry: country,
      endCountry: country,
      startRegion: null,
      endRegion: null,
    });
  }

  it("returns not met with no activities", () => {
    expect(checkIsr([]).met).toBe(false);
  });

  it("qualifies with SR series across 4 different countries", () => {
    const activities = [
      makeCountryActivity("BRM200", "Ireland"),
      makeCountryActivity("BRM300", "France"),
      makeCountryActivity("BRM400", "Belgium"),
      makeCountryActivity("BRM600", "Netherlands"),
    ];
    expect(checkIsr(activities).met).toBe(true);
  });

  it("does not qualify when two distances are in the same country", () => {
    const activities = [
      makeCountryActivity("BRM200", "Ireland"),
      makeCountryActivity("BRM300", "France"),
      makeCountryActivity("BRM400", "France"), // same as BRM300
      makeCountryActivity("BRM600", "Netherlands"),
    ];
    expect(checkIsr(activities).met).toBe(false);
  });

  it("has no date restriction (old activities count)", () => {
    const activities = [
      makeActivity({ date: "2010-01-01", eventType: "BRM200", distance: 200, startCountry: "Ireland", endCountry: "Ireland" }),
      makeActivity({ date: "2010-02-01", eventType: "BRM300", distance: 300, startCountry: "France", endCountry: "France" }),
      makeActivity({ date: "2010-03-01", eventType: "BRM400", distance: 400, startCountry: "Belgium", endCountry: "Belgium" }),
      makeActivity({ date: "2010-04-01", eventType: "BRM600", distance: 600, startCountry: "Netherlands", endCountry: "Netherlands" }),
    ];
    expect(checkIsr(activities).met).toBe(true);
  });
});

// ── International Rides ───────────────────────────────────────────────────────

describe("getInternationalRides", () => {
  it("returns activities started outside Ireland", () => {
    const abroad = makeActivity({ startCountry: "France" });
    const home = makeActivity({ startCountry: "Ireland" });
    const result = getInternationalRides([abroad, home]);
    expect(result).toHaveLength(1);
    expect(result[0].stravaId).toBe(abroad.stravaId);
  });

  it("includes manually flagged notable activities even if in Ireland", () => {
    const notable = makeActivity({ startCountry: "Ireland", isNotableInternational: true });
    expect(getInternationalRides([notable])).toHaveLength(1);
  });

  it("excludes activities with null country (not yet geocoded)", () => {
    const ungeocoded = makeActivity({ startCountry: null, isNotableInternational: false });
    expect(getInternationalRides([ungeocoded])).toHaveLength(0);
  });

  it("excludes DNF activities", () => {
    const dnfAbroad = makeActivity({ startCountry: "France", dnf: true });
    expect(getInternationalRides([dnfAbroad])).toHaveLength(0);
  });

  it("sorts by date descending (most recent first)", () => {
    const older = makeActivity({ date: "2024-01-01", startCountry: "France" });
    const newer = makeActivity({ date: "2025-01-01", startCountry: "Belgium" });
    const result = getInternationalRides([older, newer]);
    expect(result[0].stravaId).toBe(newer.stravaId);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/__tests__/awards/awards.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create `frontend/src/awards/awards.ts`**

```ts
import type { EventType } from "../db/types";

export interface AwardsActivity {
  stravaId: string;
  name: string;
  date: string;
  distance: number; // km
  elevationGain: number;
  eventType: EventType;
  dnf: boolean;
  sourceUrl: string;
  startCountry: string | null;
  startRegion: string | null;
  endCountry: string | null;
  endRegion: string | null;
  isNotableInternational: boolean;
}

function addMonths(yearMonth: string, n: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── RRTY per year ─────────────────────────────────────────────────────────────

/**
 * Returns the set of calendar years in which RRTY was achieved.
 * A year Y is achieved when a 12-consecutive-month streak ends in a month of year Y.
 */
export function checkRrtyYears(activities: AwardsActivity[]): Set<number> {
  const qualifying = activities.filter(
    (a) => !a.dnf && a.eventType !== null && a.distance >= 200
  );
  if (qualifying.length === 0) return new Set();

  const monthSet = new Set(qualifying.map((a) => a.date.substring(0, 7)));
  const sortedMonths = [...monthSet].sort();

  const achieved = new Set<number>();
  let streakStart = 0;

  for (let i = 1; i <= sortedMonths.length; i++) {
    const isEnd =
      i === sortedMonths.length ||
      addMonths(sortedMonths[i - 1], 1) !== sortedMonths[i];

    if (isEnd) {
      const streakLen = i - streakStart;
      if (streakLen >= 12) {
        // Any 12-month window ending at months[j] (j >= streakStart+11) counts
        for (let j = streakStart + 11; j < i; j++) {
          achieved.add(parseInt(sortedMonths[j].substring(0, 4)));
        }
      }
      streakStart = i;
    }
  }

  return achieved;
}

// ── Brevet 2000/5000 ──────────────────────────────────────────────────────────

const BREVET_TYPES: EventType[] = [
  "BRM200", "BRM300", "BRM400", "BRM600", "BRM1000", "Permanent",
];

/**
 * Returns season key "YYYY-YY" for an activity date.
 * Audax season runs Nov 1 – Oct 31. E.g. Jan 2025 → "2024-25".
 */
export function activitySeason(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 11) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

/**
 * Returns a map of audax season → total km ridden in BRM/Permanent events.
 */
export function checkBrevetKm(activities: AwardsActivity[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const a of activities) {
    if (a.dnf || !BREVET_TYPES.includes(a.eventType as EventType)) continue;
    const season = activitySeason(a.date);
    result.set(season, (result.get(season) ?? 0) + a.distance);
  }
  return result;
}

// ── 4 Provinces ───────────────────────────────────────────────────────────────

const PROVINCES = ["Ulster", "Leinster", "Munster", "Connacht"] as const;

export interface FourProvincesYear {
  met: boolean;
  provinces: Partial<Record<string, AwardsActivity[]>>;
}

/**
 * Returns a map of calendar year → whether all 4 Irish provinces were covered
 * with a 200km+ non-DNF classified event that year.
 */
export function checkFourProvinces(
  activities: AwardsActivity[]
): Map<number, FourProvincesYear> {
  const result = new Map<number, FourProvincesYear>();

  const qualifying = activities.filter(
    (a) =>
      !a.dnf &&
      a.eventType !== null &&
      a.distance >= 200 &&
      a.startRegion !== null &&
      PROVINCES.includes(a.startRegion as (typeof PROVINCES)[number])
  );

  for (const a of qualifying) {
    const year = new Date(a.date).getFullYear();
    if (!result.has(year)) result.set(year, { met: false, provinces: {} });
    const yearData = result.get(year)!;
    if (!yearData.provinces[a.startRegion!]) yearData.provinces[a.startRegion!] = [];
    yearData.provinces[a.startRegion!]!.push(a);
  }

  for (const data of result.values()) {
    data.met = PROVINCES.every((p) => (data.provinces[p]?.length ?? 0) > 0);
  }

  return result;
}

// ── Easter Flèche ─────────────────────────────────────────────────────────────

/** Compute Easter Sunday for a given year using the Anonymous Gregorian algorithm. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export interface EasterFlecheResult {
  year: number;
  activity: AwardsActivity;
}

/**
 * Returns all Flèche activities ridden during Easter weekend (Good Friday–Easter Monday).
 */
export function checkEasterFleche(
  activities: AwardsActivity[]
): EasterFlecheResult[] {
  return activities
    .filter((a) => a.eventType === "Fleche" && !a.dnf)
    .flatMap((a) => {
      const d = new Date(a.date);
      const year = d.getFullYear();
      const easter = easterSunday(year);
      const goodFriday = new Date(easter);
      goodFriday.setDate(easter.getDate() - 2);
      const easterMonday = new Date(easter);
      easterMonday.setDate(easter.getDate() + 1);
      // Compare dates only (ignore time)
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const fridayOnly = new Date(goodFriday.getFullYear(), goodFriday.getMonth(), goodFriday.getDate());
      const mondayOnly = new Date(easterMonday.getFullYear(), easterMonday.getMonth(), easterMonday.getDate());
      if (dateOnly >= fridayOnly && dateOnly <= mondayOnly) {
        return [{ year, activity: a }];
      }
      return [];
    })
    .sort((a, b) => a.year - b.year);
}

// ── 4 Nations SR / ISR ────────────────────────────────────────────────────────

const SR_DISTANCES: EventType[] = ["BRM200", "BRM300", "BRM400", "BRM600"];
const FOUR_NATIONS = ["Ireland", "England", "Scotland", "Wales"] as const;
const FOUR_NATIONS_SEASON_START = new Date("2024-11-01");

export interface NationAssignment {
  distance: EventType;
  nation: string;
  activity: AwardsActivity;
}

export interface SrNationsResult {
  met: boolean;
  assignments: NationAssignment[];
  /** Distances for which no valid activity in a unique nation was found */
  unmatched: EventType[];
}

function findSrAssignment(
  byDistance: Map<EventType, Array<{ nation: string; activity: AwardsActivity }>>
): { met: boolean; assignments: NationAssignment[] } {
  const assignments: NationAssignment[] = [];
  const usedNations = new Set<string>();

  function backtrack(idx: number): boolean {
    if (idx === SR_DISTANCES.length) return true;
    const dist = SR_DISTANCES[idx];
    for (const { nation, activity } of byDistance.get(dist) ?? []) {
      if (!usedNations.has(nation)) {
        usedNations.add(nation);
        assignments.push({ distance: dist, nation, activity });
        if (backtrack(idx + 1)) return true;
        usedNations.delete(nation);
        assignments.pop();
      }
    }
    return false;
  }

  const met = backtrack(0);
  return { met, assignments: met ? [...assignments] : [] };
}

/**
 * Check 4 Nations SR: BRM 200+300+400+600, each starting and finishing
 * in a different nation (England, Ireland, Scotland, Wales).
 * Only counts from the 2024–25 season (2024-11-01) onward.
 */
export function checkFourNations(activities: AwardsActivity[]): SrNationsResult {
  const eligible = activities.filter(
    (a) =>
      !a.dnf &&
      SR_DISTANCES.includes(a.eventType as EventType) &&
      a.startCountry !== null &&
      a.endCountry !== null &&
      new Date(a.date) >= FOUR_NATIONS_SEASON_START
  );

  const getNation = (a: AwardsActivity): string | null => {
    if (a.startCountry === "Ireland" && a.endCountry === "Ireland") return "Ireland";
    if (
      a.startCountry === "United Kingdom" &&
      a.endCountry === "United Kingdom" &&
      a.startRegion === a.endRegion &&
      a.startRegion !== null &&
      ["England", "Scotland", "Wales"].includes(a.startRegion)
    ) {
      return a.startRegion;
    }
    return null;
  };

  const byDistance = new Map<EventType, Array<{ nation: string; activity: AwardsActivity }>>();
  for (const dist of SR_DISTANCES) byDistance.set(dist, []);

  for (const a of eligible) {
    const nation = getNation(a);
    if (!nation || !FOUR_NATIONS.includes(nation as (typeof FOUR_NATIONS)[number])) continue;
    byDistance.get(a.eventType as EventType)!.push({ nation, activity: a });
  }

  const { met, assignments } = findSrAssignment(byDistance);
  const unmatched = met
    ? []
    : SR_DISTANCES.filter((d) => (byDistance.get(d)?.length ?? 0) === 0);

  return { met, assignments, unmatched };
}

/**
 * Check ISR (International SR): BRM 200+300+400+600, each starting and
 * finishing in a different country. No date restriction.
 */
export function checkIsr(activities: AwardsActivity[]): SrNationsResult {
  const eligible = activities.filter(
    (a) =>
      !a.dnf &&
      SR_DISTANCES.includes(a.eventType as EventType) &&
      a.startCountry !== null &&
      a.endCountry !== null
  );

  const byDistance = new Map<EventType, Array<{ nation: string; activity: AwardsActivity }>>();
  for (const dist of SR_DISTANCES) byDistance.set(dist, []);

  for (const a of eligible) {
    if (a.startCountry !== a.endCountry) continue; // must start+end same country
    byDistance.get(a.eventType as EventType)!.push({ nation: a.startCountry!, activity: a });
  }

  const { met, assignments } = findSrAssignment(byDistance);
  const unmatched = met
    ? []
    : SR_DISTANCES.filter((d) => (byDistance.get(d)?.length ?? 0) === 0);

  return { met, assignments, unmatched };
}

// ── International Rides ────────────────────────────────────────────────────────

/**
 * Returns all activities that are "international":
 * - Started outside Ireland (startCountry !== "Ireland" and not null), OR
 * - Manually flagged as a notable international event.
 * Excludes DNF activities. Sorted most-recent first.
 */
export function getInternationalRides(
  activities: AwardsActivity[]
): AwardsActivity[] {
  return activities
    .filter(
      (a) =>
        !a.dnf &&
        a.eventType !== null &&
        (a.isNotableInternational ||
          (a.startCountry !== null && a.startCountry !== "Ireland"))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/__tests__/awards/awards.test.ts
```

Expected: All tests pass.

**Step 5: Run the full test suite to catch regressions**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
jj describe -m "feat: add awards computation module (RRTY years, Brevet km, 4 Provinces, Easter Fleche, 4 Nations, ISR, International)"
```

---

### Task 7: Build the Awards page

**Files:**
- Create: `frontend/src/pages/AwardsPage.tsx`

**Context:** The page has four sections. Use `useLiveQuery` to get all activities from Dexie and pass them to the award functions. Each award is presented as a card in the appropriate section. Year-badge rows use a small inline component. Clicking a year badge reveals the activities for that year (expand on click). The page is read-only — no editing.

**Step 1: Create `frontend/src/pages/AwardsPage.tsx`**

```tsx
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db, type Activity } from "../db/database";
import {
  checkRrtyYears,
  checkBrevetKm,
  checkFourProvinces,
  checkEasterFleche,
  checkFourNations,
  checkIsr,
  getInternationalRides,
  type AwardsActivity,
} from "../awards/awards";
import { checkAcp5000, checkAcp10000 } from "../qualification/tracker";
import type { QualifyingActivity } from "../qualification/tracker";

function toQualifying(a: Activity): QualifyingActivity {
  return {
    stravaId: a.stravaId,
    name: a.name,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
    dnf: a.dnf,
    sourceUrl: a.sourceUrl,
  };
}

function toAwards(a: Activity): AwardsActivity {
  return {
    stravaId: a.stravaId,
    name: a.name,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
    dnf: a.dnf,
    sourceUrl: a.sourceUrl,
    startCountry: a.startCountry ?? null,
    startRegion: a.startRegion ?? null,
    endCountry: a.endCountry ?? null,
    endRegion: a.endRegion ?? null,
    isNotableInternational: a.isNotableInternational ?? false,
  };
}

// ── Year badge component ──────────────────────────────────────────────────────

function YearBadge({
  year,
  met,
  label,
}: {
  year: string | number;
  met: boolean;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        met
          ? "bg-green-100 text-green-800"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {label ?? year}
      {met ? " ✓" : " ✗"}
    </span>
  );
}

function AwardRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
      </div>
      {description && (
        <p className="mb-2 text-xs text-gray-500">{description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-gray-900">{children}</h2>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AwardsPage() {
  const activities = useLiveQuery(() => db.activities.toArray(), []);

  if (!activities) {
    return <div className="text-gray-500">Loading…</div>;
  }

  const qualifying = activities.map(toQualifying);
  const awards = activities.map(toAwards);

  const status5000 = checkAcp5000(qualifying.filter((a) => a.eventType !== null));
  const status10000 = checkAcp10000(qualifying.filter((a) => a.eventType !== null));

  const rrtyYears = checkRrtyYears(awards);
  const brevetKm = checkBrevetKm(awards);

  const fourProvinces = checkFourProvinces(awards);
  const easterFleches = checkEasterFleche(awards);

  const fourNations = checkFourNations(awards);
  const isr = checkIsr(awards);
  const internationalRides = getInternationalRides(awards);

  // Derive sorted year lists
  const allYears = Array.from(
    new Set([
      ...rrtyYears,
      ...Array.from(brevetKm.keys()).map((s) => parseInt(s.split("-")[0]) + 1),
      ...Array.from(fourProvinces.keys()),
    ])
  ).sort();

  const currentYear = new Date().getFullYear();
  const displayYears =
    allYears.length > 0
      ? allYears
      : [currentYear - 2, currentYear - 1, currentYear];

  const allSeasons = Array.from(brevetKm.keys()).sort();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Awards</h1>

      {/* ── ACP Awards ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>ACP Awards</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/qualification/5000"
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Randonneur 5000
              </h3>
              {status5000.qualified ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Qualified ✓
                </span>
              ) : (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                  {Math.round(status5000.totalKm).toLocaleString()} / 5000 km
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-orange-600">View details →</p>
          </Link>

          <Link
            to="/qualification/10000"
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Randonneur 10000
              </h3>
              {status10000.qualified ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Qualified ✓
                </span>
              ) : (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                  {Math.round(status10000.totalKm).toLocaleString()} / 10000 km
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-orange-600">View details →</p>
          </Link>
        </div>
      </section>

      {/* ── Annual Awards ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Annual Awards</SectionHeading>

        <AwardRow
          label="RRTY — Randonneur Round The Year"
          description="One 200 km+ brevet every month for 12 consecutive months."
        >
          {displayYears.map((year) => (
            <YearBadge key={year} year={year} met={rrtyYears.has(year)} />
          ))}
          {rrtyYears.size === 0 && (
            <span className="text-xs text-gray-400 italic">No completed years yet</span>
          )}
        </AwardRow>

        <AwardRow
          label="Brevet 2000"
          description="Ride 2000 km of BRM/Permanent events in an audax season (Nov–Oct)."
        >
          {allSeasons.length === 0 ? (
            <span className="text-xs text-gray-400 italic">No seasons with brevet data yet</span>
          ) : (
            allSeasons.map((season) => {
              const km = brevetKm.get(season) ?? 0;
              return (
                <YearBadge
                  key={season}
                  year={season}
                  met={km >= 2000}
                  label={`${season} (${Math.round(km)} km)`}
                />
              );
            })
          )}
        </AwardRow>

        <AwardRow
          label="Brevet 5000"
          description="Ride 5000 km of BRM/Permanent events in an audax season (Nov–Oct)."
        >
          {allSeasons.length === 0 ? (
            <span className="text-xs text-gray-400 italic">No seasons with brevet data yet</span>
          ) : (
            allSeasons.map((season) => {
              const km = brevetKm.get(season) ?? 0;
              return (
                <YearBadge
                  key={season}
                  year={season}
                  met={km >= 5000}
                  label={`${season} (${Math.round(km)} km)`}
                />
              );
            })
          )}
        </AwardRow>

        <AwardRow
          label="4 Provinces of Ireland"
          description="Start a 200 km+ brevet in each of Ulster, Leinster, Munster, and Connacht in a calendar year."
        >
          {displayYears.map((year) => {
            const data = fourProvinces.get(year);
            return (
              <YearBadge
                key={year}
                year={year}
                met={data?.met ?? false}
                label={
                  data
                    ? `${year} (${Object.keys(data.provinces).length}/4)`
                    : `${year} (0/4)`
                }
              />
            );
          })}
        </AwardRow>

        <AwardRow
          label="Easter Flèche Finisher"
          description="Complete a Flèche event during Easter weekend (Good Friday–Easter Monday)."
        >
          {easterFleches.length === 0 ? (
            <span className="text-xs text-gray-400 italic">
              No Easter Flèche completions yet
            </span>
          ) : (
            easterFleches.map(({ year, activity }) => (
              <a
                key={activity.stravaId}
                href={activity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 hover:bg-green-200"
              >
                {year} ✓
              </a>
            ))
          )}
        </AwardRow>
      </section>

      {/* ── Lifetime Awards ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Lifetime Awards</SectionHeading>

        {/* 4 Nations SR */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              4 Nations Super Randonneur
            </h3>
            {fourNations.met ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Completed ✓
              </span>
            ) : (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                In progress
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Complete BRM 200+300+400+600 with each distance starting and finishing in a different nation
            (England, Ireland, Scotland, Wales). Counts from 2024–25 season onward.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["BRM200", "BRM300", "BRM400", "BRM600"] as const).map((dist) => {
              const assignment = fourNations.assignments.find((a) => a.distance === dist);
              return (
                <div
                  key={dist}
                  className={`rounded border p-2 text-center text-xs ${
                    assignment
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="font-medium text-gray-700">{dist}</div>
                  {assignment ? (
                    <a
                      href={assignment.activity.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 hover:underline"
                    >
                      {assignment.nation}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ISR */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              International Super Randonneur (ISR)
            </h3>
            {isr.met ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Completed ✓
              </span>
            ) : (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                In progress
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Complete BRM 200+300+400+600 with each distance in a different country. No time restriction.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["BRM200", "BRM300", "BRM400", "BRM600"] as const).map((dist) => {
              const assignment = isr.assignments.find((a) => a.distance === dist);
              return (
                <div
                  key={dist}
                  className={`rounded border p-2 text-center text-xs ${
                    assignment
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="font-medium text-gray-700">{dist}</div>
                  {assignment ? (
                    <a
                      href={assignment.activity.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 hover:underline"
                    >
                      {assignment.activity.startCountry}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* International Rides */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">
            International Rides
          </h3>
          <p className="mb-3 text-xs text-gray-500">
            Brevets started outside Ireland, or manually flagged notable international events.
          </p>
          {internationalRides.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No international rides yet. Sync activities to detect rides abroad.
            </p>
          ) : (
            <ul className="space-y-1">
              {internationalRides.map((a) => (
                <li key={a.stravaId} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 tabular-nums">
                    {new Date(a.date).toLocaleDateString("en-IE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <a
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-orange-600 hover:underline"
                  >
                    {a.name}
                  </a>
                  {a.startCountry && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {a.startCountry}
                    </span>
                  )}
                  {a.isNotableInternational && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                      notable
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
jj describe -m "feat: add Awards page with all award sections"
```

---

### Task 8: Wire Awards into routing and navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Add Awards route to `frontend/src/App.tsx`**

Add import after existing page imports:
```ts
import AwardsPage from "./pages/AwardsPage";
```

Add route inside `<Route element={<Layout />}>`, after the `/activities` route:
```tsx
        <Route
          path="/awards"
          element={
            <ProtectedRoute>
              <AwardsPage />
            </ProtectedRoute>
          }
        />
```

**Step 2: Add Awards link to `frontend/src/components/Layout.tsx`**

Add after the Activities link and before Yearly Summary:
```tsx
<Link to="/awards" className="text-gray-600 hover:text-gray-900">Awards</Link>
```

**Step 3: Verify TypeScript compiles and tests pass**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: No errors, all tests pass.

**Step 4: Commit**

```bash
jj describe -m "feat: add Awards to app routing and nav bar"
```

---

## Final verification

After all tasks, run the full test suite one more time:

```bash
cd frontend && npx vitest run
```

All tests should pass. Then optionally start the dev server to visually inspect:

```bash
cd frontend && npm run dev
```

Navigate to `/awards` to verify all sections render correctly. After syncing with Strava, geocoding runs in the background — give it time (1 sec per activity with location data) before geographic awards populate.
