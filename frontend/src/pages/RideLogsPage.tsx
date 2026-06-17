import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/mocks';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Search, MapPin, ExternalLink } from 'lucide-react';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { useState } from 'react';
import { RideStatus } from '../types/dtos';
import { googleMapsOpenUrl, formatCoordPair, hasValidCoords } from '../lib/mapsLinks';
import { ResolvedPlaceLabel } from '../components/ui/ResolvedPlaceLabel';

export default function RideLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<RideStatus | ''>('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['ride-logs', searchTerm, status],
    queryFn: () =>
      api.rides.getLogs({ q: searchTerm || undefined, status: status || undefined, limit: 25 }),
  });

  const filteredLogs = logs?.success ? logs.data.items : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ride logs</h1>
          <p className="text-slate-500 mt-1">
            Compact operational table. For full pickup and destination cards, open{' '}
            <Link to="/rides/journeys" className="font-semibold text-emerald-700 hover:underline">
              Trip routes
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/rides/journeys">
            <Button variant="outline" size="sm">
              <MapPin className="mr-2 h-4 w-4" />
              Trip routes view
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by pickup or destination..."
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
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Showing {filteredLogs.length} rides</span>
            </div>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">User / ID</TableHead>
              <TableHead className="min-w-[340px]">From · Pickup → To · Destination</TableHead>
              <TableHead>Maps</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Fare</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="animate-pulse bg-slate-100 h-4 w-full rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id} className="align-top">
                  <TableCell className="align-top pt-4">
                    <div className="flex flex-col max-w-[180px]">
                      <span className="text-slate-900 font-bold text-xs break-all">{log.userId}</span>
                      <span className="text-[10px] text-slate-400 font-mono tracking-tight break-all mt-1">
                        {log.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top pt-3 max-w-md">
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-1">
                        From · Pickup
                      </p>
                      <ResolvedPlaceLabel storedLabel={log.pickup} coords={log.pickupCoords} />
                      {hasValidCoords(log.pickupCoords) && (
                        <p className="text-[10px] font-mono text-slate-500 mt-1">
                          {formatCoordPair(log.pickupCoords)}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-sky-100 bg-sky-50/40 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700 mb-1">
                        To · Destination
                      </p>
                      <ResolvedPlaceLabel storedLabel={log.destination} coords={log.destinationCoords} />
                      {hasValidCoords(log.destinationCoords) && (
                        <p className="text-[10px] font-mono text-slate-500 mt-1">
                          {formatCoordPair(log.destinationCoords)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top pt-4">
                    <div className="flex flex-col gap-1.5">
                      <a
                        href={googleMapsOpenUrl(log.pickup, log.pickupCoords)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"
                      >
                        From <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={googleMapsOpenUrl(log.destination, log.destinationCoords)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:underline"
                      >
                        To <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="align-top pt-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          log.provider === 'Uber' ? 'bg-black' : 'bg-[#FF00BF]',
                        )}
                      />
                      <span>{log.provider}</span>
                      <Badge variant="secondary" className="px-1 text-[9px] h-4">
                        {log.rideType}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top pt-4 whitespace-nowrap">
                    <span className="font-bold text-slate-900">
                      {formatCurrency(
                        typeof log.capturedFare === 'number' && log.capturedFare > 0
                          ? log.capturedFare
                          : typeof log.estimatedFare === 'number'
                            ? log.estimatedFare
                            : 0,
                      )}
                    </span>
                    {typeof log.capturedFare === 'number' &&
                    log.capturedFare > 0 &&
                    typeof log.estimatedFare === 'number' &&
                    log.estimatedFare > 0 ? (
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                        Est: {formatCurrency(log.estimatedFare)}
                      </p>
                    ) : typeof log.estimatedFare === 'number' && log.estimatedFare > 0 ? (
                      <p className="text-[11px] font-medium text-amber-700 mt-0.5">Estimate only</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top pt-4 whitespace-nowrap">
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
                    >
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top pt-4 text-slate-500 text-xs whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            Next cursor: {logs?.success ? logs.data.nextCursor ?? 'none' : 'none'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
