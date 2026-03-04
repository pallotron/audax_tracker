# Audax Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React SPA that syncs Strava activities, classifies audax rides, and tracks ACP 5000/10,000 qualification progress.

**Architecture:** Static React+TypeScript SPA on Cloudflare Pages. A single Cloudflare Worker handles Strava OAuth token exchange. All data stored in browser IndexedDB via Dexie.js. SPA calls Strava API directly using access tokens.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Dexie.js, Cloudflare Workers + Pages, Vitest + React Testing Library.

**Design doc:** `docs/plans/2026-03-04-audax-tracker-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/postcss.config.js`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/src/index.ts`
- Create: `README.md`

**Step 1: Scaffold the React frontend**

```bash
cd /Users/pallotron/code/audax
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install react-router-dom dexie dexie-react-hooks
```

**Step 2: Configure Tailwind**

In `frontend/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

In `frontend/src/index.css`:
```css
@import "tailwindcss";
```

**Step 3: Scaffold the Cloudflare Worker**

```bash
cd /Users/pallotron/code/audax
mkdir -p worker/src
cd worker
npm init -y
npm install -D wrangler typescript @cloudflare/workers-types
```

Create `worker/wrangler.toml`:
```toml
name = "audax-oauth"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
STRAVA_CLIENT_ID = ""

# Secret: STRAVA_CLIENT_SECRET (set via `wrangler secret put`)
# Secret: ALLOWED_ORIGIN (set via `wrangler secret put`)
```

Create `worker/src/index.ts` with a hello-world handler:
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("Audax OAuth Worker", { status: 200 });
  },
};

interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}
```

**Step 4: Initialize jj repo**

```bash
cd /Users/pallotron/code/audax
jj git init
```

Create `.gitignore`:
```
node_modules/
dist/
.wrangler/
.env
*.local
```

**Step 5: Verify both projects build**

```bash
cd /Users/pallotron/code/audax/frontend && npm run dev -- --host 0.0.0.0 &
# Verify it loads at http://localhost:5173
kill %1

cd /Users/pallotron/code/audax/worker && npx wrangler dev --local
# Verify it responds at http://localhost:8787
```

**Step 6: Commit**

```bash
cd /Users/pallotron/code/audax
jj describe -m "chore: scaffold React frontend and Cloudflare Worker"
```

---

## Task 2: Database Layer (Dexie.js)

**Files:**
- Create: `frontend/src/db/database.ts`
- Create: `frontend/src/db/types.ts`
- Create: `frontend/src/__tests__/db/database.test.ts`

**Step 1: Install test dependencies**

```bash
cd /Users/pallotron/code/audax/frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom fake-indexeddb
```

Add to `frontend/vite.config.ts`:
```typescript
/// <reference types="vitest" />
// ...in defineConfig:
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["fake-indexeddb/auto"],
  },
```

**Step 2: Write the failing test**

Create `frontend/src/__tests__/db/database.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db, type Activity } from "../../db/database";

beforeEach(async () => {
  await db.activities.clear();
});

