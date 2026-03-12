# Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in cloud sync of user activity overrides to Cloudflare KV, with automatic background sync and a visible status indicator in the header.

**Architecture:** The existing Cloudflare Worker gains three KV-backed endpoints (`GET/PUT/DELETE /overrides`) authenticated via Strava access token — the Worker calls Strava's athlete endpoint to resolve the user ID as the KV key. The frontend gains a `useCloudSync` hook that observes Dexie change hooks, debounces writes (3s), and handles pull-on-start with last-write-wins conflict resolution. Three new UI components handle the sync icon, consent dialog, and disable dialog.

**Tech Stack:** Cloudflare Workers KV, Dexie.js change hooks, React hooks, Tailwind CSS, Vitest + Testing Library

---

## File Map

**Worker (modified):**
- `worker/wrangler.toml` — add KV namespace binding
- `worker/src/index.ts` — add `/overrides` GET, PUT, DELETE endpoints; `resolveAthleteId` helper; simple rate limiter

**Frontend (new):**
- `frontend/src/cloud/client.ts` — thin fetch wrapper for the three Worker endpoints
- `frontend/src/cloud/useCloudSync.ts` — hook: enabled/enable/disable, status, Dexie change observation, debounced push, pull on mount
- `frontend/src/components/CloudSyncIcon.tsx` — header status icon (idle/syncing/synced/error)
- `frontend/src/components/CloudSyncConsentDialog.tsx` — first-use opt-in dialog
- `frontend/src/components/CloudSyncDisableDialog.tsx` — keep/delete choice when disabling

**Frontend (modified):**
- `frontend/src/db/database.ts` — bump `BackupExport` to v2; add `preferences` field
- `frontend/src/context/SyncContext.tsx` — instantiate `useCloudSync`, expose via context
- `frontend/src/components/Layout.tsx` — add `CloudSyncIcon` to header
- `frontend/src/pages/AboutPage.tsx` — add Cloud Sync section, Strava API Policy section, consent/disable dialogs

**Tests (new):**
- `frontend/src/__tests__/cloud/client.test.ts`
- `frontend/src/__tests__/cloud/useCloudSync.test.ts`

---

## Chunk 1: Data model + Worker endpoints

### Task 1: Bump BackupExport to v2

**Files:**
- Modify: `frontend/src/db/database.ts`
- Test: `frontend/src/__tests__/db/database.test.ts`

- [ ] **Step 1: Read the existing test file**

  Read `frontend/src/__tests__/db/database.test.ts` to understand the test setup and Dexie mock pattern in use.

- [ ] **Step 2: Write a failing test for v2 BackupExport shape**

  Add to `frontend/src/__tests__/db/database.test.ts`:

  ```ts
  it("exportBackup produces version 2 with preferences field", async () => {
    const backup = await exportBackup();
    expect(backup.version).toBe(2);
    expect(backup.preferences).toBeDefined();
    expect(typeof backup.preferences.cloudSyncEnabled).toBe("boolean");
  });
  ```

- [ ] **Step 3: Run test to verify it fails**

  Run: `cd frontend && npm test -- --reporter=verbose 2>&1 | grep -A5 "version 2"`
  Expected: FAIL — `backup.version` is `1`, not `2`

- [ ] **Step 4: Update BackupExport interface in `database.ts`**

  Change the interface:

  ```ts
  export interface BackupExport {
    version: 2;
    exportedAt: string;
    preferences: {
      cloudSyncEnabled: boolean;
    };
    activities: BackupEntry[];
  }
  ```

- [ ] **Step 5: Update `exportBackup()` and `importBackup()` in `database.ts`**

  In `exportBackup()`, change the returned object (all `BackupEntry` fields are identical to v1 — only the wrapper changes):

  ```ts
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    preferences: {
      cloudSyncEnabled: localStorage.getItem("audax_cloud_sync_enabled") === "true",
    },
    activities: activities.map((a) => ({
      stravaId: a.stravaId,
      eventType: a.eventType,
      classificationSource: a.classificationSource,
      needsConfirmation: a.needsConfirmation,
      manualOverride: a.manualOverride,
      homologationNumber: a.homologationNumber,
      dnf: a.dnf,
      excludeFromAwards: a.excludeFromAwards,
      isNotableInternational: a.isNotableInternational,
    })),
  };
  ```

  In `importBackup()`, update the version guard to accept both v1 and v2:

  ```ts
  if (d.version !== 1 && d.version !== 2) {
    throw new Error("Unsupported backup file version");
  }
  ```

