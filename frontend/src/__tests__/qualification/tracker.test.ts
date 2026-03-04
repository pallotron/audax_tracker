import { describe, it, expect } from "vitest";
import {
  checkAcp5000,
  checkAcp10000,
  QualifyingActivity,
} from "../../qualification/tracker";

function makeActivity(
  overrides: Partial<QualifyingActivity> = {}
): QualifyingActivity {
  return {
    stravaId: Math.random().toString(36).slice(2),
    date: "2025-06-01",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    ...overrides,
  };
}

describe("checkAcp5000", () => {
  it("returns incomplete when no activities", () => {
    const result = checkAcp5000([]);
    expect(result.qualified).toBe(false);
    expect(result.totalKm).toBe(0);
    expect(result.brmSeries.met).toBe(false);
    expect(result.pbp.met).toBe(false);
    expect(result.fleche.met).toBe(false);
    expect(result.distance.met).toBe(false);
  });

  it("recognizes complete BRM series (200+300+400+600+1000)", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.brmSeries.met).toBe(true);
    expect(result.brmSeries.missing).toEqual([]);
  });

  it("requires all BRM distances (missing 1000 → met=false)", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.brmSeries.met).toBe(false);
    expect(result.brmSeries.missing).toContain("BRM1000");
  });

  it("detects PBP requirement", () => {
    const activities = [makeActivity({ eventType: "PBP", distance: 1200 })];
    const result = checkAcp5000(activities);
    expect(result.pbp.met).toBe(true);
  });

  it("detects Fleche requirement", () => {
    const activities = [makeActivity({ eventType: "Fleche", distance: 360 })];
    const result = checkAcp5000(activities);
    expect(result.fleche.met).toBe(true);
  });

  it("returns qualified when all requirements met (200+300+400+600+1000+PBP+Fleche+extra = 5060km)", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
      makeActivity({ eventType: "PBP", distance: 1200 }),
      makeActivity({ eventType: "Fleche", distance: 360 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.qualified).toBe(true);
    expect(result.totalKm).toBe(5060);
    expect(result.distance.met).toBe(true);
    expect(result.distance.currentKm).toBe(5060);
    expect(result.distance.targetKm).toBe(5000);
  });

  it("enforces 4-year window (BRM200 from 2020 outside window ending 2025)", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, date: "2020-01-01" }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
      makeActivity({ eventType: "PBP", distance: 1200 }),
      makeActivity({ eventType: "Fleche", distance: 360 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    // The 2020 BRM200 is outside the 4-year window, so BRM series incomplete
    expect(result.brmSeries.met).toBe(false);
    expect(result.qualified).toBe(false);
  });
});

describe("checkAcp10000", () => {
  it("returns incomplete when no activities", () => {
    const result = checkAcp10000([]);
    expect(result.qualified).toBe(false);
    expect(result.totalKm).toBe(0);
    expect(result.twoBrmSeries.met).toBe(false);
    expect(result.pbp.met).toBe(false);
    expect(result.fleche.met).toBe(false);
    expect(result.distance.met).toBe(false);
  });

  it("detects mountain 600 (BRM600 with 8500m elevation → met)", () => {
    const activities = [
      makeActivity({
        eventType: "BRM600",
        distance: 600,
        elevationGain: 8500,
      }),
    ];
    const result = checkAcp10000(activities);
    expect(result.mountain600.met).toBe(true);
  });

  it("rejects 600km with insufficient elevation (5000m → not met)", () => {
    const activities = [
      makeActivity({
        eventType: "BRM600",
        distance: 600,
        elevationGain: 5000,
      }),
    ];
    const result = checkAcp10000(activities);
    expect(result.mountain600.met).toBe(false);
  });

  it("requires separate RM1200+ distinct from PBP (only PBP → separateRm1200.met=false)", () => {
    const activities = [makeActivity({ eventType: "PBP", distance: 1200 })];
    const result = checkAcp10000(activities);
    expect(result.pbp.met).toBe(true);
    expect(result.separateRm1200.met).toBe(false);
  });

  it("detects separate RM1200+ alongside PBP", () => {
    const activities = [
      makeActivity({ eventType: "PBP", distance: 1200 }),
      makeActivity({ eventType: "RM1200+", distance: 1200 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.pbp.met).toBe(true);
    expect(result.separateRm1200.met).toBe(true);
  });

  it("requires two complete BRM series (one series → seriesCount=1, met=false)", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.twoBrmSeries.seriesCount).toBe(1);
    expect(result.twoBrmSeries.met).toBe(false);
  });

  it("detects two complete BRM series (seriesCount=2, met=true)", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM200", distance: 200 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp10000(activities);
    expect(result.twoBrmSeries.seriesCount).toBe(2);
    expect(result.twoBrmSeries.met).toBe(true);
  });
});
