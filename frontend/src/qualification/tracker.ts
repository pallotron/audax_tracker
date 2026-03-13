import type { EventType, ClassificationSource } from "../db/types";
import { isAwardEligible } from "../classification/classifier";

export interface QualifyingActivity {
  stravaId: string;
  name: string;
  date: string; // ISO date string
  distance: number; // km
  elevationGain: number; // meters
  eventType: EventType;
  dnf: boolean;
  sourceUrl: string;
  // Award eligibility fields
  classificationSource: ClassificationSource;
  manualOverride: boolean;
  excludeFromAwards: boolean;
  needsConfirmation: boolean;
  homologationNumber: string | null;
}

export interface Requirement {
  met: boolean;
  details: string;
  completedDate: Date | null;
  matchingActivities: QualifyingActivity[];
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

export interface ExpiringEvent {
  stravaId: string;
  name: string;
  eventType: EventType;
  date: Date;
  expiresAt: Date;
  affects: ("R5000" | "R10000")[];
  sourceUrl: string;
}

export interface Acp5000Status {
  qualified: boolean;
  totalKm: number;
  brmSeries: BrmSeriesRequirement;
  pbp: Requirement;
  fleche: Requirement;
  distance: DistanceRequirement;
  expiringEvents: ExpiringEvent[];
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
  expiringEvents: ExpiringEvent[];
}

const BRM_DISTANCES: NonNullable<EventType>[] = [
  "BRM200",
  "BRM300",
  "BRM400",
  "BRM600",
  "BRM1000",
];

// Only these event types count toward ACP R5000/R10000 distance and window
export const ACP_QUALIFYING_TYPES: NonNullable<EventType>[] = [
  "BRM200", "BRM300", "BRM400", "BRM600", "BRM1000",
  "PBP", "RM1200+", "Fleche", "SR600",
];

/**
 * SR600 counts as BRM600 for series and award purposes.
 * This normalises the type before any series/distance checks.
 */
function normalizeToSeries(et: NonNullable<EventType>): NonNullable<EventType> {
  return et === "SR600" ? "BRM600" : et;
}

/**
 * Merges expiring events from multiple qualification checks,
 * combining the `affects` arrays for duplicate activities.
 */
export function mergeExpiringEvents(...lists: ExpiringEvent[][]): ExpiringEvent[] {
  const byId = new Map<string, ExpiringEvent>();
  for (const list of lists) {
    for (const ev of list) {
      const existing = byId.get(ev.stravaId);
      if (existing) {
        for (const a of ev.affects) {
          if (!existing.affects.includes(a)) existing.affects.push(a);
        }
      } else {
        byId.set(ev.stravaId, { ...ev, affects: [...ev.affects] });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.expiresAt.getTime() - b.expiresAt.getTime()
  );
}

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

  // Pre-compute timestamps to avoid repeated Date parsing
  const timestamps = sorted.map((a) => new Date(a.date).getTime());
  const windowMs = windowYears * 365.25 * 24 * 60 * 60 * 1000;

  let bestTotal = 0;
  let bestStart = 0;
  let bestEnd = 0;

  // Sliding window: for each start, binary-search for the end
  for (let i = 0; i < sorted.length; i++) {
    const endTime = timestamps[i] + windowMs;

    // Find the last index within the window using binary search
    let lo = i;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (timestamps[mid] < endTime) lo = mid;
      else hi = mid - 1;
    }

    let total = 0;
    for (let j = i; j <= lo; j++) {
      total += sorted[j].distance;
    }

    if (total > bestTotal) {
      bestTotal = total;
      bestStart = i;
      bestEnd = lo;
    }
  }

  return sorted.slice(bestStart, bestEnd + 1);
}

/**
 * Checks if all 5 BRM distances are present in the given activities.
 */
export function checkBrmSeries(activities: QualifyingActivity[]): {
  met: boolean;
  missing: EventType[];
} {
  const present = new Set(
    activities.map((a) => a.eventType ? normalizeToSeries(a.eventType as NonNullable<EventType>) : a.eventType)
  );
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
    if (!a.eventType) continue;
    const et = normalizeToSeries(a.eventType as NonNullable<EventType>);
    if (BRM_DISTANCES.includes(et)) {
      counts.set(et, (counts.get(et) ?? 0) + 1);
    }
  }
  return Math.min(...BRM_DISTANCES.map((d) => counts.get(d) ?? 0));
}

