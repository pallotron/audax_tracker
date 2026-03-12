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
  dnf: boolean;
}

interface NamePattern {
  pattern: RegExp;
  eventType: EventType;
  minDistanceKm?: number;
  needsConfirmation?: boolean;
}

interface DistanceRange {
  minKm: number;
  maxKm: number;
  eventType: EventType;
}

const NAME_PATTERNS: NamePattern[] = [
  // Permanent events (self-scheduled brevets)
  { pattern: /\bpermanent\b/i, eventType: "Permanent", needsConfirmation: true },
  { pattern: /\bperm\s*\d/i, eventType: "Permanent", needsConfirmation: true },
  { pattern: /\bdiy\s+brevet\b/i, eventType: "Permanent", needsConfirmation: true },
  { pattern: /\bbrevet\s+permanent\b/i, eventType: "Permanent", needsConfirmation: true },
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
  // SR600 / Super Randonnée 600 (mountain brevet, distinct from BRM600)
  { pattern: /\bsr\s*600\b/i, eventType: "SR600" },
  { pattern: /super\s+randonn[eé]e\s+600/i, eventType: "SR600" },
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

const MINIMUM_DISTANCE_KM: Partial<Record<NonNullable<EventType>, number>> = {
  BRM200: 200,
  BRM300: 300,
  BRM400: 400,
  BRM600: 600,
  BRM1000: 1000,
  PBP: 1200,
  "RM1200+": 1200,
};

export interface AwardEligibilityFields {
  dnf: boolean;
  classificationSource: ClassificationSource;
  manualOverride: boolean;
  excludeFromAwards: boolean;
}

/**
 * Returns true if an activity should be counted toward award calculations.
 * Auto-distance classified rides are excluded until the user explicitly confirms them
 * (which sets manualOverride: true). Manually excluded rides are always excluded.
 */
export function isAwardEligible(a: AwardEligibilityFields): boolean {
  return (
    !a.dnf &&
    (a.classificationSource === "auto-name" || a.manualOverride) &&
    !a.excludeFromAwards
  );
}

export function detectDnf(name: string, eventType: EventType, distanceKm: number): boolean {
  if (/\bdnf\b/i.test(name)) return true;
  if (eventType && eventType in MINIMUM_DISTANCE_KM) {
    const minKm = MINIMUM_DISTANCE_KM[eventType as NonNullable<EventType>]!;
    if (distanceKm < minKm * 0.9) return true;
  }
  return false;
}

export function classifyActivity(
  raw: RawActivity
): ClassificationResult | null {
  // Check name patterns first
  const distanceKm = raw.distance / 1000;
  for (const { pattern, eventType, minDistanceKm, needsConfirmation } of NAME_PATTERNS) {
    if (pattern.test(raw.name)) {
      if (minDistanceKm && distanceKm < minDistanceKm) continue;
      const dnf = detectDnf(raw.name, eventType, distanceKm);
      return {
        eventType,
        classificationSource: "auto-name",
        needsConfirmation: needsConfirmation ?? false,
        dnf,
      };
    }
  }

  // Check distance ranges
  for (const { minKm, maxKm, eventType } of DISTANCE_RANGES) {
    if (distanceKm >= minKm && distanceKm <= maxKm) {
      const dnf = detectDnf(raw.name, eventType, distanceKm);
      return { eventType, classificationSource: "auto-distance", needsConfirmation: true, dnf };
    }
  }

  return null;
}
