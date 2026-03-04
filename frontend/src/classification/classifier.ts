import type { EventType, ClassificationSource } from "../db/types";

export interface RawActivity {
  name: string;
  distance: number; // meters
  elevationGain: number;
}

export interface ClassificationResult {
  eventType: EventType;
  classificationSource: ClassificationSource;
}

interface NamePattern {
  pattern: RegExp;
  eventType: EventType;
}

interface DistanceRange {
  minKm: number;
  maxKm: number;
  eventType: EventType;
}

const NAME_PATTERNS: NamePattern[] = [
  { pattern: /paris[- ]brest[- ]paris/i, eventType: "PBP" },
  { pattern: /\bpbp\b/i, eventType: "PBP" },
  { pattern: /fl[eè]che\s+v[eé]locio/i, eventType: "Fleche" },
  { pattern: /trace\s+v[eé]locio/i, eventType: "TraceVelocio" },
  { pattern: /\b(?:brm|brevet)\s*1000/i, eventType: "BRM1000" },
  { pattern: /\b(?:brm|brevet)\s*600/i, eventType: "BRM600" },
  { pattern: /\b(?:brm|brevet)\s*400/i, eventType: "BRM400" },
  { pattern: /\b(?:brm|brevet)\s*300/i, eventType: "BRM300" },
  { pattern: /\b(?:brm|brevet)\s*200/i, eventType: "BRM200" },
];

const DISTANCE_RANGES: DistanceRange[] = [
  { minKm: 1200, maxKm: Infinity, eventType: "RM1200+" },
  { minKm: 950, maxKm: 1199, eventType: "BRM1000" },
  { minKm: 560, maxKm: 949, eventType: "BRM600" },
  { minKm: 380, maxKm: 559, eventType: "BRM400" },
  { minKm: 280, maxKm: 379, eventType: "BRM300" },
  { minKm: 195, maxKm: 279, eventType: "BRM200" },
];

export function classifyActivity(
  raw: RawActivity
): ClassificationResult | null {
  // Check name patterns first
  for (const { pattern, eventType } of NAME_PATTERNS) {
    if (pattern.test(raw.name)) {
      return { eventType, classificationSource: "auto-name" };
    }
  }

  // Check distance ranges
  const distanceKm = raw.distance / 1000;
  for (const { minKm, maxKm, eventType } of DISTANCE_RANGES) {
    if (distanceKm >= minKm && distanceKm <= maxKm) {
      return { eventType, classificationSource: "auto-distance" };
    }
  }

  return null;
}
