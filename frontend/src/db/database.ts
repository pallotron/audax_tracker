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
  sourceUrl: string;
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
