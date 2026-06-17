import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Eye,
  Ban,
  ShieldCheck,
  Trash2,
  Mail,
  Phone,
  MapPin,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react';
import type { MobileUserItem } from '../types/dtos';

type BlockDuration = '1' | '7' | '30' | 'permanent';

export default function MobileUsersPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [blockUser, setBlockUser] = useState<MobileUserItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<MobileUserItem | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState<BlockDuration>('7');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mobile-users', q],
    queryFn: () => api.users.listMobile({ q: q.trim() || undefined, limit: 500 }),
  });

  const items = useMemo(() => (data?.success ? data.data.items : []), [data]);
  const total = data?.success ? data.data.total : 0;
  const incompleteCount = data?.success ? data.data.incompleteSignupCount : 0;

  const { data: detailsData, isLoading: detailsLoading } = useQuery({
    queryKey: ['mobile-user', viewUserId],
    queryFn: () => api.users.getMobile(viewUserId as string),
    enabled: !!viewUserId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mobile-users'] });

  const blockMutation = useMutation({
    mutationFn: ({ id, reason, days }: { id: string; reason: string; days: number | 'permanent' }) =>
      api.users.blockMobile(id, { reason, days }),
    onSuccess: () => {
      setBlockUser(null);
      setBlockReason('');
      setBlockDuration('7');
      setActionError(null);
      refresh();
      if (viewUserId) queryClient.invalidateQueries({ queryKey: ['mobile-user', viewUserId] });
    },
    onError: (e: any) => setActionError(e?.message || 'Failed to block user'),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => api.users.unblockMobile(id),
    onSuccess: () => {
      refresh();
      if (viewUserId) queryClient.invalidateQueries({ queryKey: ['mobile-user', viewUserId] });
    },
    onError: (e: any) => setActionError(e?.message || 'Failed to unblock user'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.users.deleteMobile(id),
    onSuccess: () => {
      setDeleteUser(null);
      setDeleteConfirm('');
      setActionError(null);
      setViewUserId((prev) => (prev === deleteUser?.id ? null : prev));
      refresh();
    },
    onError: (e: any) => setActionError(e?.message || 'Failed to delete user'),
  });

  const submitBlock = () => {
    if (!blockUser) return;
    if (!blockReason.trim()) {
      setActionError('Please provide a reason');
      return;
    }
    blockMutation.mutate({
      id: blockUser.id,
      reason: blockReason.trim(),
      days: blockDuration === 'permanent' ? 'permanent' : Number(blockDuration),
    });
  };

  const submitDelete = () => {
    if (!deleteUser) return;
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setActionError('Type DELETE to confirm');
      return;
    }
    deleteMutation.mutate(deleteUser.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mobile app users</h1>
          <p className="text-slate-500 mt-1">View details, temporarily block, or remove accounts.</p>
        </div>
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search name, email, phone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Showing {items.length} of {total} {total === 1 ? 'account' : 'accounts'}
            {incompleteCount > 0 ? ` · ${incompleteCount} incomplete signup${incompleteCount !== 1 ? 's' : ''}` : ''}
            {q.trim() ? ' (filtered)' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-slate-500">Loading users...</p> : null}
          {!isLoading && items.length === 0 ? (
            <p className="text-sm text-slate-500">No users found for current filter.</p>
          ) : null}
          {items.map((u) => (
            <div
              key={u.id}
              className={`rounded-lg border p-3 transition ${
                u.blocked ? 'border-red-200 bg-red-50/40' : 'border-slate-200 hover:bg-slate-50/40'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate">
                      {u.fullName || 'Unnamed user'}
                    </p>
                    {u.blocked && (
                      <Badge variant="error" className="gap-1">
                        <Ban size={11} /> Blocked
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {u.email || '—'} · {u.phone || '—'} · {u.city || '—'}
                    {u.district ? ` (${u.district})` : ''}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <Badge
                    variant={
                      u.status === 'active' ? 'success' : u.status === 'blocked' ? 'error' : 'secondary'
                    }
                  >
                    {u.status}
                  </Badge>
                  <Badge variant={u.emailVerified ? 'success' : 'warning'}>
                    {u.emailVerified ? 'email ok' : 'email pending'}
                  </Badge>
                  <Badge variant={u.phoneVerified ? 'success' : 'warning'}>
                    {u.phoneVerified ? 'phone ok' : 'phone pending'}
                  </Badge>
                  {!u.passwordSet && (
                    <Badge variant="warning">signup incomplete</Badge>
                  )}
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
                  <p className="text-slate-500">Last ride</p>
                  <p className="font-medium text-slate-800">{u.lastRideStatus || 'none'}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1">
                  <p className="text-slate-500">Open support</p>
                  <p className="font-medium text-slate-800">{u.openSupportThreads}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1">
                  <p className="text-slate-500">Joined</p>
                  <p className="font-medium text-slate-800">
                    {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {u.blocked && (u.blockedReason || u.blockedUntil) && (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    {u.blockedReason && (
                      <p>
                        <span className="font-bold">Reason:</span> {u.blockedReason}
                      </p>
                    )}
                    <p>
                      <span className="font-bold">Expires:</span>{' '}
                      {u.blockedUntil
                        ? format(new Date(u.blockedUntil), 'PPpp')
                        : 'Permanent (until manually unblocked)'}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setViewUserId(u.id)}>
                  <Eye size={14} className="mr-1.5" /> View details
                </Button>
                {u.blocked ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setActionError(null);
                      unblockMutation.mutate(u.id);
                    }}
                    isLoading={unblockMutation.isPending && unblockMutation.variables === u.id}
                  >
                    <ShieldCheck size={14} className="mr-1.5" /> Unblock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => {
                      setActionError(null);
                      setBlockReason('');
                      setBlockDuration('7');
                      setBlockUser(u);
                    }}
                  >
                    <Ban size={14} className="mr-1.5" /> Block
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setActionError(null);
                    setDeleteConfirm('');
                    setDeleteUser(u);
                  }}
                >
                  <Trash2 size={14} className="mr-1.5" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* View details modal */}
      <Modal
        open={!!viewUserId}
        onClose={() => setViewUserId(null)}
        size="lg"
        title={detailsData?.success ? detailsData.data.profile.fullName || 'User details' : 'User details'}
        description={detailsData?.success ? detailsData.data.profile.email : undefined}
      >
        {detailsLoading || !detailsData?.success ? (
          <p className="text-sm text-slate-500">Loading user details…</p>
        ) : (
          <UserDetailsBody
            details={detailsData.data}
            onBlock={() => setBlockUser(detailsData.data.profile)}
            onUnblock={() => unblockMutation.mutate(detailsData.data.profile.id)}
            onDelete={() => setDeleteUser(detailsData.data.profile)}
            unblocking={unblockMutation.isPending}
          />
        )}
      </Modal>

      {/* Block modal */}
      <Modal
        open={!!blockUser}
        onClose={() => {
          setBlockUser(null);
          setActionError(null);
        }}
        size="sm"
        title={`Block ${blockUser?.fullName || 'user'}`}
        description="Temporarily prevent this account from using the app. They will be unable to start new rides while blocked."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              Duration
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { value: '1', label: '24h' },
                  { value: '7', label: '7d' },
                  { value: '30', label: '30d' },
                  { value: 'permanent', label: 'Permanent' },
                ] as { value: BlockDuration; label: string }[]
              ).map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setBlockDuration(d.value)}
                  className={`rounded-md border px-2 py-2 text-xs font-bold transition ${
                    blockDuration === d.value
                      ? 'border-amber-500 bg-amber-50 text-amber-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              Reason
            </label>
            <textarea
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              rows={3}
              placeholder="e.g., Repeated cancellations / abusive behavior toward driver"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </div>
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBlockUser(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={submitBlock}
              isLoading={blockMutation.isPending}
            >
              <Ban size={14} className="mr-1.5" /> Block user
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={!!deleteUser}
        onClose={() => {
          setDeleteUser(null);
          setActionError(null);
        }}
        size="sm"
        title={`Remove ${deleteUser?.fullName || 'user'}?`}
        description="This permanently removes the account from the mobile app's user database. This action cannot be undone."
      >
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <p>
              Past ride history and support threads will remain in the admin database for auditing, but the user
              will no longer be able to log in. Consider <b>blocking</b> instead if you want a reversible action.
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              Type DELETE to confirm
            </label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={submitDelete}
              isLoading={deleteMutation.isPending}
              disabled={deleteConfirm.trim().toUpperCase() !== 'DELETE'}
            >
              <Trash2 size={14} className="mr-1.5" /> Remove permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function UserDetailsBody({
  details,
  onBlock,
  onUnblock,
  onDelete,
  unblocking,
}: {
  details: import('../types/dtos').MobileUserDetailsResponse;
  onBlock: () => void;
  onUnblock: () => void;
  onDelete: () => void;
  unblocking: boolean;
}) {
  const { profile, stats, recentRides, supportThreads } = details;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Contact</p>
          <p className="text-sm text-slate-800 flex items-center gap-1.5 mt-0.5">
            <Mail size={13} className="text-slate-400" /> {profile.email || '—'}
          </p>
          <p className="text-sm text-slate-800 flex items-center gap-1.5">
            <Phone size={13} className="text-slate-400" /> {profile.phone || '—'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Location</p>
          <p className="text-sm text-slate-800 flex items-center gap-1.5 mt-0.5">
            <MapPin size={13} className="text-slate-400" /> {profile.city || '—'}
            {profile.district ? ` · ${profile.district}` : ''}
          </p>
          <p className="text-sm text-slate-800 flex items-center gap-1.5">
            <CalendarClock size={13} className="text-slate-400" />
            Joined {formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      {profile.blocked && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Currently blocked</p>
            {profile.blockedReason && <p>Reason: {profile.blockedReason}</p>}
            <p>
              Expires:{' '}
              {profile.blockedUntil
                ? format(new Date(profile.blockedUntil), 'PPpp')
                : 'Permanent (manual unblock required)'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="Total rides" value={stats.totalRides} tone="emerald" />
        <StatBox label="Confirmed" value={stats.confirmedRides} tone="sky" />
        <StatBox
          label="Avg fare"
          value={stats.avgFare !== null ? `Rs ${stats.avgFare}` : '—'}
          tone="amber"
        />
        <StatBox label="Open support" value={profile.openSupportThreads} tone="slate" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Top pickup</p>
          <p className="text-sm text-slate-800 font-bold mt-0.5">
            {stats.topPickup ? stats.topPickup.name : '—'}
          </p>
          {stats.topPickup && (
            <p className="text-[10px] text-slate-500">{stats.topPickup.count} rides</p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Top destination</p>
          <p className="text-sm text-slate-800 font-bold mt-0.5">
            {stats.topDestination ? stats.topDestination.name : '—'}
          </p>
          {stats.topDestination && (
            <p className="text-[10px] text-slate-500">{stats.topDestination.count} rides</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-slate-500 mb-2">Recent rides</p>
        {recentRides.length === 0 ? (
          <p className="text-xs text-slate-500">No rides recorded for this user yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recentRides.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-slate-100 px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">
                    {r.pickup || '—'} → {r.destination || '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {r.provider} ·{' '}
                    {r.createdAt
                      ? formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })
                      : 'unknown time'}
                  </p>
                </div>
                <Badge
                  variant={r.status === 'ride_confirmed' ? 'success' : 'secondary'}
                  className="ml-2 shrink-0"
                >
                  {r.status.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {supportThreads.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase text-slate-500 mb-2">Recent support threads</p>
          <div className="space-y-1.5">
            {supportThreads.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-slate-100 px-2.5 py-1.5 text-xs"
              >
                <p className="font-semibold text-slate-800 truncate min-w-0">{t.subject}</p>
                <div className="flex gap-1.5 ml-2 shrink-0">
                  <Badge variant="secondary">{t.priority}</Badge>
                  <Badge
                    variant={t.status === 'resolved' ? 'success' : 'warning'}
                  >
                    {t.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {profile.blocked ? (
          <Button variant="secondary" onClick={onUnblock} isLoading={unblocking}>
            <ShieldCheck size={14} className="mr-1.5" /> Unblock user
          </Button>
        ) : (
          <Button
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={onBlock}
          >
            <Ban size={14} className="mr-1.5" /> Block user
          </Button>
        )}
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={14} className="mr-1.5" /> Remove permanently
        </Button>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'emerald' | 'sky' | 'amber' | 'slate';
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-700',
    sky: 'text-sky-700',
    amber: 'text-amber-700',
    slate: 'text-slate-700',
  };
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 bg-white">
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className={`text-xl font-black ${tones[tone]}`}>{value}</p>
    </div>
  );
}
