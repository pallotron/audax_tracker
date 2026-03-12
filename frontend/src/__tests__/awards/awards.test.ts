import { describe, it, expect } from "vitest";
import {
  checkRrtyYears,
  checkBrevetKm,
  checkSuperRandonneur,
  checkFourProvinces,
  checkEasterFleche,
  checkFourNations,
  checkIsr,
  getInternationalRides,
  activitySeason,
  type AwardsActivity,
} from "../../awards/awards";

function makeActivity(overrides: Partial<AwardsActivity> = {}): AwardsActivity {
  const id = Math.random().toString(36).slice(2);
  return {
    stravaId: id,
    name: "BRM 200",
    date: "2025-06-15",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    dnf: false,
    sourceUrl: `https://www.strava.com/activities/${id}`,
    startCountry: "Ireland",
    startRegion: "Leinster",
    endCountry: "Ireland",
    endRegion: "Leinster",
    isNotableInternational: false,
    classificationSource: "auto-name",
    manualOverride: false,
    excludeFromAwards: false,
    needsConfirmation: false,
    ...overrides,
  };
}

// ── RRTY Years ──────────────────────────────────────────────────────────────

describe("checkRrtyYears", () => {
  it("returns empty set when no activities", () => {
    expect(checkRrtyYears([])).toEqual(new Map());
  });

  it("returns the year a 12-month streak ends", () => {
    const lastYear = new Date().getFullYear() - 1;
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeActivity({ date: `${lastYear}-${String(i + 1).padStart(2, "0")}-15` })
    );
    const result = checkRrtyYears(activities);
    expect(result.has(lastYear)).toBe(true);
  });

  it("does not count a broken streak (gap = no year awarded)", () => {
    const lastYear = new Date().getFullYear() - 1;
    const activities = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeActivity({ date: `${lastYear}-${String(i + 1).padStart(2, "0")}-15` })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeActivity({ date: `${lastYear}-${String(i + 7).padStart(2, "0")}-15` })
      ),
    ];
    expect(checkRrtyYears(activities)).toEqual(new Map());
  });

  it("excludes DNF activities", () => {
    const lastYear = new Date().getFullYear() - 1;
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeActivity({
        date: `${lastYear}-${String(i + 1).padStart(2, "0")}-15`,
        dnf: i === 5,
      })
    );
    expect(checkRrtyYears(activities)).toEqual(new Map());
  });
});

// ── Brevet km ───────────────────────────────────────────────────────────────

describe("checkBrevetKm", () => {
  it("returns empty map when no activities", () => {
    expect(checkBrevetKm([])).toEqual(new Map());
  });

  it("counts BRM activities into the correct audax season", () => {
    const a = makeActivity({ date: "2024-11-15", eventType: "BRM300", distance: 300 });
    const result = checkBrevetKm([a]);
    expect(result.get("2024-25")?.total).toBe(300);
  });

  it("counts Permanent activities", () => {
    const a = makeActivity({ date: "2025-03-15", eventType: "Permanent", distance: 200 });
    const result = checkBrevetKm([a]);
    expect(result.get("2024-25")?.total).toBe(200);
  });

  it("does not count PBP toward Brevet 2000/5000", () => {
    const a = makeActivity({ date: "2025-03-15", eventType: "PBP", distance: 1200 });
    const result = checkBrevetKm([a]);
    expect(result.size).toBe(0);
  });

  it("assigns Jan 2025 to season 2024-25 (not 2025-26)", () => {
    const a = makeActivity({ date: "2025-01-15", eventType: "BRM200", distance: 200 });
    expect(checkBrevetKm([a]).get("2024-25")?.total).toBe(200);
  });

  it("assigns Nov 2025 to season 2025-26", () => {
    const a = makeActivity({ date: "2025-11-15", eventType: "BRM200", distance: 200 });
    expect(checkBrevetKm([a]).get("2025-26")?.total).toBe(200);
  });

  it("skips DNF activities", () => {
    const a = makeActivity({ date: "2025-03-15", eventType: "BRM200", distance: 200, dnf: true });
    expect(checkBrevetKm([a]).size).toBe(0);
  });
});

