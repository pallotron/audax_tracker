import type { EventType, ClassificationSource } from "../db/types";
import { isAwardEligible } from "../classification/classifier";

export interface AwardsActivity {
  stravaId: string;
  name: string;
  date: string;
  distance: number; // km
  elevationGain: number;
  eventType: EventType;
  dnf: boolean;
  sourceUrl: string;
  startCountry: string | null;
  startRegion: string | null;
  endCountry: string | null;
  endRegion: string | null;
  isNotableInternational: boolean;
  // Award eligibility fields
  classificationSource: ClassificationSource;
  manualOverride: boolean;
  excludeFromAwards: boolean;
  needsConfirmation: boolean;
}

function addMonths(yearMonth: string, n: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── RRTY per year ─────────────────────────────────────────────────────────────

export function checkRrtyYears(activities: AwardsActivity[]): Map<number, AwardsActivity[]> {
  const qualifying = activities.filter(
    (a) => isAwardEligible(a) && a.eventType !== null && a.distance >= 200
  );
  if (qualifying.length === 0) return new Map();

  const byMonth = new Map<string, AwardsActivity>();
  // Prefer the earliest eligible activity in a month
  const sortedQualifying = [...qualifying].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  for (const a of sortedQualifying) {
    const m = a.date.substring(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, a);
  }

  const sortedMonths = [...byMonth.keys()].sort();
  const achieved = new Map<number, AwardsActivity[]>();
  let streakStart = 0;

  for (let i = 1; i <= sortedMonths.length; i++) {
    const isEnd =
      i === sortedMonths.length ||
      addMonths(sortedMonths[i - 1], 1) !== sortedMonths[i];

    if (isEnd) {
      const streakLen = i - streakStart;
      if (streakLen >= 12) {
        for (let j = streakStart + 11; j < i; j++) {
          const year = parseInt(sortedMonths[j].substring(0, 4));
          if (!achieved.has(year)) {
            const streakRides: AwardsActivity[] = [];
            for (let k = j - 11; k <= j; k++) {
              streakRides.push(byMonth.get(sortedMonths[k])!);
            }
            achieved.set(year, streakRides);
          }
        }
      }
      streakStart = i;
    }
  }

  return achieved;
}

// ── Brevet 2000/5000 ──────────────────────────────────────────────────────────

const BREVET_TYPES: EventType[] = [
  "BRM200", "BRM300", "BRM400", "BRM600", "BRM1000", "Permanent",
];

export function activitySeason(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 11) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

export interface BrevetKmStatus {
  total: number;
  activities: AwardsActivity[];
}

export function checkBrevetKm(activities: AwardsActivity[]): Map<string, BrevetKmStatus> {
  const result = new Map<string, BrevetKmStatus>();
  for (const a of activities) {
    if (!isAwardEligible(a) || !BREVET_TYPES.includes(a.eventType as EventType)) continue;
    const season = activitySeason(a.date);
    if (!result.has(season)) {
      result.set(season, { total: 0, activities: [] });
    }
    const status = result.get(season)!;
    status.total += a.distance;
    status.activities.push(a);
  }
  return result;
}

// ── Super Randonneur ──────────────────────────────────────────────────────────

export interface SuperRandonneurStatus {
  met: boolean;
  distances: Set<EventType>;
  activities: AwardsActivity[];
}

export function checkSuperRandonneur(
  activities: AwardsActivity[]
): Map<string, SuperRandonneurStatus> {
  const result = new Map<string, SuperRandonneurStatus>();
  const srDistances = ["BRM200", "BRM300", "BRM400", "BRM600"] as const;

  for (const a of activities) {
    if (!isAwardEligible(a) || !srDistances.includes(a.eventType as any)) continue;
    const season = activitySeason(a.date);
    if (!result.has(season)) {
      result.set(season, { met: false, distances: new Set(), activities: [] });
    }
    const status = result.get(season)!;
    if (!status.distances.has(a.eventType as EventType)) {
      status.distances.add(a.eventType as EventType);
      status.activities.push(a);
    }
    if (srDistances.every((d) => status.distances.has(d))) {
      status.met = true;
    }
  }
  return result;
}

// ── 4 Provinces ───────────────────────────────────────────────────────────────

const PROVINCES = ["Ulster", "Leinster", "Munster", "Connacht"] as const;

export interface FourProvincesSeason {
  met: boolean;
  provinces: Partial<Record<string, AwardsActivity[]>>;
}

export function checkFourProvinces(
  activities: AwardsActivity[]
): Map<string, FourProvincesSeason> {
  const result = new Map<string, FourProvincesSeason>();

  const qualifying = activities.filter(
    (a) =>
      isAwardEligible(a) &&
      a.eventType !== null &&
      a.distance >= 200 &&
      a.startRegion !== null &&
      PROVINCES.includes(a.startRegion as (typeof PROVINCES)[number])
  );

  for (const a of qualifying) {
    const season = activitySeason(a.date);
    if (!result.has(season)) result.set(season, { met: false, provinces: {} });
    const seasonData = result.get(season)!;
    if (!seasonData.provinces[a.startRegion!]) seasonData.provinces[a.startRegion!] = [];
    seasonData.provinces[a.startRegion!]!.push(a);
  }

  for (const data of result.values()) {
    data.met = PROVINCES.every((p) => (data.provinces[p]?.length ?? 0) > 0);
  }

  return result;
}

// ── Easter Flèche ─────────────────────────────────────────────────────────────

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export interface EasterFlecheResult {
  year: number;
  activity: AwardsActivity;
}

export function checkEasterFleche(
  activities: AwardsActivity[]
): EasterFlecheResult[] {
  return activities
    .filter((a) => a.eventType === "Fleche" && isAwardEligible(a))
    .flatMap((a) => {
      const d = new Date(a.date);
      const year = d.getFullYear();
      const easter = easterSunday(year);
      const goodFriday = new Date(easter);
      goodFriday.setDate(easter.getDate() - 2);
      const easterMonday = new Date(easter);
      easterMonday.setDate(easter.getDate() + 1);
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const fridayOnly = new Date(goodFriday.getFullYear(), goodFriday.getMonth(), goodFriday.getDate());
      const mondayOnly = new Date(easterMonday.getFullYear(), easterMonday.getMonth(), easterMonday.getDate());
      if (dateOnly >= fridayOnly && dateOnly <= mondayOnly) {
        return [{ year, activity: a }];
      }
      return [];
    })
    .sort((a, b) => a.year - b.year);
}

// ── 4 Nations SR / ISR ────────────────────────────────────────────────────────

const SR_DISTANCES: EventType[] = ["BRM200", "BRM300", "BRM400", "BRM600"];
const FOUR_NATIONS = ["Ireland", "England", "Scotland", "Wales"] as const;
const FOUR_NATIONS_SEASON_START = new Date("2024-11-01");

export interface NationAssignment {
  distance: EventType;
  nation: string;
  activity: AwardsActivity;
}

export interface SrNationsResult {
  met: boolean;
  assignments: NationAssignment[];
  unmatched: EventType[];
  /** True when all distances have eligible activities but unique-nation constraint cannot be satisfied */
  hasConflict: boolean;
}

function findSrAssignment(
  byDistance: Map<EventType, Array<{ nation: string; activity: AwardsActivity }>>
): { met: boolean; assignments: NationAssignment[] } {
  const assignments: NationAssignment[] = [];
  const usedNations = new Set<string>();

  function backtrack(idx: number): boolean {
    if (idx === SR_DISTANCES.length) return true;
    const dist = SR_DISTANCES[idx];
    for (const { nation, activity } of byDistance.get(dist) ?? []) {
      if (!usedNations.has(nation)) {
        usedNations.add(nation);
        assignments.push({ distance: dist, nation, activity });
        if (backtrack(idx + 1)) return true;
        usedNations.delete(nation);
        assignments.pop();
      }
    }
    return false;
  }

  const met = backtrack(0);
  return { met, assignments: met ? [...assignments] : [] };
}

export function checkFourNations(activities: AwardsActivity[]): SrNationsResult {
  const eligible = activities.filter(
    (a) =>
      isAwardEligible(a) &&
      SR_DISTANCES.includes(a.eventType as EventType) &&
      a.startCountry !== null &&
      a.endCountry !== null &&
      new Date(a.date) >= FOUR_NATIONS_SEASON_START
  );

  const getNation = (a: AwardsActivity): string | null => {
    if (a.startCountry === "Ireland" && a.endCountry === "Ireland") return "Ireland";
    if (
      a.startCountry === "United Kingdom" &&
      a.endCountry === "United Kingdom" &&
      a.startRegion === a.endRegion &&
      a.startRegion !== null &&
      ["England", "Scotland", "Wales"].includes(a.startRegion)
    ) {
      return a.startRegion;
    }
    return null;
  };

  const byDistance = new Map<EventType, Array<{ nation: string; activity: AwardsActivity }>>();
  for (const dist of SR_DISTANCES) byDistance.set(dist, []);

  for (const a of eligible) {
    const nation = getNation(a);
    if (!nation || !FOUR_NATIONS.includes(nation as (typeof FOUR_NATIONS)[number])) continue;
    byDistance.get(a.eventType as EventType)!.push({ nation, activity: a });
  }

  const { met, assignments } = findSrAssignment(byDistance);
  const unmatched = met
    ? []
    : SR_DISTANCES.filter((d) => (byDistance.get(d)?.length ?? 0) === 0);
  const hasConflict = !met && unmatched.length === 0;

  return { met, assignments, unmatched, hasConflict };
}

export function checkIsr(activities: AwardsActivity[]): SrNationsResult {
  const eligible = activities.filter(
    (a) =>
      isAwardEligible(a) &&
      SR_DISTANCES.includes(a.eventType as EventType) &&
      a.startCountry !== null &&
      a.endCountry !== null
  );

  const byDistance = new Map<EventType, Array<{ nation: string; activity: AwardsActivity }>>();
  for (const dist of SR_DISTANCES) byDistance.set(dist, []);

  for (const a of eligible) {
    if (a.startCountry !== a.endCountry) continue;
    byDistance.get(a.eventType as EventType)!.push({ nation: a.startCountry!, activity: a });
  }

  const { met, assignments } = findSrAssignment(byDistance);
  const unmatched = met
    ? []
    : SR_DISTANCES.filter((d) => (byDistance.get(d)?.length ?? 0) === 0);
  const hasConflict = !met && unmatched.length === 0;

  return { met, assignments, unmatched, hasConflict };
}

// ── International Rides ────────────────────────────────────────────────────────

export function getInternationalRides(
  activities: AwardsActivity[]
): AwardsActivity[] {
  return activities
    .filter(
      (a) =>
        isAwardEligible(a) &&
        a.eventType !== null &&
        (a.isNotableInternational ||
          (a.startCountry !== null && a.startCountry !== "Ireland"))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
