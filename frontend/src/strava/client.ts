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
const MAX_RETRY_WAIT_SECONDS = 300;

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
    excludeFromAwards: false,
  };
}

/**
 * Fetches up to one page of activities newer than `afterEpoch`.
 * Returns the raw responses so callers can reuse them (avoiding a double-fetch
 * when the result is immediately passed into fetchAllActivities).
 */
export async function fetchNewActivities(
  accessToken: string,
  afterEpoch: number
): Promise<StravaActivityResponse[]> {
  const params = new URLSearchParams({ per_page: String(PAGE_SIZE), after: String(afterEpoch) });
  const response = await fetch(
    `${STRAVA_API}/athlete/activities?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function fetchPage(
  accessToken: string,
  params: URLSearchParams,
  onRateLimit?: (waitSeconds: number) => void
): Promise<StravaActivityResponse[]> {
  const url = `${STRAVA_API}/athlete/activities?${params.toString()}`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const response = await fetch(url, { headers });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") ?? "0", 10);
    if (retryAfter > 0 && retryAfter <= MAX_RETRY_WAIT_SECONDS) {
      onRateLimit?.(retryAfter);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      const retry = await fetch(url, { headers });
      if (!retry.ok) {
        throw new Error(`Strava rate limit reached. Try again later.`);
      }
      return retry.json();
    }
    const minutes = retryAfter > 0 ? Math.ceil(retryAfter / 60) : 15;
    throw new Error(
      `Strava rate limit reached. Try again in ~${minutes} minute${minutes !== 1 ? "s" : ""}.`
    );
  }

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  return response.json();
}

export async function fetchAllActivities(
  accessToken: string,
  after?: number,
  onProgress?: (fetched: number, page: number) => void,
  onRateLimit?: (waitSeconds: number) => void,
  prefetched?: StravaActivityResponse[]
): Promise<Activity[]> {
  const activities: Activity[] = prefetched ? prefetched.map(mapStravaActivity) : [];

  // If we have a full prefetched first page there may be more; start at page 2.
  // If the prefetched page was partial (< PAGE_SIZE) we already have everything.
  let page: number | null;
  if (prefetched === undefined) {
    page = 1;
  } else {
    // Report the prefetched activities as page 1 so progress is visible.
    onProgress?.(activities.length, 1);
    page = prefetched.length === PAGE_SIZE ? 2 : null;
  }

  while (page !== null) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PAGE_SIZE),
    });
    if (after !== undefined) {
      params.set("after", String(after));
    }

    const data = await fetchPage(accessToken, params, onRateLimit);
    activities.push(...data.map(mapStravaActivity));
    onProgress?.(activities.length, page);

    if (data.length < PAGE_SIZE) {
      break;
    }
    page++;
  }

  return activities;
}

/**
 * Fetches a single activity. Returns null if the activity no longer exists on
 * Strava (404), so callers can delete it locally.
 */
export async function fetchActivity(
  stravaId: string,
  accessToken: string
): Promise<Activity | null> {
  const url = `${STRAVA_API}/activities/${stravaId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") ?? "0", 10);
    const minutes = retryAfter > 0 ? Math.ceil(retryAfter / 60) : 15;
    throw new Error(
      `Strava rate limit reached. Try again in ~${minutes} minute${minutes !== 1 ? "s" : ""}.`
    );
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  return mapStravaActivity(await response.json());
}
