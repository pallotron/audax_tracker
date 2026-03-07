import { describe, it, expect, beforeEach } from "vitest";
import { db, type Activity, bulkConfirm, bulkSetType } from "../../db/database";

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
