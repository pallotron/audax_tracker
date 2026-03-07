import Dexie, { type EntityTable } from "dexie";
import type { EventType, ClassificationSource } from "./types";
import { classifyActivity } from "../classification/classifier";

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

/**
 * Re-run the classifier on all non-manually-overridden activities.
 * Call at app startup so classifier rule changes take effect without re-syncing.
 */
export async function reclassifyAll(): Promise<number> {
  let updated = 0;
  await db.transaction("rw", db.activities, async () => {
    const all = await db.activities.filter((a) => !a.manualOverride).toArray();
    for (const activity of all) {
      const distanceMeters = activity.distance * 1000; // stored as km
      const result = classifyActivity({
        name: activity.name,
        distance: distanceMeters,
        elevationGain: activity.elevationGain,
      });
      const newType = result?.eventType ?? null;
      const newSource = result?.classificationSource ?? "manual";
      const newConfirm = result?.needsConfirmation ?? false;
      const newDnf = result?.dnf ?? false;
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
