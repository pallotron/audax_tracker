import type { EventType } from "../db/types";

export interface QualifyingActivity {
  stravaId: string;
  date: string; // ISO date string
  distance: number; // km
  elevationGain: number; // meters
  eventType: EventType;
}

export interface Requirement {
  met: boolean;
  details: string;
}

export interface BrmSeriesRequirement extends Requirement {
  missing: EventType[];
}

export interface TwoBrmSeriesRequirement extends Requirement {
  seriesCount: number;
}

export interface DistanceRequirement extends Requirement {
  currentKm: number;
  targetKm: number;
}

export interface Acp5000Status {
  qualified: boolean;
  totalKm: number;
  brmSeries: BrmSeriesRequirement;
  pbp: Requirement;
  fleche: Requirement;
  distance: DistanceRequirement;
}

export interface Acp10000Status {
  qualified: boolean;
  totalKm: number;
  twoBrmSeries: TwoBrmSeriesRequirement;
  pbp: Requirement;
  separateRm1200: Requirement;
  mountain600: Requirement;
  fleche: Requirement;
  distance: DistanceRequirement;
}

const BRM_DISTANCES: EventType[] = [
  "BRM200",
  "BRM300",
  "BRM400",
  "BRM600",
  "BRM1000",
];

/**
 * Finds the rolling window of `windowYears` years that maximizes total km.
 * Returns activities within that best window.
 */
export function findBestWindow(
  activities: QualifyingActivity[],
  windowYears: number
): QualifyingActivity[] {
  if (activities.length === 0) return [];

  const sorted = [...activities].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let bestTotal = 0;
  let bestWindow: QualifyingActivity[] = [];

  for (const activity of sorted) {
    const startDate = new Date(activity.date);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + windowYears);

    const windowActivities = sorted.filter((a) => {
      const d = new Date(a.date);
      return d >= startDate && d < endDate;
    });

    const total = windowActivities.reduce((sum, a) => sum + a.distance, 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestWindow = windowActivities;
    }
  }

  return bestWindow;
}

/**
 * Checks if all 5 BRM distances are present in the given activities.
 */
export function checkBrmSeries(activities: QualifyingActivity[]): {
  met: boolean;
  missing: EventType[];
} {
  const present = new Set(activities.map((a) => a.eventType));
  const missing = BRM_DISTANCES.filter((d) => !present.has(d));
  return {
    met: missing.length === 0,
    missing,
  };
}

/**
 * Counts how many complete BRM series can be formed from the activities.
 * A complete series needs one each of 200, 300, 400, 600, 1000.
 * The count is the minimum count across all distances.
 */
export function countBrmSeries(activities: QualifyingActivity[]): number {
  const counts = new Map<EventType, number>();
  for (const d of BRM_DISTANCES) {
    counts.set(d, 0);
  }
  for (const a of activities) {
    if (BRM_DISTANCES.includes(a.eventType!)) {
      counts.set(a.eventType!, (counts.get(a.eventType!) ?? 0) + 1);
    }
  }
  return Math.min(...BRM_DISTANCES.map((d) => counts.get(d) ?? 0));
}

/**
 * Check qualification status for ACP Randonneur 5000.
 * Requirements: 4-year window, full BRM series, PBP, Flèche, 5000km total.
 */
export function checkAcp5000(
  activities: QualifyingActivity[]
): Acp5000Status {
  const windowActivities = findBestWindow(activities, 4);
  const totalKm = windowActivities.reduce((sum, a) => sum + a.distance, 0);

  const series = checkBrmSeries(windowActivities);
  const brmSeries: BrmSeriesRequirement = {
    met: series.met,
    missing: series.missing,
    details: series.met
      ? "Complete BRM series (200+300+400+600+1000)"
      : `Missing BRM distances: ${series.missing.join(", ")}`,
  };

  const hasPbp = windowActivities.some((a) => a.eventType === "PBP");
  const pbp: Requirement = {
    met: hasPbp,
    details: hasPbp ? "PBP completed" : "PBP required",
  };

  const hasFleche = windowActivities.some((a) => a.eventType === "Fleche");
  const fleche: Requirement = {
    met: hasFleche,
    details: hasFleche ? "Flèche completed" : "Flèche required",
  };

  const targetKm = 5000;
  const distance: DistanceRequirement = {
    met: totalKm >= targetKm,
    currentKm: totalKm,
    targetKm,
    details:
      totalKm >= targetKm
        ? `${totalKm}km achieved (target: ${targetKm}km)`
        : `${totalKm}km of ${targetKm}km`,
  };

  const qualified =
    brmSeries.met && pbp.met && fleche.met && distance.met;

  return {
    qualified,
    totalKm,
    brmSeries,
    pbp,
    fleche,
    distance,
  };
}

const MOUNTAIN_600_ELEVATION = 8000; // meters

/**
 * Check qualification status for ACP Randonneur 10000.
 * Requirements: 6-year window, 2x BRM series, PBP, separate RM1200+,
 * mountain 600 (8000m+), Flèche, 10000km total.
 */
export function checkAcp10000(
  activities: QualifyingActivity[]
): Acp10000Status {
  const windowActivities = findBestWindow(activities, 6);
  const totalKm = windowActivities.reduce((sum, a) => sum + a.distance, 0);

  const seriesCount = countBrmSeries(windowActivities);
  const twoBrmSeries: TwoBrmSeriesRequirement = {
    met: seriesCount >= 2,
    seriesCount,
    details:
      seriesCount >= 2
        ? `${seriesCount} complete BRM series`
        : `${seriesCount} of 2 required BRM series`,
  };

  const hasPbp = windowActivities.some((a) => a.eventType === "PBP");
  const pbp: Requirement = {
    met: hasPbp,
    details: hasPbp ? "PBP completed" : "PBP required",
  };

  const hasRm1200 = windowActivities.some(
    (a) => a.eventType === "RM1200+"
  );
  const separateRm1200: Requirement = {
    met: hasRm1200,
    details: hasRm1200
      ? "Separate RM1200+ completed"
      : "Separate RM1200+ required (distinct from PBP)",
  };

  const hasMountain600 = windowActivities.some(
    (a) =>
      a.eventType === "BRM600" &&
      a.elevationGain >= MOUNTAIN_600_ELEVATION
  );
  const mountain600: Requirement = {
    met: hasMountain600,
    details: hasMountain600
      ? "Mountain 600 completed (8000m+ elevation)"
      : "Mountain 600 required (BRM600 with 8000m+ elevation)",
  };

  const hasFleche = windowActivities.some((a) => a.eventType === "Fleche");
  const fleche: Requirement = {
    met: hasFleche,
    details: hasFleche ? "Flèche completed" : "Flèche required",
  };

  const targetKm = 10000;
  const distance: DistanceRequirement = {
    met: totalKm >= targetKm,
    currentKm: totalKm,
    targetKm,
    details:
      totalKm >= targetKm
        ? `${totalKm}km achieved (target: ${targetKm}km)`
        : `${totalKm}km of ${targetKm}km`,
  };

  const qualified =
    twoBrmSeries.met &&
    pbp.met &&
    separateRm1200.met &&
    mountain600.met &&
    fleche.met &&
    distance.met;

  return {
    qualified,
    totalKm,
    twoBrmSeries,
    pbp,
    separateRm1200,
    mountain600,
    fleche,
    distance,
  };
}
