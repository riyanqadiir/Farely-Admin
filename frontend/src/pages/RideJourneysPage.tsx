import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Search, ArrowRight, ExternalLink, MapPin } from 'lucide-react';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { RideStatus } from '../types/dtos';
import { googleMapsOpenUrl, formatCoordPair, hasValidCoords } from '../lib/mapsLinks';
import { ResolvedPlaceLabel } from '../components/ui/ResolvedPlaceLabel';

function LocationCard({
  title,
  address,
  coords,
}: {
  title: string;
  address: string;
  coords?: { latitude: number; longitude: number };
}) {
  const url = googleMapsOpenUrl(address, coords);
  const coordLine = coords && hasValidCoords(coords) ? formatCoordPair(coords) : '';

  return (
    <div
      className={cn(
        'rounded-xl border p-4 flex flex-col gap-2 min-h-[120px]',
        title.toLowerCase().includes('pickup')
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-sky-200 bg-sky-50/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-widest',
            title.toLowerCase().includes('pickup') ? 'text-emerald-600' : 'text-sky-700',
          )}
        >
          {title}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-bold hover:underline shrink-0',
            title.toLowerCase().includes('pickup') ? 'text-emerald-700' : 'text-sky-700',
          )}
        >
          Open in Maps <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <ResolvedPlaceLabel storedLabel={address} coords={coords} />
      {coordLine ? (
        <p className="text-[11px] font-mono text-slate-600 bg-white/60 rounded px-2 py-1 border border-slate-100/80 w-fit">
          {coordLine}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400 italic">No coordinates stored</p>
      )}
    </div>
  );
}

export default function RideJourneysPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<RideStatus | ''>('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['ride-journeys', searchTerm, status],
    queryFn: () =>
      api.rides.getLogs({ q: searchTerm || undefined, status: status || undefined, limit: 50 }),
  });

  const items = useMemo(() => (logs?.success ? logs.data.items : []), [logs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MapPin size={26} className="text-emerald-600 shrink-0" />
            Trip routes
          </h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Each trip shows pickup and destination in full, with coordinates and a link to open the exact point in
            Google Maps. Use <span className="font-medium text-slate-700">Ride logs</span> for a compact table view.
          </p>
        </div>
        <Link to="/rides/logs">
          <Button variant="outline" size="sm" type="button" className="w-fit">
            Open ride logs table
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search pickup or destination..."
                className="pl-9 h-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
              value={status}
              onChange={(e) => setStatus(e.target.value as RideStatus | '')}
            >
              <option value="">All statuses</option>
              <option value="handoff_opened">handoff_opened</option>
              <option value="handoff_failed">handoff_failed</option>
              <option value="ride_confirmed">ride_confirmed</option>
              <option value="ride_not_taken">ride_not_taken</option>
            </select>
            <p className="text-xs font-medium text-slate-500 whitespace-nowrap">
              {items.length} trip{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-5">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">No rides match your filters.</p>
          ) : (
            items.map((log) => (
              <Card
                key={log.id}
                className="border border-slate-200 shadow-sm overflow-hidden bg-white"
              >
                <div className="flex flex-col lg:flex-row lg:items-stretch gap-0">
                  <div className="flex-1 p-4 space-y-3 border-b lg:border-b-0 lg:border-r border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-stretch md:items-center">
                      <LocationCard title="From · Pickup" address={log.pickup} coords={log.pickupCoords} />
                      <div className="flex md:flex-col items-center justify-center py-1 md:py-0 text-slate-300 shrink-0">
                        <ArrowRight className="h-6 w-6 md:h-10 md:w-10 rotate-90 md:rotate-0" />
                      </div>
                      <LocationCard
                        title="To · Destination"
                        address={log.destination}
                        coords={log.destinationCoords}
                      />
                    </div>
                  </div>
                  <div className="lg:w-56 shrink-0 p-4 bg-slate-50/80 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">User</p>
                      <p className="text-xs font-mono text-slate-800 break-all">{log.userId}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-1 break-all">{log.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          log.provider === 'Uber' ? 'bg-black' : 'bg-[#FF00BF]',
                        )}
                      />
                      <span className="text-sm font-medium">{log.provider}</span>
                      <Badge variant="secondary" className="text-[9px]">
                        {log.rideType}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        {typeof log.capturedFare === 'number' && log.capturedFare > 0
                          ? 'Captured fare'
                          : 'Farely estimate'}
                      </p>
                      <p className="text-lg font-black text-slate-900">
                        {formatCurrency(
                          typeof log.capturedFare === 'number' && log.capturedFare > 0
                            ? log.capturedFare
                            : typeof log.estimatedFare === 'number'
                              ? log.estimatedFare
                              : 0,
                        )}
                      </p>
                      {typeof log.capturedFare === 'number' &&
                      log.capturedFare > 0 &&
                      typeof log.estimatedFare === 'number' &&
                      log.estimatedFare > 0 ? (
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Est: {formatCurrency(log.estimatedFare)}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        log.status === 'ride_confirmed'
                          ? 'success'
                          : log.status === 'handoff_failed'
                            ? 'error'
                            : log.status === 'ride_not_taken'
                              ? 'warning'
                              : 'default'
                      }
                      className="w-fit"
                    >
                      {log.status}
                    </Badge>
                    <p className="text-xs text-slate-500">{formatDate(log.createdAt)}</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
