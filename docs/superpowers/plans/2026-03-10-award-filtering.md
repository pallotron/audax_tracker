# Award Filtering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unconfirmed (distance-classified) rides and manually excluded rides from counting toward Audax award calculations.

**Architecture:** Add `excludeFromAwards: boolean` to the Activity model and an `isAwardEligible()` helper in the classifier. Update all award calculation filters to use this helper. Add an Awards icon column to the Activities table (with inline popover for unconfirmed rides and bulk actions). Show a contextual banner on award pages when unconfirmed rides are not being counted. Add a one-time migration notice on the Dashboard.

**Tech Stack:** React 18, TypeScript, Dexie.js (IndexedDB), Tailwind CSS, Vitest

---

## Chunk 1: Core logic — types, DB, helper, calculation filters

### Task 1: Add `excludeFromAwards` to Activity and DB schema

**Files:**
- Modify: `frontend/src/db/database.ts`

- [ ] **Step 1: Write the failing test**

In `frontend/src/__tests__/db/database.test.ts`, add after the existing tests:

```typescript
it("should default excludeFromAwards to false on existing activities after migration", async () => {
  // Insert a record without the field (simulating a pre-migration record)
  await db.activities.add({
    ...sampleActivity,
    stravaId: "exclude-migration-test",
  } as Activity);

  const result = await db.activities.get("exclude-migration-test");
  expect(result).toBeDefined();
  expect(result!.excludeFromAwards).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "excludeFromAwards"
```

Expected: compile error or test failure — `excludeFromAwards` does not exist yet.

- [ ] **Step 3: Add `excludeFromAwards` to the Activity interface**

In `frontend/src/db/database.ts`, add the field to the `Activity` interface after `dnf`:

```typescript
  dnf: boolean;
  excludeFromAwards: boolean;
```

- [ ] **Step 4: Add DB version 7 migration**

Append after the `db.version(6)` block:

```typescript
db.version(7).stores({
  activities: "stravaId, date, eventType, type, startCountry, startRegion",
}).upgrade(tx => {
  return tx.table("activities").toCollection().modify(activity => {
    if (activity.excludeFromAwards === undefined) {
      activity.excludeFromAwards = false;
    }
  });
});
```

- [ ] **Step 5: Update the `sampleActivity` fixture in the database test**

In `frontend/src/__tests__/db/database.test.ts`, add `excludeFromAwards: false` to `sampleActivity`:

```typescript
  isNotableInternational: false,
  excludeFromAwards: false,
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: add excludeFromAwards field to Activity (DB schema v7)"
jj new
```

---

### Task 2: Add bulk DB helpers for exclude/include

**Files:**
- Modify: `frontend/src/db/database.ts`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/__tests__/db/database.test.ts`, import `bulkExcludeFromAwards` and `bulkIncludeInAwards`, then add:

```typescript
describe("bulkExcludeFromAwards / bulkIncludeInAwards", () => {
  it("sets excludeFromAwards to true for all given ids", async () => {
    await db.activities.add({ ...sampleActivity, stravaId: "ex-1", excludeFromAwards: false });
    await db.activities.add({ ...sampleActivity, stravaId: "ex-2", excludeFromAwards: false });

    await bulkExcludeFromAwards(["ex-1", "ex-2"]);

    const a1 = await db.activities.get("ex-1");
    const a2 = await db.activities.get("ex-2");
    expect(a1!.excludeFromAwards).toBe(true);
    expect(a2!.excludeFromAwards).toBe(true);
  });

  it("clears excludeFromAwards for all given ids", async () => {
    await db.activities.add({ ...sampleActivity, stravaId: "inc-1", excludeFromAwards: true });

    await bulkIncludeInAwards(["inc-1"]);

    const a1 = await db.activities.get("inc-1");
    expect(a1!.excludeFromAwards).toBe(false);
  });

  it("is a no-op for empty array", async () => {
    await expect(bulkExcludeFromAwards([])).resolves.not.toThrow();
    await expect(bulkIncludeInAwards([])).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "bulkExclude"
```

Expected: import error — functions do not exist yet.

- [ ] **Step 3: Implement the helpers in database.ts**

Add after `bulkSetDnf`:

```typescript
export async function bulkExcludeFromAwards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, { excludeFromAwards: true });
    }
  });
}

