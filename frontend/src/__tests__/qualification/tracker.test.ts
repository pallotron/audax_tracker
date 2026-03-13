import { describe, it, expect } from "vitest";
import {
  checkAcp5000,
  checkAcp10000,
  checkRrty,
  computeGapFillingActivities,
  type QualifyingActivity,
} from "../../qualification/tracker";

function makeActivity(
  overrides: Partial<QualifyingActivity> = {}
): QualifyingActivity {
  const id = Math.random().toString(36).slice(2);
  return {
    stravaId: id,
    name: "Test Ride",
    date: "2025-06-01",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    dnf: false,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    classificationSource: "auto-name",
    manualOverride: false,
    excludeFromAwards: false,
    needsConfirmation: false,
    homologationNumber: null,
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

describe("checkRrty", () => {
  // Generate a "YYYY-MM" string relative to the current month.
  // offset=0 → this month, offset=-1 → last month, offset=-11 → 11 months ago
  function relMonth(offset: number): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function makeMonthActivity(yearMonth: string, overrides: Partial<QualifyingActivity> = {}): QualifyingActivity {
    const id = Math.random().toString(36).slice(2);
    return {
      stravaId: id,
      name: "BRM 200",
      date: `${yearMonth}-15`,
      distance: 200,
      elevationGain: 1000,
      eventType: "BRM200",
      dnf: false,
      sourceUrl: `https://www.strava.com/activities/${id}`,
      classificationSource: "auto-name",
      manualOverride: false,
      excludeFromAwards: false,
      needsConfirmation: false,
      ...overrides,
    };
  }

  it("returns incomplete when no activities", () => {
    const result = checkRrty([]);
    expect(result.qualified).toBe(false);
    expect(result.currentStreakLength).toBe(0);
    expect(result.currentStreakMonths).toHaveLength(0);
  });

  it("qualifies when current streak reaches 12 consecutive months", () => {
    // 12 months ending this month
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeMonthActivity(relMonth(i - 11))
    );
    const result = checkRrty(activities);
    expect(result.qualified).toBe(true);
    expect(result.currentStreakLength).toBe(12);
    expect(result.currentStreakMonths).toHaveLength(12);
  });

  it("resets streak when a month is missing — current streak is the most recent run", () => {
    // Months: -10, -9, gap at -8, then -7 through 0 (9 months)
    const activities = [
      makeMonthActivity(relMonth(-10)),
      makeMonthActivity(relMonth(-9)),
      // skip relMonth(-8)
      ...Array.from({ length: 8 }, (_, i) => makeMonthActivity(relMonth(i - 7))),
    ];
    const result = checkRrty(activities);
    expect(result.qualified).toBe(false);
    expect(result.currentStreakLength).toBe(8);
    expect(result.bestStreakLength).toBe(8);
  });

  it("does not qualify based on historical streak alone — current streak must reach 12", () => {
    // Historical 7-month streak ending 3 months ago, then gap, then 2-month current streak
    const historical = Array.from({ length: 7 }, (_, i) => makeMonthActivity(relMonth(i - 11)));
    // gap at relMonth(-4)
    const current = [makeMonthActivity(relMonth(-1)), makeMonthActivity(relMonth(0))];
    const result = checkRrty([...historical, ...current]);
    expect(result.qualified).toBe(false);
    expect(result.currentStreakLength).toBe(2);
    expect(result.bestStreakLength).toBe(7);
  });

  it("excludes DNF activities — breaks streak if only ride that month was DNF", () => {
    // 12 months, but month at offset -6 is DNF → two streaks of 5 and 6
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeMonthActivity(relMonth(i - 11), { dnf: i === 5 })
    );
    const result = checkRrty(activities);
    expect(result.qualified).toBe(false);
    expect(result.currentStreakLength).toBe(6);
  });

  it("excludes rides under 200km — breaks streak if only ride that month is too short", () => {
    // 12 months, month at offset -8 has only a 100km ride
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeMonthActivity(relMonth(i - 11), { distance: i === 3 ? 100 : 200 })
    );
    const result = checkRrty(activities);
    expect(result.qualified).toBe(false);
    expect(result.currentStreakLength).toBe(8);
  });

  it("treats a streak as dead if it ended more than one month ago (clock reset to 0)", () => {
    // Streak of 3 months ending 2 years ago — far in the past
    const activities = ["2020-01", "2020-02", "2020-03"].map((m) => makeMonthActivity(m));
    const result = checkRrty(activities);
    expect(result.qualified).toBe(false);
    expect(result.currentStreakLength).toBe(0);
    expect(result.currentStreakMonths).toHaveLength(0);
    expect(result.bestStreakLength).toBe(3);
  });

  it("accepts multiple qualifying activities in a month (all included)", () => {
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeMonthActivity(relMonth(i - 11))
    );
    activities.push(makeMonthActivity(relMonth(-11))); // second ride in oldest month
    const result = checkRrty(activities);
    expect(result.qualified).toBe(true);
    expect(result.currentStreakMonths[0].activities).toHaveLength(2);
  });
});

