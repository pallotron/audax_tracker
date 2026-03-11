import Dexie, { type EntityTable } from "dexie";
import type { EventType, ClassificationSource } from "./types";
import { classifyActivity, detectDnf } from "../classification/classifier";

export interface Activity {
  stravaId: string;
  name: string;
  date: Date;
  distance: number;
  elevationGain: number;
  movingTime: number;
  elapsedTime: number;
  type: string;
  eventType: EventType;
  classificationSource: ClassificationSource;
  needsConfirmation: boolean;
  manualOverride: boolean;
  homologationNumber: string | null;
  dnf: boolean;
  excludeFromAwards: boolean;
  sourceUrl: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  startCountry: string | null;
  startRegion: string | null;
  endCountry: string | null;
  endRegion: string | null;
  isNotableInternational: boolean;
}

export const db = new Dexie("AudaxTracker") as Dexie & {
  activities: EntityTable<Activity, "stravaId">;
};

db.version(1).stores({
  activities: "stravaId, date, eventType, type",
});

db.version(2).stores({
  activities: "stravaId, date, eventType, type",
}).upgrade(tx => {
  return tx.table("activities").toCollection().modify(activity => {
    if (activity.needsConfirmation === undefined) {
      activity.needsConfirmation = activity.classificationSource === "auto-distance";
    }
  });
});

db.version(3).stores({
  activities: "stravaId, date, eventType, type",
}).upgrade(tx => {
  return tx.table("activities").toCollection().modify(activity => {
    if (activity.dnf === undefined) {
      activity.dnf = false;
    }
  });
});

db.version(4).stores({
  activities: "stravaId, date, eventType, type",
}).upgrade(tx => {
  // Backfill dnf=true for any activity with "DNF" in the name
  return tx.table("activities").toCollection().modify(activity => {
    if (/\bdnf\b/i.test(activity.name)) {
      activity.dnf = true;
    }
  });
});

db.version(5).stores({
  activities: "stravaId, date, eventType, type",
}).upgrade(tx => {
  // Backfill sourceUrl for existing Strava activities
  return tx.table("activities").toCollection().modify(activity => {
    if (!activity.sourceUrl) {
      activity.sourceUrl = `https://www.strava.com/activities/${activity.stravaId}`;
    }
  });
});

db.version(6).stores({
  activities: "stravaId, date, eventType, type, startCountry, startRegion",
}).upgrade(tx => {
  return tx.table("activities").toCollection().modify(activity => {
    activity.startLat = null;
    activity.startLng = null;
    activity.endLat = null;
    activity.endLng = null;
    activity.startCountry = null;
    activity.startRegion = null;
    activity.endCountry = null;
    activity.endRegion = null;
    activity.isNotableInternational = false;
  });
});

db.version(7).stores({
  activities: "stravaId, date, eventType, type, startCountry, startRegion",
}).upgrade(tx => {
  return tx.table("activities").toCollection().modify(activity => {
    if (activity.excludeFromAwards === undefined) {
      activity.excludeFromAwards = false;
    }
  });
});

/**
 * Re-run the classifier on all activities.
 * - For non-manually-overridden activities: updates eventType, classificationSource, needsConfirmation, and dnf.
 * - For manually-overridden activities: only updates dnf (manualOverride protects event type, not DNF status).
 * Call at app startup so classifier rule changes take effect without re-syncing.
 */
export async function reclassifyAll(): Promise<number> {
  let updated = 0;
  await db.transaction("rw", db.activities, async () => {
    const all = await db.activities.toArray();
    for (const activity of all) {
      const distanceMeters = activity.distance * 1000; // stored as km
      const result = classifyActivity({
        name: activity.name,
        distance: distanceMeters,
        elevationGain: activity.elevationGain,
      });
      const newDnf = result?.dnf ?? false;

      if (activity.manualOverride) {
        // For manually overridden activities, detect DNF using existing eventType
        // (classifyActivity may return null if name/distance don't match patterns)
        const manualDnf = detectDnf(activity.name, activity.eventType, activity.distance);
        if (activity.dnf !== manualDnf) {
          await db.activities.update(activity.stravaId, { dnf: manualDnf });
          updated++;
        }
      } else {
        const newType = result?.eventType ?? null;
        const newSource = result?.classificationSource ?? "manual";
        const newConfirm = result?.needsConfirmation ?? false;
        if (
          activity.eventType !== newType ||
          activity.classificationSource !== newSource ||
          activity.needsConfirmation !== newConfirm ||
          activity.dnf !== newDnf
        ) {
          await db.activities.update(activity.stravaId, {
            eventType: newType,
            classificationSource: newSource,
            needsConfirmation: newConfirm,
            dnf: newDnf,
          });
          updated++;
        }
      }
    }
  });
  return updated;
}

export async function bulkConfirm(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, {
        manualOverride: true,
        needsConfirmation: false,
      });
    }
  });
}

export async function bulkSetType(ids: string[], eventType: EventType): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, {
        eventType,
        manualOverride: true,
        needsConfirmation: false,
        classificationSource: "manual",
      });
    }
  });
}

export async function bulkSetDnf(ids: string[], dnf: boolean): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, { dnf, manualOverride: true });
    }
  });
}

export async function bulkExcludeFromAwards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, { excludeFromAwards: true });
    }
  });
}

export async function bulkIncludeInAwards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", db.activities, async () => {
    for (const id of ids) {
      await db.activities.update(id, { excludeFromAwards: false });
    }
  });
}

export async function setExcludeFromAwards(id: string, exclude: boolean): Promise<void> {
  await db.activities.update(id, { excludeFromAwards: exclude });
}

export async function confirmActivity(id: string): Promise<void> {
  await db.activities.update(id, { manualOverride: true, needsConfirmation: false });
}

// --- Backup export/import ---

export interface BackupEntry {
  stravaId: string;
  eventType: EventType;
  classificationSource: ClassificationSource;
  needsConfirmation: boolean;
  manualOverride: boolean;
  homologationNumber: string | null;
  dnf: boolean;
  excludeFromAwards: boolean;
}

export interface BackupExport {
  version: 1;
  exportedAt: string;
  activities: BackupEntry[];
}

export async function exportBackup(): Promise<BackupExport> {
  const activities = await db.activities.toArray();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    activities: activities.map((a) => ({
      stravaId: a.stravaId,
      eventType: a.eventType,
      classificationSource: a.classificationSource,
      needsConfirmation: a.needsConfirmation,
      manualOverride: a.manualOverride,
      homologationNumber: a.homologationNumber,
      dnf: a.dnf,
      excludeFromAwards: a.excludeFromAwards,
    })),
  };
}

export async function importBackup(data: unknown): Promise<void> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Invalid backup file format");
  }
  const d = data as Record<string, unknown>;
  if (d.version !== 1) {
    throw new Error("Unsupported backup file version");
  }
  if (!Array.isArray(d.activities)) {
    throw new Error("Invalid backup file format");
  }
  for (const entry of d.activities) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).stravaId !== "string"
    ) {
      throw new Error("Invalid backup file format");
    }
  }
  await db.transaction("rw", db.activities, async () => {
    for (const entry of d.activities as BackupEntry[]) {
      await db.activities.update(entry.stravaId, {
        eventType: entry.eventType,
        classificationSource: entry.classificationSource,
        needsConfirmation: entry.needsConfirmation,
        manualOverride: entry.manualOverride,
        homologationNumber: entry.homologationNumber,
        dnf: entry.dnf,
        excludeFromAwards: entry.excludeFromAwards,
      });
    }
  });
}
