import { useQuery } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  Users, 
  Car, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  MessageSquare,
  ArrowRightLeft,
  Search
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export default function DashboardPage() {
  const { data: traffic, isLoading: trafficLoading } = useQuery({
    queryKey: ['traffic'],
    queryFn: () => api.metrics.getTraffic(),
  });

  const { data: active } = useQuery({
    queryKey: ['active-users', 24],
    queryFn: () => api.metrics.getActiveUsers({ hours: 24 }),
  });

  const { data: threads } = useQuery({
    queryKey: ['threads', { limit: 100 }],
    queryFn: () => api.support.getThreads({ limit: 100 }),
  });

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
          <Button className="shadow-emerald-200/50">Export Report</Button>
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-emerald-950">Traffic Volume</CardTitle>
                <CardDescription className="text-emerald-500 font-medium">Peak demand periods</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm" /> Inbound
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <span className="w-2.5 h-2.5 bg-emerald-200 rounded-full" /> Confirmed
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={traffic?.success ? traffic.data.timeseries : []}>
                   <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#ecfdf5" />
                  <XAxis 
                    dataKey="bucket" 
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#34d399' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#34d399' }}
                    dx={-10}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: '1px solid rgba(255,255,255,0.4)', 
                      backdropFilter: 'blur(12px)',
                      background: 'rgba(255,255,255,0.8)',
                      boxShadow: '0 10px 15px -3px rgba(16,185,129,0.1)' 
                    }}
                  />
                  <Area type="monotone" dataKey="searches" stroke="#059669" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
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
            
             <Button variant="outline" className="w-full h-11 border-emerald-100 bg-white/50 group">
               View Support Inbox 
               <ArrowUpRight size={16} className="ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />
             </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
