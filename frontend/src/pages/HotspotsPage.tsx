import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GoogleMap,
  useJsApiLoader,
  Circle,
  InfoWindow,
  TrafficLayer,
} from '@react-google-maps/api';
import { MapContainer, TileLayer, Circle as LeafletCircle, Popup } from 'react-leaflet';
import { api } from '../api/mocks';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Info, Flame, MapPin, Zap, Clock, RefreshCw } from 'lucide-react';
import type { SurgeLevel, TrafficHotspotItem } from '../types/dtos';
import 'leaflet/dist/leaflet.css';
import { format } from 'date-fns';

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const defaultCenter = { lat: 31.5204, lng: 74.3587 };
const mapContainerStyle = { width: '100%', height: '100%' };

function surgeColor(level: SurgeLevel): { fill: string; stroke: string; tag: string; chip: string } {
  switch (level) {
    case 'high':
      return { fill: '#ef4444', stroke: '#b91c1c', tag: 'bg-red-100 text-red-700 border-red-200', chip: 'bg-red-500' };
    case 'medium':
      return { fill: '#f59e0b', stroke: '#b45309', tag: 'bg-amber-100 text-amber-700 border-amber-200', chip: 'bg-amber-500' };
    case 'low':
      return { fill: '#10b981', stroke: '#047857', tag: 'bg-emerald-100 text-emerald-700 border-emerald-200', chip: 'bg-emerald-500' };
    default:
      return { fill: '#64748b', stroke: '#334155', tag: 'bg-slate-100 text-slate-700 border-slate-200', chip: 'bg-slate-400' };
  }
}

function radiusForItem(item: TrafficHotspotItem): number {
  if (!item.available) return 350;
  const ratio = item.congestionRatio || 1;
  return 400 + Math.min(2200, Math.round((ratio - 1) * 2500));
}

