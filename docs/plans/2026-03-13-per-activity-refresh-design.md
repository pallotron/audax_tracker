# Per-Activity Refresh from Strava

**Date:** 2026-03-13
**Status:** Approved

## Problem

The Strava API's `after` parameter filters by `start_date`, not `updated_at`. Incremental syncs are therefore blind to activity renames. A user who renames an activity (e.g. adding "BRM300" or "DNF" to the title) will not see the update reflected in the tracker until they do a full re-sync.

## Solution

Add a per-activity "Refresh from Strava" button that calls `GET /activities/{id}` — a single lightweight API call — and updates the local DB record. User-initiated, so they can pull the update whenever they know a rename happened.

## Architecture

### 1. `strava/client.ts` — `fetchActivity`

New function:

```ts
fetchActivity(stravaId: string, accessToken: string): Promise<Activity>
```

- Calls `GET /activities/{stravaId}`
- Maps the response with the existing `mapStravaActivity`
- Throws a readable error on non-OK responses, including a human-readable message for 429 ("Rate limited — try again in N minutes")
- Does not auto-retry on 429 (single-activity context doesn't warrant blocking the UI)

### 2. `context/SyncContext.tsx` — `refreshActivity`

New method added to the context value:

```ts
refreshActivity(stravaId: string): Promise<void>
```

- Calls `getAccessToken()` then `fetchActivity`
- Applies the same upsert logic as `sync`:
  - For `manualOverride: true` activities: preserves `eventType`, `classificationSource`, `manualOverride`, `homologationNumber`, `dnf`, and geo fields; updates `name`, `distance`, `movingTime`, etc.
  - For `manualOverride: false` activities: writes the full fresh record from the classifier, preserving only geo fields
- Tracks in-flight activity IDs in a `Set<string>` state (`refreshing`) so multiple rows can refresh independently
- Stores per-activity errors in a `Map<string, string>` state (`refreshErrors`) keyed by `stravaId`

### 3. `components/ActivityRow.tsx`

- Adds `onRefresh: () => Promise<void>` and `refreshing: boolean` props
- Renders a small `↺` icon button next to "Edit", always visible
- Button is disabled and shows a spinner while `refreshing` is true
- Shows a transient inline error message on failure (clears on next attempt)

### 4. `pages/ActivitiesPage.tsx`

- Pulls `refreshActivity`, `refreshing`, and `refreshErrors` from `useSyncContext()`
- Passes `onRefresh={() => refreshActivity(activity.stravaId)}`, `refreshing={refreshing.has(activity.stravaId)}`, and any error down to each `ActivityRow`

## Error Handling

| Scenario | Behaviour |
|---|---|
| Network / API error | Inline error in the row, cleared on retry |
| 429 rate limit | Human-readable message, no auto-retry |
| Auth error | `getAccessToken()` handles token refresh transparently |

## Testing

- **`strava/client.test.ts`**: success case maps correctly; non-OK response throws; 429 throws with readable message
- **`context/syncContext.test.ts`**: `refreshActivity` preserves `manualOverride` fields; non-manual activities get fresh classification; error state is set on failure
