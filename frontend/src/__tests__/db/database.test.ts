import { describe, it, expect, beforeEach } from "vitest";
import { db, type Activity, bulkConfirm, bulkSetType, bulkExcludeFromAwards, bulkIncludeInAwards, exportBackup, importBackup } from "../../db/database";

beforeEach(async () => {
  await db.activities.clear();
});

describe("Activity database", () => {
  const sampleActivity: Activity = {
    stravaId: "12345",
    name: "BRM 200 Dublin",
    date: new Date("2025-06-15"),
    distance: 203.5,
    elevationGain: 1200,
    movingTime: 28800,
    elapsedTime: 32400,
    type: "Ride",
    eventType: "BRM200",
    classificationSource: "auto-name",
    needsConfirmation: false,
    manualOverride: false,
    homologationNumber: null,
    dnf: false,
    sourceUrl: "https://www.strava.com/activities/12345",
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
    excludeFromAwards: false,
  };

  it("should add and retrieve an activity", async () => {
    await db.activities.add(sampleActivity);
    const result = await db.activities.get("12345");
    expect(result).toBeDefined();
    expect(result!.name).toBe("BRM 200 Dublin");
    expect(result!.distance).toBe(203.5);
  });

  it("should query activities by year", async () => {
    await db.activities.add(sampleActivity);
    await db.activities.add({
      ...sampleActivity,
      stravaId: "12346",
      date: new Date("2024-03-01"),
    });

    const year2025 = await db.activities
      .where("date")
      .between(new Date("2025-01-01"), new Date("2026-01-01"))
      .toArray();

    expect(year2025).toHaveLength(1);
    expect(year2025[0].stravaId).toBe("12345");
  });

  it("should query activities by eventType", async () => {
    await db.activities.add(sampleActivity);
    await db.activities.add({
      ...sampleActivity,
      stravaId: "12346",
      eventType: "BRM300",
    });

    const brm200s = await db.activities
      .where("eventType")
      .equals("BRM200")
      .toArray();

    expect(brm200s).toHaveLength(1);
  });

  it("should update classification and homologation", async () => {
    await db.activities.add(sampleActivity);
    await db.activities.update("12345", {
      eventType: "BRM300",
      manualOverride: true,
      classificationSource: "manual",
      homologationNumber: "ACP-2025-12345",
    });

    const updated = await db.activities.get("12345");
    expect(updated!.eventType).toBe("BRM300");
    expect(updated!.manualOverride).toBe(true);
    expect(updated!.homologationNumber).toBe("ACP-2025-12345");
  });

  it("should store and retrieve excludeFromAwards field", async () => {
    await db.activities.add(sampleActivity);
    const result = await db.activities.get("12345");
    expect(result).toBeDefined();
    expect(result!.excludeFromAwards).toBe(false);
  });

  it("should store excludeFromAwards: true when explicitly set", async () => {
    await db.activities.add({ ...sampleActivity, excludeFromAwards: true });
    const result = await db.activities.get("12345");
    expect(result!.excludeFromAwards).toBe(true);
  });

  describe("exportBackup", () => {
    it("returns all activities with backup fields", async () => {
      await db.activities.bulkAdd([
        { ...sampleActivity, stravaId: "1", excludeFromAwards: false, eventType: "BRM200", dnf: false, isNotableInternational: false },
        { ...sampleActivity, stravaId: "2", excludeFromAwards: true, eventType: "BRM300", dnf: true, isNotableInternational: true },
      ]);

      const result = await exportBackup();

      expect(result.version).toBe(2);
      expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.activities).toHaveLength(2);
      expect(result.activities).toEqual(
        expect.arrayContaining([
          {
            stravaId: "1",
            eventType: "BRM200",
            classificationSource: "auto-name",
            needsConfirmation: false,
            manualOverride: false,
            homologationNumber: null,
            dnf: false,
            excludeFromAwards: false,
            isNotableInternational: false,
          },
          {
            stravaId: "2",
            eventType: "BRM300",
            classificationSource: "auto-name",
            needsConfirmation: false,
            manualOverride: false,
            homologationNumber: null,
            dnf: true,
            excludeFromAwards: true,
            isNotableInternational: true,
          },
        ])
      );
    });

    it("returns empty activities array when no activities exist", async () => {
      const result = await exportBackup();
      expect(result.activities).toHaveLength(0);
    });

    it("exportBackup produces version 2 with preferences field", async () => {
      const backup = await exportBackup();
      expect(backup.version).toBe(2);
      expect(backup.preferences).toBeDefined();
      expect(typeof backup.preferences.cloudSyncEnabled).toBe("boolean");
    });
  });

  describe("importBackup", () => {
    beforeEach(async () => {
      await db.activities.bulkAdd([
        { ...sampleActivity, stravaId: "1", excludeFromAwards: false, eventType: "BRM200", dnf: false, isNotableInternational: false },
        { ...sampleActivity, stravaId: "2", excludeFromAwards: false, eventType: "BRM300", dnf: false, isNotableInternational: false },
      ]);
    });

    it("updates fields for matching activities", async () => {
      await importBackup({
        version: 1,
        exportedAt: "2026-03-11T10:00:00Z",
        activities: [
          {
            stravaId: "1",
            eventType: "BRM400",
            classificationSource: "manual",
            needsConfirmation: false,
            manualOverride: true,
            homologationNumber: "123",
            dnf: false,
            excludeFromAwards: true,
            isNotableInternational: true,
          },
          {
            stravaId: "2",
            eventType: "BRM600",
            classificationSource: "auto-distance",
            needsConfirmation: true,
            manualOverride: false,
            homologationNumber: null,
            dnf: true,
            excludeFromAwards: false,
            isNotableInternational: false,
          },
        ],
      });

      const a1 = await db.activities.get("1");
      const a2 = await db.activities.get("2");
      expect(a1!.excludeFromAwards).toBe(true);
      expect(a1!.eventType).toBe("BRM400");
      expect(a1!.classificationSource).toBe("manual");
      expect(a1!.manualOverride).toBe(true);
      expect(a1!.homologationNumber).toBe("123");
      expect(a1!.dnf).toBe(false);
      expect(a1!.isNotableInternational).toBe(true);

      expect(a2!.excludeFromAwards).toBe(false);
      expect(a2!.eventType).toBe("BRM600");
      expect(a2!.classificationSource).toBe("auto-distance");
      expect(a2!.needsConfirmation).toBe(true);
      expect(a2!.manualOverride).toBe(false);
      expect(a2!.dnf).toBe(true);
      expect(a2!.isNotableInternational).toBe(false);
    });

    it("silently skips stravaIds not in the local database", async () => {
      await expect(
        importBackup({
          version: 1,
          exportedAt: "2026-03-11T10:00:00Z",
          activities: [
            {
              stravaId: "unknown-999",
              eventType: "BRM200",
              classificationSource: "manual",
              needsConfirmation: false,
              manualOverride: false,
              homologationNumber: null,
              dnf: false,
              excludeFromAwards: true,
              isNotableInternational: false,
            },
          ],
        })
      ).resolves.not.toThrow();
    });

    it("throws on wrong version", async () => {
      await expect(
        importBackup({ version: 99, exportedAt: "", activities: [] })
      ).rejects.toThrow("Unsupported backup file version");
    });

    it("throws when activities is not an array", async () => {
      await expect(
        importBackup({ version: 1, exportedAt: "", activities: "bad" })
      ).rejects.toThrow("Invalid backup file format");
    });

    it("throws when an entry is missing stravaId", async () => {
      await expect(
        importBackup({
          version: 1,
          exportedAt: "",
          activities: [{ excludeFromAwards: true }],
        })
      ).rejects.toThrow("Invalid backup file format");
    });

    it("throws when data is null", async () => {
      await expect(importBackup(null)).rejects.toThrow(
        "Invalid backup file format"
      );
    });

    it("throws when data is a string", async () => {
      await expect(importBackup("not-an-object")).rejects.toThrow(
        "Invalid backup file format"
      );
    });
  });
});