export async function bulkIncludeInAwards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, { excludeFromAwards: false });
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add bulkExcludeFromAwards / bulkIncludeInAwards helpers"
jj new
```

---

### Task 3: Add `isAwardEligible()` helper to classifier.ts

**Files:**
- Modify: `frontend/src/classification/classifier.ts`
- Modify: `frontend/src/__tests__/classification/classifier.test.ts`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/__tests__/classification/classifier.test.ts`, import `isAwardEligible` and add:

```typescript
describe("isAwardEligible", () => {
  const base = {
    dnf: false,
    classificationSource: "auto-name" as const,
    manualOverride: false,
    excludeFromAwards: false,
  };

  it("returns true for auto-name classified, not excluded, not DNF", () => {
    expect(isAwardEligible(base)).toBe(true);
  });

  it("returns false for DNF rides", () => {
    expect(isAwardEligible({ ...base, dnf: true })).toBe(false);
  });

  it("returns false for auto-distance without manualOverride", () => {
    expect(isAwardEligible({ ...base, classificationSource: "auto-distance" })).toBe(false);
  });

  it("returns true for auto-distance WITH manualOverride (user confirmed)", () => {
    expect(isAwardEligible({ ...base, classificationSource: "auto-distance", manualOverride: true })).toBe(true);
  });

  it("returns true for manual classification source", () => {
    expect(isAwardEligible({ ...base, classificationSource: "manual", manualOverride: true })).toBe(true);
  });

  it("returns false when excludeFromAwards is true", () => {
    expect(isAwardEligible({ ...base, excludeFromAwards: true })).toBe(false);
  });

  it("returns false when excludeFromAwards AND auto-distance (both blocks apply)", () => {
    expect(isAwardEligible({ ...base, classificationSource: "auto-distance", excludeFromAwards: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "isAwardEligible"
```

Expected: import error — function does not exist yet.

- [ ] **Step 3: Implement `isAwardEligible` in classifier.ts**

Add after the `detectDnf` export:

```typescript
export interface AwardEligibilityFields {
  dnf: boolean;
  classificationSource: ClassificationSource;
  manualOverride: boolean;
  excludeFromAwards: boolean;
}

/**
 * Returns true if an activity should be counted toward award calculations.
 * Auto-distance classified rides are excluded until the user explicitly confirms them
 * (which sets manualOverride: true). Manually excluded rides are always excluded.
 */
export function isAwardEligible(a: AwardEligibilityFields): boolean {
  return (
    !a.dnf &&
    (a.classificationSource === "auto-name" || a.manualOverride) &&
    !a.excludeFromAwards
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add isAwardEligible() helper to classifier"
jj new
```

---

### Task 4: Extend QualifyingActivity / AwardsActivity interfaces and update all mapper functions

**Files:**
- Modify: `frontend/src/qualification/tracker.ts`
- Modify: `frontend/src/awards/awards.ts`
- Modify: `frontend/src/pages/AwardsPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/QualificationDetailPage.tsx`
- Modify: `frontend/src/pages/RrtyPage.tsx`
- Modify: `frontend/src/__tests__/qualification/tracker.test.ts`
- Modify: `frontend/src/__tests__/awards/awards.test.ts`

**Background:** The `QualifyingActivity` and `AwardsActivity` interfaces are the DTOs that pages map the raw `Activity` into before passing to tracker/awards functions. They must include the fields that `isAwardEligible` needs. This task extends the interfaces and updates all 4 mapper functions. No calculation logic changes yet — that's Task 5.

- [ ] **Step 1: Extend `QualifyingActivity` in tracker.ts**

Add four fields to the interface:

```typescript
export interface QualifyingActivity {
  stravaId: string;
  name: string;
  date: string;
  distance: number;
  elevationGain: number;
  eventType: EventType;
  dnf: boolean;
  sourceUrl: string;
  // Award eligibility fields
  classificationSource: import("../db/types").ClassificationSource;
  manualOverride: boolean;
  excludeFromAwards: boolean;
  needsConfirmation: boolean;
}
```