- [ ] **Step 5b: Update the existing v1 test assertion**

  In `frontend/src/__tests__/db/database.test.ts`, find the assertion that checks `version: 1` and update it to `version: 2`:

  ```ts
  // Before:
  expect(result.version).toBe(1);
  // After:
  expect(result.version).toBe(2);
  ```

- [ ] **Step 6: Run all tests to verify they pass**

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 7: Commit**

  ```bash
  jj describe -m "feat: bump BackupExport to v2 with preferences field"
  jj new
  ```

---

### Task 2: Add KV namespace binding to wrangler.toml

**Files:**
- Modify: `worker/wrangler.toml`

- [ ] **Step 1: Create the KV namespace**

  Run: `cd worker && npx wrangler kv namespace create OVERRIDES_KV`
  Note the returned `id`.

  Run: `cd worker && npx wrangler kv namespace create OVERRIDES_KV --preview`
  Note the returned `preview_id`.

- [ ] **Step 2: Add binding to wrangler.toml**

  Add to `worker/wrangler.toml`:

  ```toml
  [[kv_namespaces]]
  binding = "OVERRIDES_KV"
  id = "<id from step 1>"
  preview_id = "<preview_id from step 1>"
  ```

- [ ] **Step 3: Commit**

  ```bash
  jj describe -m "chore: add KV namespace binding for overrides"
  jj new
  ```

---

### Task 3: Implement Worker /overrides endpoints

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Add `OVERRIDES_KV` to the `Env` interface**

  ```ts
  export interface Env {
    STRAVA_CLIENT_ID: string;
    STRAVA_CLIENT_SECRET: string;
    ALLOWED_ORIGINS: string;
    OVERRIDES_KV: KVNamespace;
  }
  ```

- [ ] **Step 2: Update `corsHeaders()` to allow GET, PUT, DELETE and the Authorization header**

  ```ts
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  ```

- [ ] **Step 3: Add route dispatch for `/overrides` in the fetch handler**

  Before the 404 return:

  ```ts
  if (url.pathname === "/overrides") {
    if (request.method === "GET") return handleGetOverrides(request, env, headers);
    if (request.method === "PUT") return handlePutOverrides(request, env, headers);
    if (request.method === "DELETE") return handleDeleteOverrides(request, env, headers);
  }
  ```

- [ ] **Step 4: Implement `resolveAthleteId` helper**

  ```ts
  async function resolveAthleteId(
    request: Request,
    headers: HeadersInit
  ): Promise<{ id: string } | Response> {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    const token = auth.slice(7);
    const res = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    const athlete = (await res.json()) as { id: number };
    return { id: String(athlete.id) };
  }
  ```

- [ ] **Step 5: Implement a simple per-athlete write rate limiter**

  Add module-level state (resets on Worker restart — good enough for abuse prevention):

  ```ts
  const writeCounts = new Map<string, { count: number; resetAt: number }>();

  function checkRateLimit(athleteId: string): boolean {
    const now = Date.now();
    const entry = writeCounts.get(athleteId);
    if (!entry || now > entry.resetAt) {
      writeCounts.set(athleteId, { count: 1, resetAt: now + 3_600_000 });
      return true;
    }
    if (entry.count >= 60) return false;
    entry.count++;
    return true;
  }
  ```

- [ ] **Step 6: Implement `handleGetOverrides`**

  ```ts
  async function handleGetOverrides(
    request: Request,
    env: Env,
    headers: HeadersInit
  ): Promise<Response> {
    const result = await resolveAthleteId(request, headers);
    if (result instanceof Response) return result;
    const value = await env.OVERRIDES_KV.get(`overrides:${result.id}`);
    if (!value) return new Response(null, { status: 204, headers });
    return new Response(value, {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  ```

- [ ] **Step 7: Implement `handlePutOverrides`**

  ```ts
  async function handlePutOverrides(
    request: Request,
    env: Env,
    headers: HeadersInit
  ): Promise<Response> {
    const result = await resolveAthleteId(request, headers);
    if (result instanceof Response) return result;
    if (!checkRateLimit(result.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    const body = await request.text();
    await env.OVERRIDES_KV.put(`overrides:${result.id}`, body);
    return new Response(null, { status: 200, headers });
  }
  ```

