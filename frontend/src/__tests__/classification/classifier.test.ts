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
      ["400 Audax", "BRM400"],
      ["200 km Audax", "BRM200"],
      ["Audax 600", "BRM600"],
      ["Paris-Brest-Paris", "PBP", 1200000],
      ["PBP", "PBP", 1200000],
      ["PBP23: the ride!", "PBP", 1224000],
      ["PBP2023", "PBP", 1200000],
      ["Flèche Vélocio", "Fleche"],
      ["Fleche Velocio", "Fleche"],
      ["Trace Vélocio", "TraceVelocio"],
    ])(
      'should classify "%s" as %s with source auto-name',
      (name, expectedType, distance) => {
        const result = classifyActivity(makeRaw({ name, ...(distance ? { distance } : {}) }));
        expect(result).not.toBeNull();
        expect(result!.eventType).toBe(expectedType);
        expect(result!.classificationSource).toBe("auto-name");
      }
    );

    it("classifies '400 Audax - SR series, PBP qualification' as BRM400, not PBP", () => {
      const result = classifyActivity(
        makeRaw({ name: "REK 400 Audax - SR series: ✅, PBP qualification: ✅, 4 Provinces: 3/4" })
      );
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe("BRM400");
    });

    it("does not classify short ride mentioning PBP as PBP", () => {
      const result = classifyActivity(
        makeRaw({ name: "PBP Chain abandoned me in Dun Laoghaire 🤣", distance: 65000 })
      );
      expect(result?.eventType).not.toBe("PBP");
    });

    it("does not classify 'PBP qualification' as PBP", () => {
      const result = classifyActivity(
        makeRaw({ name: "Some ride - PBP qualification: ✅" })
      );
      // Should not match PBP — "PBP qual" is excluded
      expect(result?.eventType).not.toBe("PBP");
    });

    it("detects Fleche Nationale from name", () => {
      const result = classifyActivity(makeRaw({ name: "Flèche Nationale 2025" }));
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe("Fleche");
      expect(result!.classificationSource).toBe("auto-name");
    });

    it("detects Fleche de France from name", () => {
      const result = classifyActivity(makeRaw({ name: "Fleche de France Gold" }));
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe("FlecheDeFrance");
      expect(result!.classificationSource).toBe("auto-name");
    });
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
      const result = classifyActivity(makeRaw({ distance: 50000 }));
      expect(result).toBeNull();
    });

    it("should set needsConfirmation for distance-classified rides", () => {
      const result = classifyActivity(makeRaw({ distance: 205000 }));
      expect(result).not.toBeNull();
      expect(result!.needsConfirmation).toBe(true);
    });
  });

  describe("DNF detection", () => {
    it("detects DNF from name containing 'DNF'", () => {
      const result = classifyActivity(makeRaw({ name: "BRM 400 DNF", distance: 320_000 }));
      expect(result).not.toBeNull();
      expect(result!.dnf).toBe(true);
    });

    it("detects DNF when distance is significantly short of BRM minimum", () => {
      // BRM400 classified by name but only 250km ridden (< 90% of 400)
      const result = classifyActivity(makeRaw({ name: "BRM 400", distance: 250_000 }));
      expect(result).not.toBeNull();
      expect(result!.dnf).toBe(true);
    });

    it("does not mark DNF when distance is close to minimum (≥90%)", () => {
      // BRM200 classified by name, 185km ridden (≥90% of 200)
      const result = classifyActivity(makeRaw({ name: "BRM 200", distance: 185_000 }));
      expect(result).not.toBeNull();
      expect(result!.dnf).toBe(false);
    });

    it("does not mark DNF for normal completed ride", () => {
      const result = classifyActivity(makeRaw({ name: "BRM 600", distance: 615_000 }));
      expect(result).not.toBeNull();
      expect(result!.dnf).toBe(false);
    });

    it("DNF detection is case-insensitive", () => {
      const result = classifyActivity(makeRaw({ name: "Audax 300 dnf", distance: 300_000 }));
      expect(result).not.toBeNull();
      expect(result!.dnf).toBe(true);
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

  describe("Permanent events", () => {
    it("classifies 'Permanent 200' as Permanent with needsConfirmation", () => {
      const result = classifyActivity(makeRaw({ name: "Permanent 200", distance: 200_000 }));
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe("Permanent");
      expect(result!.classificationSource).toBe("auto-name");
      expect(result!.needsConfirmation).toBe(true);
    });

    it("classifies 'perm 300' as Permanent", () => {
      const result = classifyActivity(makeRaw({ name: "perm 300", distance: 300_000 }));
      expect(result!.eventType).toBe("Permanent");
    });

    it("classifies 'perm200' (no space) as Permanent", () => {
      const result = classifyActivity(makeRaw({ name: "perm200", distance: 200_000 }));
      expect(result!.eventType).toBe("Permanent");
    });

    it("classifies 'DIY Brevet 200' as Permanent", () => {
      const result = classifyActivity(makeRaw({ name: "DIY Brevet 200km", distance: 200_000 }));
      expect(result!.eventType).toBe("Permanent");
    });

    it("classifies 'Brevet Permanent' as Permanent", () => {
      const result = classifyActivity(makeRaw({ name: "Brevet Permanent 300", distance: 300_000 }));
      expect(result!.eventType).toBe("Permanent");
    });

    it("does not classify 'permanently tired' as Permanent", () => {
      const result = classifyActivity(makeRaw({ name: "permanently tired", distance: 50_000 }));
      expect(result?.eventType).not.toBe("Permanent");
    });
  });
});
