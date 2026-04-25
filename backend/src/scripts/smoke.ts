const BASE = process.env.ADMIN_SMOKE_BASE_URL || 'http://localhost:4001';
const EMAIL = process.env.ADMIN_SMOKE_EMAIL || process.env.ADMIN_SEED_EMAIL || 'admin@farely.app';
const PASSWORD = process.env.ADMIN_SMOKE_PASSWORD || process.env.ADMIN_SEED_PASSWORD || 'Admin@12345';

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const json = await res.json();
  if (!res.ok || !json?.success) {
    throw new Error(`${path} failed: ${json?.error?.message || res.statusText}`);
  }
  return json;
}

async function main() {
  const login = await req('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const token = login.data.accessToken as string;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await req('/admin/metrics/traffic', { headers: auth });
  await req('/admin/metrics/hotspots', { headers: auth });
  const threads = await req('/admin/support/threads?limit=1', { headers: auth });
  if (threads.data.items.length) {
    const tid = threads.data.items[0].id;
    await req(`/admin/support/threads/${tid}/messages`, { headers: auth });
    await req(`/admin/support/threads/${tid}/reply`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ text: 'Smoke test reply' }),
    });
  }
  await req('/ops/health');
  await req('/ops/reconcile');

  // eslint-disable-next-line no-console
  console.log('Smoke checks passed');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke checks failed:', err?.message || err);
  process.exit(1);
});