/**
 * Finds critical expiring events: events that, if they fall out of the
 * rolling window, would cause a currently-met requirement to become unmet.
 *
 * For each event expiring in the next 6 months, we check whether removing
 * it would break a requirement (e.g. losing the only PBP, or dropping
 * from 1 complete BRM series to 0).
 */
function findExpiringEvents(
  windowActivities: QualifyingActivity[],
  windowYears: number,
  requiredSeriesCount: number,
  affects: "R5000" | "R10000"
): ExpiringEvent[] {
  if (windowActivities.length === 0) return [];

  const now = new Date();
  const sixMonthsFromNow = new Date(now);
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  // Find events expiring within 6 months
  const expiring: { activity: QualifyingActivity; expiresAt: Date }[] = [];
  for (const a of windowActivities) {
    const activityDate = new Date(a.date);
    const expiresAt = new Date(activityDate);
    expiresAt.setFullYear(expiresAt.getFullYear() + windowYears);
    if (expiresAt > now && expiresAt <= sixMonthsFromNow) {
      expiring.push({ activity: a, expiresAt });
    }
  }

  if (expiring.length === 0) return [];

  // Count occurrences of each event type in the window (SR600 normalised to BRM600)
  const typeCounts = new Map<string, number>();
  for (const a of windowActivities) {
    if (a.eventType) {
      const et = normalizeToSeries(a.eventType as NonNullable<EventType>);
      typeCounts.set(et, (typeCounts.get(et) ?? 0) + 1);
    }
  }

  const results: ExpiringEvent[] = [];

  for (const { activity, expiresAt } of expiring) {
    const et = activity.eventType;
    if (!et) continue;

    let isCritical = false;

    // Unique events: PBP, Fleche, RM1200+ — critical if it's the only one
    if (["PBP", "Fleche", "RM1200+"].includes(et)) {
      isCritical = (typeCounts.get(et) ?? 0) <= 1;
    }
    // BRM distances (including SR600 normalised to BRM600): critical if losing it
    // drops below the required series count
    else if (BRM_DISTANCES.includes(normalizeToSeries(et as NonNullable<EventType>))) {
      const normalised = normalizeToSeries(et as NonNullable<EventType>);
      const count = typeCounts.get(normalised) ?? 0;
      if (count <= requiredSeriesCount) {
        isCritical = true;
      }
    }

    if (isCritical) {
      results.push({
        stravaId: activity.stravaId,
        name: activity.name,
        eventType: et,
        date: new Date(activity.date),
        expiresAt,
        affects: [affects],
        sourceUrl: activity.sourceUrl,
      });
    }
  }

  return results.sort(
    (a, b) => a.expiresAt.getTime() - b.expiresAt.getTime()
  );
}

/**
 * Check qualification status for ACP Randonneur 5000.
 * Requirements: 4-year window, full BRM series, PBP, Flèche, 5000km total.
 */