describe("Activity database", () => {
  const sampleActivity: Activity = {
    stravaId: "12345",
    name: "BRM 200 Dublin",
    date: new Date("2025-06-15"),
    distance: 203.5,
    elevationGain: 1200,
    movingTime: 28800,
    elapsedTime: 32400,
    type: "Ride",
    eventType: "BRM200",
    classificationSource: "auto-name",
    manualOverride: false,
    homologationNumber: null,
  };

  it("should add and retrieve an activity", async () => {
    await db.activities.add(sampleActivity);
    const result = await db.activities.get("12345");
    expect(result).toBeDefined();
    expect(result!.name).toBe("BRM 200 Dublin");
    expect(result!.distance).toBe(203.5);
  });

  it("should query activities by year", async () => {
    await db.activities.add(sampleActivity);
    await db.activities.add({
      ...sampleActivity,
      stravaId: "12346",
      date: new Date("2024-03-01"),
    });

    const year2025 = await db.activities
      .where("date")
      .between(new Date("2025-01-01"), new Date("2026-01-01"))
      .toArray();

    expect(year2025).toHaveLength(1);
    expect(year2025[0].stravaId).toBe("12345");
  });

  it("should query activities by eventType", async () => {
    await db.activities.add(sampleActivity);
    await db.activities.add({
      ...sampleActivity,
      stravaId: "12346",
      eventType: "BRM300",
    });

    const brm200s = await db.activities
      .where("eventType")
      .equals("BRM200")
      .toArray();

    expect(brm200s).toHaveLength(1);
  });

  it("should update classification and homologation", async () => {
    await db.activities.add(sampleActivity);
    await db.activities.update("12345", {
      eventType: "BRM300",
      manualOverride: true,
      classificationSource: "manual",
      homologationNumber: "ACP-2025-12345",
    });

    const updated = await db.activities.get("12345");
    expect(updated!.eventType).toBe("BRM300");
    expect(updated!.manualOverride).toBe(true);
    expect(updated!.homologationNumber).toBe("ACP-2025-12345");
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd /Users/pallotron/code/audax/frontend
npx vitest run src/__tests__/db/database.test.ts
```

Expected: FAIL — module `../../db/database` not found.

**Step 4: Write the implementation**

Create `frontend/src/db/types.ts`:
```typescript
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
  | "Other";

export type ClassificationSource = "auto-name" | "auto-distance" | "manual";
```

Create `frontend/src/db/database.ts`:
```typescript
import Dexie, { type EntityTable } from "dexie";
import type { EventType, ClassificationSource } from "./types";

export interface Activity {
  stravaId: string;
  name: string;
  date: Date;
  distance: number;
  elevationGain: number;
  movingTime: number;
  elapsedTime: number;
  type: string;
  eventType: EventType;
  classificationSource: ClassificationSource;
  manualOverride: boolean;
  homologationNumber: string | null;
}

export const db = new Dexie("AudaxTracker") as Dexie & {
  activities: EntityTable<Activity, "stravaId">;
};

db.version(1).stores({
  activities: "stravaId, date, eventType, type",
});
```

**Step 5: Run tests to verify they pass**

```bash
cd /Users/pallotron/code/audax/frontend
npx vitest run src/__tests__/db/database.test.ts
```

Expected: all 4 tests PASS.

**Step 6: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Dexie.js database layer with Activity model"
```

---

## Task 3: Classification Engine

**Files:**
- Create: `frontend/src/classification/classifier.ts`
- Create: `frontend/src/__tests__/classification/classifier.test.ts`

**Step 1: Write the failing tests**

Create `frontend/src/__tests__/classification/classifier.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { classifyActivity, type RawActivity } from "../../classification/classifier";

const makeRaw = (overrides: Partial<RawActivity> = {}): RawActivity => ({
  name: "Morning Ride",
  distance: 50000, // 50 km in meters
  elevationGain: 500,
  ...overrides,
});

describe("classifyActivity", () => {
  describe("name-based classification", () => {
    it("detects BRM 200 from name", () => {
      const result = classifyActivity(makeRaw({ name: "BRM 200 Dublin" }));
      expect(result.eventType).toBe("BRM200");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects Brevet 300km from name", () => {
      const result = classifyActivity(makeRaw({ name: "Brevet 300km Kerry" }));
      expect(result.eventType).toBe("BRM300");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects BRM 400 from name", () => {
      const result = classifyActivity(makeRaw({ name: "BRM 400 - Cork to Dublin" }));
      expect(result.eventType).toBe("BRM400");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects BRM 600 from name", () => {
      const result = classifyActivity(makeRaw({ name: "BRM 600 Wild Atlantic" }));
      expect(result.eventType).toBe("BRM600");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects BRM 1000 from name", () => {
      const result = classifyActivity(makeRaw({ name: "BRM 1000 Ireland" }));
      expect(result.eventType).toBe("BRM1000");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects PBP from name", () => {
      const result = classifyActivity(makeRaw({ name: "Paris-Brest-Paris 2027" }));
      expect(result.eventType).toBe("PBP");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects PBP variant spelling", () => {
      const result = classifyActivity(makeRaw({ name: "PBP 2023" }));
      expect(result.eventType).toBe("PBP");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects Fleche from name", () => {
      const result = classifyActivity(makeRaw({ name: "Flèche Vélocio 2025" }));
      expect(result.eventType).toBe("Fleche");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects Fleche without accents", () => {
      const result = classifyActivity(makeRaw({ name: "Fleche Velocio" }));
      expect(result.eventType).toBe("Fleche");
      expect(result.classificationSource).toBe("auto-name");
    });

    it("detects Trace Velocio from name", () => {
      const result = classifyActivity(makeRaw({ name: "Trace Vélocio 2025" }));
      expect(result.eventType).toBe("TraceVelocio");
      expect(result.classificationSource).toBe("auto-name");
    });
  });

  describe("distance-based classification", () => {
    it("suggests BRM200 for ~200km ride", () => {
      const result = classifyActivity(makeRaw({ distance: 205000 })); // 205 km
      expect(result.eventType).toBe("BRM200");
      expect(result.classificationSource).toBe("auto-distance");
    });

    it("suggests BRM300 for ~300km ride", () => {
      const result = classifyActivity(makeRaw({ distance: 310000 }));
      expect(result.eventType).toBe("BRM300");
      expect(result.classificationSource).toBe("auto-distance");
    });

    it("suggests BRM400 for ~400km ride", () => {
      const result = classifyActivity(makeRaw({ distance: 415000 }));
      expect(result.eventType).toBe("BRM400");
      expect(result.classificationSource).toBe("auto-distance");
    });

    it("suggests BRM600 for ~600km ride", () => {
      const result = classifyActivity(makeRaw({ distance: 620000 }));
      expect(result.eventType).toBe("BRM600");
      expect(result.classificationSource).toBe("auto-distance");
    });

    it("suggests BRM1000 for ~1000km ride", () => {
      const result = classifyActivity(makeRaw({ distance: 1020000 }));
      expect(result.eventType).toBe("BRM1000");
      expect(result.classificationSource).toBe("auto-distance");
    });

    it("suggests RM1200+ for 1200km+ ride", () => {
      const result = classifyActivity(makeRaw({ distance: 1250000 }));
      expect(result.eventType).toBe("RM1200+");
      expect(result.classificationSource).toBe("auto-distance");
    });

    it("returns null for a regular short ride", () => {
      const result = classifyActivity(makeRaw({ distance: 50000 }));
      expect(result.eventType).toBeNull();
    });
  });

  describe("name takes priority over distance", () => {
    it("uses name classification even when distance doesn't match", () => {
      const result = classifyActivity(
        makeRaw({ name: "BRM 200 Dublin", distance: 215000 })
      );
      expect(result.eventType).toBe("BRM200");
      expect(result.classificationSource).toBe("auto-name");
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/pallotron/code/audax/frontend
npx vitest run src/__tests__/classification/classifier.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `frontend/src/classification/classifier.ts`:
```typescript
import type { EventType, ClassificationSource } from "../db/types";

export interface RawActivity {
  name: string;
  distance: number; // meters (as returned by Strava)
  elevationGain: number;
}

export interface ClassificationResult {
  eventType: EventType;
  classificationSource: ClassificationSource;
}

interface NamePattern {
  pattern: RegExp;
  eventType: EventType;
}

const NAME_PATTERNS: NamePattern[] = [
  { pattern: /paris[- ]brest[- ]paris|^pbp\b/i, eventType: "PBP" },
  { pattern: /fl[eè]che\s+(v[eé]locio|nationale)/i, eventType: "Fleche" },
  { pattern: /trace\s+v[eé]locio/i, eventType: "TraceVelocio" },
  { pattern: /\b(brm|brevet)\s*1000/i, eventType: "BRM1000" },
  { pattern: /\b(brm|brevet)\s*600/i, eventType: "BRM600" },
  { pattern: /\b(brm|brevet)\s*400/i, eventType: "BRM400" },
  { pattern: /\b(brm|brevet)\s*300/i, eventType: "BRM300" },
  { pattern: /\b(brm|brevet)\s*200/i, eventType: "BRM200" },
];

interface DistanceRange {
  minKm: number;
  maxKm: number;
  eventType: EventType;
}

const DISTANCE_RANGES: DistanceRange[] = [
  { minKm: 1200, maxKm: Infinity, eventType: "RM1200+" },
  { minKm: 950, maxKm: 1199, eventType: "BRM1000" },
  { minKm: 560, maxKm: 949, eventType: "BRM600" },
  { minKm: 380, maxKm: 559, eventType: "BRM400" },
  { minKm: 280, maxKm: 379, eventType: "BRM300" },
  { minKm: 195, maxKm: 279, eventType: "BRM200" },
];

export function classifyActivity(raw: RawActivity): ClassificationResult {
  // Layer 1: Name-based detection (highest priority)
  for (const { pattern, eventType } of NAME_PATTERNS) {
    if (pattern.test(raw.name)) {
      return { eventType, classificationSource: "auto-name" };
    }
  }

  // Layer 2: Distance-based heuristic
  const distanceKm = raw.distance / 1000;
  for (const { minKm, maxKm, eventType } of DISTANCE_RANGES) {
    if (distanceKm >= minKm && distanceKm <= maxKm) {
      return { eventType, classificationSource: "auto-distance" };
    }
  }

  // No match
  return { eventType: null, classificationSource: "auto-distance" };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/pallotron/code/audax/frontend
npx vitest run src/__tests__/classification/classifier.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add activity classification engine with name and distance detection"
```

---

## Task 4: Qualification Tracker Logic

**Files:**
- Create: `frontend/src/qualification/tracker.ts`
- Create: `frontend/src/__tests__/qualification/tracker.test.ts`

**Step 1: Write the failing tests**

Create `frontend/src/__tests__/qualification/tracker.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  checkAcp5000,
  checkAcp10000,
  type QualifyingActivity,
  type QualificationStatus,
} from "../../qualification/tracker";

const makeActivity = (
  overrides: Partial<QualifyingActivity>
): QualifyingActivity => ({
  stravaId: Math.random().toString(),
  date: new Date("2025-06-01"),
  distance: 200,
  elevationGain: 1000,
  eventType: "BRM200",
  ...overrides,
});

describe("checkAcp5000", () => {
  it("returns incomplete when no activities", () => {
    const result = checkAcp5000([]);
    expect(result.qualified).toBe(false);
    expect(result.totalKm).toBe(0);
    expect(result.requirements.fullBrmSeries.met).toBe(false);
    expect(result.requirements.pbp.met).toBe(false);
    expect(result.requirements.fleche.met).toBe(false);
    expect(result.requirements.totalDistance.met).toBe(false);
  });

  it("recognizes a complete full BRM series", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.requirements.fullBrmSeries.met).toBe(true);
  });

  it("requires all BRM distances for series", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      // Missing BRM1000
    ];
    const result = checkAcp5000(activities);
    expect(result.requirements.fullBrmSeries.met).toBe(false);
  });

  it("detects PBP requirement", () => {
    const activities = [makeActivity({ eventType: "PBP", distance: 1200 })];
    const result = checkAcp5000(activities);
    expect(result.requirements.pbp.met).toBe(true);
  });

  it("detects Fleche requirement", () => {
    const activities = [makeActivity({ eventType: "Fleche", distance: 360 })];
    const result = checkAcp5000(activities);
    expect(result.requirements.fleche.met).toBe(true);
  });

  it("returns qualified when all requirements met", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
      makeActivity({ eventType: "PBP", distance: 1200 }),
      makeActivity({ eventType: "Fleche", distance: 360 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.qualified).toBe(true);
    expect(result.totalKm).toBe(5060);
    expect(result.requirements.totalDistance.met).toBe(true);
  });

  it("enforces 4-year window", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, date: new Date("2020-01-01") }),
      makeActivity({ eventType: "BRM300", distance: 300, date: new Date("2020-06-01") }),
      makeActivity({ eventType: "BRM400", distance: 400, date: new Date("2021-01-01") }),
      makeActivity({ eventType: "BRM600", distance: 600, date: new Date("2021-06-01") }),
      makeActivity({ eventType: "BRM1000", distance: 1000, date: new Date("2022-01-01") }),
      makeActivity({ eventType: "PBP", distance: 1200, date: new Date("2023-08-01") }),
      makeActivity({ eventType: "Fleche", distance: 360, date: new Date("2025-01-01") }),
      makeActivity({ eventType: "BRM600", distance: 600, date: new Date("2025-06-01") }),
      makeActivity({ eventType: "BRM400", distance: 400, date: new Date("2025-06-01") }),
    ];
    const result = checkAcp5000(activities);
    // BRM200 from 2020 is outside 4-year window ending 2025
    expect(result.qualified).toBe(false);
    expect(result.requirements.fullBrmSeries.met).toBe(false);
  });
});

