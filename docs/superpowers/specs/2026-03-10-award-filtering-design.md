# Award Filtering Design

**Date:** 2026-03-10
**Issue:** Non-Audax rides (ultras, tours, training rides) are counted toward award calculations if they meet distance thresholds, producing inaccurate award progress.

---

## Problem

The classifier has two paths:

1. **Name-based** (`classificationSource: "auto-name"`): Matches patterns like `/\baudax\b/i`, `/\bpermanent\b/i`, `paris-brest-paris`, etc. High confidence.
2. **Distance-based** (`classificationSource: "auto-distance"`): Falls back to distance ranges (e.g. 560–949 km → BRM600). Sets `needsConfirmation: true`.

The `needsConfirmation` flag is currently only a UI hint — award calculations do not check it. A ride like "Wild Mayo Ultra" at 657 km gets classified as BRM600 and counted toward awards even though it is not an Audax event.

---

## Solution: Option 3 (auto-exclusion + manual override)

- **Unconfirmed rides** (`needsConfirmation: true` and `!manualOverride`) do not count toward awards until the user explicitly confirms them.
- **Manual exclude flag** (`excludeFromAwards: true`) allows any ride to be excluded regardless of classification status.

---

## Data Model

Add one field to the `Activity` interface:

```typescript
excludeFromAwards: boolean  // default: false
```

No other schema changes. Existing fields `needsConfirmation` and `manualOverride` carry the auto-exclusion logic.

**DB migration:** Add `excludeFromAwards` in a new schema version with a default of `false` for all existing records.

---

## Counting Rule

An activity counts toward awards if and only if all of the following are true:

```typescript
function isCountingForAwards(activity: Activity): boolean {
  return (
    !activity.dnf &&
    activity.eventType !== null &&
    ACP_QUALIFYING_TYPES.includes(activity.eventType) &&
    (activity.classificationSource === 'auto-name' || activity.manualOverride) &&
    !activity.excludeFromAwards
  )
}
```

This helper is defined once and used in both `qualification/tracker.ts` and `awards/awards.ts` to replace the current inline filter.

---

## Activities Page UI

### New "Awards" column

Added between the existing Type and DNF columns. Uses a compact icon with tooltip.

| State | Icon | Colour | Tooltip | Click behaviour |
|---|---|---|---|---|
| Counting | ✓ | Green | "Counting towards awards" | Toggles to ✕ (sets `excludeFromAwards: true`) |
| Unconfirmed | ? | Amber | "Not counting — needs confirmation" | Opens popover |
| Excluded | ✕ | Red | "Manually excluded from awards" | Toggles to ✓ (clears `excludeFromAwards`) |

### Popover on `?` click

Appears inline below the icon. Contains:
- Ride name as a header
- **"Confirm as [type]"** — sets `manualOverride: true`, `needsConfirmation: false`
- **"Exclude from awards"** — sets `excludeFromAwards: true`

Dismissed by clicking outside.

### Bulk actions

Extend the existing checkbox + bulk action bar with two new actions:
- **"Exclude from awards"** — sets `excludeFromAwards: true` on all selected
- **"Include in awards"** — clears `excludeFromAwards` on all selected

---

## Awards / Qualification Pages

**Default behaviour:** excluded and unconfirmed rides are silently ignored. No visual noise for users who have confirmed all their rides.

**Contextual notice:** when an awards page is rendered, check whether any unconfirmed rides (not currently counting) have an `eventType` that would satisfy a qualifying type within the active award window. If so, show a single dismissible banner:

> "X rides are unconfirmed and not counted toward awards. Review in Activities →"

The banner links to the Activities page pre-filtered to `needsConfirmation: true`.

---

## Migration

Existing users may see award totals drop on first load after this change (distance-classified unconfirmed rides stop counting).

- On DB open / `reclassifyAll()`, check localStorage for flag `audax_awards_filter_migrated`.
- If not set, show a one-time dismissible notice on the Dashboard:
  > "Award filtering has been updated. Rides classified by distance now require confirmation to count. Review unconfirmed rides →"
- Set the flag when the user dismisses the notice.

---

## Files Affected

| File | Change |
|---|---|
| `frontend/src/db/types.ts` | Add `excludeFromAwards: boolean` to `Activity` |
| `frontend/src/db/database.ts` | New schema version, migration to set `excludeFromAwards: false`; add `bulkExcludeFromAwards()` / `bulkIncludeInAwards()` helpers |
| `frontend/src/classification/classifier.ts` | Export `isCountingForAwards()` helper |
| `frontend/src/qualification/tracker.ts` | Replace inline filter with `isCountingForAwards()` |
| `frontend/src/awards/awards.ts` | Replace inline filter with `isCountingForAwards()` |
| `frontend/src/pages/ActivitiesPage.tsx` | Add Awards icon column, popover, bulk actions |
| `frontend/src/pages/AwardsPage.tsx` / qualification pages | Add unconfirmed-rides notice |
| `frontend/src/pages/DashboardPage.tsx` | Add one-time migration notice |
