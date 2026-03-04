import { describe, it, expect, beforeEach } from "vitest";
import { db, type Activity } from "../../db/database";

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
