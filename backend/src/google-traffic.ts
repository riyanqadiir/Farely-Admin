/**
 * Thin wrapper around the Google Distance Matrix API. Used to score how
 * congested a predefined area is right now compared to free-flow traffic.
 *
 * Cached in-memory for 5 minutes per origin/destination pair to keep the
 * Distance Matrix bill low even with frequent dashboard refreshes.
 */

export interface TrafficMeasurement {
  duration: number;
  durationInTraffic: number;
  ratio: number;
}

interface CacheEntry {
  result: TrafficMeasurement | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

function cacheKeyFor(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): string {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}|${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
}

async function callDistanceMatrix(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string,
): Promise<TrafficMeasurement | null> {
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin.lat},${origin.lng}` +
    `&destinations=${destination.lat},${destination.lng}` +
    `&departure_time=now` +
    `&traffic_model=best_guess` +
    `&key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data?.status !== 'OK') return null;

    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !element.duration) return null;

    const duration = Number(element.duration.value || 0);
    const durationInTraffic = Number(
      (element.duration_in_traffic && element.duration_in_traffic.value) || duration,
    );
    if (!Number.isFinite(duration) || duration <= 0) return null;

    return {
      duration,
      durationInTraffic,
      ratio: durationInTraffic / duration,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function measureTraffic(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<TrafficMeasurement | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  const key = cacheKeyFor(origin, destination);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  const result = await callDistanceMatrix(origin, destination, apiKey);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}
