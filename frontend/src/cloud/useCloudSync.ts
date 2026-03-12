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
  retry: () => void;
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

  return { enabled, enable, disable, retry: push, status, lastSynced, error };
}
