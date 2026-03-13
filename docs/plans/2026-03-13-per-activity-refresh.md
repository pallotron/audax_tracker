# Per-Activity Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-row "↺" button that re-fetches a single activity from `GET /activities/{id}` and updates the local DB, so renames on Strava are visible without a full re-sync.

**Architecture:** `fetchActivity` is added to `strava/client.ts`. The upsert logic is extracted from `sync` into a testable `applyActivityUpsert` helper in `SyncContext.tsx`, then reused by a new `refreshActivity` method. `ActivityRow` receives `onRefresh`, `refreshing`, and `refreshError` props and renders a `↺` button.

**Tech Stack:** TypeScript, React, Dexie (IndexedDB), Vitest, Tailwind CSS

---

### Task 1: `fetchActivity` in `strava/client.ts`

**Files:**
- Modify: `frontend/src/strava/client.ts`
- Test: `frontend/src/__tests__/strava/client.test.ts`

**Step 1: Write the failing tests**

Append to `frontend/src/__tests__/strava/client.test.ts`:

```ts
import { fetchActivity } from "../../strava/client";

// ...after the existing describe blocks...

describe("fetchActivity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a single activity by ID and maps it", async () => {
    const raw = {
      id: 999,
      name: "BRM 300 Test",
      distance: 305000,
      moving_time: 43200,
      elapsed_time: 50000,
      total_elevation_gain: 2000,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-07-01T05:00:00Z",
      start_latlng: [] as [],
      end_latlng: [] as [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(raw))
    );
    const result = await fetchActivity("999", "fake-token");
    expect(result.stravaId).toBe("999");
    expect(result.name).toBe("BRM 300 Test");
    expect(result.distance).toBeCloseTo(305);
  });

  it("throws a human-readable error on 429 with Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "120" } })
    );
    await expect(fetchActivity("999", "fake-token")).rejects.toThrow(/2 minute/);
  });

  it("throws a human-readable error on 429 without Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 429 })
    );
    await expect(fetchActivity("999", "fake-token")).rejects.toThrow(/rate limit/i);
  });

  it("throws on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );
    await expect(fetchActivity("999", "fake-token")).rejects.toThrow(/404/);
  });
});
```

**Step 2: Run tests to verify they fail**

```
cd frontend && npx vitest run src/__tests__/strava/client.test.ts
```

Expected: FAIL — `fetchActivity` is not exported.

**Step 3: Implement `fetchActivity`**

Append to `frontend/src/strava/client.ts`, after `fetchAllActivities`:

```ts
export async function fetchActivity(
  stravaId: string,
  accessToken: string
): Promise<Activity> {
  const url = `${STRAVA_API}/activities/${stravaId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") ?? "0", 10);
    const minutes = retryAfter > 0 ? Math.ceil(retryAfter / 60) : 15;
    throw new Error(
      `Strava rate limit reached. Try again in ~${minutes} minute${minutes !== 1 ? "s" : ""}.`
    );
  }

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  return mapStravaActivity(await response.json());
}
```

**Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/__tests__/strava/client.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```
jj describe -m "feat: add fetchActivity for single-activity Strava refresh"
```

---

### Task 2: `applyActivityUpsert` helper in `SyncContext.tsx`

This extracts the "what do we preserve?" logic from `sync` into a pure, testable function, and adds a test for it. The `sync` function will be refactored to use it in the next task.

**Files:**
- Modify: `frontend/src/context/SyncContext.tsx`
- Test: `frontend/src/__tests__/context/syncContext.test.ts`

**Step 1: Write the failing tests**

Append to `frontend/src/__tests__/context/syncContext.test.ts`:

```ts
import { applyActivityUpsert } from "../../context/SyncContext";
import type { Activity } from "../../db/database";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    stravaId: "1",
    name: "Morning Ride",
    date: new Date("2025-01-01"),
    distance: 100,
    elevationGain: 500,
    movingTime: 3600,
    elapsedTime: 4000,
    type: "Ride",
    eventType: null,
    classificationSource: "manual",
    needsConfirmation: false,
    manualOverride: false,
    homologationNumber: null,
    dnf: false,
    excludeFromAwards: false,
    sourceUrl: "https://www.strava.com/activities/1",
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
    ...overrides,
  };
}

