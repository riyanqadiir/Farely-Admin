const CACHE_KEY = 'farely_reverse_geocode_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CacheEntry = { name: string; ts: number };
type CacheShape = Record<string, CacheEntry>;

function loadCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

function saveCache(cache: CacheShape): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota errors */
  }
}

function keyFor(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

interface BigDataCloudAdminLevel {
  name?: string;
  order?: number;
  adminLevel?: number;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  localityInfo?: {
    administrative?: BigDataCloudAdminLevel[];
    informative?: BigDataCloudAdminLevel[];
  };
}

function pickName(data: BigDataCloudResponse): string | null {
  const admin = data.localityInfo?.administrative || [];
  const informative = data.localityInfo?.informative || [];

  const neighbourhood =
    informative.find((a) => /suburb|neighbourhood|neighborhood|quarter/i.test(a.name || ''))?.name ||
    admin
      .slice()
      .reverse()
      .find((a) => (a.adminLevel || 0) >= 7 && a.name && a.name !== data.city)?.name;

  const city = data.city || data.locality || data.principalSubdivision;

  if (neighbourhood && city && neighbourhood !== city) {
    return `${neighbourhood}, ${city}`;
  }
  if (data.locality && data.city && data.locality !== data.city) {
    return `${data.locality}, ${data.city}`;
  }
  return city || data.locality || null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const cache = loadCache();
  const k = keyFor(lat, lng);
  const hit = cache[k];
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.name;

  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as BigDataCloudResponse;
    const name = pickName(data);
    if (name) {
      cache[k] = { name, ts: Date.now() };
      saveCache(cache);
    }
    return name;
  } catch {
    return null;
  }
}