describe("Bulk operations", () => {
  const makeActivity = (id: string, overrides: Partial<Activity> = {}): Activity => ({
    stravaId: id,
    name: `Activity ${id}`,
    date: new Date("2025-06-15"),
    distance: 200,
    elevationGain: 1000,
    movingTime: 28800,
    elapsedTime: 32400,
    type: "Ride",
    eventType: "BRM200",
    classificationSource: "auto-distance",
    needsConfirmation: true,
    manualOverride: false,
    homologationNumber: null,
    dnf: false,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
    excludeFromAwards: false,
    ...overrides,
  });

  beforeEach(async () => {
    await db.activities.clear();
  });

  it("bulkConfirm sets manualOverride and clears needsConfirmation", async () => {
    await db.activities.bulkAdd([makeActivity("1"), makeActivity("2"), makeActivity("3")]);

    await bulkConfirm(["1", "3"]);

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    const a3 = await db.activities.get("3");

    expect(a1!.manualOverride).toBe(true);
    expect(a1!.needsConfirmation).toBe(false);
    expect(a2!.manualOverride).toBe(false);
    expect(a2!.needsConfirmation).toBe(true);
    expect(a3!.manualOverride).toBe(true);
    expect(a3!.needsConfirmation).toBe(false);
  });

  it("bulkConfirm does not change eventType", async () => {
    await db.activities.bulkAdd([
      makeActivity("1", { eventType: "BRM200" }),
      makeActivity("2", { eventType: "BRM400" }),
    ]);

    await bulkConfirm(["1", "2"]);

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    expect(a1!.eventType).toBe("BRM200");
    expect(a2!.eventType).toBe("BRM400");
  });

  it("bulkSetType sets eventType, manualOverride, classificationSource", async () => {
    await db.activities.bulkAdd([makeActivity("1"), makeActivity("2")]);

    await bulkSetType(["1", "2"], "BRM600");

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    expect(a1!.eventType).toBe("BRM600");
    expect(a1!.manualOverride).toBe(true);
    expect(a1!.needsConfirmation).toBe(false);
    expect(a1!.classificationSource).toBe("manual");
    expect(a2!.eventType).toBe("BRM600");
  });

  it("bulkSetType with null clears eventType", async () => {
    await db.activities.bulkAdd([makeActivity("1", { eventType: "BRM200" })]);

    await bulkSetType(["1"], null);

    const a1 = await db.activities.get("1");
    expect(a1!.eventType).toBeNull();
    expect(a1!.classificationSource).toBe("manual");
  });
});

