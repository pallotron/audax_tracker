# Audax Season Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Audax season (Nov–Oct) filter to ActivitiesPage and YearlySummaryPage, mutually exclusive with the existing calendar year filter.

**Architecture:** Reuse the existing `activitySeason()` function from `awards/awards.ts` to derive season labels ("YYYY-YY") and match activities to seasons. Both pages get a season dropdown/selector alongside the year selector; selecting one clears the other. No backend changes — all filtering is client-side.

**Tech Stack:** React, TypeScript, Dexie/IndexedDB (client-side only), Vitest for tests, Tailwind CSS for styling.

---

### Task 1: Add `activitySeason` tests for edge-case months

The `activitySeason` function has limited test coverage. Add explicit tests for the boundary months (October, November) so we trust it before building on it.

**Files:**
- Modify: `frontend/src/__tests__/awards/awards.test.ts`

**Step 1: Write the failing tests**

Add this block after the existing `activitySeason` usage in the file (around line 449):

```typescript
describe("activitySeason", () => {
  it("puts January in the current-year season", () => {
    expect(activitySeason("2025-01-15")).toBe("2024-25");
  });

  it("puts October in the current-year season", () => {
    expect(activitySeason("2025-10-31")).toBe("2024-25");
  });

  it("puts November in the next-year season", () => {
    expect(activitySeason("2025-11-01")).toBe("2025-26");
  });

  it("puts December in the next-year season", () => {
    expect(activitySeason("2025-12-31")).toBe("2025-26");
  });

  it("puts June in the current-year season", () => {
    expect(activitySeason("2025-06-15")).toBe("2024-25");
  });
});
```

**Step 2: Run tests to verify they pass (the logic already exists)**

```bash
cd frontend && npm test -- --reporter=verbose src/__tests__/awards/awards.test.ts
```

