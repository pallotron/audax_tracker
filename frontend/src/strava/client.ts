import type { Activity } from "../db/database";
import { classifyActivity } from "../classification/classifier";

export interface StravaActivityResponse {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_latlng: [number, number] | [];
  end_latlng: [number, number] | [];
}

const STRAVA_API = "https://www.strava.com/api/v3";
const PAGE_SIZE = 200;

export async function fetchAthleteActivityCount(
  accessToken: string,
  athleteId: number
): Promise<number> {
  const response = await fetch(
    `${STRAVA_API}/athletes/${athleteId}/stats`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return 0;
  const data = await response.json();
  // Sum all activity types, not just rides
  const rides = data.all_ride_totals?.count ?? 0;
  const runs = data.all_run_totals?.count ?? 0;
  const swims = data.all_swim_totals?.count ?? 0;
  return rides + runs + swims;
}

export function mapStravaActivity(raw: StravaActivityResponse): Activity {
  const distanceKm = raw.distance / 1000;
  const classification = classifyActivity({
    name: raw.name,
    distance: raw.distance,
    elevationGain: raw.total_elevation_gain,
  });

  return {
    stravaId: String(raw.id),
    name: raw.name,
    distance: distanceKm,
    movingTime: raw.moving_time,
    elapsedTime: raw.elapsed_time,
    elevationGain: raw.total_elevation_gain,
    type: raw.type,
    date: new Date(raw.start_date),
    eventType: classification?.eventType ?? null,
    classificationSource: classification?.classificationSource ?? "manual",
    needsConfirmation: classification?.needsConfirmation ?? false,
    manualOverride: false,
    homologationNumber: null,
    dnf: classification?.dnf ?? false,
    sourceUrl: `https://www.strava.com/activities/${raw.id}`,
    startLat: raw.start_latlng?.[0] ?? null,
    startLng: raw.start_latlng?.[1] ?? null,
    endLat: raw.end_latlng?.[0] ?? null,
    endLng: raw.end_latlng?.[1] ?? null,
    startCountry: null,
    startRegion: null,
    endCountry: null,
    endRegion: null,
    isNotableInternational: false,
  };
}

/**
 * Lightweight check: returns true if Strava has any activities
 * newer than `afterEpoch`. Fetches only 1 result.
 */
export async function hasNewActivities(
  accessToken: string,
  afterEpoch: number
): Promise<boolean> {
  const params = new URLSearchParams({ per_page: "1", after: String(afterEpoch) });
  const response = await fetch(
    `${STRAVA_API}/athlete/activities?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return false;
  const data = await response.json();
  return Array.isArray(data) && data.length > 0;
}

export async function fetchAllActivities(
  accessToken: string,
  after?: number,
  onProgress?: (fetched: number, page: number) => void
): Promise<Activity[]> {
  const activities: Activity[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PAGE_SIZE),
    });
    if (after !== undefined) {
      params.set("after", String(after));
    }

    const response = await fetch(
      `${STRAVA_API}/athlete/activities?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        const minutesUntilReset = 15 - (new Date().getMinutes() % 15);
        throw new Error(
          `Strava rate limit reached. Try again in ~${minutesUntilReset} minute${minutesUntilReset !== 1 ? "s" : ""}.`
        );
      }
      throw new Error(`Strava API error: ${response.status}`);
    }

    const data: StravaActivityResponse[] = await response.json();
    activities.push(...data.map(mapStravaActivity));
    onProgress?.(activities.length, page);

    if (data.length < PAGE_SIZE) {
      break;
    }
    page++;
  }

  return activities;
}