describe("bulkExcludeFromAwards / bulkIncludeInAwards", () => {
  const makeActivity = (id: string, overrides: Partial<Activity> = {}): Activity => ({
    stravaId: id,
    name: `Activity ${id}`,
    date: new Date("2025-06-15"),
    distance: 200,
    elevationGain: 1000,
    movingTime: 28800,
    elapsedTime: 32400,
    type: "Ride",
    eventType: "BRM200",
    classificationSource: "auto-distance",
    needsConfirmation: true,
    manualOverride: false,
    homologationNumber: null,
    dnf: false,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
    excludeFromAwards: false,
    ...overrides,
  });

  beforeEach(async () => {
    await db.activities.clear();
  });

  it("sets excludeFromAwards to true for all given ids", async () => {
    await db.activities.add(makeActivity("ex-1", { excludeFromAwards: false }));
    await db.activities.add(makeActivity("ex-2", { excludeFromAwards: false }));

    await bulkExcludeFromAwards(["ex-1", "ex-2"]);

    const a1 = await db.activities.get("ex-1");
    const a2 = await db.activities.get("ex-2");
    expect(a1!.excludeFromAwards).toBe(true);
    expect(a2!.excludeFromAwards).toBe(true);
  });

  it("clears excludeFromAwards for all given ids", async () => {
    await db.activities.add(makeActivity("inc-1", { excludeFromAwards: true }));

    await bulkIncludeInAwards(["inc-1"]);

    const a1 = await db.activities.get("inc-1");
    expect(a1!.excludeFromAwards).toBe(false);
  });

  it("is a no-op for empty array", async () => {
    await expect(bulkExcludeFromAwards([])).resolves.not.toThrow();
    await expect(bulkIncludeInAwards([])).resolves.not.toThrow();
  });
});