// ── Super Randonneur ─────────────────────────────────────────────────────────

describe("checkSuperRandonneur", () => {
  it("returns empty map when no activities", () => {
    expect(checkSuperRandonneur([])).toEqual(new Map());
  });

  it("marks season as not met when missing distances", () => {
    const activities = [
      makeActivity({ date: "2025-04-15", eventType: "BRM200", distance: 200 }),
      makeActivity({ date: "2025-05-15", eventType: "BRM300", distance: 300 }),
    ];
    const result = checkSuperRandonneur(activities);
    expect(result.get("2024-25")?.met).toBe(false);
    expect(result.get("2024-25")?.distances.size).toBe(2);
  });

  it("marks season as met when 200, 300, 400, 600 completed", () => {
    const activities = [
      makeActivity({ date: "2025-04-15", eventType: "BRM200", distance: 200 }),
      makeActivity({ date: "2025-05-15", eventType: "BRM300", distance: 300 }),
      makeActivity({ date: "2025-06-15", eventType: "BRM400", distance: 400 }),
      makeActivity({ date: "2025-07-15", eventType: "BRM600", distance: 600 }),
    ];
    const result = checkSuperRandonneur(activities);
    expect(result.get("2024-25")?.met).toBe(true);
    expect(result.get("2024-25")?.distances.size).toBe(4);
  });
});

// ── 4 Provinces ─────────────────────────────────────────────────────────────

describe("checkFourProvinces", () => {
  it("returns empty map with no activities", () => {
    expect(checkFourProvinces([])).toEqual(new Map());
  });

  it("marks year as met when all 4 provinces covered", () => {
    const activities = [
      makeActivity({ date: "2025-03-01", startRegion: "Leinster" }),
      makeActivity({ date: "2025-04-01", startRegion: "Munster" }),
      makeActivity({ date: "2025-05-01", startRegion: "Connacht" }),
      makeActivity({ date: "2025-06-01", startRegion: "Ulster" }),
    ];
    const result = checkFourProvinces(activities);
    expect(result.get("2024-25")?.met).toBe(true);
  });

  it("marks year as not met when only 3 provinces covered", () => {
    const activities = [
      makeActivity({ date: "2025-03-01", startRegion: "Leinster" }),
      makeActivity({ date: "2025-04-01", startRegion: "Munster" }),
      makeActivity({ date: "2025-05-01", startRegion: "Connacht" }),
    ];
    const result = checkFourProvinces(activities);
    expect(result.get("2024-25")?.met).toBe(false);
  });

  it("tracks which activities covered each province", () => {
    const act = makeActivity({ date: "2025-03-01", startRegion: "Munster" });
    const result = checkFourProvinces([act]);
    expect(result.get("2024-25")?.provinces["Munster"]).toHaveLength(1);
  });

  it("ignores activities without region data", () => {
    const act = makeActivity({ date: "2025-03-01", startRegion: null });
    expect(checkFourProvinces([act]).size).toBe(0);
  });

  it("counts a Northern Ireland ride as Ulster province", () => {
    const activities = [
      makeActivity({ date: "2025-03-01", startRegion: "Leinster" }),
      makeActivity({ date: "2025-04-01", startRegion: "Munster" }),
      makeActivity({ date: "2025-05-01", startRegion: "Connacht" }),
      makeActivity({
        date: "2025-06-01",
        startCountry: "United Kingdom",
        startRegion: "Northern Ireland",
      }),
    ];
    const result = checkFourProvinces(activities);
    expect(result.get("2024-25")?.met).toBe(true);
    expect(result.get("2024-25")?.provinces["Ulster"]).toHaveLength(1);
  });
});

// ── Easter Flèche ────────────────────────────────────────────────────────────