function GoogleHotspotMap({
  items,
  showTraffic,
  mapCenter,
}: {
  items: TrafficHotspotItem[];
  showTraffic: boolean;
  mapCenter: { lat: number; lng: number };
}) {
  const [active, setActive] = useState<TrafficHotspotItem | null>(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'farely-admin-hotspots',
    googleMapsApiKey: GOOGLE_KEY,
  });

  if (loadError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-100 text-slate-600 text-sm p-4 text-center">
        Google Maps failed to load. Check the browser console and that Maps JavaScript API is enabled for this key.
      </div>
    );
  }
  if (!isLoaded) {
    return <div className="h-full w-full flex items-center justify-center bg-slate-50 text-slate-500 text-sm">Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapCenter}
      zoom={12}
      options={{
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      }}
    >
      {showTraffic && <TrafficLayer />}
      {items.map((p) => {
        const c = surgeColor(p.surgeLevel);
        return (
          <Circle
            key={p.key}
            center={{ lat: p.lat, lng: p.lng }}
            radius={radiusForItem(p)}
            options={{
              fillColor: c.fill,
              fillOpacity: p.available ? 0.3 + Math.min(0.5, ((p.congestionRatio || 1) - 1) * 0.8) : 0.15,
              strokeColor: c.stroke,
              strokeWeight: 1.5,
              strokeOpacity: 0.9,
              clickable: true,
            }}
            onClick={() => setActive(p)}
          />
        );
      })}
      {active && (
        <InfoWindow position={{ lat: active.lat, lng: active.lng }} onCloseClick={() => setActive(null)}>
          <div className="p-1 min-w-[220px] text-slate-900 text-xs">
            <p className="font-bold border-b border-slate-200 pb-1 mb-1.5 flex items-center gap-1">
              <MapPin size={11} /> {active.name}, {active.city}
            </p>
            {!active.available ? (
              <p className="text-slate-500">Traffic data unavailable right now.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                  <div>
                    <p className="text-[9px] uppercase font-bold text-slate-400">Free-flow</p>
                    <p className="font-bold">
                      {active.duration ? `${Math.round(active.duration / 60)} min` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold text-slate-400">In traffic</p>
                    <p className="font-bold">
                      {active.durationInTraffic ? `${Math.round(active.durationInTraffic / 60)} min` : '—'}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mb-1.5">
                  Delay: <b>{active.delayMinutes ?? 0} min</b> · Congestion:{' '}
                  <b>{active.congestionRatio?.toFixed(2)}×</b>
                </p>
                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1 border ${surgeColor(active.surgeLevel).tag}`}
                >
                  <span className="text-[10px] font-bold uppercase">Fare surge</span>
                  <span className="font-black">
                    {active.surgeMultiplier.toFixed(2)}× ({active.surgePercent >= 0 ? '+' : ''}
                    {active.surgePercent}%)
                  </span>
                </div>
              </>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

function LeafletHotspotMap({
  items,
  mapCenter,
}: {
  items: TrafficHotspotItem[];
  mapCenter: [number, number];
}) {
  return (
    <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {items.map((p) => {
        const c = surgeColor(p.surgeLevel);
        return (
          <LeafletCircle
            key={p.key}
            center={[p.lat, p.lng]}
            pathOptions={{
              fillOpacity: p.available ? 0.3 + Math.min(0.5, ((p.congestionRatio || 1) - 1) * 0.8) : 0.15,
              fillColor: c.fill,
              color: c.stroke,
              weight: 1.5,
            }}
            radius={radiusForItem(p)}
          >
            <Popup>
              <div className="p-1 min-w-[200px] text-slate-900 text-xs">
                <p className="font-bold border-b border-slate-200 pb-1 mb-1">{p.name}, {p.city}</p>
                {!p.available ? (
                  <p>Traffic unavailable</p>
                ) : (
                  <>
                    <p>Delay: <b>{p.delayMinutes} min</b></p>
                    <p>Congestion: <b>{p.congestionRatio?.toFixed(2)}×</b></p>
                    <p>Surge: <b>{p.surgeMultiplier.toFixed(2)}×</b></p>
                  </>
                )}
              </div>
            </Popup>
          </LeafletCircle>
        );
      })}
    </MapContainer>
  );
}

export default function HotspotsPage() {
  const [cityFilter, setCityFilter] = useState<string>('');
  const [showTraffic, setShowTraffic] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['traffic-hotspots', cityFilter],
    queryFn: () => api.metrics.getTrafficHotspots(cityFilter ? { city: cityFilter } : undefined),
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const items: TrafficHotspotItem[] = useMemo(
    () => (data?.success ? data.data.items : []),
    [data],
  );

  const cities = useMemo(() => (data?.success ? data.data.cities : []), [data]);
  const summary = data?.success ? data.data.summary : null;
  const fetchedAt = data?.success ? data.data.fetchedAt : null;

  const mapCenterG = items[0] ? { lat: items[0].lat, lng: items[0].lng } : defaultCenter;
  const mapCenterL: [number, number] = [mapCenterG.lat, mapCenterG.lng];

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading live traffic…</div>;

  const isConfigError =
    error instanceof Error && error.message?.toLowerCase().includes('google_maps_api_key');

  if (isConfigError) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-2">
        <p className="text-red-600 font-bold">Backend Google Maps API key not configured</p>
        <p className="text-xs text-slate-500">
          Add <code className="px-1 rounded bg-slate-100">GOOGLE_MAPS_API_KEY</code> to{' '}
          <code className="px-1 rounded bg-slate-100">farely-admin/backend/.env</code>, then restart the backend.
          Make sure the <b>Distance Matrix API</b> is enabled on that key in Google Cloud Console.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-bold">Couldn't load traffic hotspots</p>
        <p className="text-xs text-slate-500 mt-1">
          Backend may be down. Try <code className="px-1 rounded bg-slate-100">cd backend &amp;&amp; npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Flame size={22} className="text-red-500" /> Live traffic hotspots &amp; surge pricing
          </h1>
          <p className="text-slate-500">
            Real-time congestion across {summary?.totalAreas || 0} watch-zones in Pakistan, sourced from Google
            Distance Matrix. Updates every 5 minutes.
            {fetchedAt && (
              <span className="ml-1 text-slate-400">
                · Last fetch: {format(new Date(fetchedAt), 'PPpp')}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c.toLowerCase()}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowTraffic((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
              showTraffic ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {showTraffic ? 'Traffic layer: ON' : 'Traffic layer: OFF'}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase text-slate-400">Watch zones</p>
            <p className="text-2xl font-black text-slate-900">{summary?.totalAreas ?? 0}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{summary?.availableAreas ?? 0} reporting now</p>
          </CardContent>
        </Card>
        <Card className="border border-red-100 shadow-sm bg-red-50/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase text-red-500 flex items-center gap-1">
              <Zap size={12} /> High surge zones
            </p>
            <p className="text-2xl font-black text-red-700">{summary?.highSurgeCount ?? 0}</p>
            <p className="text-[10px] text-red-500/70 mt-0.5">Charging up to 1.5× fare</p>
          </CardContent>
        </Card>
        <Card className="border border-amber-100 shadow-sm bg-amber-50/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1">
              <Clock size={12} /> Avg traffic delay
            </p>
            <p className="text-2xl font-black text-amber-700">{summary?.avgDelayMinutes ?? 0} min</p>
            <p className="text-[10px] text-amber-600/70 mt-0.5">Above free-flow time</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase text-slate-400">Data source</p>
            <p className="text-sm font-black text-slate-900 mt-1">Google Maps</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Distance Matrix API</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-600">
        <Info className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
        <p>
          Surge tier is derived from live <span className="font-semibold">traffic delay vs free-flow</span> ratio for each
          watch-zone: <span className="font-semibold text-red-600">≥1.5× → 1.5× surge</span>,{' '}
          <span className="font-semibold text-amber-600">≥1.25× → 1.25×</span>,{' '}
          <span className="font-semibold text-emerald-600">≥1.10× → 1.1×</span>, otherwise normal pricing.
          Toggle the traffic layer to see Google's live road congestion overlay.
        </p>
      </div>

      {!GOOGLE_KEY && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Set <code className="font-mono bg-amber-100/80 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in{' '}
          <code className="font-mono">farely-admin/frontend/.env</code> to use Google Maps; otherwise an OpenStreetMap fallback is shown (no live traffic overlay).
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden h-[min(70vh,640px)] border border-slate-200 shadow-xl p-0">
          {items.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm px-4 text-center">
              No areas to display.
            </div>
          ) : GOOGLE_KEY ? (
            <GoogleHotspotMap items={items} showTraffic={showTraffic} mapCenter={mapCenterG} />
          ) : (
            <LeafletHotspotMap items={items} mapCenter={mapCenterL} />
          )}
        </Card>

        <Card className="flex h-[min(70vh,640px)] flex-col border border-slate-200 shadow-xl">
          <CardHeader className="pb-0">
            <CardTitle>Live hotspot ranking</CardTitle>
            <CardDescription>
              Sorted by congestion ratio (traffic time ÷ free-flow time). Click a row's area name on the map for details.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto pt-4 px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Area</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead className="pr-6">Surge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.key} className="hover:bg-slate-50/80">
                    <TableCell className="pl-6">
                      <span className="font-bold text-slate-900 block">{p.name}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5 block uppercase tracking-tight">
                        {p.city}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.available ? (
                        <div className="flex flex-col gap-1 w-max">
                          <span className="text-[11px] font-bold text-slate-800">
                            +{p.delayMinutes ?? 0} min
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {p.congestionRatio?.toFixed(2)}× ratio
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">no data</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <Badge
                        variant={
                          p.surgeLevel === 'high'
                            ? 'error'
                            : p.surgeLevel === 'medium'
                              ? 'warning'
                              : p.surgeLevel === 'low'
                                ? 'success'
                                : 'secondary'
                        }
                        className="text-[10px] px-1.5 whitespace-nowrap"
                      >
                        {p.surgeMultiplier.toFixed(2)}×
                        {p.surgePercent > 0 ? ` +${p.surgePercent}%` : ''}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Mobile app should call <code className="px-1 rounded bg-white border border-slate-200">/admin/metrics/traffic-hotspots</code>,
              find the nearest area to the user's pickup, and multiply base fare by <code className="px-1 rounded bg-white border border-slate-200">surgeMultiplier</code>.
              Cache the response for ~5 min on device.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
