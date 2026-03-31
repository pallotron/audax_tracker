import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { fetchAllActivities, fetchActivity, fetchNewActivities, type StravaActivityResponse } from "../strava/client";
import { db, type Activity } from "../db/database";
import { geocodeActivities } from "../geo/geocoder";
import { useCloudSync, type CloudSyncHook } from "../cloud/useCloudSync";

const LAST_SYNC_KEY = "audax_last_sync";
const CHECK_COOLDOWN_KEY = "audax_last_check";
const CHECK_COOLDOWN_MS = 60_000;

interface SyncContextValue {
  sync: () => Promise<void>;
  fullSync: () => Promise<void>;
  checkPending: () => Promise<void>;
  refreshActivity: (stravaId: string) => Promise<void>;
  syncing: boolean;
  checking: boolean;
  pendingCount: number;
  refreshing: Set<string>;
  refreshErrors: Map<string, string>;
  progress: { fetched: number; total: number } | null;
  geocoding: { done: number; total: number } | null;
  rateLimitWait: number | null;
  error: string | null;
  lastSync: string | null;
  cloudSync: CloudSyncHook;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function computeAfterEpoch(lastSync: string | null): number | undefined {
  return lastSync
    ? Math.floor(new Date(lastSync).getTime() / 1000) - 60
    : undefined;
}

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

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [rateLimitWait, setRateLimitWait] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(
    () => localStorage.getItem(LAST_SYNC_KEY)
  );
  const [geocoding, setGeocoding] = useState<{ done: number; total: number } | null>(null);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [refreshErrors, setRefreshErrors] = useState<Map<string, string>>(new Map());
  const cloudSync = useCloudSync();
  // Cache from the last checkPending call so sync() can reuse the first page
  // without a redundant API request.
  const pendingCacheRef = useRef<{ raw: StravaActivityResponse[]; fetchedAt: number } | null>(null);
  const PENDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const runSync = useCallback(async (full: boolean) => {
    setSyncing(true);
    setError(null);
    setProgress(null);
    setRateLimitWait(null);

    try {
      const token = await getAccessToken();

      // Full sync: fetch everything (no after), then delete stale local entries.
      // Incremental sync: fetch only what's new since last sync.
      const afterEpoch = full ? undefined : computeAfterEpoch(lastSync);

      // For incremental syncs, reuse activities already fetched during
      // checkPending if the cache is fresh, saving one API call.
      const cache = full ? null : pendingCacheRef.current;
      const cacheAge = cache ? Date.now() - cache.fetchedAt : Infinity;
      const prefetched = cache && cacheAge < PENDING_CACHE_TTL_MS ? cache.raw : undefined;
      pendingCacheRef.current = null;

      const activities = await fetchAllActivities(
        token,
        afterEpoch,
        (fetched) => setProgress({ fetched, total: 0 }),
        (waitSeconds) => setRateLimitWait(waitSeconds),
        prefetched
      );

      await db.transaction("rw", db.activities, async () => {
        for (const activity of activities) {
          const existing = await db.activities.get(activity.stravaId);
          await db.activities.put(applyActivityUpsert(activity, existing));
        }

        // On a full sync (or the very first sync), remove activities no longer
        // on Strava.
        if (full || !lastSync) {
          const stravaIds = new Set(activities.map((a) => a.stravaId));
          const localIds = await db.activities.toCollection().primaryKeys() as string[];
          const toDelete = localIds.filter((id) => !stravaIds.has(id));
          if (toDelete.length > 0) {
            await db.activities.bulkDelete(toDelete);
          }
        }
      });

      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSync(now);
      setPendingCount(0);

      // If cloud sync is enabled, re-apply cloud overrides now that the DB is
      // populated. This matters on a new device where the initial pull was a
      // no-op because the DB was empty at the time.
      if (cloudSync.enabled) {
        await cloudSync.pullAndApply();
      }

      // Geocode in background — state lives in context so survives navigation
      setGeocoding({ done: 0, total: 0 });
      geocodeActivities((done, total) => setGeocoding({ done, total }))
        .catch(console.error)
        .finally(() => setGeocoding(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      setProgress(null);
      setRateLimitWait(null);
    }
  }, [getAccessToken, lastSync, cloudSync]);

  const sync = useCallback(() => runSync(false), [runSync]);
  const fullSync = useCallback(() => runSync(true), [runSync]);

  const checkPending = useCallback(async () => {
    const lastCheck = localStorage.getItem(CHECK_COOLDOWN_KEY);
    if (lastCheck && Date.now() - new Date(lastCheck).getTime() < CHECK_COOLDOWN_MS) {
      return;
    }
    setChecking(true);
    try {
      const token = await getAccessToken();
      const afterEpoch = lastSync
        ? Math.floor(new Date(lastSync).getTime() / 1000)
        : 0;
      const raw = await fetchNewActivities(token, afterEpoch);
      // Cache the raw response so sync() can reuse it as the first page.
      pendingCacheRef.current = { raw, fetchedAt: Date.now() };
      setPendingCount(raw.length);
      localStorage.setItem(CHECK_COOLDOWN_KEY, new Date().toISOString());
    } catch {
      // silently ignore — network or auth failure
    } finally {
      setChecking(false);
    }
  }, [getAccessToken, lastSync]);

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
      if (activity === null) {
        await db.activities.delete(stravaId);
        return;
      }
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

  return (
    <SyncContext.Provider
      value={{ sync, fullSync, checkPending, refreshActivity, syncing, checking, pendingCount, refreshing, refreshErrors, progress, geocoding, rateLimitWait, error, lastSync, cloudSync }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
  return ctx;
}
