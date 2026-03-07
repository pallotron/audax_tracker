import { describe, it, expect } from "vitest";
import { countyToProvince, parseNominatimRegion } from "../../geo/geocoder";

describe("countyToProvince", () => {
  it.each([
    ["Cork", "Munster"],
    ["Kerry", "Munster"],
    ["Limerick", "Munster"],
    ["Tipperary", "Munster"],
    ["Waterford", "Munster"],
    ["Clare", "Munster"],
    ["Dublin", "Leinster"],
    ["Wicklow", "Leinster"],
    ["Kildare", "Leinster"],
    ["Galway", "Connacht"],
    ["Mayo", "Connacht"],
    ["Sligo", "Connacht"],
    ["Roscommon", "Connacht"],
    ["Leitrim", "Connacht"],
    ["Donegal", "Ulster"],
    ["Cavan", "Ulster"],
    ["Monaghan", "Ulster"],
    ["Antrim", "Ulster"],
    ["Down", "Ulster"],
    ["Derry", "Ulster"],
  ])("maps %s to %s", (county, province) => {
    expect(countyToProvince(county)).toBe(province);
  });

  it("strips 'County ' prefix before mapping", () => {
    expect(countyToProvince("County Cork")).toBe("Munster");
    expect(countyToProvince("County Dublin")).toBe("Leinster");
  });

  it("returns null for unknown county", () => {
    expect(countyToProvince("Yorkshire")).toBeNull();
  });
});

describe("parseNominatimRegion", () => {
  it("returns province for Irish county", () => {
    const result = parseNominatimRegion({ country: "Ireland", county: "County Cork" });
    expect(result.country).toBe("Ireland");
    expect(result.region).toBe("Munster");
  });

  it("returns state directly for UK activities", () => {
    const result = parseNominatimRegion({ country: "United Kingdom", state: "Scotland" });
    expect(result.country).toBe("United Kingdom");
    expect(result.region).toBe("Scotland");
  });

  it("returns state for non-IE/UK countries", () => {
    const result = parseNominatimRegion({ country: "France", state: "Bretagne" });
    expect(result.country).toBe("France");
    expect(result.region).toBe("Bretagne");
  });

  it("returns null country and region when address is empty", () => {
    const result = parseNominatimRegion({});
    expect(result.country).toBeNull();
    expect(result.region).toBeNull();
  });

  it("returns null region when Irish county is unknown", () => {
    const result = parseNominatimRegion({ country: "Ireland", county: "Unknown" });
    expect(result.country).toBe("Ireland");
    expect(result.region).toBeNull();
  });
});
