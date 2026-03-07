import { db } from "../db/database";

const COUNTY_TO_PROVINCE: Record<string, string> = {
  // Munster
  Cork: "Munster", Kerry: "Munster", Limerick: "Munster",
  Tipperary: "Munster", Waterford: "Munster", Clare: "Munster",
  // Leinster
  Dublin: "Leinster", Wicklow: "Leinster", Wexford: "Leinster",
  Carlow: "Leinster", Kilkenny: "Leinster", Laois: "Leinster",
  Offaly: "Leinster", Kildare: "Leinster", Meath: "Leinster",
  Westmeath: "Leinster", Longford: "Leinster", Louth: "Leinster",
  // Connacht
  Galway: "Connacht", Mayo: "Connacht", Sligo: "Connacht",
  Roscommon: "Connacht", Leitrim: "Connacht",
  // Ulster
  Donegal: "Ulster", Cavan: "Ulster", Monaghan: "Ulster",
  Antrim: "Ulster", Armagh: "Ulster", Down: "Ulster",
  Fermanagh: "Ulster", Tyrone: "Ulster", Derry: "Ulster",
};

export function countyToProvince(county: string): string | null {
  const bare = county.replace(/^County\s+/i, "").trim();
  return COUNTY_TO_PROVINCE[bare] ?? null;
}

export interface GeoLocation {
  country: string | null;
  region: string | null;
}

export function parseNominatimRegion(address: {
  country?: string;
  state?: string;
  county?: string;
}): GeoLocation {
  const country = address.country ?? null;
  if (!country) return { country: null, region: null };

  if (country === "Ireland") {
    const region = address.county ? countyToProvince(address.county) : null;
    return { country, region };
  }

  if (country === "United Kingdom") {
    return { country, region: address.state ?? null };
  }

  return { country, region: address.state ?? null };
}

// Cache keyed on rounded coords (~11km precision) to avoid duplicate Nominatim calls
const geoCache = new Map<string, GeoLocation>();

function cacheKey(lat: number, lng: number): string {
  return `${Math.round(lat * 10) / 10},${Math.round(lng * 10) / 10}`;
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoLocation> {
  const key = cacheKey(lat, lng);
  if (geoCache.has(key)) return geoCache.get(key)!;

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "AudaxTracker/1.0 (personal tool)" },
    });
    if (!response.ok) return { country: null, region: null };
    const data = await response.json();
    const result = parseNominatimRegion(data.address ?? {});
    geoCache.set(key, result);
    return result;
  } catch {
    return { country: null, region: null };
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode audax activities that have lat/lng but no country yet.
 * Only processes activities with a classified event type (skips unclassified rides).
 * Calls Nominatim for start and (if available) end points, rate-limited to 1 req/sec.
 * Writes results back to the DB.
 * @param onProgress called after each activity is geocoded with (done, total)
 */
export async function geocodeActivities(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const all = await db.activities.toArray();
  const toGeocode = all.filter(
    (a) =>
      a.startLat !== null &&
      a.eventType !== null &&
      (a.startCountry === null ||
        (a.startCountry === "Ireland" && a.startRegion === null))
  );
  if (toGeocode.length === 0) return;

  for (let i = 0; i < toGeocode.length; i++) {
    const activity = toGeocode[i];
    const startKey = cacheKey(activity.startLat!, activity.startLng!);
    const startCached = geoCache.has(startKey);
    const startGeo = await reverseGeocode(activity.startLat!, activity.startLng!);
    if (!startCached) await sleep(1000);

    let endGeo: GeoLocation = { country: null, region: null };
    if (activity.endLat !== null) {
      const endKey = cacheKey(activity.endLat, activity.endLng!);
      const endCached = geoCache.has(endKey);
      endGeo = await reverseGeocode(activity.endLat, activity.endLng!);
      if (!endCached) await sleep(1000);
    }

    await db.activities.update(activity.stravaId, {
      startCountry: startGeo.country,
      startRegion: startGeo.region,
      endCountry: endGeo.country,
      endRegion: endGeo.region,
    });

    onProgress?.(i + 1, toGeocode.length);
  }
}
