import { useQuery } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Search, Filter, ArrowRight, ExternalLink } from 'lucide-react';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { useState } from 'react';
import { RideStatus } from '../types/dtos';

export default function RideLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<RideStatus | ''>('');
  
  const { data: logs, isLoading } = useQuery({
    queryKey: ['ride-logs', searchTerm, status],
    queryFn: () => api.rides.getLogs({ q: searchTerm || undefined, status: status || undefined, limit: 25 }),
  });

  const filteredLogs = logs?.success ? logs.data.items : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ride Logs</h1>
          <p className="text-slate-500">History of all ride searches and handoffs.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm">
             <Filter className="mr-2 h-4 w-4" />
             Filters
           </Button>
           <Button size="sm">Export CSV</Button>
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
              <TableHead>User / ID</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Fare</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead className="w-[50px]"></TableHead>
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
            ) : filteredLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-slate-900 font-bold">{log.userId}</span>
                    <span className="text-[10px] text-slate-400 font-mono tracking-tight">{log.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 max-w-[200px]">
                    <span className="truncate" title={log.pickup}>{log.pickup}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
                    <span className="truncate font-normal text-slate-500" title={log.destination}>{log.destination}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      log.provider === 'Uber' ? 'bg-black' : 'bg-[#FF00BF]'
                    )} />
                    <span>{log.provider}</span>
                    <Badge variant="secondary" className="px-1 text-[9px] h-4">{log.rideType}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-bold text-slate-900">
                    {formatCurrency(typeof log.estimatedFare === 'number' ? log.estimatedFare : 0)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={
                    log.status === 'ride_confirmed' ? 'success' : 
                    log.status === 'handoff_failed' ? 'error' : 
                    log.status === 'ride_not_taken' ? 'warning' : 'default'
                  }>
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-500 text-xs">
                  {formatDate(log.createdAt)}
                </TableCell>
                <TableCell>
                  <button className="text-slate-400 hover:text-emerald-600 transition-colors">
                    <ExternalLink size={16} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
           <p className="text-xs text-slate-500 font-medium">Next cursor: {logs?.success ? logs.data.nextCursor ?? 'none' : 'none'}</p>
           <div className="flex gap-2">
             <Button variant="outline" size="sm" disabled>Previous</Button>
             <Button variant="outline" size="sm">Next</Button>
           </div>
        </div>
      </Card>
    </div>
  );
}