export function checkAcp5000(
  activities: QualifyingActivity[]
): Acp5000Status {
  const eligible = activities.filter(
    (a) => isAwardEligible(a) && ACP_QUALIFYING_TYPES.includes(a.eventType as NonNullable<EventType>)
  );
  const windowActivities = findBestWindow(eligible, 4);
  const totalKm = windowActivities.reduce((sum, a) => sum + a.distance, 0);

  const series = checkBrmSeries(windowActivities);
  // Find the date of the last BRM that completed the series
  let brmSeriesCompletedDate: Date | null = null;
  if (series.met) {
    const lastPerDistance = new Map<EventType, Date>();
    const sortedByDate = [...windowActivities].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    for (const a of sortedByDate) {
      if (!a.eventType) continue;
      const et = normalizeToSeries(a.eventType as NonNullable<EventType>);
      if (BRM_DISTANCES.includes(et)) {
        lastPerDistance.set(et, new Date(a.date));
        // Check if we have all distances now
        if (BRM_DISTANCES.every((d) => lastPerDistance.has(d))) {
          brmSeriesCompletedDate = new Date(a.date);
          break;
        }
      }
    }
  }
  // Collect one activity per BRM distance for the series (most recent per distance)
  const brmSeriesActivities: QualifyingActivity[] = [];
  const seenDistances = new Set<EventType>();
  const sortedForBrm = [...windowActivities].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  for (const a of sortedForBrm) {
    if (!a.eventType) continue;
    const et = normalizeToSeries(a.eventType as NonNullable<EventType>);
    if (BRM_DISTANCES.includes(et) && !seenDistances.has(et)) {
      seenDistances.add(et);
      brmSeriesActivities.push(a);
    }
  }

  const brmSeries: BrmSeriesRequirement = {
    met: series.met,
    missing: series.missing,
    completedDate: brmSeriesCompletedDate,
    matchingActivities: brmSeriesActivities,
    details: series.met
      ? "Complete BRM series (200+300+400+600+1000)"
      : `Missing BRM distances: ${series.missing.join(", ")}`,
  };

  const pbpActivity = windowActivities
    .filter((a) => a.eventType === "PBP")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const hasPbp = !!pbpActivity;
  const pbp: Requirement = {
    met: hasPbp,
    completedDate: hasPbp ? new Date(pbpActivity.date) : null,
    matchingActivities: pbpActivity ? [pbpActivity] : [],
    details: hasPbp ? "PBP completed" : "PBP required",
  };

  const flecheActivity = windowActivities
    .filter((a) => a.eventType === "Fleche")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const hasFleche = !!flecheActivity;
  const fleche: Requirement = {
    met: hasFleche,
    completedDate: hasFleche ? new Date(flecheActivity.date) : null,
    matchingActivities: flecheActivity ? [flecheActivity] : [],
    details: hasFleche ? "Flèche completed" : "Flèche required",
  };

  const targetKm = 5000;
  // Find the date when total distance reached the target
  let distanceCompletedDate: Date | null = null;
  if (totalKm >= targetKm) {
    const sortedByDate = [...windowActivities].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let cumulative = 0;
    for (const a of sortedByDate) {
      cumulative += a.distance;
      if (cumulative >= targetKm) {
        distanceCompletedDate = new Date(a.date);
        break;
      }
    }
  }
  const mandatoryActivities5000 = [
    ...brmSeriesActivities,
    ...(pbpActivity ? [pbpActivity] : []),
    ...(flecheActivity ? [flecheActivity] : []),
  ];
  const distance: DistanceRequirement = {
    met: totalKm >= targetKm,
    completedDate: distanceCompletedDate,
    matchingActivities: computeGapFillingActivities(windowActivities, mandatoryActivities5000, targetKm),
    currentKm: totalKm,
    targetKm,
    details:
      totalKm >= targetKm
        ? `${Math.round(totalKm).toLocaleString()} km achieved (target: ${targetKm.toLocaleString()} km)`
        : `${Math.round(totalKm).toLocaleString()} km of ${targetKm.toLocaleString()} km`,
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
    expiringEvents: findExpiringEvents(windowActivities, 4, 1, "R5000"),
  };
}

export interface RrtyMonthStatus {
  month: string; // "YYYY-MM"
  label: string; // "Jun 2025"
  activities: QualifyingActivity[];
}

export interface RrtyResult {
  qualified: boolean;
  // Most recent ongoing streak — this is what matters for a new attempt
  currentStreakStart: string | null;
  currentStreakLength: number;
  currentStreakMonths: RrtyMonthStatus[];
  // Longest historical streak (for context; may equal current if still ongoing)
  bestStreakStart: string | null;
  bestStreakEnd: string | null;
  bestStreakLength: number;
  bestStreakMonths: RrtyMonthStatus[];
}

