import { describe, it, expect } from "vitest";
import { buildR5000TemplateData } from "../../forms/acpFormGenerator";
import type { RiderProfile } from "../../db/profile";
import type { QualifyingActivity } from "../../qualification/tracker";

const profile: RiderProfile = {
  id: 1,
  lastName: "Murphy",
  firstName: "Ciara",
  birthDate: "15/03/1985",
  address: "42 Main Street",
  zipCode: "D01",
  city: "Dublin",
  country: "Ireland",
  clubName: "Audax Ireland",
  acpCode: "IE001",
};

function makeActivity(overrides: Partial<QualifyingActivity>): QualifyingActivity {
  return {
    stravaId: "1",
    name: "Test Ride",
    date: "2023-06-15T00:00:00.000Z",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    dnf: false,
    sourceUrl: "https://strava.com/activities/1",
    classificationSource: "manual",
    manualOverride: true,
    excludeFromAwards: false,
    needsConfirmation: false,
    homologationNumber: null,
    ...overrides,
  };
}

describe("buildR5000TemplateData", () => {
  it("fills personal info from profile", () => {
    const data = buildR5000TemplateData(profile, [], 0);
    expect(data.lastName).toBe("Murphy");
    expect(data.firstName).toBe("Ciara");
    expect(data.birthDate).toBe("15/03/1985");
    expect(data.club).toBe("Audax Ireland");
    expect(data.acpCode).toBe("IE001");
  });

  it("formats dates as dd/mm/yyyy", () => {
    const activities = [makeActivity({ eventType: "BRM200", date: "2023-06-15T00:00:00.000Z" })];
    const data = buildR5000TemplateData(profile, activities, 200);
    expect(data.brm200Date).toBe("15/06/2023");
  });

  it("fills mandatory BRM slots from windowActivities", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "BRM200", name: "BRM 200 Dublin", distance: 200, homologationNumber: "IE-001" }),
      makeActivity({ stravaId: "2", eventType: "BRM300", name: "BRM 300 Cork", distance: 300, homologationNumber: "IE-002", date: "2023-07-01T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 500);
    expect(data.brm200Name).toBe("BRM 200 Dublin");
    expect(data.brm200Cert).toBe("IE-001");
    expect(data.brm300Name).toBe("BRM 300 Cork");
    expect(data.brm300Cert).toBe("IE-002");
  });

  it("leaves mandatory slot empty when no matching activity", () => {
    const data = buildR5000TemplateData(profile, [], 0);
    expect(data.brm200Date).toBe("");
    expect(data.brm200Name).toBe("");
    expect(data.brm200Cert).toBe("");
    expect(data.pbpDate).toBe("");
  });

  it("SR600 fills BRM600 slot", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "SR600", name: "Rocky Road SR600", distance: 600, homologationNumber: "SR-001" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 600);
    expect(data.brm600Name).toBe("Rocky Road SR600");
    expect(data.brm600Cert).toBe("SR-001");
  });

  it("uses null homologation number as empty string", () => {
    const activities = [makeActivity({ eventType: "BRM200", homologationNumber: null })];
    const data = buildR5000TemplateData(profile, activities, 200);
    expect(data.brm200Cert).toBe("");
  });

  it("puts extra BRMs in brmRides balance array", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "BRM200", name: "First BRM200", date: "2023-01-01T00:00:00.000Z" }),
      makeActivity({ stravaId: "2", eventType: "BRM200", name: "Second BRM200", date: "2023-03-01T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 400);
    expect(data.brm200Name).toBe("First BRM200"); // earliest goes to mandatory slot
    expect(data.brmRides).toHaveLength(1);
    expect(data.brmRides[0].name).toBe("Second BRM200");
  });

  it("puts RM1200+ rides in brevet1200Rides", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "RM1200+", name: "LEL 1400", distance: 1400 }),
    ];
    const data = buildR5000TemplateData(profile, activities, 1400);
    expect(data.brevet1200Rides).toHaveLength(1);
    expect(data.brevet1200Rides[0].name).toBe("LEL 1400");
  });

  it("puts Fleche rides in flecheRides beyond the mandatory slot", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "Fleche", name: "Easter Fleche 2022", date: "2022-04-15T00:00:00.000Z" }),
      makeActivity({ stravaId: "2", eventType: "Fleche", name: "Easter Fleche 2023", date: "2023-04-07T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 720);
    expect(data.flecheName).toBe("Easter Fleche 2022"); // earliest to mandatory
    expect(data.flecheRides).toHaveLength(1);
    expect(data.flecheRides[0].name).toBe("Easter Fleche 2023");
  });

  it("computes firstEventDate and lastEventDate", () => {
    const activities = [
      makeActivity({ stravaId: "1", date: "2023-03-15T00:00:00.000Z" }),
      makeActivity({ stravaId: "2", date: "2022-06-01T00:00:00.000Z" }),
      makeActivity({ stravaId: "3", date: "2024-01-10T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 600);
    expect(data.firstEventDate).toBe("01/06/2022");
    expect(data.lastEventDate).toBe("10/01/2024");
  });

  it("formats totalKm as rounded string with km suffix", () => {
    const data = buildR5000TemplateData(profile, [], 5123.7);
    expect(data.totalKm).toBe("5124 km");
  });
});
