import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GoogleMap, useJsApiLoader, Circle } from '@react-google-maps/api';
import { MapContainer, TileLayer, Circle as LeafletCircle, Popup } from 'react-leaflet';
import { api } from '../api/mocks';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Navigation, Info } from 'lucide-react';
import type { HotspotTile } from '../types/dtos';
import 'leaflet/dist/leaflet.css';
import { format } from 'date-fns';

type MapView = 'demand' | 'supply';

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const defaultCenter = { lat: 31.5204, lng: 74.3587 };
const mapContainerStyle = { width: '100%', height: '100%' };

function circleRadiusMeters(t: HotspotTile, view: MapView): number {
  if (view === 'demand') {
    return 120 + Math.min(35 * Math.sqrt(t.demandCount + 1), 4200);
  }
  return 120 + Math.min(40 * Math.sqrt(t.confirmedRides + 1), 4000);
}

function circleColors(t: HotspotTile, view: MapView) {
  if (view === 'demand') {
    const w = t.demandIndex / 100;
    const g = 60 + w * 80;
    const fill = `rgb(16, ${Math.round(120 + w * 80)}, 90)`;
    return { fill, fillOpacity: 0.12 + w * 0.38, stroke: fill };
  }
  const w = t.supplyScore / 100;
  const fill = `rgb(37, ${110 + Math.round(60 * w)}, ${180 + Math.round(40 * w)})`;
  return { fill, fillOpacity: 0.14 + w * 0.36, stroke: fill };
}

function sortTiles(tiles: HotspotTile[], view: MapView): HotspotTile[] {
  const copy = [...tiles];
  if (view === 'demand') copy.sort((a, b) => b.demandCount - a.demandCount);
  else copy.sort((a, b) => b.confirmedRides - a.confirmedRides);
  return copy;
}

function GoogleHotspotMap({ tiles, view, mapCenter }: { tiles: HotspotTile[]; view: MapView; mapCenter: { lat: number; lng: number } }) {
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
      {tiles.map((h) => {
        const c = circleColors(h, view);
        return (
          <Circle
            key={h.tileKey}
            center={h.center}
            radius={circleRadiusMeters(h, view)}
            options={{
              fillColor: c.fill,
              fillOpacity: c.fillOpacity,
              strokeColor: c.stroke,
              strokeWeight: 1,
              strokeOpacity: 0.9,
            }}
            title={h.tileKey}
          />
        );
      })}
    </GoogleMap>
  );
}

function LeafletHotspotMap({ tiles, view, mapCenter }: { tiles: HotspotTile[]; view: MapView; mapCenter: [number, number] }) {
  return (
    <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {tiles.map((h) => {
        const c = circleColors(h, view);
        const m = view === 'demand' ? h.demandCount : h.confirmedRides;
        return (
          <LeafletCircle
            key={h.tileKey}
            center={[h.center.lat, h.center.lng]}
            pathOptions={{
              fillOpacity: c.fillOpacity,
              fillColor: c.fill,
              color: c.stroke,
              weight: 1,
            }}
            radius={Math.min(90 + m * 12, 2200)}
          >
            <Popup>
              <div className="p-1 min-w-[160px] text-slate-900 text-xs">
                <p className="font-bold border-b border-slate-200 pb-1 mb-1">{h.tileKey}</p>
                <p>
                  {view === 'demand' ? 'Ride events' : 'Confirmed rides'}: <b>{m}</b>
                </p>
                <p>Success: {(h.successRate * 100).toFixed(0)}%</p>
              </div>
            </Popup>
          </LeafletCircle>
        );
      })}
    </MapContainer>
  );
}