function addMonths(yearMonth: string, n: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check qualification status for Audax Ireland RRTY
 * (Randonneur Round The Year).
 *
 * Requirement: at least one approved brevet of 200km+ in EVERY month
 * for 12 CONSECUTIVE months. Missing a month resets the streak.
 *
 * Finds the longest consecutive streak across all activities.
 */
export function checkRrty(activities: QualifyingActivity[]): RrtyResult {
  const empty: RrtyResult = {
    qualified: false,
    currentStreakStart: null,
    currentStreakLength: 0,
    currentStreakMonths: [],
    bestStreakStart: null,
    bestStreakEnd: null,
    bestStreakLength: 0,
    bestStreakMonths: [],
  };

  // Qualifying: non-DNF, classified event, 200km+
  const qualifying = activities.filter(
    (a) => isAwardEligible(a) && a.eventType !== null && a.distance >= 200
  );

  if (qualifying.length === 0) return empty;

  // Build month → activities map
  const monthMap = new Map<string, QualifyingActivity[]>();
  for (const a of qualifying) {
    const month = a.date.substring(0, 7); // "YYYY-MM"
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(a);
  }

  const sortedMonths = [...monthMap.keys()].sort();

  // Walk sorted months and collect consecutive streaks
  type Streak = { start: string; end: string; length: number };
  const streaks: Streak[] = [];
  let streakStart = sortedMonths[0];
  let streakLen = 1;

  for (let i = 1; i < sortedMonths.length; i++) {
    if (addMonths(sortedMonths[i - 1], 1) === sortedMonths[i]) {
      streakLen++;
    } else {
      streaks.push({ start: streakStart, end: sortedMonths[i - 1], length: streakLen });
      streakStart = sortedMonths[i];
      streakLen = 1;
    }
  }
  streaks.push({ start: streakStart, end: sortedMonths[sortedMonths.length - 1], length: streakLen });

  // Best streak = longest (keep last on tie to prefer more recent)
  const best = streaks.reduce((b, s) => s.length >= b.length ? s : b, streaks[0]);

  // Current streak = the most recent one, BUT only if it's still alive.
  // A streak is alive if it ended in the current month or the previous month.
  // If there's been a gap since then, the clock has reset to 0.
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = addMonths(currentMonth, -1);

  const lastStreak = streaks[streaks.length - 1];
  const isStreakAlive = lastStreak.end >= prevMonth;
  const current = isStreakAlive ? lastStreak : null;

  const buildMonths = (streak: Streak): RrtyMonthStatus[] => {
    const result: RrtyMonthStatus[] = [];
    for (let i = 0; i < streak.length; i++) {
      const month = addMonths(streak.start, i);
      const acts = monthMap.get(month) ?? [];
      const [year, mon] = month.split("-").map(Number);
      const label = new Date(year, mon - 1, 1).toLocaleDateString("en-IE", {
        month: "short",
        year: "numeric",
      });
      result.push({ month, label, activities: acts });
    }
    return result;
  };

  return {
    qualified: (current?.length ?? 0) >= 12,
    currentStreakStart: current?.start ?? null,
    currentStreakLength: current?.length ?? 0,
    currentStreakMonths: current ? buildMonths(current) : [],
    bestStreakStart: best.start,
    bestStreakEnd: best.end,
    bestStreakLength: best.length,
    bestStreakMonths: current && best.start === current.start ? [] : buildMonths(best),
  };
}

const MOUNTAIN_600_ELEVATION = 8000; // meters

/**
 * Returns the activities that fill the remaining distance gap after mandatory
 * activities are accounted for. Only activities with a homologation number are
 * considered. Activities are taken most-recent-first until the gap is filled.
 */
export function computeGapFillingActivities(
  windowActivities: QualifyingActivity[],
  mandatoryActivities: QualifyingActivity[],
  targetKm: number,
): QualifyingActivity[] {
  const mandatoryIds = new Set<string>();
  let mandatoryKm = 0;
  for (const a of mandatoryActivities) {
    if (!mandatoryIds.has(a.stravaId)) {
      mandatoryIds.add(a.stravaId);
      mandatoryKm += a.distance;
    }
  }
  const remainingKm = Math.max(0, targetKm - mandatoryKm);
  let accKm = 0;
  return windowActivities
    .filter((a) => !mandatoryIds.has(a.stravaId) && a.homologationNumber !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((a) => {
      if (accKm >= remainingKm) return false;
      accKm += a.distance;
      return true;
    });
}

/**
 * Check qualification status for ACP Randonneur 10000.
 * Requirements: 6-year window, 2x BRM series, PBP, separate RM1200+,
 * mountain 600 (8000m+), Flèche, 10000km total.
 */
export function checkAcp10000(
  activities: QualifyingActivity[]
): Acp10000Status {
  const eligible = activities.filter(
    (a) => isAwardEligible(a) && ACP_QUALIFYING_TYPES.includes(a.eventType as NonNullable<EventType>)
  );
  const windowActivities = findBestWindow(eligible, 6);
  const totalKm = windowActivities.reduce((sum, a) => sum + a.distance, 0);

  const sortedByDate = [...windowActivities].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const mountain600Activity = sortedByDate.find(
    (a) =>
      (a.eventType === "BRM600" || a.eventType === "SR600") &&
      a.elevationGain >= MOUNTAIN_600_ELEVATION
  );

  const activitiesForSeries = mountain600Activity
    ? sortedByDate.filter((a) => a.stravaId !== mountain600Activity.stravaId)
    : sortedByDate;

  const seriesCount = countBrmSeries(activitiesForSeries);
  // Find date when second series was completed
  let twoSeriesDate: Date | null = null;
  if (seriesCount >= 2) {
    const counts: Record<string, number> = {};
    for (const a of activitiesForSeries) {
      if (!a.eventType) continue;
      const et = normalizeToSeries(a.eventType as NonNullable<EventType>);
      if (BRM_DISTANCES.includes(et)) {
        counts[et] = (counts[et] ?? 0) + 1;
        if (BRM_DISTANCES.every((d) => (counts[d] ?? 0) >= 2)) {
          twoSeriesDate = new Date(a.date);
          break;
        }
      }
    }
  }
  // Collect up to 2 activities per BRM distance for the 2x series (most recent per distance)
  const twoBrmActivities: QualifyingActivity[] = [];
  const distCounts = new Map<string, number>();
  const activitiesForSeriesDesc = [...activitiesForSeries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  for (const a of activitiesForSeriesDesc) {
    if (!a.eventType) continue;
    const et = normalizeToSeries(a.eventType as NonNullable<EventType>);
    if (BRM_DISTANCES.includes(et)) {
      const count = distCounts.get(et) ?? 0;
      if (count < 2) {
        twoBrmActivities.push(a);
        distCounts.set(et, count + 1);
      }
    }
  }

  const missingDistances: string[] = [];
  for (const d of BRM_DISTANCES) {
    const count = distCounts.get(d) ?? 0;
    if (count < 2) {
      missingDistances.push(`${2 - count}x ${d}`);
    }
  }

  const twoBrmSeries: TwoBrmSeriesRequirement = {
    met: seriesCount >= 2,
    seriesCount,
    completedDate: twoSeriesDate,
    matchingActivities: twoBrmActivities,
    details:
      seriesCount >= 2
        ? `${seriesCount} complete BRM series`
        : `Missing: ${missingDistances.join(", ")}`,
  };

  const pbpActivity = sortedByDate.find((a) => a.eventType === "PBP");
  const pbp: Requirement = {
    met: !!pbpActivity,
    completedDate: pbpActivity ? new Date(pbpActivity.date) : null,
    matchingActivities: pbpActivity ? [pbpActivity] : [],
    details: pbpActivity ? "PBP completed" : "PBP required",
  };

  const rm1200Activity = sortedByDate.find((a) => a.eventType === "RM1200+");
  const separateRm1200: Requirement = {
    met: !!rm1200Activity,
    completedDate: rm1200Activity ? new Date(rm1200Activity.date) : null,
    matchingActivities: rm1200Activity ? [rm1200Activity] : [],
    details: rm1200Activity
      ? "Separate RM1200+ completed"
      : "Separate RM1200+ required (distinct from PBP)",
  };

  const mountain600: Requirement = {
    met: !!mountain600Activity,
    completedDate: mountain600Activity ? new Date(mountain600Activity.date) : null,
    matchingActivities: mountain600Activity ? [mountain600Activity] : [],
    details: mountain600Activity
      ? "Mountain 600 completed (8000m+ elevation)"
      : "Mountain 600 required (BRM600 with 8000m+ elevation)",
  };

  const flecheActivity = sortedByDate.find((a) => a.eventType === "Fleche");
  const fleche: Requirement = {
    met: !!flecheActivity,
    completedDate: flecheActivity ? new Date(flecheActivity.date) : null,
    matchingActivities: flecheActivity ? [flecheActivity] : [],
    details: flecheActivity ? "Flèche completed" : "Flèche required",
  };

  const targetKm = 10000;
  let distanceCompletedDate: Date | null = null;
  if (totalKm >= targetKm) {
    let cumulative = 0;
    for (const a of sortedByDate) {
      cumulative += a.distance;
      if (cumulative >= targetKm) {
        distanceCompletedDate = new Date(a.date);
        break;
      }
    }
  }
  const mandatoryActivities10000 = [
    ...twoBrmActivities,
    ...(pbpActivity ? [pbpActivity] : []),
    ...(rm1200Activity ? [rm1200Activity] : []),
    ...(mountain600Activity ? [mountain600Activity] : []),
    ...(flecheActivity ? [flecheActivity] : []),
  ];
  const distance: DistanceRequirement = {
    met: totalKm >= targetKm,
    completedDate: distanceCompletedDate,
    matchingActivities: computeGapFillingActivities(windowActivities, mandatoryActivities10000, targetKm),
    currentKm: totalKm,
    targetKm,
    details:
      totalKm >= targetKm
        ? `${Math.round(totalKm).toLocaleString()} km achieved (target: ${targetKm.toLocaleString()} km)`
        : `${Math.round(totalKm).toLocaleString()} km of ${targetKm.toLocaleString()} km`,
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
    expiringEvents: findExpiringEvents(windowActivities, 6, 2, "R10000"),
  };
}