- [ ] **Step 2: Extend `AwardsActivity` in awards.ts**

First, update the import at the top of `awards.ts` to include `ClassificationSource` (replace the existing `import type { EventType }` line):

```typescript
import type { EventType, ClassificationSource } from "../db/types";
```

Then add the four fields to the `AwardsActivity` interface:

```typescript
export interface AwardsActivity {
  stravaId: string;
  name: string;
  date: string;
  distance: number;
  elevationGain: number;
  eventType: EventType;
  dnf: boolean;
  sourceUrl: string;
  startCountry: string | null;
  startRegion: string | null;
  endCountry: string | null;
  endRegion: string | null;
  isNotableInternational: boolean;
  // Award eligibility fields
  classificationSource: ClassificationSource;
  manualOverride: boolean;
  excludeFromAwards: boolean;
  needsConfirmation: boolean;
}
```

- [ ] **Step 3: Update `toQualifyingActivity` in DashboardPage.tsx**

```typescript
function toQualifyingActivity(a: Activity): QualifyingActivity {
  return {
    stravaId: a.stravaId,
    name: a.name,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
    dnf: a.dnf,
    sourceUrl: a.sourceUrl,
    classificationSource: a.classificationSource,
    manualOverride: a.manualOverride,
    excludeFromAwards: a.excludeFromAwards,
    needsConfirmation: a.needsConfirmation,
  };
}
```

- [ ] **Step 4: Update `toQualifyingActivities` in QualificationDetailPage.tsx**

```typescript
function toQualifyingActivities(activities: Activity[]): QualifyingActivity[] {
  return activities
    .filter((a) => a.eventType !== null)
    .map((a) => ({
      stravaId: a.stravaId,
      name: a.name,
      date: new Date(a.date).toISOString(),
      distance: a.distance,
      elevationGain: a.elevationGain,
      eventType: a.eventType!,
      dnf: a.dnf,
      sourceUrl: a.sourceUrl,
      classificationSource: a.classificationSource,
      manualOverride: a.manualOverride,
      excludeFromAwards: a.excludeFromAwards,
      needsConfirmation: a.needsConfirmation,
    }));
}
```

- [ ] **Step 5: Update `toQualifyingActivity` in RrtyPage.tsx**

```typescript
function toQualifyingActivity(a: Activity): QualifyingActivity {
  return {
    stravaId: a.stravaId,
    name: a.name,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
    dnf: a.dnf,
    sourceUrl: a.sourceUrl,
    classificationSource: a.classificationSource,
    manualOverride: a.manualOverride,
    excludeFromAwards: a.excludeFromAwards,
    needsConfirmation: a.needsConfirmation,
  };
}
```

- [ ] **Step 6: Update `toQualifying` and `toAwards` in AwardsPage.tsx**

```typescript
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
    classificationSource: a.classificationSource,
    manualOverride: a.manualOverride,
    excludeFromAwards: a.excludeFromAwards,
    needsConfirmation: a.needsConfirmation,
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
    classificationSource: a.classificationSource,
    manualOverride: a.manualOverride,
    excludeFromAwards: a.excludeFromAwards,
    needsConfirmation: a.needsConfirmation,
  };
}
```

- [ ] **Step 7: Update the `makeActivity` helper in tracker.test.ts**

Add defaults for the new fields:

```typescript
function makeActivity(
  overrides: Partial<QualifyingActivity> = {}
): QualifyingActivity {
  const id = Math.random().toString(36).slice(2);
  return {
    stravaId: id,
    name: "Test Ride",
    date: "2025-06-01",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    dnf: false,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    classificationSource: "auto-name",
    manualOverride: false,
    excludeFromAwards: false,
    needsConfirmation: false,
    ...overrides,
  };
}
```

- [ ] **Step 8: Update `makeActivity` helper in awards.test.ts**

Open `frontend/src/__tests__/awards/awards.test.ts` and find the `makeActivity` or equivalent fixture factory. Add the same four fields with the same defaults:

```typescript
classificationSource: "auto-name",
manualOverride: false,
excludeFromAwards: false,
needsConfirmation: false,
```

- [ ] **Step 9: Run tests to verify TypeScript compiles and tests pass**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass (no logic change yet, just interface expansion).

