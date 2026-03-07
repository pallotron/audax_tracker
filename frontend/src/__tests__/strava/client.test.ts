import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllActivities, mapStravaActivity } from "../../strava/client";

describe("mapStravaActivity", () => {
  it("maps Strava API response to Activity shape", () => {
    const stravaData = {
      id: 12345,
      name: "BRM 200 Dublin",
      distance: 205000,
      moving_time: 28800,
      elapsed_time: 32400,
      total_elevation_gain: 1200,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-06-15T06:00:00Z",
      start_latlng: [53.3498, -6.2603] as [number, number],
      end_latlng: [53.3498, -6.2603] as [number, number],
    };
    const result = mapStravaActivity(stravaData);
    expect(result.stravaId).toBe("12345");
    expect(result.name).toBe("BRM 200 Dublin");
    expect(result.distance).toBeCloseTo(205);
    expect(result.movingTime).toBe(28800);
    expect(result.elapsedTime).toBe(32400);
    expect(result.elevationGain).toBe(1200);
    expect(result.type).toBe("Ride");
    expect(result.date).toEqual(new Date("2025-06-15T06:00:00Z"));
    expect(result.eventType).toBe("BRM200");
    expect(result.classificationSource).toBe("auto-name");
    expect(result.needsConfirmation).toBe(false);
    expect(result.manualOverride).toBe(false);
    expect(result.homologationNumber).toBeNull();
    expect(result.dnf).toBe(false);
    expect(result.sourceUrl).toBe("https://www.strava.com/activities/12345");
  });
});

describe("mapStravaActivity — geo fields", () => {
  function makeRawWithGeo(overrides = {}) {
    return {
      id: 12345,
      name: "BRM 200",
      distance: 200000,
      moving_time: 28800,
      elapsed_time: 30000,
      total_elevation_gain: 1200,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-06-01T07:00:00Z",
      start_latlng: [53.3498, -6.2603],
      end_latlng: [53.3498, -6.2603],
      ...overrides,
    };
  }

  it("stores start and end lat/lng when present", () => {
    const result = mapStravaActivity(makeRawWithGeo());
    expect(result.startLat).toBe(53.3498);
    expect(result.startLng).toBe(-6.2603);
    expect(result.endLat).toBe(53.3498);
    expect(result.endLng).toBe(-6.2603);
  });

  it("stores null for lat/lng when Strava returns empty array", () => {
    const result = mapStravaActivity(makeRawWithGeo({ start_latlng: [], end_latlng: [] }));
    expect(result.startLat).toBeNull();
    expect(result.startLng).toBeNull();
    expect(result.endLat).toBeNull();
    expect(result.endLng).toBeNull();
  });

  it("initializes country/region/notableInternational as null/false", () => {
    const result = mapStravaActivity(makeRawWithGeo());
    expect(result.startCountry).toBeNull();
    expect(result.startRegion).toBeNull();
    expect(result.endCountry).toBeNull();
    expect(result.endRegion).toBeNull();
    expect(result.isNotableInternational).toBe(false);
  });
});

describe("fetchAllActivities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("paginates through all pages", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      name: `Ride ${i}`,
      distance: 50000,
      moving_time: 3600,
      elapsed_time: 4000,
      total_elevation_gain: 100,
      type: "Ride",
      sport_type: "Ride",
      start_date: "2025-01-01T00:00:00Z",
      start_latlng: [] as [],
      end_latlng: [] as [],
    }));
    const page2 = [page1[0]];
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify(callCount === 1 ? page1 : page2));
    });
    const results = await fetchAllActivities("fake-token");
    expect(callCount).toBe(2);
    expect(results).toHaveLength(201);
  });
});