- [ ] **Step 8: Implement `handleDeleteOverrides`**

  ```ts
  async function handleDeleteOverrides(
    request: Request,
    env: Env,
    headers: HeadersInit
  ): Promise<Response> {
    const result = await resolveAthleteId(request, headers);
    if (result instanceof Response) return result;
    await env.OVERRIDES_KV.delete(`overrides:${result.id}`);
    return new Response(null, { status: 200, headers });
  }
  ```

- [ ] **Step 9: Manual test with wrangler dev**

  Run: `cd worker && npx wrangler dev`

  Test cases (use curl or a REST client with a real Strava access token):
  - `GET /overrides` with no `Authorization` header → expect 401
  - `GET /overrides` with valid token, no data yet → expect 204
  - `PUT /overrides` with valid token and `{"version":2,...}` body → expect 200
  - `GET /overrides` with valid token → expect 200 with the stored JSON
  - `DELETE /overrides` with valid token → expect 200
  - `GET /overrides` after delete → expect 204

- [ ] **Step 10: Deploy the worker**

  Run: `cd worker && npx wrangler deploy`

- [ ] **Step 11: Commit**

  ```bash
  jj describe -m "feat: add /overrides KV endpoints to Worker"
  jj new
  ```

---

## Chunk 2: Frontend cloud client + useCloudSync hook

### Task 4: Cloud API client