- [ ] **Step 10: Commit**

```bash
jj describe -m "feat: extend QualifyingActivity/AwardsActivity with award eligibility fields"
jj new
```

---

### Task 5: Update tracker.ts and awards.ts filters to use `isAwardEligible()`

**Files:**
- Modify: `frontend/src/qualification/tracker.ts`
- Modify: `frontend/src/awards/awards.ts`
- Modify: `frontend/src/__tests__/qualification/tracker.test.ts`
- Modify: `frontend/src/__tests__/awards/awards.test.ts`

- [ ] **Step 1: Write failing tests in tracker.test.ts**

Add a new describe block:

```typescript
describe("award eligibility filtering", () => {
  it("checkAcp5000: excludes unconfirmed (auto-distance) rides", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, classificationSource: "auto-distance" }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    // BRM200 is auto-distance and should be excluded — series incomplete
    expect(result.brmSeries.met).toBe(false);
    expect(result.brmSeries.missing).toContain("BRM200");
  });

  it("checkAcp5000: counts auto-distance ride once manualOverride=true", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, classificationSource: "auto-distance", manualOverride: true }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.brmSeries.met).toBe(true);
  });

  it("checkAcp5000: excludes rides with excludeFromAwards=true", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, excludeFromAwards: true }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.brmSeries.met).toBe(false);
    expect(result.brmSeries.missing).toContain("BRM200");
  });

  it("checkRrty: excludes unconfirmed rides from streak", () => {
    // 12 months but one is unconfirmed
    const activities = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return makeActivity({
        eventType: "BRM200",
        distance: 200,
        date: `2025-${month}-15`,
        classificationSource: i === 5 ? "auto-distance" : "auto-name",
      });
    });
    const result = checkRrty(activities);
    // Month 6 is unconfirmed → streak is broken → not qualified
    expect(result.qualified).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | grep -A5 "award eligibility filtering"
```

Expected: the new tests fail. For example, the "excludes unconfirmed (auto-distance) rides" test currently fails because the filter lets all rides through — `result.brmSeries.met` is `true` but the test expects `false`.

- [ ] **Step 3: Update tracker.ts — import `isAwardEligible`**

At the top of `tracker.ts`, add:

```typescript
import { isAwardEligible } from "../classification/classifier";
```

- [ ] **Step 4: Update `checkAcp5000` filter**

Replace:

```typescript
const eligible = activities.filter(
  (a) => !a.dnf && ACP_QUALIFYING_TYPES.includes(a.eventType as NonNullable<EventType>)
);
```

With:

```typescript
const eligible = activities.filter(
  (a) => isAwardEligible(a) && ACP_QUALIFYING_TYPES.includes(a.eventType as NonNullable<EventType>)
);
```

- [ ] **Step 5: Update `checkAcp10000` filter**

Replace:

```typescript
const eligible = activities.filter(
  (a) => !a.dnf && ACP_QUALIFYING_TYPES.includes(a.eventType as NonNullable<EventType>)
);
```

With:

```typescript
const eligible = activities.filter(
  (a) => isAwardEligible(a) && ACP_QUALIFYING_TYPES.includes(a.eventType as NonNullable<EventType>)
);
```

- [ ] **Step 6: Update `checkRrty` filter**

Replace:

```typescript
const qualifying = activities.filter(
  (a) => !a.dnf && a.eventType !== null && a.distance >= 200
);
```

With:

```typescript
const qualifying = activities.filter(
  (a) => isAwardEligible(a) && a.eventType !== null && a.distance >= 200
);
```

- [ ] **Step 7: Update awards.ts — import `isAwardEligible` and update all filters**

Add import at the top of `awards.ts`:

```typescript
import { isAwardEligible } from "../classification/classifier";
```

Update `checkRrtyYears`:

```typescript
const qualifying = activities.filter(
  (a) => isAwardEligible(a) && a.eventType !== null && a.distance >= 200
);
```

Update `checkBrevetKm` — replace `if (a.dnf || ...` with:

```typescript
if (!isAwardEligible(a) || !BREVET_TYPES.includes(a.eventType as EventType)) continue;
```