export default function HotspotsPage() {
  const [view, setView] = useState<MapView>('demand');
  const { data: hotspots, isLoading } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => api.metrics.getHotspots(),
  });

  const tiles = useMemo(
    () => (hotspots?.success ? sortTiles(hotspots.data.tiles, view) : []),
    [hotspots, view]
  );

  const mapCenterG = useMemo(() => {
    if (tiles.length > 0) return { lat: tiles[0].center.lat, lng: tiles[0].center.lng };
    return defaultCenter;
  }, [tiles]);

  const mapCenterL: [number, number] = [mapCenterG.lat, mapCenterG.lng];

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading hotspots…</div>;

  const windowLabel =
    hotspots?.success && hotspots.data.windowStart
      ? format(new Date(hotspots.data.windowStart), 'PPpp')
      : '—';
  const summary = hotspots?.success ? hotspots.data.summary : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Supply &amp; demand hotspots</h1>
          <p className="text-slate-500">
            Map uses ride snapshots from the last 7 days, grouped by ~2 km pickup grid. Data window: {windowLabel}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
          <button
            type="button"
            onClick={() => setView('demand')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md ${
              view === 'demand' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Demand
          </button>
          <button
            type="button"
            onClick={() => setView('supply')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md ${
              view === 'supply' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Supply
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-600">
        <Info className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
        <p>
          <span className="font-semibold text-slate-700">Demand</span> highlights areas with more ride activity (all snapshot events).
          <span className="font-semibold text-slate-700"> Supply</span> highlights where completed trips cluster (confirmed handoffs) — a
          practical proxy; Farely does not ingest driver supply from Uber/Tango. Hotspot size scales with the selected metric.
        </p>
      </div>

      {!GOOGLE_KEY && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Set <code className="font-mono bg-amber-100/80 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in{' '}
          <code className="font-mono">farely-admin/frontend/.env</code> to use Google Maps; otherwise an OpenStreetMap fallback is shown.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden h-[min(70vh,640px)] border border-slate-200 shadow-xl p-0">
          {GOOGLE_KEY ? (
            <GoogleHotspotMap tiles={tiles} view={view} mapCenter={mapCenterG} />
          ) : (
            <LeafletHotspotMap tiles={tiles} view={view} mapCenter={mapCenterL} />
          )}
        </Card>

        <Card className="flex h-[min(70vh,640px)] flex-col border border-slate-200 shadow-xl">
          <CardHeader className="pb-0">
            <CardTitle>{view === 'demand' ? 'Top demand areas' : 'Top fulfilment (supply proxy)'}</CardTitle>
            <CardDescription>
              {view === 'demand'
                ? 'Tiles sorted by ride event count. Larger / greener = more activity.'
                : 'Tiles sorted by confirmed rides. Bluer = relatively more completions in that cell.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto pt-4 px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Area / tile</TableHead>
                  <TableHead>{view === 'demand' ? 'Rides' : 'Confirmed'}</TableHead>
                  <TableHead className="pr-6">Success</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="pl-6 pr-6 text-slate-500 text-sm">
                      No ride snapshots in the last 7 days. Use the app, wait for ingest + hourly hotspot job, or run the backfill script.
                    </TableCell>
                  </TableRow>
                )}
                {tiles.map((h) => (
                  <TableRow key={h.tileKey} className="hover:bg-slate-50/80">
                    <TableCell className="pl-6">
                      <span className="font-bold text-slate-900 block">{h.tileKey}</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 font-mono uppercase tracking-tighter">
                        <Navigation className="h-2 w-2" />
                        {h.center.lat.toFixed(4)}, {h.center.lng.toFixed(4)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {view === 'demand' ? (
                        <div className="flex flex-col gap-1.5 w-max">
                          <div className="h-1.5 w-20 rounded-full overflow-hidden bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${h.demandIndex}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-800">{h.demandCount} rides</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 w-max">
                          <div className="h-1.5 w-20 rounded-full overflow-hidden bg-slate-100">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${h.supplyScore}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-800">{h.confirmedRides} done</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <Badge variant={h.successRate > 0.5 ? 'success' : 'warning'} className="text-[10px] px-1.5">
                        {(h.successRate * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Rides in view</p>
                <p className="text-xl font-bold text-emerald-600">{summary?.totalRides ?? 0}</p>
                <p className="text-[10px] text-slate-500 mt-1">across {summary?.tileCount ?? 0} tiles</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Avg success</p>
                <p className="text-xl font-bold text-amber-600">
                  {summary && summary.totalRides > 0
                    ? `${(summary.avgSuccessRate * 100).toFixed(1)}%`
                    : '—'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">confirmed ÷ all events</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
              ETA per tile is a display estimate (5–12m range) from tile id; add device-measured ETAs in snapshots later for live numbers.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
