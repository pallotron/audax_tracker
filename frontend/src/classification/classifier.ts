import type { EventType, ClassificationSource } from "../db/types";

export interface RawActivity {
  name: string;
  distance: number; // meters
  elevationGain: number;
}

export interface ClassificationResult {
  eventType: EventType;
  classificationSource: ClassificationSource;
  needsConfirmation: boolean;
}

interface NamePattern {
  pattern: RegExp;
  eventType: EventType;
  minDistanceKm?: number;
}

interface DistanceRange {
  minKm: number;
  maxKm: number;
  eventType: EventType;
}

const NAME_PATTERNS: NamePattern[] = [
  // BRM distances first — explicit distance in name takes priority
  { pattern: /\b(?:brm|brevet|audax)\s*1000/i, eventType: "BRM1000" },
  { pattern: /\b(?:brm|brevet|audax)\s*600/i, eventType: "BRM600" },
  { pattern: /\b(?:brm|brevet|audax)\s*400/i, eventType: "BRM400" },
  { pattern: /\b(?:brm|brevet|audax)\s*300/i, eventType: "BRM300" },
  { pattern: /\b(?:brm|brevet|audax)\s*200/i, eventType: "BRM200" },
  // Also match "1000 audax", "400 audax", etc.
  { pattern: /\b1000\s*(?:km\s+)?audax/i, eventType: "BRM1000" },
  { pattern: /\b600\s*(?:km\s+)?audax/i, eventType: "BRM600" },
  { pattern: /\b400\s*(?:km\s+)?audax/i, eventType: "BRM400" },
  { pattern: /\b300\s*(?:km\s+)?audax/i, eventType: "BRM300" },
  { pattern: /\b200\s*(?:km\s+)?audax/i, eventType: "BRM200" },
  // PBP — only as the event itself, not "PBP qualification" references, and must be long enough
  { pattern: /paris[- ]brest[- ]paris/i, eventType: "PBP", minDistanceKm: 1000 },
  { pattern: /\bpbp(?:\d+)?(?![\w]*qual)/i, eventType: "PBP", minDistanceKm: 1000 },
  // Fleche variants
  { pattern: /fl[eè]che\s+v[eé]locio/i, eventType: "Fleche" },
  { pattern: /fl[eè]che\s+nationale/i, eventType: "Fleche" },
  { pattern: /fl[eè]che\s+de\s+france/i, eventType: "FlecheDeFrance" },
  { pattern: /trace\s+v[eé]locio/i, eventType: "TraceVelocio" },
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
  const distanceKm = raw.distance / 1000;
  for (const { pattern, eventType, minDistanceKm } of NAME_PATTERNS) {
    if (pattern.test(raw.name)) {
      if (minDistanceKm && distanceKm < minDistanceKm) continue;
      return { eventType, classificationSource: "auto-name", needsConfirmation: false };
    }
  }

  // Check distance ranges
  for (const { minKm, maxKm, eventType } of DISTANCE_RANGES) {
    if (distanceKm >= minKm && distanceKm <= maxKm) {
      return { eventType, classificationSource: "auto-distance", needsConfirmation: true };
    }
  }

  return null;
}