Update `checkFourProvinces`:

```typescript
const qualifying = activities.filter(
  (a) =>
    isAwardEligible(a) &&
    a.eventType !== null &&
    a.distance >= 200 &&
    a.startRegion !== null &&
    PROVINCES.includes(a.startRegion as (typeof PROVINCES)[number])
);
```

Update `checkEasterFleche`:

```typescript
.filter((a) => a.eventType === "Fleche" && isAwardEligible(a))
```

Update `checkFourNations` eligible filter:

```typescript
const eligible = activities.filter(
  (a) =>
    isAwardEligible(a) &&
    SR_DISTANCES.includes(a.eventType as EventType) &&
    a.startCountry !== null &&
    a.endCountry !== null &&
    new Date(a.date) >= FOUR_NATIONS_SEASON_START
);
```

Update `checkIsr` eligible filter:

```typescript
const eligible = activities.filter(
  (a) =>
    isAwardEligible(a) &&
    SR_DISTANCES.includes(a.eventType as EventType) &&
    a.startCountry !== null &&
    a.endCountry !== null
);
```

Update `getInternationalRides`:

```typescript
return activities
  .filter(
    (a) =>
      isAwardEligible(a) &&
      a.eventType !== null &&
      (a.isNotableInternational ||
        (a.startCountry !== null && a.startCountry !== "Ireland"))
  )
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

- [ ] **Step 8: Write failing tests for awards.ts filters**

In `frontend/src/__tests__/awards/awards.test.ts`, find or add a describe block testing `checkRrtyYears` and `checkBrevetKm`. Verify that unconfirmed or excluded activities are not counted. For example:

```typescript
describe("checkBrevetKm — award eligibility", () => {
  it("excludes unconfirmed activities from season km", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, date: "2025-06-01", classificationSource: "auto-distance" }),
      makeActivity({ eventType: "BRM200", distance: 200, date: "2025-06-15" }),
    ];
    const result = checkBrevetKm(activities);
    const season = activitySeason("2025-06-01");
    // Only the confirmed activity should count
    expect(result.get(season)).toBe(200);
  });
});
```

- [ ] **Step 9: Run all tests to verify they pass**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
jj describe -m "feat: apply isAwardEligible() filter in tracker and awards calculations"
jj new
```

---

## Chunk 2: Activities page UI — awards column, popover, bulk actions

### Task 6: Add Awards icon column to ActivityRow

**Files:**
- Modify: `frontend/src/components/ActivityRow.tsx`
- Modify: `frontend/src/db/database.ts` (single-activity update helper)

The Awards column shows:
- **✓ green** — counting (auto-name or manualOverride, not excluded): clicking sets `excludeFromAwards: true`
- **? amber** — unconfirmed (auto-distance, !manualOverride, !excludeFromAwards): clicking opens popover
- **✕ red** — excluded (excludeFromAwards: true): clicking clears `excludeFromAwards`

- [ ] **Step 1: Add a single-activity award toggle helper to database.ts**

```typescript
export async function setExcludeFromAwards(id: string, exclude: boolean): Promise<void> {
  await db.activities.update(id, { excludeFromAwards: exclude });
}

export async function confirmActivity(id: string): Promise<void> {
  await db.activities.update(id, { manualOverride: true, needsConfirmation: false });
}
```

- [ ] **Step 2: Create `AwardsStatusIcon` component inside ActivityRow.tsx**

Add above the `ActivityRow` component export:

