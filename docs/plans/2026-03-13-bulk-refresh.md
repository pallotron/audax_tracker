# Bulk Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "↺ Refresh from Strava" button to the bulk action bar that refreshes all selected activities in parallel and then clears the selection.

**Architecture:** Two file edits — `BulkActionBar` gets an `onRefresh` prop and a new button; `ActivitiesPage` gets a `handleBulkRefresh` callback that calls `refreshActivity` for each selected ID in parallel, then clears selection. No new state, no new context changes.

**Tech Stack:** TypeScript, React, Tailwind CSS, Vitest

---

### Task 1: Add `onRefresh` to BulkActionBar and wire handleBulkRefresh in ActivitiesPage

**Files:**
- Modify: `frontend/src/components/BulkActionBar.tsx`
- Modify: `frontend/src/pages/ActivitiesPage.tsx`

There is no unit test file for `BulkActionBar` or `ActivitiesPage`. The full suite (214 tests) serves as the regression check.

**Step 1: Update `BulkActionBarProps` interface**

In `frontend/src/components/BulkActionBar.tsx`, add `onRefresh` to the props interface:

```ts
interface BulkActionBarProps {
  selectedCount: number;
  onConfirm: () => void;
  onSetType: (eventType: EventType) => void;
  onSetDnf: (dnf: boolean) => void;
  onExcludeFromAwards: () => void;
  onIncludeInAwards: () => void;
  onRefresh: () => void;
  onClear: () => void;
}
```

Also destructure `onRefresh` in the function signature:

```ts
export function BulkActionBar({ selectedCount, onConfirm, onSetType, onSetDnf, onExcludeFromAwards, onIncludeInAwards, onRefresh, onClear }: BulkActionBarProps) {
```

**Step 2: Add the refresh button to BulkActionBar**

After the "Confirm Selected" button (around line 47), add:

```tsx
<button
  onClick={onRefresh}
  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
>
  ↺ Refresh from Strava
</button>
```

**Step 3: Add `handleBulkRefresh` to ActivitiesPage**

In `frontend/src/pages/ActivitiesPage.tsx`, add this callback after `handleBulkIncludeInAwards`:

```ts
const handleBulkRefresh = useCallback(async () => {
  await Promise.all(Array.from(selectedIds).map((id) => refreshActivity(id)));
  setSelectedIds(new Set());
}, [selectedIds, refreshActivity]);
```

**Step 4: Pass `onRefresh` to `<BulkActionBar />`**

Find the `<BulkActionBar ... />` JSX (near the bottom of the component) and add:

```tsx
onRefresh={handleBulkRefresh}
```

**Step 5: Run all tests**

```
cd frontend && npx vitest run
```

Expected: 214 tests, 0 failures.

**Step 6: Commit**

```
jj describe -m "feat: add bulk refresh to BulkActionBar"
```
