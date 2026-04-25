import { HotspotTileModel, RideSnapshotModel, TrafficDailyMetricModel } from './models';

/** ~2.2 km near Lahore; bucket pickup pins into named tiles. */
const GRID_DEG = 0.02;

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  lahore: { lat: 31.5204, lng: 74.3587 },
  karachi: { lat: 24.8607, lng: 67.0011 },
  islamabad: { lat: 33.6844, lng: 73.0479 },
  default: { lat: 31.5204, lng: 74.3587 },
};

function cityCenter(city: string): { lat: number; lng: number } {
  const k = String(city || 'lahore')
    .trim()
    .toLowerCase();
  return CITY_CENTERS[k] || CITY_CENTERS.default;
}

function gridKey(city: string, lat: number, lng: number): string {
  const gLat = Math.round(lat / GRID_DEG) * GRID_DEG;
  const gLng = Math.round(lng / GRID_DEG) * GRID_DEG;
  return `${String(city).toLowerCase()}:${gLat.toFixed(3)}:${gLng.toFixed(3)}`;
}

/** Stable 5–12 min pseudo-ETA from tile key (no device ETA in snapshot). */
function avgEtaForTile(tileKey: string): number {
  let h = 0;
  for (let i = 0; i < tileKey.length; i += 1) h = (h * 31 + tileKey.charCodeAt(i)) >>> 0;
  return Math.round((5 + (h % 8) + Number.EPSILON) * 10) / 10;
}

type BucketAgg = {
  city: string;
  tileKey: string;
  sumLat: number;
  sumLng: number;
  n: number;
  demand: number;
  confirmed: number;
};

export const refreshHotspots = async (): Promise<void> => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rides = await RideSnapshotModel().find({ createdAt: { $gte: since } }).lean();

  const grouped = new Map<string, BucketAgg>();
  let noCoordIdx = 0;

  for (const ride of rides) {
    const cityRaw = String(ride.city || 'lahore').trim() || 'lahore';
    const center = cityCenter(cityRaw);
    let lat: number;
    let lng: number;
    const pc = ride.pickupCoords as { latitude?: number; longitude?: number } | undefined;
    if (
      pc &&
      typeof pc.latitude === 'number' &&
      typeof pc.longitude === 'number' &&
      !Number.isNaN(pc.latitude) &&
      !Number.isNaN(pc.longitude)
    ) {
      lat = pc.latitude;
      lng = pc.longitude;
    } else {
      const i = noCoordIdx;
      noCoordIdx += 1;
      // Spread unknown pickups slightly so they do not collapse to one dot if many.
      const spread = 0.0028 * (i % 7);
      lat = center.lat + spread * 0.6;
      lng = center.lng + spread * 0.8;
    }

    const key = gridKey(cityRaw, lat, lng);
    if (!grouped.has(key)) {
      grouped.set(key, {
        city: cityRaw.toLowerCase(),
        tileKey: key,
        sumLat: 0,
        sumLng: 0,
        n: 0,
        demand: 0,
        confirmed: 0,
      });
    }
    const b = grouped.get(key)!;
    b.demand += 1;
    if (String(ride.status) === 'ride_confirmed') b.confirmed += 1;
    b.sumLat += lat;
    b.sumLng += lng;
    b.n += 1;
  }

  const windowStart = new Date();
  await HotspotTileModel().deleteMany({ windowStart: { $gte: new Date(windowStart.getTime() - 1000 * 60 * 5) } });

  const sorted = Array.from(grouped.values())
    .filter((b) => b.demand > 0)
    .sort((a, b) => b.demand - a.demand)
    .slice(0, 60);

  await Promise.all(
    sorted.map((b) => {
      const clat = b.sumLat / b.n;
      const clng = b.sumLng / b.n;
      const success = b.demand ? Number((b.confirmed / b.demand).toFixed(3)) : 0;
      return HotspotTileModel().create({
        windowStart,
        city: b.city,
        tileKey: b.tileKey,
        center: { lat: clat, lng: clng },
        demandCount: b.demand,
        confirmedRides: b.confirmed,
        avgEtaMin: avgEtaForTile(b.tileKey),
        successRate: success,
      });
    })
  );
};

export const runDailyTrafficRollup = async (): Promise<void> => {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const rides = await RideSnapshotModel().find({ createdAt: { $gte: start, $lte: end } }).lean();
  const keyMap = new Map<string, { searches: number; handoffAttempts: number; handoffSuccess: number; confirmedRides: number }>();
  rides.forEach((ride) => {
    const key = `${date}:${ride.provider}:${ride.city}:${ride.rideType}`;
    if (!keyMap.has(key)) keyMap.set(key, { searches: 0, handoffAttempts: 0, handoffSuccess: 0, confirmedRides: 0 });
    const metric = keyMap.get(key)!;
    metric.searches += 1;
    if (ride.status !== 'ride_not_taken') metric.handoffAttempts += 1;
    if (ride.status === 'ride_confirmed') {
      metric.handoffSuccess += 1;
      metric.confirmedRides += 1;
    }
  });
  for (const [key, metric] of keyMap.entries()) {
    const [entryDate, provider, city, rideType] = key.split(':');
    await TrafficDailyMetricModel().updateOne(
      { date: entryDate, provider, city, rideType },
      { $set: { date: entryDate, provider, city, rideType, ...metric } },
      { upsert: true }
    );
  }
};
