import { FormEvent, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';
import { Shield, Server, LogOut, KeyRound } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../api/mocks';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:4001';

export default function SettingsPage() {
  const { user, logout, updateLocalUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const updateProfile = useMutation({
    mutationFn: (payload: { fullName: string }) => api.auth.updateMe(payload),
    onSuccess: (res) => {
      setNotice('Profile updated.');
      updateLocalUser(res.data.admin);
    },
  });

  const changePassword = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) => api.auth.changePassword(payload),
    onSuccess: () => {
      setNotice('Password changed. Please sign in again.');
      setCurrentPassword('');
      setNewPassword('');
    },
  });

  const publicHints = useMemo(
    () => [
      { title: 'Admin API', body: 'Configure VITE_ADMIN_API_URL in the dashboard env to point at the admin API (default localhost:4001).', icon: Server },
      { title: 'Sessions', body: 'Access tokens are short-lived; the dashboard automatically refreshes using the httpOnly-friendly refresh response.', icon: KeyRound },
      { title: 'Roles', body: 'super_admin, support, and ops_analyst control support replies and user management in the API.', icon: Shield },
    ],
    []
  );

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    const v = fullName.trim();
    if (!v) return;
    setNotice(null);
    updateProfile.mutate({ fullName: v });
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || newPassword.length < 10) return;
    setNotice(null);
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-emerald-950">Settings</h1>
        <p className="text-slate-500 mt-1">Environment and account references for this admin console.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed in as</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">
            <span className="font-bold text-slate-900">{user?.fullName}</span> ·{' '}
            <span className="uppercase text-xs font-bold text-emerald-600">{user?.role}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              void logout();
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
          {user?.mustChangePassword ? (
            <p className="text-xs mt-3 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
              Password rotation required: change your password now.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {notice ? <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile management</CardTitle>
          <CardDescription>Update your operator display profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submitProfile}>
            <div>
              <label className="text-xs font-bold text-slate-600">Full name</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <Button type="submit" isLoading={updateProfile.isPending}>
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password management</CardTitle>
          <CardDescription>Use a strong credential and rotate regularly.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submitPassword}>
            <div>
              <label className="text-xs font-bold text-slate-600">Current password</label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">New password (10+ chars)</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <Button type="submit" isLoading={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration hints</CardTitle>
          <CardDescription>Read-only; values are not editable in the UI.</CardDescription>
        </CardHeader>
        <CardContent className="space-4 text-sm text-slate-600">
          <p className="text-xs font-mono bg-slate-50 p-2 rounded border border-slate-100 break-all">API base: {API_BASE}</p>
          {publicHints.map((h) => (
            <div key={h.title} className="flex gap-3">
              <h.icon className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-800">{h.title}</p>
                <p className="mt-1 leading-relaxed">{h.body}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