describe("checkEasterFleche", () => {
  it("returns empty array when no Flèche activities", () => {
    expect(checkEasterFleche([])).toEqual([]);
  });

  it("detects Easter 2025 Flèche (Easter Sunday = 20 April 2025)", () => {
    // Good Friday 18 Apr → Easter Monday 21 Apr
    const a = makeActivity({ date: "2025-04-19", eventType: "Fleche" }); // Holy Saturday
    const result = checkEasterFleche([a]);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2025);
  });

  it("does not count a Flèche outside Easter weekend", () => {
    const a = makeActivity({ date: "2025-06-01", eventType: "Fleche" });
    expect(checkEasterFleche([a])).toHaveLength(0);
  });

  it("does not count a DNF Flèche", () => {
    const a = makeActivity({ date: "2025-04-19", eventType: "Fleche", dnf: true });
    expect(checkEasterFleche([a])).toHaveLength(0);
  });
});

// ── 4 Nations SR ─────────────────────────────────────────────────────────────

describe("checkFourNations", () => {
  function makeNationActivity(
    distance: AwardsActivity["eventType"],
    nation: string,
    date = "2025-03-01"
  ): AwardsActivity {
    const country = nation === "Ireland" ? "Ireland" : "United Kingdom";
    return makeActivity({
      date,
      eventType: distance,
      distance: distance === "BRM200" ? 200 : distance === "BRM300" ? 300 : distance === "BRM400" ? 400 : 600,
      startCountry: country,
      startRegion: nation,
      endCountry: country,
      endRegion: nation,
    });
  }

  it("returns not met with no activities", () => {
    expect(checkFourNations([]).met).toBe(false);
  });

  it("qualifies with one SR distance per nation", () => {
    const activities = [
      makeNationActivity("BRM200", "Ireland"),
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
      makeNationActivity("BRM600", "Wales"),
    ];
    expect(checkFourNations(activities).met).toBe(true);
  });

  it("does not qualify with only 3 nations", () => {
    const activities = [
      makeNationActivity("BRM200", "Ireland"),
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
    ];
    expect(checkFourNations(activities).met).toBe(false);
  });

  it("does not count activities before 2024-11-01", () => {
    const activities = [
      makeNationActivity("BRM200", "Ireland", "2024-10-31"),
      makeNationActivity("BRM300", "England", "2025-01-01"),
      makeNationActivity("BRM400", "Scotland", "2025-02-01"),
      makeNationActivity("BRM600", "Wales", "2025-03-01"),
    ];
    expect(checkFourNations(activities).met).toBe(false);
  });

  it("treats a ride crossing Republic/Northern Ireland border as Ireland", () => {
    const crossBorder = makeActivity({
      eventType: "BRM200",
      distance: 200,
      date: "2025-03-01",
      startCountry: "Ireland",
      startRegion: "Ulster",
      endCountry: "United Kingdom",
      endRegion: "Northern Ireland",
    });
    const activities = [
      crossBorder,
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
      makeNationActivity("BRM600", "Wales"),
    ];
    expect(checkFourNations(activities).met).toBe(true);
  });

  it("does not count a ride crossing Ireland and England border", () => {
    const crossBorder = makeActivity({
      eventType: "BRM200",
      distance: 200,
      date: "2025-03-01",
      startCountry: "Ireland",
      startRegion: "Leinster",
      endCountry: "United Kingdom",
      endRegion: "England",
    });
    const activities = [
      crossBorder,
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
      makeNationActivity("BRM600", "Wales"),
    ];
    expect(checkFourNations(activities).met).toBe(false);
  });

  it("counts a ride entirely within Northern Ireland as Ireland", () => {
    const niRide = makeActivity({
      eventType: "BRM200",
      distance: 200,
      date: "2025-03-01",
      startCountry: "United Kingdom",
      startRegion: "Northern Ireland",
      endCountry: "United Kingdom",
      endRegion: "Northern Ireland",
    });
    const activities = [
      niRide,
      makeNationActivity("BRM300", "England"),
      makeNationActivity("BRM400", "Scotland"),
      makeNationActivity("BRM600", "Wales"),
    ];
    expect(checkFourNations(activities).met).toBe(true);
  });
});

// ── ISR ───────────────────────────────────────────────────────────────────────

