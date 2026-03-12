import { createContext, useCallback, useContext, useState } from "react";
import { useAuth } from "./AuthContext";
import { fetchAllActivities, hasNewActivities } from "../strava/client";
import { db } from "../db/database";
import { geocodeActivities } from "../geo/geocoder";
import { useCloudSync, type CloudSyncHook } from "../cloud/useCloudSync";

const LAST_SYNC_KEY = "audax_last_sync";

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

const SyncContext = createContext<SyncContextValue | null>(null);

export function computeAfterEpoch(lastSync: string | null): number | undefined {
  return lastSync
    ? Math.floor(new Date(lastSync).getTime() / 1000)
    : undefined;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(
    () => localStorage.getItem(LAST_SYNC_KEY)
  );
  const [geocoding, setGeocoding] = useState<{ done: number; total: number } | null>(null);
  const cloudSync = useCloudSync();

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setProgress(null);

    try {
      const token = await getAccessToken();

      const afterEpoch = computeAfterEpoch(lastSync);

      const activities = await fetchAllActivities(token, afterEpoch, (fetched) => {
        setProgress({ fetched, total: 0 });
      });

      await db.transaction("rw", db.activities, async () => {
        for (const activity of activities) {
          const existing = await db.activities.get(activity.stravaId);
          if (existing?.manualOverride) {
            await db.activities.put({
              ...activity,
              eventType: existing.eventType,
              classificationSource: existing.classificationSource,
              manualOverride: true,
              homologationNumber: existing.homologationNumber,
              dnf: existing.dnf,
              startCountry: existing.startCountry,
              startRegion: existing.startRegion,
              endCountry: existing.endCountry,
              endRegion: existing.endRegion,
              isNotableInternational: existing.isNotableInternational,
            });
          } else {
            await db.activities.put({
              ...activity,
              startCountry: existing?.startCountry ?? null,
              startRegion: existing?.startRegion ?? null,
              endCountry: existing?.endCountry ?? null,
              endRegion: existing?.endRegion ?? null,
              isNotableInternational: existing?.isNotableInternational ?? false,
            });
          }
        }
      });

      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSync(now);
      setHasPending(false);

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
    }
  }, [getAccessToken, lastSync]);

  const checkPending = useCallback(async () => {
    setChecking(true);
    try {
      const token = await getAccessToken();
      const afterEpoch = lastSync
        ? Math.floor(new Date(lastSync).getTime() / 1000)
        : 0;
      const pending = await hasNewActivities(token, afterEpoch);
      setHasPending(pending);
    } catch {
      // silently ignore — network or auth failure
    } finally {
      setChecking(false);
    }
  }, [getAccessToken, lastSync]);

  return (
    <SyncContext.Provider
      value={{ sync, checkPending, syncing, checking, hasPending, progress, geocoding, error, lastSync, cloudSync }}
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
