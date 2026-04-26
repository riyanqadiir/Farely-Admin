import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/mocks';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { AdminRole } from '../types/dtos';

const roles: AdminRole[] = ['super_admin', 'support', 'ops_analyst'];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: '', email: '', role: 'support' as AdminRole, password: '' });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.auth.listAdmins(),
    enabled: user?.role === 'super_admin',
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.auth.createAdmin({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password.trim() || undefined,
      }),
    onSuccess: (res) => {
      setTempPassword(res.data.tempPassword || null);
      setEmailNotice(res.data.emailSent ? `Credentials emailed to ${res.data.admin.email}.` : null);
      setForm({ fullName: '', email: '', role: 'support', password: '' });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, role, active }: { id: string; role?: AdminRole; active?: boolean }) =>
      api.auth.updateAdmin(id, { role, active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => api.auth.resetAdminPassword(id),
    onSuccess: (res) => {
      setTempPassword(res.data.tempPassword || null);
      setEmailNotice(res.data.emailSent ? `Reset emailed to ${res.data.admin.email}.` : null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) return;
    createMutation.mutate();
  };

  const items = useMemo(() => (data?.success ? data.data.items : []), [data]);

  if (user?.role !== 'super_admin') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin users</CardTitle>
          <CardDescription>Only super admins can manage staff accounts.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin users</h1>
        <p className="text-slate-500 mt-1">Create staff logins, assign role access, and rotate credentials.</p>
      </div>

      {tempPassword && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Temporary password generated: <code className="font-mono">{tempPassword}</code>. Share securely, then ask user to
          change in Settings.
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(tempPassword);
                } catch {
                  // ignore
                }
              }}
            >
              Copy
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setTempPassword(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {emailNotice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{emailNotice}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create admin account</CardTitle>
          <CardDescription>Minimal onboarding: create account, share temp password, force password change.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={submit}>
            <div>
              <label className="text-xs font-bold text-slate-600">Full name</label>
              <Input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Role</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as AdminRole }))}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Initial password (optional)</label>
              <Input
                type="text"
                placeholder="auto-generate if blank"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              />
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create account'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current admin users</CardTitle>
          <CardDescription>Role and status updates are audited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading admin users...</p>
          ) : (
            items.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-200 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{a.fullName}</p>
                  <p className="text-xs text-slate-500">{a.email}</p>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="secondary">{a.role}</Badge>
                    <Badge variant={a.active ? 'success' : 'warning'}>{a.active ? 'active' : 'inactive'}</Badge>
                    {a.mustChangePassword ? <Badge variant="warning">password reset required</Badge> : null}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <select
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                    value={a.role}
                    onChange={(e) => updateMutation.mutate({ id: a.id, role: e.target.value as AdminRole })}
                    disabled={updateMutation.isPending}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateMutation.mutate({ id: a.id, active: !a.active })}
                    disabled={updateMutation.isPending}
                  >
                    {a.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => resetMutation.mutate(a.id)} disabled={resetMutation.isPending}>
                    Reset password
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