**Files:**
- Create: `frontend/src/cloud/client.ts`
- Test: `frontend/src/__tests__/cloud/client.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `frontend/src/__tests__/cloud/client.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { getOverrides, putOverrides, deleteOverrides } from "../../cloud/client";
  import type { BackupExport } from "../../db/database";

  const mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);

  const BASE = "https://api.example.com";
  const TOKEN = "test-token";

  const sampleBackup: BackupExport = {
    version: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    preferences: { cloudSyncEnabled: true },
    activities: [],
  };

  beforeEach(() => mockFetch.mockReset());

  describe("getOverrides", () => {
    it("returns null when server returns 204", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });
      expect(await getOverrides(BASE, TOKEN)).toBeNull();
    });

    it("returns parsed backup when server returns 200", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => sampleBackup });
      expect(await getOverrides(BASE, TOKEN)).toEqual(sampleBackup);
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" });
      await expect(getOverrides(BASE, TOKEN)).rejects.toThrow("GET /overrides failed: 401");
    });
  });

  describe("putOverrides", () => {
    it("sends PUT with JSON body and Authorization header", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      await putOverrides(BASE, TOKEN, sampleBackup);
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/overrides`,
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        })
      );
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 });
      await expect(putOverrides(BASE, TOKEN, sampleBackup)).rejects.toThrow("PUT /overrides failed: 429");
    });
  });

  describe("deleteOverrides", () => {
    it("sends DELETE with Authorization header", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      await deleteOverrides(BASE, TOKEN);
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/overrides`,
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        })
      );
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(deleteOverrides(BASE, TOKEN)).rejects.toThrow("DELETE /overrides failed: 500");
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "cloud/client"`
  Expected: FAIL — module not found

- [ ] **Step 3: Implement the client**

  Create `frontend/src/cloud/client.ts`:

  ```ts
  import type { BackupExport } from "../db/database";

  export async function getOverrides(baseUrl: string, token: string): Promise<BackupExport | null> {
    const res = await fetch(`${baseUrl}/overrides`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`GET /overrides failed: ${res.status}`);
    return res.json() as Promise<BackupExport>;
  }

  export async function putOverrides(
    baseUrl: string,
    token: string,
    backup: BackupExport
  ): Promise<void> {
    const res = await fetch(`${baseUrl}/overrides`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backup),
    });
    if (!res.ok) throw new Error(`PUT /overrides failed: ${res.status}`);
  }

  export async function deleteOverrides(baseUrl: string, token: string): Promise<void> {
    const res = await fetch(`${baseUrl}/overrides`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`DELETE /overrides failed: ${res.status}`);
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 5: Commit**

  ```bash
  jj describe -m "feat: add cloud API client for /overrides"
  jj new
  ```

---

### Task 5: useCloudSync hook

**Files:**
- Create: `frontend/src/cloud/useCloudSync.ts`
- Test: `frontend/src/__tests__/cloud/useCloudSync.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `frontend/src/__tests__/cloud/useCloudSync.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { renderHook, act } from "@testing-library/react";
  import { useCloudSync } from "../../cloud/useCloudSync";

  vi.mock("../../context/AuthContext", () => ({
    useAuth: () => ({ getAccessToken: async () => "mock-token" }),
  }));
  vi.mock("../../config", () => ({
    config: { oauthWorkerUrl: "https://api.test.com" },
  }));

  const mockGetOverrides = vi.fn().mockResolvedValue(null);
  const mockPutOverrides = vi.fn().mockResolvedValue(undefined);
  const mockDeleteOverrides = vi.fn().mockResolvedValue(undefined);

  vi.mock("../../cloud/client", () => ({
    getOverrides: (...args: unknown[]) => mockGetOverrides(...args),
    putOverrides: (...args: unknown[]) => mockPutOverrides(...args),
    deleteOverrides: (...args: unknown[]) => mockDeleteOverrides(...args),
  }));

  vi.mock("../../db/database", () => ({
    exportBackup: vi.fn().mockResolvedValue({
      version: 2,
      exportedAt: "2026-01-01T00:00:00.000Z",
      preferences: { cloudSyncEnabled: true },
      activities: [],
    }),
    importBackup: vi.fn().mockResolvedValue(undefined),
    db: {
      activities: {
        hook: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      },
    },
  }));

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("useCloudSync", () => {
    it("is disabled by default when no localStorage key is set", () => {
      const { result } = renderHook(() => useCloudSync());
      expect(result.current.enabled).toBe(false);
    });

    it("is enabled when audax_cloud_sync_enabled is 'true' in localStorage", () => {
      localStorage.setItem("audax_cloud_sync_enabled", "true");
      const { result } = renderHook(() => useCloudSync());
      expect(result.current.enabled).toBe(true);
    });

    it("enable() sets enabled to true and writes to localStorage", async () => {
      const { result } = renderHook(() => useCloudSync());
      await act(async () => { result.current.enable(); });
      expect(result.current.enabled).toBe(true);
      expect(localStorage.getItem("audax_cloud_sync_enabled")).toBe("true");
    });

    it("disable(false) sets enabled to false without calling deleteOverrides", async () => {
      localStorage.setItem("audax_cloud_sync_enabled", "true");
      const { result } = renderHook(() => useCloudSync());
      await act(async () => { await result.current.disable(false); });
      expect(result.current.enabled).toBe(false);
      expect(localStorage.getItem("audax_cloud_sync_enabled")).toBe("false");
      expect(mockDeleteOverrides).not.toHaveBeenCalled();
    });

    it("disable(true) calls deleteOverrides", async () => {
      localStorage.setItem("audax_cloud_sync_enabled", "true");
      const { result } = renderHook(() => useCloudSync());
      await act(async () => { await result.current.disable(true); });
      expect(mockDeleteOverrides).toHaveBeenCalledWith("https://api.test.com", "mock-token");
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "useCloudSync"`
  Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

  Create `frontend/src/cloud/useCloudSync.ts`:

  ```ts
  import { useState, useCallback, useEffect, useRef } from "react";
  import { useAuth } from "../context/AuthContext";
  import { config } from "../config";
  import { getOverrides, putOverrides, deleteOverrides } from "./client";
  import { exportBackup, importBackup, db } from "../db/database";

  const ENABLED_KEY = "audax_cloud_sync_enabled";
  const LAST_PUSH_KEY = "audax_cloud_sync_last_push";
  const DEBOUNCE_MS = 3000;

  export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

  export interface CloudSyncHook {
    enabled: boolean;
    enable: () => void;
    disable: (deleteCloud: boolean) => Promise<void>;
    status: CloudSyncStatus;
    lastSynced: string | null;
    error: string | null;
  }

  export function useCloudSync(): CloudSyncHook {
    const { getAccessToken } = useAuth();
    const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) === "true");
    const [status, setStatus] = useState<CloudSyncStatus>("idle");
    const [lastSynced, setLastSynced] = useState<string | null>(
      () => localStorage.getItem(LAST_PUSH_KEY)
    );
    const [error, setError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const push = useCallback(async () => {
      try {
        setStatus("syncing");
        const token = await getAccessToken();
        const backup = await exportBackup();
        await putOverrides(config.oauthWorkerUrl, token, backup);
        const now = new Date().toISOString();
        localStorage.setItem(LAST_PUSH_KEY, now);
        setLastSynced(now);
        setStatus("synced");
        setError(null);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Sync failed");
      }
    }, [getAccessToken]);

    const schedulePush = useCallback(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { push(); }, DEBOUNCE_MS);
    }, [push]);

    // Pull on mount when enabled, then push if local is newer
    useEffect(() => {
      if (!enabled) return;
      (async () => {
        try {
          setStatus("syncing");
          const token = await getAccessToken();
          const cloud = await getOverrides(config.oauthWorkerUrl, token);
          if (cloud) {
            const lastPush = localStorage.getItem(LAST_PUSH_KEY);
            if (!lastPush || cloud.exportedAt > lastPush) {
              await importBackup(cloud);
              // Propagate cross-device preference
              if (cloud.preferences?.cloudSyncEnabled) {
                localStorage.setItem(ENABLED_KEY, "true");
              }
              setStatus("synced");
            } else {
              await push();
            }
          } else {
            await push();
          }
        } catch (err) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Sync failed");
        }
      })();
    // Only re-run when enabled flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    // Observe Dexie change hooks
    useEffect(() => {
      if (!enabled) return;
      const handler = () => schedulePush();
      db.activities.hook("creating", handler);
      db.activities.hook("updating", handler);
      return () => {
        db.activities.hook("creating").unsubscribe(handler);
        db.activities.hook("updating").unsubscribe(handler);
      };
    }, [enabled, schedulePush]);

    const enable = useCallback(() => {
      localStorage.setItem(ENABLED_KEY, "true");
      setEnabled(true);
    }, []);

    const disable = useCallback(
      async (deleteCloud: boolean) => {
        localStorage.setItem(ENABLED_KEY, "false");
        setEnabled(false);
        setStatus("idle");
        if (deleteCloud) {
          try {
            const token = await getAccessToken();
            await deleteOverrides(config.oauthWorkerUrl, token);
          } catch {
            // best-effort — don't surface error when disabling
          }
        }
      },
      [getAccessToken]
    );

    return { enabled, enable, disable, status, lastSynced, error };
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 5: Commit**

  ```bash
  jj describe -m "feat: add useCloudSync hook with Dexie change observation and debounced push"
  jj new
  ```

---

## Chunk 3: UI components + About page

### Task 6: Wire useCloudSync into SyncContext and Layout

**Files:**
- Modify: `frontend/src/context/SyncContext.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Read SyncContext.tsx to understand existing interface and provider shape**

  Read `frontend/src/context/SyncContext.tsx` in full before editing. Note the exact fields in `SyncContextValue` and the structure of `SyncProvider` — these must be preserved exactly when adding `cloudSync`.

- [ ] **Step 2: Add `cloudSync` to `SyncContextValue` interface in SyncContext.tsx**

  Add the import and field (preserving all existing fields):

  ```ts
  import { useCloudSync, type CloudSyncHook } from "../cloud/useCloudSync";

  interface SyncContextValue {
    sync: () => Promise<void>;
    checkPending: () => Promise<void>;
    syncing: boolean;
    checking: boolean;
    hasPending: boolean;
    progress: { fetched: number; total: number } | null;
    geocoding: { done: number; total: number } | null;
    error: string | null;
    lastSync: string | null;
    cloudSync: CloudSyncHook;
  }
  ```

- [ ] **Step 3: Instantiate `useCloudSync` inside `SyncProvider` and expose it**

  Inside `SyncProvider`:
  ```ts
  const cloudSync = useCloudSync();
  ```

  Add `cloudSync` to the context value object passed to `SyncContext.Provider`.

- [ ] **Step 4: Run tests to verify SyncContext tests still pass**

  Run: `cd frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "syncContext"`
  Expected: pass

- [ ] **Step 5: Read Layout.tsx before editing**

  Read `frontend/src/components/Layout.tsx` in full to find the exact JSX insertion point for the cloud sync icon in the right-side header area (next to the geocoding indicator).

- [ ] **Step 6: Create `CloudSyncIcon` component**

  Create `frontend/src/components/CloudSyncIcon.tsx`:

  ```tsx
  import type { CloudSyncHook } from "../cloud/useCloudSync";

  interface Props {
    sync: CloudSyncHook;
    onRetry?: () => void;
  }

  export default function CloudSyncIcon({ sync, onRetry }: Props) {
    if (!sync.enabled) return null;

    const tooltip =
      sync.status === "synced" && sync.lastSynced
        ? `Last synced: ${new Date(sync.lastSynced).toLocaleTimeString()}`
        : sync.status === "error"
        ? `${sync.error ?? "Sync error"} — click to retry`
        : sync.status === "syncing"
        ? "Syncing to cloud…"
        : "Cloud sync enabled";

    return (
      <span
        title={tooltip}
        className={`inline-flex items-center ${sync.status === "error" ? "cursor-pointer" : ""}`}
        onClick={sync.status === "error" ? onRetry : undefined}
      >
        {sync.status === "syncing" && (
          <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {sync.status === "synced" && (
          <svg className="h-4 w-4 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
          </svg>
        )}
        {sync.status === "error" && (
          <svg className="h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd" />
          </svg>
        )}
        {sync.status === "idle" && (
          <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
          </svg>
        )}
      </span>
    );
  }
  ```

- [ ] **Step 7: Add `retry` to `useCloudSync` hook**

  Open `frontend/src/cloud/useCloudSync.ts` (created in Chunk 2). The internal immediate-push function is named `push` (distinct from `schedulePush`, the debounced wrapper — `retry` should call `push` directly for immediate effect). Add `retry` to the `CloudSyncHook` interface and return it:

  ```ts
  // In CloudSyncHook interface, add:
  retry: () => void;

  // In the return statement, add:
  retry: push,
  ```

  Check `frontend/src/__tests__/cloud/useCloudSync.test.ts` — the tests there do not assert the exact shape of the return value (they test individual behaviours), so no test updates are needed. Run to confirm:

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 8: Add `CloudSyncIcon` to the header in Layout.tsx**

  In `frontend/src/components/Layout.tsx`, add the import and update the existing `useSyncContext` destructure to include `cloudSync`, then insert the icon alongside the geocoding indicator:

  ```tsx
  import CloudSyncIcon from "./CloudSyncIcon";
  // Update existing destructure (already imports geocoding):
  const { geocoding, cloudSync } = useSyncContext();
  // In the right-side div, alongside the geocoding indicator:
  <CloudSyncIcon sync={cloudSync} onRetry={cloudSync.retry} />
  ```

- [ ] **Step 9: Run all tests**

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 10: Visual verification**

  Run: `cd frontend && npm run dev`
  Open app, run `localStorage.setItem("audax_cloud_sync_enabled","true")` in browser console, reload.
  Expected: cloud icon appears in header; on error state icon is clickable.

- [ ] **Step 11: Commit**

  ```bash
  jj describe -m "feat: add CloudSyncIcon to header via SyncContext"
  jj new
  ```

---

### Task 7: Consent and Disable dialogs

**Files:**
- Create: `frontend/src/components/CloudSyncConsentDialog.tsx`
- Test: `frontend/src/__tests__/components/CloudSyncConsentDialog.test.tsx`
- Create: `frontend/src/components/CloudSyncDisableDialog.tsx`
- Test: `frontend/src/__tests__/components/CloudSyncDisableDialog.test.tsx`

- [ ] **Step 1: Write failing tests for CloudSyncConsentDialog**

  Create `frontend/src/__tests__/components/CloudSyncConsentDialog.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import CloudSyncConsentDialog from "../../components/CloudSyncConsentDialog";

  describe("CloudSyncConsentDialog", () => {
    it("renders the dialog with enable and dismiss buttons", () => {
      render(<CloudSyncConsentDialog onEnable={vi.fn()} onDismiss={vi.fn()} />);
      expect(screen.getByText(/Enable Cloud Sync/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Enable cloud sync/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /No thanks/i })).toBeInTheDocument();
    });

    it("calls onEnable when Enable button is clicked", async () => {
      const onEnable = vi.fn();
      render(<CloudSyncConsentDialog onEnable={onEnable} onDismiss={vi.fn()} />);
      await userEvent.click(screen.getByRole("button", { name: /Enable cloud sync/i }));
      expect(onEnable).toHaveBeenCalledOnce();
    });

    it("calls onDismiss when No thanks button is clicked", async () => {
      const onDismiss = vi.fn();
      render(<CloudSyncConsentDialog onEnable={vi.fn()} onDismiss={onDismiss} />);
      await userEvent.click(screen.getByRole("button", { name: /No thanks/i }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 2: Write failing tests for CloudSyncDisableDialog**

  Create `frontend/src/__tests__/components/CloudSyncDisableDialog.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import CloudSyncDisableDialog from "../../components/CloudSyncDisableDialog";

  describe("CloudSyncDisableDialog", () => {
    it("renders keep, delete, and cancel options", () => {
      render(<CloudSyncDisableDialog onKeep={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText(/Keep my cloud data/i)).toBeInTheDocument();
      expect(screen.getByText(/Delete my cloud data/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    });

    it("calls onKeep when Keep button is clicked", async () => {
      const onKeep = vi.fn();
      render(<CloudSyncDisableDialog onKeep={onKeep} onDelete={vi.fn()} onCancel={vi.fn()} />);
      await userEvent.click(screen.getByText(/Keep my cloud data/i));
      expect(onKeep).toHaveBeenCalledOnce();
    });

    it("calls onDelete when Delete button is clicked", async () => {
      const onDelete = vi.fn();
      render(<CloudSyncDisableDialog onKeep={vi.fn()} onDelete={onDelete} onCancel={vi.fn()} />);
      await userEvent.click(screen.getByText(/Delete my cloud data/i));
      expect(onDelete).toHaveBeenCalledOnce();
    });

    it("calls onCancel when Cancel button is clicked", async () => {
      const onCancel = vi.fn();
      render(<CloudSyncDisableDialog onKeep={vi.fn()} onDelete={vi.fn()} onCancel={onCancel} />);
      await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 3: Run tests to verify they fail**

  Run: `cd frontend && npm test -- --reporter=verbose 2>&1 | grep -A3 "Dialog"`
  Expected: FAIL — modules not found

- [ ] **Step 4: Create CloudSyncConsentDialog**

  Create `frontend/src/components/CloudSyncConsentDialog.tsx`:

  ```tsx
  interface Props {
    onEnable: () => void;
    onDismiss: () => void;
  }

  export default function CloudSyncConsentDialog({ onEnable, onDismiss }: Props) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Enable Cloud Sync?</h2>
          <p className="mb-3 text-sm text-gray-600">
            Your activity annotations (event types, DNF flags, homologation numbers) will be
            securely stored on Cloudflare using your Strava identity. No separate account needed.
          </p>
          <ul className="mb-4 space-y-1 text-sm text-gray-600 list-disc pl-5">
            <li>Syncs automatically in the background</li>
            <li>Works across all your devices</li>
            <li>Strava activity data, GPS tracks, and personal info are never stored in the cloud</li>
            <li>You can delete your cloud data at any time</li>
          </ul>
          <div className="flex justify-end gap-3">
            <button
              onClick={onDismiss}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              No thanks
            </button>
            <button
              onClick={onEnable}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Enable cloud sync
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 5: Create CloudSyncDisableDialog**

  Create `frontend/src/components/CloudSyncDisableDialog.tsx`:

  ```tsx
  interface Props {
    onKeep: () => void;
    onDelete: () => void;
    onCancel: () => void;
  }

  export default function CloudSyncDisableDialog({ onKeep, onDelete, onCancel }: Props) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Disable Cloud Sync</h2>
          <p className="mb-4 text-sm text-gray-600">What would you like to do with your cloud data?</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={onKeep}
              className="rounded-lg border border-gray-200 px-4 py-3 text-left text-sm hover:bg-gray-50"
            >
              <span className="font-medium text-gray-800">Keep my cloud data</span>
              <p className="text-gray-500 mt-0.5">
                Sync is turned off, but your data stays in the cloud. You can re-enable later.
              </p>
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-4 py-3 text-left text-sm hover:bg-red-50"
            >
              <span className="font-medium text-red-700">Delete my cloud data</span>
              <p className="text-red-500 mt-0.5">
                Permanently removes your data from the cloud. Only your local browser copy remains.
              </p>
            </button>
            <button onClick={onCancel} className="mt-1 text-sm text-gray-500 hover:text-gray-700 text-center">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 6: Run tests to verify they pass**

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 7: Commit**

  ```bash
  jj describe -m "feat: add CloudSyncConsentDialog and CloudSyncDisableDialog"
  jj new
  ```

---

### Task 8: Update AboutPage

**Files:**
- Modify: `frontend/src/pages/AboutPage.tsx`

- [ ] **Step 1: Read AboutPage.tsx before editing**

  Read `frontend/src/pages/AboutPage.tsx` in full. Note: `SyncProvider` wraps the entire app in `App.tsx` (including the `/about` route), so `useSyncContext` is safe to call here regardless of auth state. Note the exact JSX of the Privacy section (the text to replace) and the location of the closing `</div>` of the `space-y-8` container where the new sections will be inserted.

- [ ] **Step 2: Import dialogs and access cloudSync from SyncContext**

  Note: `cloudSync.enable()` is a **raw setter** — it only sets `localStorage` and flips the `enabled` state. It does **not** show a dialog. The consent dialog is owned entirely by `AboutPage` local state. Calling `enable()` inside `onEnable` after the user has already clicked through the dialog is correct and will not cause a double-dialog.

  Add imports to `AboutPage.tsx`:

  ```tsx
  import { useState } from "react";
  import { useSyncContext } from "../context/SyncContext";
  import CloudSyncConsentDialog from "../components/CloudSyncConsentDialog";
  import CloudSyncDisableDialog from "../components/CloudSyncDisableDialog";
  ```

  Inside the component:

  ```tsx
  const { cloudSync } = useSyncContext();
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  ```

- [ ] **Step 3: Replace the existing Privacy section**

  Update the Privacy section to note that local storage is the default and cloud sync is opt-in:

  ```tsx
  <section>
    <h2 className="mb-2 text-xl font-semibold text-gray-800">Privacy</h2>
    <p className="text-gray-600">
      By default, all your activity data is stored locally in your browser using IndexedDB.
      Nothing is sent to any external server beyond the initial Strava sync. Clearing your
      browser data will remove all stored activities. Optionally, you can enable cloud sync
      (see below) to back up your annotations across devices.
    </p>
  </section>
  ```

- [ ] **Step 4: Add Cloud Sync section after Privacy**

  ```tsx
  <section>
    <h2 className="mb-2 text-xl font-semibold text-gray-800">Cloud Sync</h2>
    <p className="mb-3 text-gray-600">
      Optionally sync your activity annotations (event types, DNF flags, homologation numbers)
      across devices. Your Strava activity data, GPS tracks, and personal information are never
      stored in the cloud — only the annotations you create within Audax Tracker.
    </p>
    {cloudSync.enabled ? (
      <button
        onClick={() => setShowDisableDialog(true)}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        Disable cloud sync
      </button>
    ) : (
      <button
        onClick={() => setShowConsentDialog(true)}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Enable cloud sync
      </button>
    )}
    {showConsentDialog && (
      <CloudSyncConsentDialog
        onEnable={() => { cloudSync.enable(); setShowConsentDialog(false); }}
        onDismiss={() => setShowConsentDialog(false)}
      />
    )}
    {showDisableDialog && (
      <CloudSyncDisableDialog
        onKeep={() => { void cloudSync.disable(false); setShowDisableDialog(false); }}
        onDelete={() => { void cloudSync.disable(true); setShowDisableDialog(false); }}
        onCancel={() => setShowDisableDialog(false)}
      />
    )}
    {/* Note: disable(true) calls deleteOverrides as best-effort — errors are silently
        swallowed inside useCloudSync to avoid surfacing a network error during disable. */}
  </section>
  ```

- [ ] **Step 5: Add Strava API Policy section after Cloud Sync**

  ```tsx
  <section>
    <h2 className="mb-2 text-xl font-semibold text-gray-800">Strava API Policy</h2>
    <p className="text-gray-600">
      Audax Tracker complies with the{" "}
      <a
        href="https://www.strava.com/legal/api"
        target="_blank"
        rel="noopener noreferrer"
        className="text-orange-600 hover:underline"
      >
        Strava API Agreement
      </a>
      . Strava activity data — including names, distances, GPS tracks, and other Strava content —
      is stored only in your local browser and is never uploaded to any external server. The
      optional cloud sync feature stores only user-generated annotations: data you have created
      within Audax Tracker, not data retrieved from Strava. You can permanently delete your
      cloud data at any time using the Cloud Sync settings above.
    </p>
  </section>
  ```

- [ ] **Step 6: Run all tests**

  Run: `cd frontend && npm test`
  Expected: all pass

- [ ] **Step 7: Visual verification**

  Run: `cd frontend && npm run dev`, navigate to `/about`.
  - Verify "Enable cloud sync" button appears when sync is off
  - Click it → consent dialog appears
  - Click "Enable" → button changes to "Disable cloud sync"
  - Click "Disable cloud sync" → disable dialog with keep/delete options appears
  - Verify Strava API Policy section is present

- [ ] **Step 8: Commit**

  ```bash
  jj describe -m "feat: update AboutPage with Cloud Sync controls and Strava API Policy section"
  jj new
  ```
