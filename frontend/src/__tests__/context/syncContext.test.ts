import { describe, it, expect } from "vitest";

import { computeAfterEpoch, applyActivityUpsert } from "../../context/SyncContext";
import type { Activity } from "../../db/database";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    stravaId: "1",
    name: "Morning Ride",
    date: new Date("2025-01-01"),
    distance: 100,
    elevationGain: 500,
    movingTime: 3600,
    elapsedTime: 4000,
    type: "Ride",
    eventType: null,
    classificationSource: "manual",
    needsConfirmation: false,
    manualOverride: false,
    homologationNumber: null,
    dnf: false,
    excludeFromAwards: false,
    sourceUrl: "https://www.strava.com/activities/1",
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
    ...overrides,
  };
}

describe("computeAfterEpoch", () => {
  it("returns undefined when lastSync is null (first sync — fetch full history)", () => {
    expect(computeAfterEpoch(null)).toBeUndefined();
  });

  it("returns unix epoch seconds minus 60s buffer when lastSync is set (incremental sync)", () => {
    const ts = "2025-06-15T06:00:00.000Z";
    const expected = Math.floor(new Date(ts).getTime() / 1000) - 60;
    expect(computeAfterEpoch(ts)).toBe(expected);
  });

  it("returns epoch even when DB has activities with null lat/lng (indoor rides do not trigger full sync)", () => {
    const ts = "2025-06-15T06:00:00.000Z";
    // computeAfterEpoch is a pure function — it only uses lastSync, never inspects the DB
    expect(computeAfterEpoch(ts)).toBe(Math.floor(new Date(ts).getTime() / 1000) - 60);
  });
});

describe("applyActivityUpsert", () => {
  it("returns fresh activity with geo fields from existing when no manualOverride", () => {
    const fresh = makeActivity({ name: "BRM 200 Renamed", eventType: "BRM200" });
    const existing = makeActivity({
      startCountry: "France",
      startRegion: "Île-de-France",
      endCountry: "France",
      endRegion: "Normandy",
      isNotableInternational: true,
    });
    const result = applyActivityUpsert(fresh, existing);
    expect(result.name).toBe("BRM 200 Renamed");
    expect(result.eventType).toBe("BRM200");
    expect(result.startCountry).toBe("France");
    expect(result.isNotableInternational).toBe(true);
    expect(result.manualOverride).toBe(false);
  });

  it("returns null geo fields when no existing record", () => {
    const fresh = makeActivity({ name: "New Ride" });
    const result = applyActivityUpsert(fresh, undefined);
    expect(result.startCountry).toBeNull();
    expect(result.isNotableInternational).toBe(false);
  });

  it("preserves manualOverride fields when existing has manualOverride=true", () => {
    const fresh = makeActivity({
      name: "BRM 400 Renamed",
      eventType: "BRM400",
      classificationSource: "auto-name",
      dnf: false,
    });
    const existing = makeActivity({
      manualOverride: true,
      eventType: "BRM600",
      classificationSource: "manual",
      homologationNumber: "FR-2025-123",
      dnf: true,
      startCountry: "Spain",
      isNotableInternational: true,
    });
    const result = applyActivityUpsert(fresh, existing);
    expect(result.name).toBe("BRM 400 Renamed");
    expect(result.eventType).toBe("BRM600");
    expect(result.classificationSource).toBe("manual");
    expect(result.manualOverride).toBe(true);
    expect(result.homologationNumber).toBe("FR-2025-123");
    expect(result.dnf).toBe(true);
    expect(result.startCountry).toBe("Spain");
    expect(result.isNotableInternational).toBe(true);
  });
});