```typescript
interface AwardsStatusIconProps {
  activity: Activity;
  onExclude: () => void;
  onInclude: () => void;
  onConfirm: () => void;
}

function AwardsStatusIcon({ activity, onExclude, onInclude, onConfirm }: AwardsStatusIconProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isUnconfirmed = activity.needsConfirmation && !activity.manualOverride && !activity.excludeFromAwards;
  const isExcluded = activity.excludeFromAwards;
  const isCounting = !isUnconfirmed && !isExcluded;

  if (isUnconfirmed) {
    return (
      <div className="relative">
        <button
          onClick={() => setPopoverOpen((v) => !v)}
          title="Not counting — needs confirmation"
          className="text-amber-500 hover:text-amber-600 text-sm font-bold w-5 text-center"
        >
          ?
        </button>
        {popoverOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setPopoverOpen(false)}
            />
            <div className="absolute right-0 top-6 z-20 w-52 rounded-lg border border-gray-200 bg-white shadow-lg p-2">
              <p className="text-xs text-gray-500 px-2 py-1 border-b border-gray-100 mb-1 truncate">
                {activity.name}
              </p>
              <button
                onClick={() => { onConfirm(); setPopoverOpen(false); }}
                className="w-full text-left text-xs text-green-700 hover:bg-green-50 rounded px-2 py-1.5 flex items-center gap-2"
              >
                <span>✓</span> Confirm as {activity.eventType}
              </button>
              <button
                onClick={() => { onExclude(); setPopoverOpen(false); }}
                className="w-full text-left text-xs text-red-700 hover:bg-red-50 rounded px-2 py-1.5 flex items-center gap-2"
              >
                <span>✕</span> Exclude from awards
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (isExcluded) {
    return (
      <button
        onClick={onInclude}
        title="Manually excluded from awards — click to include"
        className="text-red-500 hover:text-red-600 text-sm font-bold w-5 text-center"
      >
        ✕
      </button>
    );
  }

  return (
    <button
      onClick={onExclude}
      title="Counting towards awards — click to exclude"
      className="text-green-500 hover:text-green-600 text-sm font-bold w-5 text-center"
    >
      ✓
    </button>
  );
}
```

- [ ] **Step 3: Import helpers and wire up the icon in `ActivityRow`**

At the top of ActivityRow.tsx, add to the database import:

```typescript
import { db, type Activity, setExcludeFromAwards, confirmActivity } from "../db/database";
```

Inside the `ActivityRow` component, add handlers:

```typescript
const handleExclude = async () => {
  await setExcludeFromAwards(activity.stravaId, true);
};
const handleInclude = async () => {
  await setExcludeFromAwards(activity.stravaId, false);
};
const handleConfirm = async () => {
  await confirmActivity(activity.stravaId);
};
```

- [ ] **Step 4: Add the column header in ActivitiesPage.tsx**

In the table `<thead>` column list in `ActivitiesPage.tsx`, add a non-sortable header after the Homologation column:

```typescript
<th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
  Awards
</th>
```

- [ ] **Step 5: Add the cell in ActivityRow.tsx**

After the homologation `<td>` and before the start `<td>`, add:

```tsx
<td className="whitespace-nowrap px-3 py-2 text-sm text-center">
  <AwardsStatusIcon
    activity={activity}
    onExclude={handleExclude}
    onInclude={handleInclude}
    onConfirm={handleConfirm}
  />
</td>
```

- [ ] **Step 6: Build check**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: add Awards icon column to ActivityRow with inline popover"
jj new
```

---

### Task 7: Add bulk Exclude/Include actions to BulkActionBar and ActivitiesPage

**Files:**
- Modify: `frontend/src/components/BulkActionBar.tsx`
- Modify: `frontend/src/pages/ActivitiesPage.tsx`

- [ ] **Step 1: Add props to BulkActionBar**

Add `onExcludeFromAwards` and `onIncludeInAwards` to the props interface:

```typescript
interface BulkActionBarProps {
  selectedCount: number;
  onConfirm: () => void;
  onSetType: (eventType: EventType) => void;
  onSetDnf: (dnf: boolean) => void;
  onExcludeFromAwards: () => void;
  onIncludeInAwards: () => void;
  onClear: () => void;
}
```

- [ ] **Step 2: Add the two buttons to BulkActionBar's render**

After the "Clear DNF" button and before "Clear Selection":

```tsx
<button
  onClick={onExcludeFromAwards}
  className="rounded-md bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
>
  Exclude from awards
</button>
<button
  onClick={onIncludeInAwards}
  className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
>
  Include in awards
</button>
```

- [ ] **Step 3: Wire up handlers in ActivitiesPage.tsx**

Add import:

```typescript
import { db, bulkConfirm, bulkSetType, bulkSetDnf, bulkExcludeFromAwards, bulkIncludeInAwards } from "../db/database";
```

Add handlers after `handleBulkSetDnf`:

```typescript
const handleBulkExcludeFromAwards = useCallback(async () => {
  await bulkExcludeFromAwards(Array.from(selectedIds));
  setSelectedIds(new Set());
}, [selectedIds]);

