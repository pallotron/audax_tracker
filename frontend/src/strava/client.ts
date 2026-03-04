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
}

const STRAVA_API = "https://www.strava.com/api/v3";
const PAGE_SIZE = 200;

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
    manualOverride: false,
    homologationNumber: null,
  };
}

export async function fetchAllActivities(
  accessToken: string,
  after?: number
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
      throw new Error(`Strava API error: ${response.status}`);
    }

    const data: StravaActivityResponse[] = await response.json();
    activities.push(...data.map(mapStravaActivity));

    if (data.length < PAGE_SIZE) {
      break;
    }
    page++;
  }

  return activities;
}