describe("checkAcp10000", () => {
  it("returns incomplete when no activities", () => {
    const result = checkAcp10000([]);
    expect(result.qualified).toBe(false);
    expect(result.requirements.twoBrmSeries.met).toBe(false);
    expect(result.requirements.pbp.met).toBe(false);
    expect(result.requirements.separateRm1200.met).toBe(false);
    expect(result.requirements.mountain600.met).toBe(false);
    expect(result.requirements.fleche.met).toBe(false);
    expect(result.requirements.totalDistance.met).toBe(false);
  });

  it("detects mountain 600 requirement", () => {
    const activities = [
      makeActivity({ eventType: "BRM600", distance: 600, elevationGain: 8500 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.requirements.mountain600.met).toBe(true);
  });

  it("rejects 600km with insufficient elevation", () => {
    const activities = [
      makeActivity({ eventType: "BRM600", distance: 600, elevationGain: 5000 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.requirements.mountain600.met).toBe(false);
  });

  it("requires separate RM1200+ distinct from PBP", () => {
    const activities = [
      makeActivity({ eventType: "PBP", distance: 1200 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.requirements.pbp.met).toBe(true);
    expect(result.requirements.separateRm1200.met).toBe(false);
  });

  it("detects separate RM1200+ when present alongside PBP", () => {
    const activities = [
      makeActivity({ eventType: "PBP", distance: 1200 }),
      makeActivity({ eventType: "RM1200+", distance: 1400 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.requirements.pbp.met).toBe(true);
    expect(result.requirements.separateRm1200.met).toBe(true);
  });

  it("requires two complete BRM series", () => {
    // Only one complete series
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.requirements.twoBrmSeries.met).toBe(false);
    expect(result.requirements.twoBrmSeries.seriesCount).toBe(1);
  });

  it("detects two complete BRM series", () => {
    const activities = [
      // Series 1
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
      // Series 2
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.requirements.twoBrmSeries.met).toBe(true);
    expect(result.requirements.twoBrmSeries.seriesCount).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/qualification/tracker.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `frontend/src/qualification/tracker.ts`:
```typescript
import type { EventType } from "../db/types";

export interface QualifyingActivity {
  stravaId: string;
  date: Date;
  distance: number; // km
  elevationGain: number; // meters
  eventType: EventType;
}

interface Requirement {
  met: boolean;
  details: string;
}

interface BrmSeriesRequirement extends Requirement {
  missing: EventType[];
}

interface TwoBrmSeriesRequirement extends Requirement {
  seriesCount: number;
}

interface DistanceRequirement extends Requirement {
  currentKm: number;
  targetKm: number;
}

export interface Acp5000Status {
  qualified: boolean;
  totalKm: number;
  windowStart: Date | null;
  windowEnd: Date | null;
  requirements: {
    fullBrmSeries: BrmSeriesRequirement;
    pbp: Requirement;
    fleche: Requirement;
    totalDistance: DistanceRequirement;
  };
}

export interface Acp10000Status {
  qualified: boolean;
  totalKm: number;
  windowStart: Date | null;
  windowEnd: Date | null;
  requirements: {
    twoBrmSeries: TwoBrmSeriesRequirement;
    pbp: Requirement;
    separateRm1200: Requirement;
    mountain600: Requirement;
    fleche: Requirement;
    totalDistance: DistanceRequirement;
  };
}

const BRM_DISTANCES: EventType[] = ["BRM200", "BRM300", "BRM400", "BRM600", "BRM1000"];

function findBestWindow(
  activities: QualifyingActivity[],
  windowYears: number
): QualifyingActivity[] {
  if (activities.length === 0) return [];

  const sorted = [...activities].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  let bestWindow: QualifyingActivity[] = [];
  let bestKm = 0;

  for (const startActivity of sorted) {
    const windowEnd = new Date(startActivity.date);
    windowEnd.setFullYear(windowEnd.getFullYear() + windowYears);

    const inWindow = sorted.filter(
      (a) => a.date >= startActivity.date && a.date <= windowEnd
    );

    const totalKm = inWindow.reduce((sum, a) => sum + a.distance, 0);
    if (totalKm > bestKm) {
      bestKm = totalKm;
      bestWindow = inWindow;
    }
  }

  return bestWindow;
}

function checkBrmSeries(activities: QualifyingActivity[]): BrmSeriesRequirement {
  const missing = BRM_DISTANCES.filter(
    (dist) => !activities.some((a) => a.eventType === dist)
  );
  return {
    met: missing.length === 0,
    missing,
    details:
      missing.length === 0
        ? "Full BRM series complete"
        : `Missing: ${missing.join(", ")}`,
  };
}

function countBrmSeries(activities: QualifyingActivity[]): number {
  const counts: Record<string, number> = {};
  for (const dist of BRM_DISTANCES) {
    counts[dist] = activities.filter((a) => a.eventType === dist).length;
  }
  // Number of complete series = min count across all distances
  return Math.min(...BRM_DISTANCES.map((d) => counts[d] || 0));
}

export function checkAcp5000(
  activities: QualifyingActivity[]
): Acp5000Status {
  const qualifying = activities.filter((a) => a.eventType !== null);
  const window = findBestWindow(qualifying, 4);
  const totalKm = window.reduce((sum, a) => sum + a.distance, 0);

  const brmSeries = checkBrmSeries(window);
  const hasPbp = window.some((a) => a.eventType === "PBP");
  const hasFleche = window.some((a) => a.eventType === "Fleche");

  const allMet = brmSeries.met && hasPbp && hasFleche && totalKm >= 5000;

  return {
    qualified: allMet,
    totalKm,
    windowStart: window.length > 0 ? window[0].date : null,
    windowEnd:
      window.length > 0 ? window[window.length - 1].date : null,
    requirements: {
      fullBrmSeries: brmSeries,
      pbp: {
        met: hasPbp,
        details: hasPbp ? "PBP completed" : "PBP required",
      },
      fleche: {
        met: hasFleche,
        details: hasFleche
          ? "Flèche completed"
          : "Flèche Vélocio or Nationale required",
      },
      totalDistance: {
        met: totalKm >= 5000,
        currentKm: totalKm,
        targetKm: 5000,
        details: `${totalKm.toFixed(0)} / 5,000 km`,
      },
    },
  };
}

export function checkAcp10000(
  activities: QualifyingActivity[]
): Acp10000Status {
  const qualifying = activities.filter((a) => a.eventType !== null);
  const window = findBestWindow(qualifying, 6);
  const totalKm = window.reduce((sum, a) => sum + a.distance, 0);

  const seriesCount = countBrmSeries(window);
  const hasPbp = window.some((a) => a.eventType === "PBP");
  const hasRm1200 = window.some((a) => a.eventType === "RM1200+");
  const hasMountain600 = window.some(
    (a) => a.eventType === "BRM600" && a.elevationGain >= 8000
  );
  const hasFleche = window.some((a) => a.eventType === "Fleche");

  const allMet =
    seriesCount >= 2 &&
    hasPbp &&
    hasRm1200 &&
    hasMountain600 &&
    hasFleche &&
    totalKm >= 10000;

  return {
    qualified: allMet,
    totalKm,
    windowStart: window.length > 0 ? window[0].date : null,
    windowEnd:
      window.length > 0 ? window[window.length - 1].date : null,
    requirements: {
      twoBrmSeries: {
        met: seriesCount >= 2,
        seriesCount,
        details: `${seriesCount} / 2 complete BRM series`,
      },
      pbp: {
        met: hasPbp,
        details: hasPbp ? "PBP completed" : "PBP required",
      },
      separateRm1200: {
        met: hasRm1200,
        details: hasRm1200
          ? "RM 1200+ completed"
          : "Separate RM 1200+ event required (not PBP)",
      },
      mountain600: {
        met: hasMountain600,
        details: hasMountain600
          ? "Mountain BRM 600 completed (8000m+)"
          : "BRM 600 with ≥ 8,000m elevation required",
      },
      fleche: {
        met: hasFleche,
        details: hasFleche
          ? "Flèche completed"
          : "Flèche Vélocio or Nationale required",
      },
      totalDistance: {
        met: totalKm >= 10000,
        currentKm: totalKm,
        targetKm: 10000,
        details: `${totalKm.toFixed(0)} / 10,000 km`,
      },
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/qualification/tracker.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add ACP 5000 and ACP 10000 qualification tracker"
```

---

## Task 5: Cloudflare Worker — Strava OAuth Token Exchange

**Files:**
- Modify: `worker/src/index.ts`
- Create: `worker/src/index.test.ts`

**Step 1: Install test dependencies**

```bash
cd /Users/pallotron/code/audax/worker
npm install -D vitest @cloudflare/vitest-pool-workers
```

Add `worker/vitest.config.ts`:
```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

**Step 2: Write the implementation**

Replace `worker/src/index.ts`:
```typescript
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

    // Handle CORS preflight
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
```

**Step 3: Manually verify worker runs locally**

```bash
cd /Users/pallotron/code/audax/worker
npx wrangler dev --local
# Test: curl -X POST http://localhost:8787/oauth/token -d '{"code":"test"}' -H 'Content-Type: application/json'
# Expected: error from Strava (invalid code), but 200 proxied response confirms worker works
```

**Step 4: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Cloudflare Worker for Strava OAuth token exchange"
```

---

## Task 6: Strava API Client (Browser-Side)

**Files:**
- Create: `frontend/src/strava/client.ts`
- Create: `frontend/src/strava/auth.ts`
- Create: `frontend/src/__tests__/strava/client.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/__tests__/strava/client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllActivities, mapStravaActivity } from "../../strava/client";

describe("mapStravaActivity", () => {
  it("maps Strava API response to Activity shape", () => {
    const stravaData = {
      id: 12345,
      name: "BRM 200 Dublin",
      distance: 205000, // meters
      moving_time: 28800,
      elapsed_time: 32400,
      total_elevation_gain: 1200,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-06-15T06:00:00Z",
    };

    const result = mapStravaActivity(stravaData);

    expect(result.stravaId).toBe("12345");
    expect(result.name).toBe("BRM 200 Dublin");
    expect(result.distance).toBeCloseTo(205);
    expect(result.movingTime).toBe(28800);
    expect(result.elapsedTime).toBe(32400);
    expect(result.elevationGain).toBe(1200);
    expect(result.type).toBe("Ride");
    expect(result.date).toEqual(new Date("2025-06-15T06:00:00Z"));
    // Classification should be auto-applied
    expect(result.eventType).toBe("BRM200");
    expect(result.classificationSource).toBe("auto-name");
    expect(result.manualOverride).toBe(false);
    expect(result.homologationNumber).toBeNull();
  });
});

describe("fetchAllActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("paginates through all pages", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      name: `Ride ${i}`,
      distance: 50000,
      moving_time: 3600,
      elapsed_time: 4000,
      total_elevation_gain: 100,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-01-01T00:00:00Z",
    }));
    const page2 = [page1[0]]; // 1 item = last page

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify(callCount === 1 ? page1 : page2));
    });

    const results = await fetchAllActivities("fake-token");
    expect(callCount).toBe(2);
    expect(results).toHaveLength(201);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/strava/client.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `frontend/src/strava/auth.ts`:
```typescript
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

const TOKEN_KEY = "audax_strava_tokens";

export function getStravaAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "read,activity:read_all",
    approval_prompt: "auto",
  });
  return `${STRAVA_AUTH_URL}?${params}`;
}

export async function exchangeCode(
  workerUrl: string,
  code: string
): Promise<StravaTokens> {
  const response = await fetch(`${workerUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }
  return response.json();
}

export async function refreshAccessToken(
  workerUrl: string,
  refreshToken: string
): Promise<StravaTokens> {
  const response = await fetch(`${workerUrl}/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }
  return response.json();
}

export function saveTokens(tokens: StravaTokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function loadTokens(): StravaTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isTokenExpired(tokens: StravaTokens): boolean {
  return Date.now() / 1000 >= tokens.expires_at;
}
```

Create `frontend/src/strava/client.ts`:
```typescript
import type { Activity } from "../db/database";
import { classifyActivity } from "../classification/classifier";

const STRAVA_API = "https://www.strava.com/api/v3";

export interface StravaActivityResponse {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
}

export function mapStravaActivity(raw: StravaActivityResponse): Activity {
  const classification = classifyActivity({
    name: raw.name,
    distance: raw.distance,
    elevationGain: raw.total_elevation_gain,
  });

  return {
    stravaId: String(raw.id),
    name: raw.name,
    date: new Date(raw.start_date),
    distance: raw.distance / 1000, // convert to km
    elevationGain: raw.total_elevation_gain,
    movingTime: raw.moving_time,
    elapsedTime: raw.elapsed_time,
    type: raw.type,
    eventType: classification.eventType,
    classificationSource: classification.classificationSource,
    manualOverride: false,
    homologationNumber: null,
  };
}

export async function fetchAllActivities(
  accessToken: string,
  after?: number
): Promise<Activity[]> {
  const activities: Activity[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (after) {
      params.set("after", String(after));
    }

    const response = await fetch(
      `${STRAVA_API}/athlete/activities?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`);
    }

    const data: StravaActivityResponse[] = await response.json();
    activities.push(...data.map(mapStravaActivity));

    if (data.length < perPage) break;
    page++;
  }

  return activities;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/strava/client.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Strava API client with auth helpers and activity fetching"
```

---

## Task 7: React App Shell — Routing and Layout

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/ActivitiesPage.tsx`
- Create: `frontend/src/pages/YearlySummaryPage.tsx`
- Create: `frontend/src/pages/QualificationDetailPage.tsx`
- Create: `frontend/src/pages/OAuthCallbackPage.tsx`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/config.ts`

**Step 1: Create config**

Create `frontend/src/config.ts`:
```typescript
export const config = {
  stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL as string,
  redirectUri: `${window.location.origin}/callback`,
};
```

Create `frontend/.env.example`:
```
VITE_STRAVA_CLIENT_ID=your_strava_client_id
VITE_OAUTH_WORKER_URL=http://localhost:8787
```

**Step 2: Create AuthContext**

Create `frontend/src/context/AuthContext.tsx`:
```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  loadTokens,
  saveTokens,
  clearTokens,
  isTokenExpired,
  refreshAccessToken,
  type StravaTokens,
} from "../strava/auth";
import { config } from "../config";

interface AuthContextValue {
  tokens: StravaTokens | null;
  isAuthenticated: boolean;
  login: (tokens: StravaTokens) => void;
  logout: () => void;
  getAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<StravaTokens | null>(loadTokens);

  const login = (newTokens: StravaTokens) => {
    saveTokens(newTokens);
    setTokens(newTokens);
  };

  const logout = () => {
    clearTokens();
    setTokens(null);
  };

  const getAccessToken = async (): Promise<string> => {
    if (!tokens) throw new Error("Not authenticated");
    if (!isTokenExpired(tokens)) return tokens.access_token;

    const refreshed = await refreshAccessToken(
      config.oauthWorkerUrl,
      tokens.refresh_token
    );
    login(refreshed);
    return refreshed.access_token;
  };

  return (
    <AuthContext.Provider
      value={{ tokens, isAuthenticated: !!tokens, login, logout, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

**Step 3: Create Layout component**

Create `frontend/src/components/Layout.tsx`:
```tsx
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { isAuthenticated, logout, tokens } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-orange-600">
            Audax Tracker
          </Link>
          {isAuthenticated && (
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link to="/activities" className="text-gray-600 hover:text-gray-900">
                Activities
              </Link>
              <Link to="/yearly" className="text-gray-600 hover:text-gray-900">
                Yearly Summary
              </Link>
              <span className="text-sm text-gray-500">
                {tokens?.athlete.firstname}
              </span>
              <button
                onClick={logout}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 4: Create page stubs**

Create `frontend/src/pages/LoginPage.tsx`:
```tsx
import { getStravaAuthUrl } from "../strava/auth";
import { config } from "../config";

export function LoginPage() {
  const authUrl = getStravaAuthUrl(config.stravaClientId, config.redirectUri);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h1 className="text-4xl font-bold text-gray-900">Audax Tracker</h1>
      <p className="text-lg text-gray-600">
        Track your ACP 5000 and 10,000 qualification progress
      </p>
      <a
        href={authUrl}
        className="bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 transition"
      >
        Connect with Strava
      </a>
    </div>
  );
}
```

Create `frontend/src/pages/OAuthCallbackPage.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeCode } from "../strava/auth";
import { useAuth } from "../context/AuthContext";
import { config } from "../config";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("No authorization code received");
      return;
    }

    exchangeCode(config.oauthWorkerUrl, code)
      .then((tokens) => {
        login(tokens);
        navigate("/dashboard");
      })
      .catch((err) => setError(err.message));
  }, [searchParams, login, navigate]);

  if (error) {
    return (
      <div className="text-center mt-20">
        <p className="text-red-600">Authentication failed: {error}</p>
        <a href="/" className="text-blue-600 underline mt-4 block">
          Try again
        </a>
      </div>
    );
  }

  return (
    <div className="text-center mt-20">
      <p className="text-gray-600">Connecting to Strava...</p>
    </div>
  );
}
```

Create `frontend/src/pages/DashboardPage.tsx`:
```tsx
export function DashboardPage() {
  return <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-gray-600 mt-2">Coming in Task 8</p></div>;
}
```

Create `frontend/src/pages/ActivitiesPage.tsx`:
```tsx
export function ActivitiesPage() {
  return <div><h1 className="text-2xl font-bold">Activities</h1><p className="text-gray-600 mt-2">Coming in Task 9</p></div>;
}
```

Create `frontend/src/pages/YearlySummaryPage.tsx`:
```tsx
export function YearlySummaryPage() {
  return <div><h1 className="text-2xl font-bold">Yearly Summary</h1><p className="text-gray-600 mt-2">Coming in Task 10</p></div>;
}
```

Create `frontend/src/pages/QualificationDetailPage.tsx`:
```tsx
export function QualificationDetailPage() {
  return <div><h1 className="text-2xl font-bold">Qualification Detail</h1><p className="text-gray-600 mt-2">Coming in Task 11</p></div>;
}
```

**Step 5: Wire up App.tsx with routing**

Replace `frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { YearlySummaryPage } from "./pages/YearlySummaryPage";
import { QualificationDetailPage } from "./pages/QualificationDetailPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
          }
        />
        <Route path="/callback" element={<OAuthCallbackPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/activities" element={<ProtectedRoute><ActivitiesPage /></ProtectedRoute>} />
        <Route path="/yearly" element={<ProtectedRoute><YearlySummaryPage /></ProtectedRoute>} />
        <Route path="/qualification/:type" element={<ProtectedRoute><QualificationDetailPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

**Step 6: Verify it compiles and renders**

```bash
cd /Users/pallotron/code/audax/frontend
npm run build
```

Expected: builds without errors.

**Step 7: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add React app shell with routing, auth context, and page stubs"
```

---

## Task 8: Dashboard Page — Sync + Qualification Overview

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/hooks/useSync.ts`
- Create: `frontend/src/components/QualificationCard.tsx`
- Create: `frontend/src/components/ProgressBar.tsx`

**Step 1: Create ProgressBar component**

Create `frontend/src/components/ProgressBar.tsx`:
```tsx
interface ProgressBarProps {
  current: number;
  target: number;
  label: string;
}

export function ProgressBar({ current, target, label }: ProgressBarProps) {
  const pct = Math.min((current / target) * 100, 100);

  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        <span>{current.toLocaleString()} / {target.toLocaleString()} km</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-orange-500 h-3 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

**Step 2: Create QualificationCard component**

Create `frontend/src/components/QualificationCard.tsx`:
```tsx
import { Link } from "react-router-dom";
import { ProgressBar } from "./ProgressBar";

interface Requirement {
  label: string;
  met: boolean;
  details: string;
}

interface QualificationCardProps {
  title: string;
  type: "5000" | "10000";
  qualified: boolean;
  totalKm: number;
  targetKm: number;
  requirements: Requirement[];
}

export function QualificationCard({
  title,
  type,
  qualified,
  totalKm,
  targetKm,
  requirements,
}: QualificationCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        {qualified ? (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
            Qualified
          </span>
        ) : (
          <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            In Progress
          </span>
        )}
      </div>

      <ProgressBar current={totalKm} target={targetKm} label="Total Distance" />

      <ul className="mt-4 space-y-2">
        {requirements.map((req) => (
          <li key={req.label} className="flex items-center gap-2 text-sm">
            <span className={req.met ? "text-green-600" : "text-gray-400"}>
              {req.met ? "\u2713" : "\u25CB"}
            </span>
            <span className={req.met ? "text-gray-900" : "text-gray-500"}>
              {req.label}
            </span>
            <span className="text-gray-400 ml-auto text-xs">{req.details}</span>
          </li>
        ))}
      </ul>

      <Link
        to={`/qualification/${type}`}
        className="mt-4 block text-center text-orange-600 hover:text-orange-800 text-sm font-medium"
      >
        View Details
      </Link>
    </div>
  );
}
```

**Step 3: Create useSync hook**

Create `frontend/src/hooks/useSync.ts`:
```tsx
import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchAllActivities } from "../strava/client";
import { db } from "../db/database";

const LAST_SYNC_KEY = "audax_last_sync";

export function useSync() {
  const { getAccessToken } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const lastSync = localStorage.getItem(LAST_SYNC_KEY);
      const after = lastSync ? Math.floor(new Date(lastSync).getTime() / 1000) : undefined;

      const activities = await fetchAllActivities(token, after);

      // Upsert: preserve manual overrides
      for (const activity of activities) {
        const existing = await db.activities.get(activity.stravaId);
        if (existing?.manualOverride) {
          // Keep user's classification, update Strava fields
          await db.activities.update(activity.stravaId, {
            name: activity.name,
            distance: activity.distance,
            elevationGain: activity.elevationGain,
            movingTime: activity.movingTime,
            elapsedTime: activity.elapsedTime,
          });
        } else {
          await db.activities.put(activity);
        }
      }

      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [getAccessToken]);

  return { sync, syncing, error };
}
```

**Step 4: Implement DashboardPage**

Replace `frontend/src/pages/DashboardPage.tsx`:
```tsx
import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { checkAcp5000, checkAcp10000, type QualifyingActivity } from "../qualification/tracker";
import { useSync } from "../hooks/useSync";
import { QualificationCard } from "../components/QualificationCard";

export function DashboardPage() {
  const { sync, syncing, error } = useSync();

  const activities = useLiveQuery(() => db.activities.toArray());

  // Auto-sync on first visit if no data
  useEffect(() => {
    if (activities && activities.length === 0) {
      sync();
    }
  }, [activities?.length]);

  const qualifying: QualifyingActivity[] = (activities ?? [])
    .filter((a) => a.eventType !== null)
    .map((a) => ({
      stravaId: a.stravaId,
      date: a.date,
      distance: a.distance,
      elevationGain: a.elevationGain,
      eventType: a.eventType,
    }));

  const acp5000 = checkAcp5000(qualifying);
  const acp10000 = checkAcp10000(qualifying);

  const currentYear = new Date().getFullYear();
  const thisYearActivities = (activities ?? []).filter(
    (a) => a.date.getFullYear() === currentYear && a.eventType !== null
  );
  const thisYearKm = thisYearActivities.reduce((s, a) => s + a.distance, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={sync}
          disabled={syncing}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition"
        >
          {syncing ? "Syncing..." : "Sync from Strava"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Year summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">{currentYear} Summary</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {thisYearActivities.length}
            </div>
            <div className="text-sm text-gray-500">Audax Rides</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {thisYearKm.toFixed(0)}
            </div>
            <div className="text-sm text-gray-500">km</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {(activities ?? []).length}
            </div>
            <div className="text-sm text-gray-500">Total Synced</div>
          </div>
        </div>
      </div>

      {/* Qualification cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <QualificationCard
          title="ACP Randonneur 5000"
          type="5000"
          qualified={acp5000.qualified}
          totalKm={acp5000.totalKm}
          targetKm={5000}
          requirements={[
            { label: "Full BRM Series", ...acp5000.requirements.fullBrmSeries },
            { label: "Paris-Brest-Paris", ...acp5000.requirements.pbp },
            { label: "Flèche", ...acp5000.requirements.fleche },
          ]}
        />
        <QualificationCard
          title="ACP Randonneur 10,000"
          type="10000"
          qualified={acp10000.qualified}
          totalKm={acp10000.totalKm}
          targetKm={10000}
          requirements={[
            { label: "2x BRM Series", ...acp10000.requirements.twoBrmSeries },
            { label: "Paris-Brest-Paris", ...acp10000.requirements.pbp },
            { label: "RM 1200+ (separate)", ...acp10000.requirements.separateRm1200 },
            { label: "Mountain 600 (8000m+)", ...acp10000.requirements.mountain600 },
            { label: "Flèche", ...acp10000.requirements.fleche },
          ]}
        />
      </div>
    </div>
  );
}
```

**Step 5: Verify it compiles**

```bash
cd /Users/pallotron/code/audax/frontend && npm run build
```

**Step 6: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Dashboard with Strava sync and qualification cards"
```

---

## Task 9: Activities Page — Table with Inline Editing

**Files:**
- Modify: `frontend/src/pages/ActivitiesPage.tsx`
- Create: `frontend/src/components/ActivityRow.tsx`
- Create: `frontend/src/components/EventTypeBadge.tsx`

**Step 1: Create EventTypeBadge**

Create `frontend/src/components/EventTypeBadge.tsx`:
```tsx
import type { EventType, ClassificationSource } from "../db/types";

interface EventTypeBadgeProps {
  eventType: EventType;
  source: ClassificationSource;
}

const COLORS: Record<string, string> = {
  BRM200: "bg-blue-100 text-blue-800",
  BRM300: "bg-indigo-100 text-indigo-800",
  BRM400: "bg-purple-100 text-purple-800",
  BRM600: "bg-pink-100 text-pink-800",
  BRM1000: "bg-red-100 text-red-800",
  PBP: "bg-yellow-100 text-yellow-800",
  "RM1200+": "bg-orange-100 text-orange-800",
  Fleche: "bg-green-100 text-green-800",
  Other: "bg-gray-100 text-gray-800",
};

export function EventTypeBadge({ eventType, source }: EventTypeBadgeProps) {
  if (!eventType) return <span className="text-gray-400 text-sm">-</span>;

  const color = COLORS[eventType] ?? "bg-gray-100 text-gray-800";
  const sourceIcon = source === "manual" ? " (manual)" : source === "auto-name" ? " (name)" : " (dist)";

  return (
    <span className={`${color} px-2 py-0.5 rounded text-xs font-medium`}>
      {eventType}
      <span className="opacity-60">{sourceIcon}</span>
    </span>
  );
}
```

**Step 2: Create ActivityRow**

Create `frontend/src/components/ActivityRow.tsx`:
```tsx
import { useState } from "react";
import type { Activity } from "../db/database";
import type { EventType } from "../db/types";
import { db } from "../db/database";
import { EventTypeBadge } from "./EventTypeBadge";

const EVENT_TYPE_OPTIONS: EventType[] = [
  null, "BRM200", "BRM300", "BRM400", "BRM600", "BRM1000",
  "PBP", "RM1200+", "Fleche", "SuperRandonneur", "TraceVelocio",
  "FlecheDeFrance", "Other",
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function ActivityRow({ activity }: { activity: Activity }) {
  const [editing, setEditing] = useState(false);
  const [eventType, setEventType] = useState(activity.eventType);
  const [homologation, setHomologation] = useState(activity.homologationNumber ?? "");

  const save = async () => {
    await db.activities.update(activity.stravaId, {
      eventType,
      homologationNumber: homologation || null,
      manualOverride: true,
      classificationSource: "manual",
    });
    setEditing(false);
  };

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-4 py-3 text-sm">{activity.date.toLocaleDateString()}</td>
      <td className="px-4 py-3 text-sm font-medium">{activity.name}</td>
      <td className="px-4 py-3 text-sm text-right">{activity.distance.toFixed(1)}</td>
      <td className="px-4 py-3 text-sm text-right">{activity.elevationGain.toFixed(0)}</td>
      <td className="px-4 py-3 text-sm text-right">{formatDuration(activity.movingTime)}</td>
      <td className="px-4 py-3 text-sm text-right">{formatDuration(activity.elapsedTime)}</td>
      <td className="px-4 py-3 text-sm">
        {editing ? (
          <select
            value={eventType ?? ""}
            onChange={(e) => setEventType((e.target.value || null) as EventType)}
            className="border rounded px-1 py-0.5 text-xs"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt ?? "none"} value={opt ?? ""}>
                {opt ?? "None"}
              </option>
            ))}
          </select>
        ) : (
          <EventTypeBadge eventType={activity.eventType} source={activity.classificationSource} />
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {editing ? (
          <input
            value={homologation}
            onChange={(e) => setHomologation(e.target.value)}
            placeholder="ACP-..."
            className="border rounded px-2 py-0.5 text-xs w-28"
          />
        ) : (
          <span className="text-gray-500 text-xs">{activity.homologationNumber ?? "-"}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {editing ? (
          <div className="flex gap-1">
            <button onClick={save} className="text-green-600 text-xs hover:underline">Save</button>
            <button onClick={() => setEditing(false)} className="text-gray-400 text-xs hover:underline">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-orange-600 text-xs hover:underline">Edit</button>
        )}
      </td>
    </tr>
  );
}
```

**Step 3: Implement ActivitiesPage**

Replace `frontend/src/pages/ActivitiesPage.tsx`:
```tsx
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { ActivityRow } from "../components/ActivityRow";
import { useSync } from "../hooks/useSync";
import type { EventType } from "../db/types";

export function ActivitiesPage() {
  const { sync, syncing } = useSync();
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");

  const activities = useLiveQuery(() =>
    db.activities.orderBy("date").reverse().toArray()
  );

  const years = [...new Set((activities ?? []).map((a) => a.date.getFullYear()))].sort(
    (a, b) => b - a
  );

  const filtered = (activities ?? []).filter((a) => {
    if (yearFilter !== "all" && a.date.getFullYear() !== yearFilter) return false;
    if (typeFilter !== "all" && a.eventType !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Activities</h1>
        <button
          onClick={sync}
          disabled={syncing}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync from Strava"}
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <select
          value={yearFilter}
          onChange={(e) =>
            setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))
          }
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="all">All Years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={typeFilter ?? "all"}
          onChange={(e) =>
            setTypeFilter(e.target.value === "all" ? "all" : (e.target.value as EventType))
          }
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="all">All Types</option>
          <option value="BRM200">BRM 200</option>
          <option value="BRM300">BRM 300</option>
          <option value="BRM400">BRM 400</option>
          <option value="BRM600">BRM 600</option>
          <option value="BRM1000">BRM 1000</option>
          <option value="PBP">PBP</option>
          <option value="RM1200+">RM 1200+</option>
          <option value="Fleche">Flèche</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Km</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Elev (m)</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Moving</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Elapsed</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Homologation</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <ActivityRow key={a.stravaId} activity={a} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            {(activities ?? []).length === 0
              ? "No activities synced yet. Click 'Sync from Strava' to get started."
              : "No activities match your filters."}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Verify it compiles**

```bash
cd /Users/pallotron/code/audax/frontend && npm run build
```

**Step 5: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Activities page with table, filters, and inline editing"
```

---

## Task 10: Yearly Summary Page

**Files:**
- Modify: `frontend/src/pages/YearlySummaryPage.tsx`

**Step 1: Implement YearlySummaryPage**

Replace `frontend/src/pages/YearlySummaryPage.tsx`:
```tsx
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { EventTypeBadge } from "../components/EventTypeBadge";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function YearlySummaryPage() {
  const activities = useLiveQuery(() => db.activities.orderBy("date").toArray());

  const years = [
    ...new Set((activities ?? []).map((a) => a.date.getFullYear())),
  ].sort((a, b) => b - a);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? years[0] ?? new Date().getFullYear();

  const yearActivities = (activities ?? []).filter(
    (a) => a.date.getFullYear() === year && a.eventType !== null
  );

  const totalKm = yearActivities.reduce((s, a) => s + a.distance, 0);
  const totalElev = yearActivities.reduce((s, a) => s + a.elevationGain, 0);
  const totalMoving = yearActivities.reduce((s, a) => s + a.movingTime, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Yearly Summary</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              y === year
                ? "bg-orange-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-orange-600">{year}</div>
            <div className="text-sm text-gray-500">Year</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {yearActivities.length}
            </div>
            <div className="text-sm text-gray-500">Audax Rides</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {totalKm.toFixed(0)}
            </div>
            <div className="text-sm text-gray-500">km</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {totalElev.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">m elevation</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Km</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Elev</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Time</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Homologation</th>
            </tr>
          </thead>
          <tbody>
            {yearActivities.map((a) => (
              <tr key={a.stravaId} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{a.date.toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm font-medium">{a.name}</td>
                <td className="px-4 py-3 text-sm text-right">{a.distance.toFixed(1)}</td>
                <td className="px-4 py-3 text-sm text-right">{a.elevationGain.toFixed(0)}</td>
                <td className="px-4 py-3 text-sm text-right">{formatDuration(a.elapsedTime)}</td>
                <td className="px-4 py-3 text-sm">
                  <EventTypeBadge eventType={a.eventType} source={a.classificationSource} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {a.homologationNumber ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {yearActivities.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            No audax rides recorded for {year}.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/pallotron/code/audax/frontend && npm run build
```

**Step 3: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Yearly Summary page with year selector and stats"
```

---

## Task 11: Qualification Detail Page

**Files:**
- Modify: `frontend/src/pages/QualificationDetailPage.tsx`

**Step 1: Implement QualificationDetailPage**

Replace `frontend/src/pages/QualificationDetailPage.tsx`:
```tsx
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import {
  checkAcp5000,
  checkAcp10000,
  type QualifyingActivity,
} from "../qualification/tracker";
import { ProgressBar } from "../components/ProgressBar";
import { EventTypeBadge } from "../components/EventTypeBadge";

export function QualificationDetailPage() {
  const { type } = useParams<{ type: string }>();
  const is5000 = type === "5000";
  const title = is5000 ? "ACP Randonneur 5000" : "ACP Randonneur 10,000";
  const windowYears = is5000 ? 4 : 6;

  const activities = useLiveQuery(() => db.activities.toArray());

  const qualifying: QualifyingActivity[] = (activities ?? [])
    .filter((a) => a.eventType !== null)
    .map((a) => ({
      stravaId: a.stravaId,
      date: a.date,
      distance: a.distance,
      elevationGain: a.elevationGain,
      eventType: a.eventType,
    }));

  const status = is5000 ? checkAcp5000(qualifying) : checkAcp10000(qualifying);

  const requirements = is5000
    ? [
        { label: "Full BRM Series (200+300+400+600+1000)", ...(status as ReturnType<typeof checkAcp5000>).requirements.fullBrmSeries },
        { label: "Paris-Brest-Paris", ...status.requirements.pbp },
        { label: "Flèche Vélocio / Nationale", ...status.requirements.fleche },
      ]
    : [
        { label: "2x Full BRM Series", ...(status as ReturnType<typeof checkAcp10000>).requirements.twoBrmSeries },
        { label: "Paris-Brest-Paris", ...status.requirements.pbp },
        { label: "RM 1200+ (separate from PBP)", ...(status as ReturnType<typeof checkAcp10000>).requirements.separateRm1200 },
        { label: "Mountain BRM 600 (8000m+)", ...(status as ReturnType<typeof checkAcp10000>).requirements.mountain600 },
        { label: "Flèche Vélocio / Nationale", ...status.requirements.fleche },
      ];

  // Get activities in the best window for display
  const windowActivities = (activities ?? [])
    .filter((a) => a.eventType !== null)
    .filter((a) => {
      if (!status.windowStart || !status.windowEnd) return false;
      return a.date >= status.windowStart && a.date <= status.windowEnd;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-gray-500 mb-6">
        {windowYears}-year qualifying window
        {status.windowStart &&
          ` | Best window: ${status.windowStart.toLocaleDateString()} — ${status.windowEnd?.toLocaleDateString()}`}
      </p>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          {status.qualified ? (
            <span className="bg-green-100 text-green-800 px-4 py-2 rounded-full font-semibold">
              QUALIFIED
            </span>
          ) : (
            <span className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full font-semibold">
              IN PROGRESS
            </span>
          )}
          <span className="text-gray-500">
            {status.totalKm.toFixed(0)} km total qualifying distance
          </span>
        </div>

        <ProgressBar
          current={status.totalKm}
          target={is5000 ? 5000 : 10000}
          label="Distance Progress"
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Requirements Checklist</h2>
        <ul className="space-y-3">
          {requirements.map((req) => (
            <li
              key={req.label}
              className="flex items-start gap-3 p-3 rounded-lg border"
            >
              <span
                className={`text-xl mt-0.5 ${
                  req.met ? "text-green-500" : "text-gray-300"
                }`}
              >
                {req.met ? "\u2713" : "\u25CB"}
              </span>
              <div>
                <div className={`font-medium ${req.met ? "" : "text-gray-500"}`}>
                  {req.label}
                </div>
                <div className="text-sm text-gray-400">{req.details}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">
          Qualifying Events in Window ({windowActivities.length})
        </h2>
        {windowActivities.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b">
              <tr>
                <th className="px-3 py-2 text-xs text-gray-500 uppercase">Date</th>
                <th className="px-3 py-2 text-xs text-gray-500 uppercase">Name</th>
                <th className="px-3 py-2 text-xs text-gray-500 uppercase text-right">Km</th>
                <th className="px-3 py-2 text-xs text-gray-500 uppercase text-right">Elev</th>
                <th className="px-3 py-2 text-xs text-gray-500 uppercase">Type</th>
              </tr>
            </thead>
            <tbody>
              {windowActivities.map((a) => (
                <tr key={a.stravaId} className="border-b">
                  <td className="px-3 py-2 text-sm">{a.date.toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-sm">{a.name}</td>
                  <td className="px-3 py-2 text-sm text-right">{a.distance.toFixed(1)}</td>
                  <td className="px-3 py-2 text-sm text-right">{a.elevationGain.toFixed(0)}</td>
                  <td className="px-3 py-2 text-sm">
                    <EventTypeBadge eventType={a.eventType} source={a.classificationSource} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400">No qualifying events found.</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/pallotron/code/audax/frontend && npm run build
```

**Step 3: Commit**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "feat: add Qualification Detail page with checklist and event timeline"
```

---

## Task 12: End-to-End Manual Testing & Polish

**Files:**
- Create: `frontend/.env.local` (from `.env.example`, with real Strava credentials)

**Step 1: Set up Strava API app**

1. Go to https://www.strava.com/settings/api
2. Create app, get `client_id` and `client_secret`
3. Set callback domain to `localhost`

**Step 2: Configure environment**

```bash
cd /Users/pallotron/code/audax/frontend
cp .env.example .env.local
# Edit .env.local with real VITE_STRAVA_CLIENT_ID
```

```bash
cd /Users/pallotron/code/audax/worker
npx wrangler secret put STRAVA_CLIENT_SECRET
# Enter your client secret
npx wrangler secret put ALLOWED_ORIGIN
# Enter: http://localhost:5173
```

Update `worker/wrangler.toml` `STRAVA_CLIENT_ID` with your real client ID.

**Step 3: Run both services locally**

```bash
# Terminal 1: Worker
cd /Users/pallotron/code/audax/worker && npx wrangler dev --local

# Terminal 2: Frontend
cd /Users/pallotron/code/audax/frontend && npm run dev
```

**Step 4: Test the full flow**

1. Open http://localhost:5173
2. Click "Connect with Strava" → authorize → redirect back
3. Verify activities sync and auto-classify
4. Test inline editing on Activities page
5. Check Yearly Summary page
6. Check Qualification Detail pages for /qualification/5000 and /qualification/10000

**Step 5: Commit any fixes**

```bash
cd /Users/pallotron/code/audax
jj new
jj describe -m "chore: end-to-end testing and polish"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | `frontend/`, `worker/` |
| 2 | Dexie.js database layer | `frontend/src/db/` |
| 3 | Classification engine | `frontend/src/classification/` |
| 4 | Qualification tracker | `frontend/src/qualification/` |
| 5 | OAuth Worker | `worker/src/index.ts` |
| 6 | Strava API client | `frontend/src/strava/` |
| 7 | React app shell + routing | `frontend/src/App.tsx`, pages, components |
| 8 | Dashboard page | `frontend/src/pages/DashboardPage.tsx` |
| 9 | Activities page | `frontend/src/pages/ActivitiesPage.tsx` |
| 10 | Yearly Summary page | `frontend/src/pages/YearlySummaryPage.tsx` |
| 11 | Qualification Detail page | `frontend/src/pages/QualificationDetailPage.tsx` |
| 12 | E2E testing & polish | Manual testing |