Expected: all new tests PASS (the function already handles this correctly — we're confirming it).

**Step 3: Commit**

```bash
jj describe -m "test: verify activitySeason boundary months"
jj new
```

---

### Task 2: Add season filter to ActivitiesPage

**Files:**
- Modify: `frontend/src/pages/ActivitiesPage.tsx`

**Step 1: Add the `activitySeason` import**

At the top of `ActivitiesPage.tsx` (after existing imports), add:

```typescript
import { activitySeason } from "../awards/awards";
```

**Step 2: Add `seasonFilter` URL param (after line 72)**

```typescript
const seasonFilter = searchParams.get("season") ?? "all";
```

**Step 3: Add `seasons` memo (after the `years` memo, around line 157)**

```typescript
const seasons = useMemo(() => {
  if (!activities) return [];
  const set = new Set<string>();
  for (const a of activities) {
    set.add(activitySeason(a.date instanceof Date ? a.date.toISOString() : String(a.date)));
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}, [activities]);
```

**Step 4: Add `handleSeasonChange` (after `handleYearChange`, around line 110)**

```typescript
const handleSeasonChange = (value: string) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value === "all") {
      next.delete("season");
    } else {
      next.set("season", value);
      next.delete("year"); // mutually exclusive
    }
    return next;
  }, { replace: true });
  resetPage();
};
```

**Step 5: Update `handleYearChange` to also clear `season` (replace existing at line 107)**

```typescript
const handleYearChange = (value: string) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value === "all") {
      next.delete("year");
    } else {
      next.set("year", value);
      next.delete("season"); // mutually exclusive
    }
    return next;
  }, { replace: true });
  resetPage();
};
```

**Step 6: Add season filter to `filtered` memo**

In the `filtered` useMemo (around line 162), after the `yearFilter` block, add:

```typescript
if (seasonFilter !== "all") {
  const season = activitySeason(a.date instanceof Date ? a.date.toISOString() : String(a.date));
  if (season !== seasonFilter) return false;
}
```

Also update the dependency array on line 188 to include `seasonFilter`:

```typescript
}, [activities, yearFilter, seasonFilter, selectedTypes, activeFilters, textFilter, sortKey, sortDir]);
```

**Step 7: Add Season dropdown to the UI (after the Year dropdown block, around line 331)**

```tsx
<div>
  <label htmlFor="season-filter" className="mr-2 text-sm font-medium text-gray-700">
    Season:
  </label>
  <select
    id="season-filter"
    value={seasonFilter}
    onChange={(e) => handleSeasonChange(e.target.value)}
    className="rounded border border-gray-300 px-2 py-1 text-sm"
  >
    <option value="all">All seasons</option>
    {seasons.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
</div>
```

**Step 8: Update the reset button condition (line 332) to include `seasonFilter`**

```tsx
{(textFilter || yearFilter !== "all" || seasonFilter !== "all" || selectedTypes.size > 0 || activeFilters.size > 0) && (
```

**Step 9: Run the app locally and verify manually**

```bash
cd frontend && npm run dev
```

- Navigate to Activities page
- Confirm Season dropdown appears next to Year dropdown
- Select a season → year dropdown resets to "All years"
- Select a year → season dropdown resets to "All seasons"
- A ride from November 2024 should appear in season "2024-25"
- Reset filters clears both

**Step 10: Commit**

```bash
jj describe -m "feat: add Audax season filter to ActivitiesPage"
jj new
```

---

### Task 3: Add season mode to YearlySummaryPage

**Files:**
- Modify: `frontend/src/pages/YearlySummaryPage.tsx`

**Step 1: Add the `activitySeason` import**

```typescript
import { activitySeason } from "../awards/awards";
```

**Step 2: Add `mode` and `selectedSeason` state (after line 10)**

```typescript
const [mode, setMode] = useState<"year" | "season">("year");
const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
```

**Step 3: Add `seasons` memo (after the `years` memo, around line 24)**

```typescript
const seasons = useMemo(
  () =>
    [
      ...new Set(
        audaxActivities.map((a) =>
          activitySeason(a.date instanceof Date ? (a.date as Date).toISOString() : String(a.date))
        )
      ),
    ].sort((a, b) => b.localeCompare(a)),
  [audaxActivities],
);
```

**Step 4: Add `activeSeason` and season-filtered activities (after line 26)**

```typescript
const activeSeason = selectedSeason ?? seasons[0] ?? "";

const seasonActivities = useMemo(
  () =>
    audaxActivities
      .filter((a) =>
        activitySeason(a.date instanceof Date ? (a.date as Date).toISOString() : String(a.date)) === activeSeason
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  [audaxActivities, activeSeason],
);
```

**Step 5: Add `seasonStats` memo for the comparison table (after `yearlyStats` memo, around line 61)**

```typescript
const seasonStats = useMemo(() => {
  return seasons.map((season) => {
    const sa = audaxActivities.filter(
      (a) => activitySeason(a.date instanceof Date ? (a.date as Date).toISOString() : String(a.date)) === season
    );
    return {
      season,
      rides: sa.length,
      km: Math.round(sa.reduce((s, a) => s + a.distance, 0)),
      elevation: Math.round(sa.reduce((s, a) => s + a.elevationGain, 0)),
    };
  });
}, [seasons, audaxActivities]);
```

**Step 6: Compute the active display data based on mode**

Just before the `return (` statement, add:

```typescript
const displayActivities = mode === "season" ? seasonActivities : yearActivities;
const displayRideCount = displayActivities.length;
const displayTotalKm = displayActivities.reduce((sum, a) => sum + a.distance, 0);
const displayTotalElevation = displayActivities.reduce((sum, a) => sum + a.elevationGain, 0);
const displayTotalMoving = displayActivities.reduce((sum, a) => sum + a.movingTime, 0);
const displayTotalElapsed = displayActivities.reduce((sum, a) => sum + a.elapsedTime, 0);
const displayByCountry = new Map<string, number>();
for (const a of displayActivities) {
  const key = a.startCountry ?? "Unknown";
  displayByCountry.set(key, (displayByCountry.get(key) ?? 0) + 1);
}
const displayLabel = mode === "season" ? activeSeason : String(activeYear);
```

**Step 7: Update the JSX to use `displayActivities` and `displayLabel`**

Replace usages of `rideCount`, `totalKm`, `totalElevation`, `totalMoving`, `totalElapsed`, `byCountry`, `yearActivities` in the JSX with the `display*` variables.

Also update the "no rides" message:
```tsx
No audax rides recorded for {displayLabel}.
```

**Step 8: Replace the year selector section with a mode toggle + conditional selector (around line 85)**

Replace the existing year selector block with:

```tsx
{/* Mode toggle */}
{(years.length > 0 || seasons.length > 0) && (
  <div className="space-y-2">
    <div className="flex gap-1">
      <button
        onClick={() => setMode("year")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          mode === "year"
            ? "bg-gray-700 text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        Year
      </button>
      <button
        onClick={() => setMode("season")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          mode === "season"
            ? "bg-orange-500 text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        Season
      </button>
    </div>

    {mode === "year" && years.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {years.map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              year === activeYear
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {year}
          </button>
        ))}
      </div>
    )}

    {mode === "season" && seasons.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {seasons.map((season) => (
          <button
            key={season}
            onClick={() => setSelectedSeason(season)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              season === activeSeason
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {season}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

**Step 9: Update the comparison table to show season data when in season mode**

Replace the comparison table section (around line 105) — show `yearlyStats` or `seasonStats` based on mode:

```tsx
{showComparison && (
  <>
    {mode === "year" && yearlyStats.length > 0 && (
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Year</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Rides</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Km</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Elevation (m)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {yearlyStats.map((s) => (
              <tr
                key={s.year}
                className={`hover:bg-gray-50 cursor-pointer ${s.year === activeYear ? "bg-orange-50" : ""}`}
                onClick={() => { setSelectedYear(s.year); setShowComparison(false); }}
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.year}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{s.rides}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{s.km.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{s.elevation.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {mode === "season" && seasonStats.length > 0 && (
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Season</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Rides</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Km</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Elevation (m)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {seasonStats.map((s) => (
              <tr
                key={s.season}
                className={`hover:bg-gray-50 cursor-pointer ${s.season === activeSeason ? "bg-orange-50" : ""}`}
                onClick={() => { setSelectedSeason(s.season); setShowComparison(false); }}
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.season}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{s.rides}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{s.km.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">{s.elevation.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
)}
```

**Step 10: Update the "Compare" button label to be context-aware (around line 76)**

```tsx
{showComparison
  ? `Hide comparison`
  : mode === "season"
    ? "Compare seasons"
    : "Compare years"}
```

**Step 11: Update the page title to reflect mode (line 74)**

```tsx
<h1 className="text-2xl font-bold text-gray-900">
  Audax {mode === "season" ? "Season" : "Yearly"} Summary
</h1>
```

**Step 12: Run tests**

```bash
cd frontend && npm test
```

Expected: all existing tests PASS.

**Step 13: Verify manually**

```bash
cd frontend && npm run dev
```

- Navigate to Yearly Summary page
- Confirm Year / Season toggle buttons appear above year selector
- Click Season → season buttons appear (e.g., "2024-25", "2025-26")
- Stats cards and table update to show season data
- "Compare seasons" button appears; click it → shows seasonal comparison table
- A ride from November 2024 appears in "2024-25" season, not "2024"
- Click Year → reverts to calendar year behaviour (unchanged)

**Step 14: Commit**

```bash
jj describe -m "feat: add Audax season mode to YearlySummaryPage"
jj new
```
