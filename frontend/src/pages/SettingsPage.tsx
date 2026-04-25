import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';
import { Shield, Server, LogOut, KeyRound } from 'lucide-react';
import { Button } from '../components/ui/Button';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:4001';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const publicHints = useMemo(
    () => [
      { title: 'Admin API', body: 'Configure VITE_ADMIN_API_URL in the dashboard env to point at the admin API (default localhost:4001).', icon: Server },
      { title: 'Sessions', body: 'Access tokens are short-lived; the dashboard automatically refreshes using the httpOnly-friendly refresh response.', icon: KeyRound },
      { title: 'Roles', body: 'super_admin, support, and ops_analyst control support replies and user management in the API.', icon: Shield },
    ],
    []
  );

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
