# Cloud Sync Design

**Date:** 2026-03-12
**Status:** Approved

## Overview

Opt-in cloud synchronisation of user-generated annotations (event classifications, DNF flags, homologation numbers, etc.) across devices. Raw Strava activity data is never stored in the cloud — only the user's own overrides, which are tiny and can be cleanly separated from Strava content.

---

## Architecture

Three components:

1. **Extended Cloudflare Worker** (`audax-tracker-oauth`) — gains three new endpoints authenticated via Strava access token. The Worker calls `api.strava.com/v3/athlete` to resolve the athlete ID, then uses it as the KV key. The browser never touches KV directly.

2. **Cloudflare KV namespace** — one entry per user, storing a `BackupExport` JSON blob. No compression (payload is tiny; Cloudflare handles transit compression automatically).

3. **Frontend `useCloudSync` hook** — runs in the background, observes Dexie change hooks, debounces writes (3s), and manages push/pull on app start.

---

## KV Data Model

```
key:   overrides:{stravaAthleteId}
value: BackupExport JSON (version 2)
```

### BackupExport v2 schema

```ts
interface BackupExport {
  version: 2;
  exportedAt: string;          // ISO timestamp — serves as last-write timestamp
  preferences: {
    cloudSyncEnabled: boolean;
  };
  activities: BackupEntry[];
}
```

`BackupEntry` is unchanged from v1 — contains only user-generated fields:
`stravaId`, `eventType`, `classificationSource`, `needsConfirmation`, `manualOverride`, `homologationNumber`, `dnf`, `excludeFromAwards`, `isNotableInternational`.

---

## Worker Endpoints

All endpoints require `Authorization: Bearer <strava_access_token>`. The Worker validates by calling Strava's athlete endpoint to resolve the numeric athlete ID.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/overrides` | Returns the KV blob, or `204 No Content` if none exists |
| `PUT` | `/overrides` | Body: `BackupExport` JSON. Writes to KV, returns `200 OK` |
| `DELETE` | `/overrides` | Deletes the KV entry permanently. Returns `200 OK` |

**Security:**
- Strava token validation serves as auth — no separate accounts
- Rate limiting: 60 writes per athlete per hour
- CORS: gated by existing `ALLOWED_ORIGINS` Worker secret

---

## Frontend Sync Flow

### localStorage (device-local)

| Key | Purpose |
|-----|---------|
| `audax_cloud_sync_enabled` | Opt-in flag. Set on consent; also propagated from cloud `preferences` |
| `audax_cloud_sync_last_push` | Local watermark — ISO timestamp of last successful push |

### On app start (if sync enabled)

1. `GET /overrides`
2. If cloud `exportedAt` is newer than `audax_cloud_sync_last_push` → `importBackup()` to merge cloud into local
3. If local is newer or cloud is empty → push local immediately

### On local override change

Observe via `db.activities.hook('updating')` and `db.activities.hook('creating')`. Debounce 3 seconds, then `exportBackup()` → `PUT /overrides`. Update `audax_cloud_sync_last_push` on success.

### Cross-device preference propagation

`preferences.cloudSyncEnabled` is stored in the KV blob. When a user enables sync on a new device (consent dialog), the app pulls from cloud and reads this preference to confirm sync is enabled. Chicken-and-egg is resolved by the user explicitly enabling sync locally first.

### Conflict resolution

Last-write-wins based on `exportedAt` timestamp.

### `useCloudSync` hook interface

```ts
{
  enabled: boolean
  enable: () => void       // shows consent dialog on first call
  disable: () => void      // offers to keep or delete cloud copy
  status: "idle" | "syncing" | "synced" | "error"
  lastSynced: string | null
  error: string | null
}
```

---

## UI Components

### Sync status icon (header)

Always visible in `Layout.tsx` when sync is enabled; absent when disabled.

| State | Appearance |
|-------|-----------|
| Syncing | Animated cloud with spinner |
| Synced | Cloud + checkmark; tooltip: "Last synced: X minutes ago" |
| Error | Cloud + `!` badge; tooltip: error message; click → retry/disable dialog |

### First-use consent dialog

Shown once when the user first enables cloud sync. Explains:
- **What is stored:** Event classifications, DNF flags, homologation numbers, and other user annotations
- **Where:** Cloudflare KV, accessed via your Strava identity — no separate account needed
- **What is NOT stored:** Strava activity data, GPS tracks, names, distances, or personal information
- **Buttons:** Enable / No thanks

### Disable flow

Accessible from the sync icon or About page. When disabling, user chooses:
- **Keep my cloud data** — sync off, data remains in KV, can re-enable later
- **Delete my cloud data** — calls `DELETE /overrides`, permanently removes KV entry; only local IndexedDB copy remains

---

## About Page Additions

### Cloud Sync section

Explains the feature, what is stored, where, and how to enable/disable. Includes a direct link to the disable/delete flow.

### Strava API Policy section

Clarifies:
- Only user-generated annotations are stored in the cloud
- Strava activity data (names, distances, GPS, etc.) is never persisted outside the browser
- Users can permanently delete their cloud data at any time via the disable flow
- This design complies with Strava's API agreement, which restricts storing Strava content — user metadata is not Strava content

---

## What Is Explicitly Out of Scope

- Real-time multi-device sync (push notifications, WebSockets)
- Per-field conflict resolution
- Sync history or audit log
- Any server-side processing of activity data
