# Bulk Refresh Design

**Date:** 2026-03-13
**Status:** Approved

## Problem

The per-activity `↺` refresh button works for individual rows but requires clicking each row separately when multiple activities need refreshing.

## Solution

Add a "↺ Refresh from Strava" button to the bulk action bar that fires `refreshActivity` for all selected activities in parallel, then clears the selection.

## Changes

**`BulkActionBar.tsx`**
- Add `onRefresh: () => void` to `BulkActionBarProps`
- Add a "↺ Refresh from Strava" button after "Confirm Selected"

**`ActivitiesPage.tsx`**
- Add `handleBulkRefresh` callback: `Promise.all(selectedIds.map(refreshActivity))` then `setSelectedIds(new Set())`
- Pass as `onRefresh` to `<BulkActionBar />`

## Non-changes

- No new state
- No new context changes
- No new tests (underlying `refreshActivity` already tested; this is pure wiring)