describe("award eligibility filtering", () => {
  it("checkAcp5000: excludes unconfirmed (auto-distance) rides", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, classificationSource: "auto-distance" }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    // BRM200 is auto-distance and should be excluded — series incomplete
    expect(result.brmSeries.met).toBe(false);
    expect(result.brmSeries.missing).toContain("BRM200");
  });

  it("checkAcp5000: counts auto-distance ride once manualOverride=true", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, classificationSource: "auto-distance", manualOverride: true }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.brmSeries.met).toBe(true);
  });

  it("checkAcp5000: excludes rides with excludeFromAwards=true", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, excludeFromAwards: true }),
      makeActivity({ eventType: "BRM300", distance: 300 }),
      makeActivity({ eventType: "BRM400", distance: 400 }),
      makeActivity({ eventType: "BRM600", distance: 600 }),
      makeActivity({ eventType: "BRM1000", distance: 1000 }),
    ];
    const result = checkAcp5000(activities);
    expect(result.brmSeries.met).toBe(false);
    expect(result.brmSeries.missing).toContain("BRM200");
  });

  it("checkRrty: excludes unconfirmed rides from streak", () => {
    // 12 months but one is unconfirmed
    const activities = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return makeActivity({
        eventType: "BRM200",
        distance: 200,
        date: `2025-${month}-15`,
        classificationSource: i === 5 ? "auto-distance" : "auto-name",
      });
    });
    const result = checkRrty(activities);
    // Month 6 is unconfirmed → streak is broken → not qualified
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

describe("computeGapFillingActivities", () => {
  const mandatory = [
    makeActivity({ stravaId: "m1", distance: 2000, homologationNumber: "H001" }),
    makeActivity({ stravaId: "m2", distance: 1500, homologationNumber: "H002" }),
  ]; // mandatory total: 3500 km, gap to 5000 = 1500 km

  it("excludes mandatory activities", () => {
    const window = [
      ...mandatory,
      makeActivity({ stravaId: "g1", distance: 600, homologationNumber: "H003", date: "2025-06-01" }),
    ];
    const result = computeGapFillingActivities(window, mandatory, 5000);
    expect(result.map((a) => a.stravaId)).not.toContain("m1");
    expect(result.map((a) => a.stravaId)).not.toContain("m2");
    expect(result.map((a) => a.stravaId)).toContain("g1");
  });

  it("excludes activities with no homologation number", () => {
    const window = [
      ...mandatory,
      makeActivity({ stravaId: "no-hom", distance: 600, homologationNumber: null, date: "2025-06-01" }),
      makeActivity({ stravaId: "with-hom", distance: 600, homologationNumber: "H010", date: "2025-05-01" }),
    ];
    const result = computeGapFillingActivities(window, mandatory, 5000);
    expect(result.map((a) => a.stravaId)).not.toContain("no-hom");
    expect(result.map((a) => a.stravaId)).toContain("with-hom");
  });

  it("takes only as many rides as needed to fill the gap, most recent first", () => {
    const window = [
      ...mandatory,
      makeActivity({ stravaId: "old", distance: 1000, homologationNumber: "H020", date: "2024-01-01" }),
      makeActivity({ stravaId: "recent", distance: 1000, homologationNumber: "H021", date: "2025-06-01" }),
      makeActivity({ stravaId: "extra", distance: 1000, homologationNumber: "H022", date: "2023-01-01" }),
    ];
    // gap = 1500, recent(1000) + old(1000) fills it in 2 rides; extra should be excluded
    const result = computeGapFillingActivities(window, mandatory, 5000);
    expect(result.map((a) => a.stravaId)).toEqual(["recent", "old"]);
    expect(result.map((a) => a.stravaId)).not.toContain("extra");
  });

  it("returns empty when mandatory activities already meet the target", () => {
    const bigMandatory = [
      makeActivity({ stravaId: "big1", distance: 3000, homologationNumber: "H030" }),
      makeActivity({ stravaId: "big2", distance: 2500, homologationNumber: "H031" }),
    ]; // 5500 km >= 5000 km target
    const window = [
      ...bigMandatory,
      makeActivity({ stravaId: "extra", distance: 500, homologationNumber: "H032", date: "2025-01-01" }),
    ];
    const result = computeGapFillingActivities(window, bigMandatory, 5000);
    expect(result).toHaveLength(0);
  });

  it("distance.matchingActivities in checkAcp5000 excludes rides without homologation", () => {
    // Mandatory rides are dated 2025-07-01 so they win the "most recent" slot for each distance.
    // Gap rides are older (2025-01-01 / 2025-02-01) so they are not promoted to mandatory.
    const base = [
      makeActivity({ eventType: "BRM200", distance: 200, homologationNumber: "H1", date: "2025-07-01" }),
      makeActivity({ eventType: "BRM300", distance: 300, homologationNumber: "H2", date: "2025-07-01" }),
      makeActivity({ eventType: "BRM400", distance: 400, homologationNumber: "H3", date: "2025-07-01" }),
      makeActivity({ eventType: "BRM600", distance: 600, homologationNumber: "H4", date: "2025-07-01" }),
      makeActivity({ eventType: "BRM1000", distance: 1000, homologationNumber: "H5", date: "2025-07-01" }),
      makeActivity({ eventType: "PBP", distance: 1200, homologationNumber: "H6", date: "2025-07-01" }),
      makeActivity({ eventType: "Fleche", distance: 360, homologationNumber: "H7", date: "2025-07-01" }),
    ];
    // Older gap ride with homologation — should appear in distance.matchingActivities
    const withHom = makeActivity({ eventType: "BRM200", distance: 500, homologationNumber: "H8", date: "2025-02-01" });
    // Older gap ride without homologation — must NOT appear
    const noHom = makeActivity({ eventType: "BRM300", distance: 500, homologationNumber: null, date: "2025-01-01" });
    const result = checkAcp5000([...base, withHom, noHom]);
    const gapIds = result.distance.matchingActivities.map((a) => a.stravaId);
    expect(gapIds).toContain(withHom.stravaId);
    expect(gapIds).not.toContain(noHom.stravaId);
  });
});