const handleBulkIncludeInAwards = useCallback(async () => {
  await bulkIncludeInAwards(Array.from(selectedIds));
  setSelectedIds(new Set());
}, [selectedIds]);
```

- [ ] **Step 4: Pass handlers to BulkActionBar**

```tsx
<BulkActionBar
  selectedCount={selectedIds.size}
  onConfirm={handleBulkConfirm}
  onSetType={handleBulkSetType}
  onSetDnf={handleBulkSetDnf}
  onExcludeFromAwards={handleBulkExcludeFromAwards}
  onIncludeInAwards={handleBulkIncludeInAwards}
  onClear={clearSelection}
/>
```

- [ ] **Step 5: Build check**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: add bulk Exclude/Include from awards to BulkActionBar"
jj new
```

---

## Chunk 3: Notices and migration

### Task 8: Contextual unconfirmed-rides notice on award pages

**Files:**
- Create: `frontend/src/components/UnconfirmedRidesNotice.tsx`
- Modify: `frontend/src/pages/AwardsPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/QualificationDetailPage.tsx`
- Modify: `frontend/src/pages/RrtyPage.tsx`
- Modify: `frontend/src/pages/ActivitiesPage.tsx`

The notice appears when there are activities with `needsConfirmation && !manualOverride && !excludeFromAwards && eventType !== null`. It shows a count and links to Activities filtered by `?needsConfirm=1`.

- [ ] **Step 1: Create `frontend/src/components/UnconfirmedRidesNotice.tsx`**