describe("checkIsr", () => {
  function makeCountryActivity(
    distance: AwardsActivity["eventType"],
    country: string
  ): AwardsActivity {
    return makeActivity({
      eventType: distance,
      distance: distance === "BRM200" ? 200 : distance === "BRM300" ? 300 : distance === "BRM400" ? 400 : 600,
      startCountry: country,
      endCountry: country,
      startRegion: null,
      endRegion: null,
    });
  }

  it("returns not met with no activities", () => {
    expect(checkIsr([]).met).toBe(false);
  });

  it("qualifies with SR series across 4 different countries", () => {
    const activities = [
      makeCountryActivity("BRM200", "Ireland"),
      makeCountryActivity("BRM300", "France"),
      makeCountryActivity("BRM400", "Belgium"),
      makeCountryActivity("BRM600", "Netherlands"),
    ];
    expect(checkIsr(activities).met).toBe(true);
  });

  it("does not qualify when two distances are in the same country", () => {
    const activities = [
      makeCountryActivity("BRM200", "Ireland"),
      makeCountryActivity("BRM300", "France"),
      makeCountryActivity("BRM400", "France"),
      makeCountryActivity("BRM600", "Netherlands"),
    ];
    expect(checkIsr(activities).met).toBe(false);
  });

  it("has no date restriction (old activities count)", () => {
    const activities = [
      makeActivity({ date: "2010-01-01", eventType: "BRM200", distance: 200, startCountry: "Ireland", endCountry: "Ireland" }),
      makeActivity({ date: "2010-02-01", eventType: "BRM300", distance: 300, startCountry: "France", endCountry: "France" }),
      makeActivity({ date: "2010-03-01", eventType: "BRM400", distance: 400, startCountry: "Belgium", endCountry: "Belgium" }),
      makeActivity({ date: "2010-04-01", eventType: "BRM600", distance: 600, startCountry: "Netherlands", endCountry: "Netherlands" }),
    ];
    expect(checkIsr(activities).met).toBe(true);
  });
});

// ── International Rides ───────────────────────────────────────────────────────

describe("getInternationalRides", () => {
  it("returns activities started outside Ireland", () => {
    const abroad = makeActivity({ startCountry: "France" });
    const home = makeActivity({ startCountry: "Ireland" });
    const result = getInternationalRides([abroad, home]);
    expect(result).toHaveLength(1);
    expect(result[0].stravaId).toBe(abroad.stravaId);
  });

  it("includes manually flagged notable activities even if in Ireland", () => {
    const notable = makeActivity({ startCountry: "Ireland", isNotableInternational: true });
    expect(getInternationalRides([notable])).toHaveLength(1);
  });

  it("excludes activities with null country (not yet geocoded)", () => {
    const ungeocoded = makeActivity({ startCountry: null, isNotableInternational: false });
    expect(getInternationalRides([ungeocoded])).toHaveLength(0);
  });

  it("excludes DNF activities", () => {
    const dnfAbroad = makeActivity({ startCountry: "France", dnf: true });
    expect(getInternationalRides([dnfAbroad])).toHaveLength(0);
  });

  it("does not treat Northern Ireland as international", () => {
    const niRide = makeActivity({
      startCountry: "United Kingdom",
      startRegion: "Northern Ireland",
    });
    expect(getInternationalRides([niRide])).toHaveLength(0);
  });

  it("sorts by date descending (most recent first)", () => {
    const older = makeActivity({ date: "2024-01-01", startCountry: "France" });
    const newer = makeActivity({ date: "2025-01-01", startCountry: "Belgium" });
    const result = getInternationalRides([older, newer]);
    expect(result[0].stravaId).toBe(newer.stravaId);
  });
});

describe("checkBrevetKm — award eligibility", () => {
  it("excludes unconfirmed activities from season km", () => {
    const activities = [
      makeActivity({ eventType: "BRM200", distance: 200, date: "2025-06-01", classificationSource: "auto-distance" }),
      makeActivity({ eventType: "BRM200", distance: 200, date: "2025-06-15" }),
    ];
    const result = checkBrevetKm(activities);
    const season = activitySeason("2025-06-01");
    // Only the confirmed activity should count
    expect(result.get(season)?.total).toBe(200);
  });
});
