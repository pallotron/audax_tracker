import { describe, it, expect } from "vitest";
import {
  classifyActivity,
  type RawActivity,
} from "../../classification/classifier";

function makeRaw(overrides: Partial<RawActivity> = {}): RawActivity {
  return {
    name: "Morning Ride",
    distance: 50000,
    elevationGain: 500,
    ...overrides,
  };
}

describe("classifyActivity", () => {
  describe("name-based classification", () => {
    it.each([
      ["BRM 200", "BRM200"],
      ["Brevet 300km", "BRM300"],
      ["BRM 400", "BRM400"],
      ["BRM 600", "BRM600"],
      ["BRM 1000", "BRM1000"],
      ["Paris-Brest-Paris", "PBP"],
      ["PBP", "PBP"],
      ["Flèche Vélocio", "Fleche"],
      ["Fleche Velocio", "Fleche"],
      ["Trace Vélocio", "TraceVelocio"],
    ])(
      'should classify "%s" as %s with source auto-name',
      (name, expectedType) => {
        const result = classifyActivity(makeRaw({ name }));
        expect(result).not.toBeNull();
        expect(result!.eventType).toBe(expectedType);
        expect(result!.classificationSource).toBe("auto-name");
      }
    );
  });

  describe("distance-based classification", () => {
    it.each([
      [200_000, "BRM200"],
      [300_000, "BRM300"],
      [400_000, "BRM400"],
      [600_000, "BRM600"],
      [1_000_000, "BRM1000"],
      [1_200_000, "RM1200+"],
    ])(
      "should classify %d meters as %s with source auto-distance",
      (distance, expectedType) => {
        const result = classifyActivity(makeRaw({ distance }));
        expect(result).not.toBeNull();
        expect(result!.eventType).toBe(expectedType);
        expect(result!.classificationSource).toBe("auto-distance");
      }
    );

    it("should return null for 50km (no match)", () => {
      const result = classifyActivity(makeRaw({ distance: 50_000 }));
      expect(result).toBeNull();
    });
  });

  describe("priority", () => {
    it("should prioritize name over distance", () => {
      const result = classifyActivity(
        makeRaw({ name: "BRM 200", distance: 600_000 })
      );
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe("BRM200");
      expect(result!.classificationSource).toBe("auto-name");
    });
  });
});
