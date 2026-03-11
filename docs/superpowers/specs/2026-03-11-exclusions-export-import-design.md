# Design: Export/Import Ride Exclusions

**Date:** 2026-03-11
**Status:** Approved

## Problem

Ride exclusions (`excludeFromAwards`) are stored in browser IndexedDB (Dexie.js) and are therefore device-local. Users who access the app on multiple devices must re-apply exclusions manually on each device.

## Goal

Allow users to export their exclusion settings to a JSON file and import that file on another device, so exclusions are consistent across devices without requiring manual re-entry.

## Decisions

| Question | Decision |
|----------|----------|
| Conflict handling | Imported file wins — overwrites all matching exclusion states on the target device |
| Export scope | All activities with their exclusion status (full snapshot, not just excluded rides) |
| File format | JSON with a `version` field for forward compatibility |
| UI placement | Small icon button near the existing Sync from Strava button, opens a modal |

## Data Format

File name: `audax-exclusions.json`

```json
{
  "version": 1,
  "exportedAt": "2026-03-11T10:00:00Z",
  "exclusions": [
    { "stravaId": "12345678901", "excludeFromAwards": true },
    { "stravaId": "12345678902", "excludeFromAwards": false }
  ]
}
```

All activities are included (not just excluded ones), so importing on a device with different exclusion state results in a fully known, deterministic outcome.

## Architecture

### Database Layer (`frontend/src/db/database.ts`)

Two new exported functions:

**`exportExclusions(): ExclusionsExport`**
- Queries all activities via `db.activities.toArray()`
- Maps each to `{ stravaId, excludeFromAwards }`
- Returns `{ version: 1, exportedAt: <ISO string>, exclusions: [...] }`

**`importExclusions(data: unknown): Promise<void>`**
- Validates the incoming object: checks `version === 1`, that `exclusions` is an array, and each entry has `stravaId: string` and `excludeFromAwards: boolean`
- Throws a descriptive error on invalid format
- Runs a Dexie transaction updating `excludeFromAwards` for each matching `stravaId`
- Silently skips entries whose `stravaId` is not found in the local DB (e.g. ride not yet synced on this device)

### UI Layer

**`ExclusionsTransferButton` component** (new file, rendered near Sync from Strava button)

- Small icon button (upload/download icon) that opens a modal
- Modal contains two sections:
  - **Export:** button that calls `exportExclusions()`, serialises to JSON, triggers browser file download via `<a download="audax-exclusions.json">`
  - **Import:** file input (`<input type="file" accept=".json">`), reads file via `FileReader`, shows a confirmation prompt ("This will overwrite exclusion settings for all matching rides. Continue?"), calls `importExclusions()`, then shows a success or error toast
- No per-ride conflict resolution UI — intentionally simple

## Error Handling

- Invalid file format (wrong version, missing fields, bad types): show error toast with message
- File read failure: show error toast
- DB transaction failure: show error toast
- Empty exclusions array: valid, applies successfully (no-op effectively)

## Testing

- Unit tests for `exportExclusions()` and `importExclusions()` in the existing `database.test.ts`
- Test cases: round-trip export→import, import with unknown stravaIds, import with invalid format, import with version mismatch
- Manual test: exclude rides on device A, export, import on device B, verify exclusions match
