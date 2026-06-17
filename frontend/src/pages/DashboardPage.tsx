import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  Users, 
  Car, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  MessageSquare,
  ArrowRightLeft,
  Search,
  MapPin,
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar,
  LabelList,
} from 'recharts';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { reverseGeocode } from '../lib/geocode';

export default function DashboardPage() {
  const { data: traffic, isLoading: trafficLoading } = useQuery({
    queryKey: ['traffic'],
    queryFn: () => api.metrics.getTraffic(),
  });

  const { data: areaFreq, isLoading: areaFreqLoading, error: areaFreqError } = useQuery({
    queryKey: ['area-frequency', 7],
    queryFn: () => api.metrics.getAreaFrequency({ days: 7, limit: 10 }),
    retry: 1,
  });

  const { data: active } = useQuery({
    queryKey: ['active-users', 24],
    queryFn: () => api.metrics.getActiveUsers({ hours: 24 }),
  });

  const { data: threads } = useQuery({
    queryKey: ['threads', { limit: 100 }],
    queryFn: () => api.support.getThreads({ limit: 100 }),
  });

  const areaItems = useMemo(
    () => (areaFreq?.success ? areaFreq.data.items : []),
    [areaFreq],
  );

  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const needGeocode = areaItems.filter(
      (a) => !a.name && a.lat !== null && a.lng !== null && !resolvedNames[a.key],
    );
    if (needGeocode.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        needGeocode.map(async (a) => {
          const n = await reverseGeocode(a.lat as number, a.lng as number);
          return [a.key, n] as const;
        }),
      );
      if (cancelled) return;
      setResolvedNames((prev) => {
        const next = { ...prev };
        for (const [k, v] of entries) if (v) next[k] = v;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [areaItems, resolvedNames]);

  if (trafficLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const m = traffic?.data.summary;
  const threadSummary = (threads?.success && threads.data.items
    ? threads.data.items.reduce(
        (acc, item) => {
          if (item.status === 'open') acc.open += 1;
          if (item.status === 'in_progress') acc.inProgress += 1;
          if (item.status === 'resolved') acc.resolved += 1;
          return acc;
        },
        { open: 0, inProgress: 0, resolved: 0 },
      )
    : { open: 0, inProgress: 0, resolved: 0 });

  const activeCount = active?.data?.displayCount;

  const chartData = areaItems.map((a) => {
    const label = a.name || resolvedNames[a.key] || 'Nearby location';
    return {
      key: a.key,
      area: label.length > 28 ? label.slice(0, 27) + '…' : label,
      fullArea: label,
      pickups: a.pickupCount,
      destinations: a.destinationCount,
      pickupConfirmed: a.pickupConfirmed,
      destinationConfirmed: a.destinationConfirmed,
      total: a.totalCount,
    };
  });

  const totalPickups = chartData.reduce((s, a) => s + a.pickups, 0);
  const totalDestinations = chartData.reduce((s, a) => s + a.destinations, 0);
  const chartHeight = Math.max(360, chartData.length * 46);
  const windowDays = areaFreq?.success ? areaFreq.data.days : 7;
  const usedFallbackWindow = !!(areaFreq?.success && areaFreq.data.usedFallback);
  const windowLabel = windowDays === 0
    ? 'all time'
    : windowDays === 1
      ? 'last 24 hours'
      : `last ${windowDays} days`;

  const stats = [
    { name: 'Active users (24h est.)', value: activeCount, icon: Users, change: '—', trend: 'up' as const },
    { name: 'Ride Searches', value: m?.searches, icon: Search, change: '+12%', trend: 'up' as const },
    { name: 'Handoff Attempts', value: m?.handoffAttempts, icon: ArrowRightLeft, change: '+5%', trend: 'up' as const },
    { name: 'Handoff Success', value: m?.handoffSuccess, icon: CheckCircle2, change: '+2%', trend: 'up' as const },
    { name: 'Confirmed Rides', value: m?.confirmedRides, icon: Car, change: '+3%', trend: 'up' as const },
  ];

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col sm:flex-row justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900 tracking-tight">System Overview</h1>
          <p className="text-emerald-500/80 mt-1">Real-time analytics for the Farely network</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="glass-card gap-2">
            Last 24 Hours <Clock size={16} />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="hover:scale-[1.02] cursor-default">
              <CardContent className="p-6">
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5">{stat.name}</div>
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-black text-emerald-950">{stat.value?.toLocaleString()}</h3>
                  <div className="p-2.5 bg-emerald-100/50 text-emerald-600 rounded-xl shadow-inner border border-white/50">
                    <stat.icon size={22} strokeWidth={2.5} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5">
                  <div className={cn(
                    "flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm",
                    stat.trend === 'up' ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"
                  )}>
                    {stat.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {stat.change}
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">vs yesterday</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-xl shadow-emerald-900/5">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-emerald-950 flex items-center gap-2">
                  <MapPin size={18} className="text-emerald-600" />
                  Ride Volume by Area
                </CardTitle>
                <CardDescription className="text-emerald-500 font-medium">
                  Top areas by pickups &amp; destinations · {windowLabel} · {totalPickups} pickups · {totalDestinations} destinations
                  {usedFallbackWindow && (
                    <span className="ml-2 text-amber-600 font-semibold">
                      (no data in 7 days — showing wider window)
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm" /> Pickup
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                  <span className="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-sm" /> Destination
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="pt-4" style={{ height: chartHeight }}>
              {areaFreqLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-emerald-500">
                  Loading area data…
                </div>
              ) : areaFreqError ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <div className="text-sm font-bold text-red-600">Couldn't reach the admin backend</div>
                  <div className="text-xs text-slate-500 max-w-md">
                    The chart needs <code className="px-1 rounded bg-slate-100">/admin/metrics/area-frequency</code>.
                    Make sure the backend is running: <code className="px-1 rounded bg-slate-100">cd backend &amp;&amp; npm run dev</code>
                  </div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-emerald-500/80 text-center px-6">
                  No rides recorded yet. The chart will populate as rides come in.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 8, right: 32, bottom: 8, left: 8 }}
                    barCategoryGap={14}
                    barGap={4}
                  >
                    <defs>
                      <linearGradient id="pickupGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="destinationGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="6 6" horizontal={false} stroke="#ecfdf5" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="area"
                      width={180}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#065f46' }}
                      interval={0}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                      contentStyle={{
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.4)',
                        backdropFilter: 'blur(12px)',
                        background: 'rgba(255,255,255,0.92)',
                        boxShadow: '0 10px 15px -3px rgba(16,185,129,0.1)',
                      }}
                      labelFormatter={(_, payload) => {
                        const item = payload?.[0]?.payload as typeof chartData[number] | undefined;
                        return item?.fullArea || '';
                      }}
                      formatter={(value: number, name) => {
                        if (name === 'pickups') return [`${value} rides`, 'Pickups'];
                        if (name === 'destinations') return [`${value} rides`, 'Destinations'];
                        return [value, name];
                      }}
                    />
                    <Bar
                      dataKey="pickups"
                      fill="url(#pickupGradient)"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={18}
                    >
                      <LabelList
                        dataKey="pickups"
                        position="right"
                        formatter={(value: number) => (value > 0 ? value : '')}
                        style={{ fill: '#065f46', fontSize: 10, fontWeight: 800 }}
                      />
                    </Bar>
                    <Bar
                      dataKey="destinations"
                      fill="url(#destinationGradient)"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={18}
                    >
                      <LabelList
                        dataKey="destinations"
                        position="right"
                        formatter={(value: number) => (value > 0 ? value : '')}
                        style={{ fill: '#0c4a6e', fontSize: 10, fontWeight: 800 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl shadow-emerald-900/5">
          <CardHeader>
            <CardTitle className="text-emerald-950">Support Inbox</CardTitle>
            <CardDescription className="text-emerald-500 font-medium">Average response: 4m</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
                {[
                  { label: 'Open', count: threadSummary.open, color: 'bg-emerald-500 shadow-emerald-500/20' },
                  { label: 'In Progress', count: threadSummary.inProgress, color: 'bg-amber-400 shadow-amber-400/20' },
                  { label: 'Resolved', count: threadSummary.resolved, color: 'bg-emerald-100 shadow-emerald-100/10' },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600/70 uppercase tracking-widest">{item.label}</span>
                    <span className="text-lg font-black text-emerald-950">{item.count}</span>
                  </div>
                  <div className="h-2.5 w-full bg-emerald-50 rounded-full overflow-hidden border border-emerald-100/50 shadow-inner">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-1000 shadow-[2px_0_8px_rgba(0,0,0,0.1)]", item.color)} 
                      style={{ width: `${(item.count / Math.max(1, threadSummary.open + threadSummary.inProgress + threadSummary.resolved)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6">
               <div className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 backdrop-blur-sm shadow-sm group hover:scale-[1.02] transition-transform">
                 <div className="bg-emerald-600 p-2.5 rounded-xl shadow-lg shadow-emerald-600/30 text-white transition-colors group-hover:bg-emerald-500">
                   <MessageSquare size={20} strokeWidth={2.5} />
                 </div>
                 <div>
                  <p className="text-sm font-black text-emerald-900">{threadSummary.open} Waiting Threads</p>
                   <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-tight">Priority Escalation</p>
                 </div>
               </div>
            </div>
            
             <Link to="/support/inbox" className="block">
               <Button variant="outline" className="w-full h-11 border-emerald-100 bg-white/50 group">
                 View Support Inbox
                 <ArrowUpRight size={16} className="ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />
               </Button>
             </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
