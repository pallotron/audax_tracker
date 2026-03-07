# Bulk Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bulk confirm and bulk set-type actions to the Activities page, with checkbox selection and a sticky action bar.

**Architecture:** Selection state (`Set<string>`) lives in `ActivitiesPage`. A new `BulkActionBar` component renders as a sticky bottom bar. Bulk DB operations run in Dexie transactions.

**Tech Stack:** React 19, Dexie 4, Tailwind CSS 4, Vitest, fake-indexeddb

---

### Task 1: Add bulk database operations

**Files:**
- Modify: `frontend/src/db/database.ts`
- Test: `frontend/src/__tests__/db/database.test.ts`

**Step 1: Write the failing tests**

Add to `frontend/src/__tests__/db/database.test.ts`:

```ts
import { db, type Activity, bulkConfirm, bulkSetType } from "../../db/database";

// ... existing tests ...

describe("Bulk operations", () => {
  const makeActivity = (id: string, overrides: Partial<Activity> = {}): Activity => ({
    stravaId: id,
    name: `Activity ${id}`,
    date: new Date("2025-06-15"),
    distance: 200,
    elevationGain: 1000,
    movingTime: 28800,
    elapsedTime: 32400,
    type: "Ride",
    eventType: "BRM200",
    classificationSource: "auto-distance",
    needsConfirmation: true,
    manualOverride: false,
    homologationNumber: null,
    ...overrides,
  });

  beforeEach(async () => {
    await db.activities.clear();
  });

  it("bulkConfirm sets manualOverride and clears needsConfirmation", async () => {
    await db.activities.bulkAdd([makeActivity("1"), makeActivity("2"), makeActivity("3")]);

    await bulkConfirm(["1", "3"]);

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    const a3 = await db.activities.get("3");

    expect(a1!.manualOverride).toBe(true);
    expect(a1!.needsConfirmation).toBe(false);
    expect(a2!.manualOverride).toBe(false);
    expect(a2!.needsConfirmation).toBe(true);
    expect(a3!.manualOverride).toBe(true);
    expect(a3!.needsConfirmation).toBe(false);
  });

  it("bulkConfirm does not change eventType", async () => {
    await db.activities.bulkAdd([
      makeActivity("1", { eventType: "BRM200" }),
      makeActivity("2", { eventType: "BRM400" }),
    ]);

    await bulkConfirm(["1", "2"]);

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    expect(a1!.eventType).toBe("BRM200");
    expect(a2!.eventType).toBe("BRM400");
  });

  it("bulkSetType sets eventType, manualOverride, classificationSource", async () => {
    await db.activities.bulkAdd([makeActivity("1"), makeActivity("2")]);

    await bulkSetType(["1", "2"], "BRM600");

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    expect(a1!.eventType).toBe("BRM600");
    expect(a1!.manualOverride).toBe(true);
    expect(a1!.needsConfirmation).toBe(false);
    expect(a1!.classificationSource).toBe("manual");
    expect(a2!.eventType).toBe("BRM600");
  });

  it("bulkSetType with null clears eventType", async () => {
    await db.activities.bulkAdd([makeActivity("1", { eventType: "BRM200" })]);

    await bulkSetType(["1"], null);

    const a1 = await db.activities.get("1");
    expect(a1!.eventType).toBeNull();
    expect(a1!.classificationSource).toBe("manual");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/db/database.test.ts`
Expected: FAIL — `bulkConfirm` and `bulkSetType` are not exported from database.ts

**Step 3: Write the implementation**

Add to bottom of `frontend/src/db/database.ts`:

```ts
export async function bulkConfirm(ids: string[]): Promise<void> {
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, {
        manualOverride: true,
        needsConfirmation: false,
      });
    }
  });
}

export async function bulkSetType(ids: string[], eventType: EventType): Promise<void> {
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, {
        eventType,
        manualOverride: true,
        needsConfirmation: false,
        classificationSource: "manual",
      });
    }
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/db/database.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
jj new
jj describe -m "feat: add bulkConfirm and bulkSetType database operations"
```

---

### Task 2: Create BulkActionBar component

**Files:**
- Create: `frontend/src/components/BulkActionBar.tsx`

**Step 1: Create the component**

Create `frontend/src/components/BulkActionBar.tsx`:

```tsx
import { useState } from "react";
import type { EventType } from "../db/types";

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: null, label: "(none)" },
  { value: "BRM200", label: "BRM200" },
  { value: "BRM300", label: "BRM300" },
  { value: "BRM400", label: "BRM400" },
  { value: "BRM600", label: "BRM600" },
  { value: "BRM1000", label: "BRM1000" },
  { value: "PBP", label: "PBP" },
  { value: "RM1200+", label: "RM1200+" },
  { value: "Fleche", label: "Fleche" },
  { value: "SuperRandonneur", label: "SuperRandonneur" },
  { value: "TraceVelocio", label: "TraceVelocio" },
  { value: "FlecheDeFrance", label: "FlecheDeFrance" },
  { value: "Other", label: "Other" },
];

interface BulkActionBarProps {
  selectedCount: number;
  onConfirm: () => void;
  onSetType: (eventType: EventType) => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, onConfirm, onSetType, onClear }: BulkActionBarProps) {
  const [bulkEventType, setBulkEventType] = useState<EventType>("BRM200");

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between rounded-t-lg bg-gray-800 px-6 py-3 text-white shadow-lg">
      <span className="text-sm font-medium">
        {selectedCount} {selectedCount === 1 ? "activity" : "activities"} selected
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={onConfirm}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          Confirm Selected
        </button>
        <div className="flex items-center gap-1.5">
          <select
            value={bulkEventType ?? ""}
            onChange={(e) =>
              setBulkEventType(e.target.value === "" ? null : (e.target.value as EventType))
            }
            className="rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onSetType(bulkEventType)}
            className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Set Type
          </button>
        </div>
        <button
          onClick={onClear}
          className="rounded-md bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-500"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
jj new
jj describe -m "feat: add BulkActionBar component"
```

