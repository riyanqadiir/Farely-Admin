import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatDistanceToNow } from 'date-fns';

export default function MobileUsersPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['mobile-users', q],
    queryFn: () => api.users.listMobile({ q: q.trim() || undefined, limit: 100 }),
  });

  const items = useMemo(() => (data?.success ? data.data.items : []), [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mobile app users</h1>
          <p className="text-slate-500 mt-1">Operational view of app accounts, activity status, and support load.</p>
        </div>
        <div className="w-full sm:w-80">
          <Input placeholder="Search name, email, phone..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Minimal operations panel: activity, verification, recent ride state, open support count.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-slate-500">Loading users...</p> : null}
          {!isLoading && items.length === 0 ? <p className="text-sm text-slate-500">No users found for current filter.</p> : null}
          {items.map((u) => (
            <div key={u.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{u.fullName || 'Unnamed user'}</p>
                  <p className="text-xs text-slate-500">
                    {u.email || '—'} · {u.phone || '—'} · {u.city || '—'} {u.district ? `(${u.district})` : ''}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={u.status === 'active' ? 'success' : 'secondary'}>{u.status}</Badge>
                  <Badge variant={u.emailVerified ? 'success' : 'warning'}>{u.emailVerified ? 'email verified' : 'email unverified'}</Badge>
                  <Badge variant={u.phoneVerified ? 'success' : 'warning'}>{u.phoneVerified ? 'phone verified' : 'phone unverified'}</Badge>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 px-2 py-1">
                  <p className="text-slate-500">Last seen</p>
                  <p className="font-medium text-slate-800">
                    {u.lastSeenAt ? formatDistanceToNow(new Date(u.lastSeenAt), { addSuffix: true }) : 'never'}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1">
                  <p className="text-slate-500">Last ride status</p>
                  <p className="font-medium text-slate-800">{u.lastRideStatus || 'none'}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1">
                  <p className="text-slate-500">Open support</p>
                  <p className="font-medium text-slate-800">{u.openSupportThreads}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1">
                  <p className="text-slate-500">Joined</p>
                  <p className="font-medium text-slate-800">{formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