describe("applyActivityUpsert", () => {
  it("returns fresh activity with geo fields from existing when no manualOverride", () => {
    const fresh = makeActivity({ name: "BRM 200 Renamed", eventType: "BRM200" });
    const existing = makeActivity({
      startCountry: "France",
      startRegion: "Île-de-France",
      endCountry: "France",
      endRegion: "Normandy",
      isNotableInternational: true,
    });
    const result = applyActivityUpsert(fresh, existing);
    expect(result.name).toBe("BRM 200 Renamed");
    expect(result.eventType).toBe("BRM200");
    expect(result.startCountry).toBe("France");
    expect(result.isNotableInternational).toBe(true);
    expect(result.manualOverride).toBe(false);
  });

  it("returns null geo fields when no existing record", () => {
    const fresh = makeActivity({ name: "New Ride" });
    const result = applyActivityUpsert(fresh, undefined);
    expect(result.startCountry).toBeNull();
    expect(result.isNotableInternational).toBe(false);
  });

  it("preserves manualOverride fields when existing has manualOverride=true", () => {
    const fresh = makeActivity({
      name: "BRM 400 Renamed",
      eventType: "BRM400",
      classificationSource: "auto-name",
      dnf: false,
    });
    const existing = makeActivity({
      manualOverride: true,
      eventType: "BRM600",
      classificationSource: "manual",
      homologationNumber: "FR-2025-123",
      dnf: true,
      startCountry: "Spain",
      isNotableInternational: true,
    });
    const result = applyActivityUpsert(fresh, existing);
    expect(result.name).toBe("BRM 400 Renamed");
    expect(result.eventType).toBe("BRM600");
    expect(result.classificationSource).toBe("manual");
    expect(result.manualOverride).toBe(true);
    expect(result.homologationNumber).toBe("FR-2025-123");
    expect(result.dnf).toBe(true);
    expect(result.startCountry).toBe("Spain");
    expect(result.isNotableInternational).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```
cd frontend && npx vitest run src/__tests__/context/syncContext.test.ts
```

Expected: FAIL — `applyActivityUpsert` is not exported.

**Step 3: Implement `applyActivityUpsert`**

Add this exported function to `frontend/src/context/SyncContext.tsx`, before `SyncProvider`:

```ts
export function applyActivityUpsert(
  activity: Activity,
  existing: Activity | undefined
): Activity {
  if (existing?.manualOverride) {
    return {
      ...activity,
      eventType: existing.eventType,
      classificationSource: existing.classificationSource,
      manualOverride: true,
      needsConfirmation: existing.needsConfirmation,
      homologationNumber: existing.homologationNumber,
      dnf: existing.dnf,
      excludeFromAwards: existing.excludeFromAwards,
      startCountry: existing.startCountry,
      startRegion: existing.startRegion,
      endCountry: existing.endCountry,
      endRegion: existing.endRegion,
      isNotableInternational: existing.isNotableInternational,
    };
  }
  return {
    ...activity,
    startCountry: existing?.startCountry ?? null,
    startRegion: existing?.startRegion ?? null,
    endCountry: existing?.endCountry ?? null,
    endRegion: existing?.endRegion ?? null,
    isNotableInternational: existing?.isNotableInternational ?? false,
  };
}
```

**Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/__tests__/context/syncContext.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```
jj describe -m "feat: extract applyActivityUpsert helper from sync logic"
```

---

### Task 3: `refreshActivity` in `SyncContext.tsx` + refactor `sync` to use helper

**Files:**
- Modify: `frontend/src/context/SyncContext.tsx`

**Step 1: Update `SyncContextValue` interface**

In `frontend/src/context/SyncContext.tsx`, update the `SyncContextValue` interface to add the new fields:

```ts
interface SyncContextValue {
  sync: () => Promise<void>;
  checkPending: () => Promise<void>;
  refreshActivity: (stravaId: string) => Promise<void>;
  syncing: boolean;
  checking: boolean;
  hasPending: boolean;
  refreshing: Set<string>;
  refreshErrors: Map<string, string>;
  progress: { fetched: number; total: number } | null;
  geocoding: { done: number; total: number } | null;
  rateLimitWait: number | null;
  error: string | null;
  lastSync: string | null;
  cloudSync: CloudSyncHook;
}
```

**Step 2: Add state and `refreshActivity` to `SyncProvider`**

In `SyncProvider`, add the new state variables after the existing ones:

```ts
const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
const [refreshErrors, setRefreshErrors] = useState<Map<string, string>>(new Map());
```

Then add the `refreshActivity` callback (add after `checkPending`):

```ts
const refreshActivity = useCallback(async (stravaId: string) => {
  setRefreshing((prev) => new Set(prev).add(stravaId));
  setRefreshErrors((prev) => {
    const next = new Map(prev);
    next.delete(stravaId);
    return next;
  });
  try {
    const token = await getAccessToken();
    const activity = await fetchActivity(stravaId, token);
    await db.transaction("rw", db.activities, async () => {
      const existing = await db.activities.get(stravaId);
      await db.activities.put(applyActivityUpsert(activity, existing));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    setRefreshErrors((prev) => new Map(prev).set(stravaId, message));
  } finally {
    setRefreshing((prev) => {
      const next = new Set(prev);
      next.delete(stravaId);
      return next;
    });
  }
}, [getAccessToken]);
```

**Step 3: Refactor `sync` to use `applyActivityUpsert`**

Inside the `sync` callback, replace the transaction block:

```ts
// OLD:
await db.transaction("rw", db.activities, async () => {
  for (const activity of activities) {
    const existing = await db.activities.get(activity.stravaId);
    if (existing?.manualOverride) {
      await db.activities.put({
        ...activity,
        eventType: existing.eventType,
        classificationSource: existing.classificationSource,
        manualOverride: true,
        homologationNumber: existing.homologationNumber,
        dnf: existing.dnf,
        startCountry: existing.startCountry,
        startRegion: existing.startRegion,
        endCountry: existing.endCountry,
        endRegion: existing.endRegion,
        isNotableInternational: existing.isNotableInternational,
      });
    } else {
      await db.activities.put({
        ...activity,
        startCountry: existing?.startCountry ?? null,
        startRegion: existing?.startRegion ?? null,
        endCountry: existing?.endCountry ?? null,
        endRegion: existing?.endRegion ?? null,
        isNotableInternational: existing?.isNotableInternational ?? false,
      });
    }
  }
});

// NEW:
await db.transaction("rw", db.activities, async () => {
  for (const activity of activities) {
    const existing = await db.activities.get(activity.stravaId);
    await db.activities.put(applyActivityUpsert(activity, existing));
  }
});
```

**Step 4: Add `fetchActivity` to the import at the top of `SyncContext.tsx`**

```ts
import { fetchAllActivities, fetchActivity, hasNewActivities } from "../strava/client";
```

**Step 5: Expose new state/functions in the `SyncContext.Provider` value**

```ts
value={{ sync, checkPending, refreshActivity, syncing, checking, hasPending, refreshing, refreshErrors, progress, geocoding, rateLimitWait, error, lastSync, cloudSync }}
```

**Step 6: Run all tests**

```
cd frontend && npx vitest run
```

Expected: all tests PASS (no behavior change in `sync`, new exports available).

**Step 7: Commit**

```
jj describe -m "feat: add refreshActivity to SyncContext"
```

---

### Task 4: Refresh button in `ActivityRow`

**Files:**
- Modify: `frontend/src/components/ActivityRow.tsx`

**Step 1: Update props interface**

```ts
interface ActivityRowProps {
  activity: Activity;
  selected: boolean;
  onToggle: (stravaId: string) => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  refreshError: string | null;
}
```

**Step 2: Update the function signature**

```ts
export function ActivityRow({ activity, selected, onToggle, onRefresh, refreshing, refreshError }: ActivityRowProps) {
```

**Step 3: Replace the last `<td>` (the edit/save/cancel cell)**

The current last `<td>` contains the Edit/Save/Cancel button. Add the refresh button before "Edit" in the non-editing state:

```tsx
<td className="whitespace-nowrap px-3 py-2 text-sm">
  {editing ? (
    <span className="inline-flex items-center gap-2">
      <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={dnf}
          onChange={(e) => setDnf(e.target.checked)}
          className="rounded border-gray-300 text-red-500 focus:ring-red-400"
        />
        😢 DNF
      </label>
      <button
        onClick={handleSave}
        className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
      >
        Save
      </button>
      <button
        onClick={handleCancel}
        className="rounded bg-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-400"
      >
        Cancel
      </button>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title={refreshError ?? "Refresh from Strava"}
        className={`rounded px-2 py-0.5 text-xs ${
          refreshError
            ? "bg-red-100 text-red-600 hover:bg-red-200"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        } disabled:opacity-50`}
      >
        {refreshing ? "…" : "↺"}
      </button>
      <button
        onClick={() => setEditing(true)}
        className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
      >
        Edit
      </button>
    </span>
  )}
</td>
```

**Step 4: Run all tests**

```
cd frontend && npx vitest run
```

Expected: all tests PASS.

**Step 5: Commit**

```
jj describe -m "feat: add refresh button to ActivityRow"
```

---

### Task 5: Wire up in `ActivitiesPage`

**Files:**
- Modify: `frontend/src/pages/ActivitiesPage.tsx`

**Step 1: Pull new fields from `useSyncContext`**

On line 67, update the destructure:

```ts
const { syncing, progress, error, refreshActivity, refreshing, refreshErrors } = useSyncContext();
```

**Step 2: Pass props to each `ActivityRow`**

In the `paged.map` render (around line 517), update `ActivityRow`:

```tsx
<ActivityRow
  key={a.stravaId}
  activity={a}
  selected={selectedIds.has(a.stravaId)}
  onToggle={toggleSelect}
  onRefresh={() => refreshActivity(a.stravaId)}
  refreshing={refreshing.has(a.stravaId)}
  refreshError={refreshErrors.get(a.stravaId) ?? null}
/>
```

**Step 3: Run all tests**

```
cd frontend && npx vitest run
```

Expected: all tests PASS.

**Step 4: Commit**

```
jj describe -m "feat: wire per-activity refresh in ActivitiesPage"
```

---

### Final verification

```
cd frontend && npx vitest run
```

All tests should pass. Manually verify:
1. The `↺` button appears on each activity row next to "Edit"
2. Clicking it calls the Strava API (check Network tab) and updates the row name
3. While in-flight, the button shows `…` and is disabled
4. A failed call (e.g. disconnect network) shows the button in red with the error in the tooltip