```typescript
import { Link } from "react-router-dom";

export function UnconfirmedRidesNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        {count} {count === 1 ? "ride is" : "rides are"} unconfirmed and not counted toward awards.
      </span>
      <Link
        to="/activities?needsConfirm=1"
        className="ml-4 font-medium underline hover:text-amber-900 whitespace-nowrap"
      >
        Review in Activities →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Add notice to AwardsPage**

Import `UnconfirmedRidesNotice` at the top of `AwardsPage.tsx`:

```typescript
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";
```

In the `AwardsPage` component, after `const activities = useLiveQuery(...)`, compute the count:

```typescript
const unconfirmedCount = (activities ?? []).filter(
  (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
).length;
```

Render at the top of the returned JSX (before any section cards):

```tsx
<UnconfirmedRidesNotice count={unconfirmedCount} />
```

- [ ] **Step 3: Add notice to DashboardPage**

Import `UnconfirmedRidesNotice`:

```typescript
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";
```

After `const activities = useLiveQuery(() => db.activities.toArray(), []);`, add:

```typescript
const unconfirmedCount = (activities ?? []).filter(
  (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
).length;
```

Render `<UnconfirmedRidesNotice count={unconfirmedCount} />` after the `<h1>` heading and before the qualification cards.

- [ ] **Step 4: Add notice to QualificationDetailPage**

`QualificationDetailPage.tsx` fetches `activities` via `const activities = useLiveQuery(() => db.activities.toArray());` and renders conditionally if `!activities`. Place the count computation before the `if (!activities)` guard (so it is always derived reactively), and render the banner at the top of the page JSX (inside the outer `<div>`):

Import `UnconfirmedRidesNotice`:

```typescript
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";
```

After `const activities = useLiveQuery(...)`:

```typescript
const unconfirmedCount = (activities ?? []).filter(
  (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
).length;
```

In the returned JSX (after the loading guard), add as the first child of the outer div:

```tsx
<UnconfirmedRidesNotice count={unconfirmedCount} />
```

- [ ] **Step 5: Add notice to RrtyPage**

`RrtyPage.tsx` fetches `const activities = useLiveQuery(() => db.activities.toArray(), []);`.

Import `UnconfirmedRidesNotice`:

```typescript
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";
```

After the `useLiveQuery` call:

```typescript
const unconfirmedCount = (activities ?? []).filter(
  (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
).length;
```

In the returned JSX, add `<UnconfirmedRidesNotice count={unconfirmedCount} />` as the first child (before the `<div className="flex items-center gap-3">` heading row).

- [ ] **Step 6: Build check**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 7: Handle the `?needsConfirm=1` query param in ActivitiesPage**

In `ActivitiesPage.tsx`, the `needsConfirmOnly` state is currently initialised to `false`. Replace its declaration to read the URL param on first render:

Add `useSearchParams` to the react-router-dom import (already imported — just add the hook):

```typescript
import { useSearchParams } from "react-router-dom";
```

Inside the component, add before the existing `useState` calls:

```typescript
const [searchParams] = useSearchParams();
```

Then initialise `needsConfirmOnly` from the param:

```typescript
const [needsConfirmOnly, setNeedsConfirmOnly] = useState(
  () => searchParams.get("needsConfirm") === "1"
);
```

(Replace the existing `const [needsConfirmOnly, setNeedsConfirmOnly] = useState(false);`.)

- [ ] **Step 8: Build check**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
jj describe -m "feat: add unconfirmed rides notice to award pages"
jj new
```

---

### Task 9: One-time migration notice on Dashboard

**Files:**
- Create: `frontend/src/utils/migrationNotice.ts`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/__tests__/utils/migrationNotice.test.ts`

The notice is shown once per browser when the feature first lands. It is dismissed by the user and never shown again (persisted via localStorage key `audax_awards_filter_migrated`). The flag logic is extracted into a tiny utility so it can be unit-tested without rendering a component.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/__tests__/utils/migrationNotice.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { shouldShowMigrationNotice, dismissMigrationNotice } from "../../utils/migrationNotice";

const FLAG = "audax_awards_filter_migrated";

beforeEach(() => {
  localStorage.removeItem(FLAG);
});

describe("shouldShowMigrationNotice", () => {
  it("returns true when flag is not set", () => {
    expect(shouldShowMigrationNotice()).toBe(true);
  });

  it("returns false after flag is set", () => {
    localStorage.setItem(FLAG, "1");
    expect(shouldShowMigrationNotice()).toBe(false);
  });
});

describe("dismissMigrationNotice", () => {
  it("sets the flag in localStorage", () => {
    dismissMigrationNotice();
    expect(localStorage.getItem(FLAG)).toBe("1");
  });

  it("makes shouldShowMigrationNotice return false", () => {
    dismissMigrationNotice();
    expect(shouldShowMigrationNotice()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "migrationNotice"
```

Expected: import error — module does not exist.

- [ ] **Step 3: Create `frontend/src/utils/migrationNotice.ts`**

```typescript
const MIGRATION_FLAG = "audax_awards_filter_migrated";

export function shouldShowMigrationNotice(): boolean {
  return localStorage.getItem(MIGRATION_FLAG) !== "1";
}

export function dismissMigrationNotice(): void {
  localStorage.setItem(MIGRATION_FLAG, "1");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Add migration notice state and logic to DashboardPage**

Import the utilities:

```typescript
import { shouldShowMigrationNotice, dismissMigrationNotice as _dismiss } from "../utils/migrationNotice";
```

Inside the component:

```typescript
const [showMigrationNotice, setShowMigrationNotice] = useState(shouldShowMigrationNotice);

const handleDismissMigrationNotice = useCallback(() => {
  _dismiss();
  setShowMigrationNotice(false);
}, []);
```

- [ ] **Step 6: Render the notice in DashboardPage JSX**

Add above the qualification cards (after the page heading):

```tsx
{showMigrationNotice && (
  <div className="flex items-start justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
    <span>
      Award filtering has been updated. Rides classified by distance now require confirmation to count.{" "}
      <Link to="/activities?needsConfirm=1" className="font-medium underline hover:text-blue-900">
        Review unconfirmed rides →
      </Link>
    </span>
    <button
      onClick={handleDismissMigrationNotice}
      className="ml-4 text-blue-600 hover:text-blue-800 flex-shrink-0"
      aria-label="Dismiss"
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 7: Build check**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 8: Run full test suite**

```bash
cd /Users/pallotron/code/audax_tracker/frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
jj describe -m "feat: add one-time migration notice for award filtering change"
jj new
```
