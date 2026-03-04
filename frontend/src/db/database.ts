import Dexie, { type EntityTable } from "dexie";
import type { EventType, ClassificationSource } from "./types";

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
  manualOverride: boolean;
  homologationNumber: string | null;
}

export const db = new Dexie("AudaxTracker") as Dexie & {
  activities: EntityTable<Activity, "stravaId">;
};

db.version(1).stores({
  activities: "stravaId, date, eventType, type",
});
