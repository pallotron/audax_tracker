import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchAllActivities } from "../strava/client";
import { db } from "../db/database";

const LAST_SYNC_KEY = "audax_last_sync";

export function useSync() {
  const { getAccessToken } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(
    () => localStorage.getItem(LAST_SYNC_KEY)
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      const token = await getAccessToken();

      // Fetch after last sync timestamp if available
      const afterEpoch = lastSync
        ? Math.floor(new Date(lastSync).getTime() / 1000)
        : undefined;

      const activities = await fetchAllActivities(token, afterEpoch);

      // Upsert activities, preserving manual overrides
      await db.transaction("rw", db.activities, async () => {
        for (const activity of activities) {
          const existing = await db.activities.get(activity.stravaId);
          if (existing?.manualOverride) {
            // Preserve manual override fields, update the rest
            await db.activities.put({
              ...activity,
              eventType: existing.eventType,
              classificationSource: existing.classificationSource,
              manualOverride: true,
              homologationNumber: existing.homologationNumber,
            });
          } else {
            await db.activities.put(activity);
          }
        }
      });

      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSync(now);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [getAccessToken, lastSync]);

  return { sync, syncing, error, lastSync };
}