---

### Task 3: Add checkbox to ActivityRow

**Files:**
- Modify: `frontend/src/components/ActivityRow.tsx`

**Step 1: Update ActivityRow to accept selection props and render checkbox**

Add `selected` and `onToggle` props to the interface:

```tsx
interface ActivityRowProps {
  activity: Activity;
  selected: boolean;
  onToggle: (stravaId: string) => void;
}
```

Update the component signature:

```tsx
export function ActivityRow({ activity, selected, onToggle }: ActivityRowProps) {
```

Add a checkbox `<td>` as the first cell inside the `<tr>`, before the date cell:

```tsx
<td className="whitespace-nowrap px-3 py-2">
  <input
    type="checkbox"
    checked={selected}
    onChange={() => onToggle(activity.stravaId)}
    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
  />
</td>
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors in `ActivitiesPage.tsx` because `ActivityRow` now requires `selected` and `onToggle` props. This is expected — fixed in Task 4.

**Step 3: Commit**

```bash
jj new
jj describe -m "feat: add checkbox prop support to ActivityRow"
```

---

### Task 4: Wire up selection state and bulk actions in ActivitiesPage

**Files:**
- Modify: `frontend/src/pages/ActivitiesPage.tsx`

**Step 1: Add imports**

Add to the existing imports:

```tsx
import { bulkConfirm, bulkSetType } from "../db/database";
import { BulkActionBar } from "../components/BulkActionBar";
import type { EventType } from "../db/types";
```

**Step 2: Add selection state**

Inside `ActivitiesPage`, after the existing state declarations, add:

```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

**Step 3: Add selection handlers**

After the existing handler functions (after `handleSort`), add:

```tsx
const toggleSelect = useCallback((id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}, []);

const toggleSelectAll = useCallback(() => {
  setSelectedIds((prev) => {
    const allFilteredIds = filtered.map((a) => a.stravaId);
    const allSelected = allFilteredIds.every((id) => prev.has(id));
    if (allSelected) {
      const next = new Set(prev);
      for (const id of allFilteredIds) next.delete(id);
      return next;
    } else {
      const next = new Set(prev);
      for (const id of allFilteredIds) next.add(id);
      return next;
    }
  });
}, [filtered]);

const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

const handleBulkConfirm = useCallback(async () => {
  await bulkConfirm(Array.from(selectedIds));
  setSelectedIds(new Set());
}, [selectedIds]);

const handleBulkSetType = useCallback(async (eventType: EventType) => {
  await bulkSetType(Array.from(selectedIds), eventType);
  setSelectedIds(new Set());
}, [selectedIds]);
```

**Step 4: Compute header checkbox state**

After the selection handlers, add:

```tsx
const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.stravaId));
const someFilteredSelected = filtered.some((a) => selectedIds.has(a.stravaId));
```

**Step 5: Add checkbox header column**

In the `<thead>`, add a new `<th>` as the first column (before the sortable headers map):

```tsx
<th className="px-3 py-2 w-10">
  <input
    type="checkbox"
    checked={allFilteredSelected}
    ref={(el) => {
      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
    }}
    onChange={toggleSelectAll}
    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
  />
</th>
```

**Step 6: Pass selection props to ActivityRow**

Change the `ActivityRow` usage from:

```tsx
<ActivityRow key={a.stravaId} activity={a} />
```

To:

```tsx
<ActivityRow
  key={a.stravaId}
  activity={a}
  selected={selectedIds.has(a.stravaId)}
  onToggle={toggleSelect}
/>
```

**Step 7: Add BulkActionBar**

Just before the closing `</div>` of the component's root element (before line 331), add:

```tsx
<BulkActionBar
  selectedCount={selectedIds.size}
  onConfirm={handleBulkConfirm}
  onSetType={handleBulkSetType}
  onClear={clearSelection}
/>
```

**Step 8: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 9: Run all existing tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 10: Commit**

```bash
jj new
jj describe -m "feat: wire up bulk selection and actions in ActivitiesPage"
```

---

### Task 5: Manual smoke test

**Step 1: Run the dev server**

Run: `cd frontend && npm run dev`

**Step 2: Verify the following in the browser:**

1. Checkbox column appears as the first column in the activities table
2. Header checkbox selects/deselects all filtered activities
3. Header checkbox shows indeterminate state when some are selected
4. Individual row checkboxes toggle selection
5. Sticky bottom bar appears when activities are selected, showing count
6. "Confirm Selected" sets `manualOverride: true` and clears confirmation badges
7. "Set Type" dropdown + button changes event type for all selected
8. "Clear Selection" deselects all and hides the bar
9. Changing filters does not clear selection
10. After bulk action, selection is cleared

**Step 3: Final commit (squash if needed)**

```bash
jj new
jj describe -m "feat: add bulk editing to Activities page"
```
