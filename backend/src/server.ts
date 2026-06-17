import express from 'express';
import cors from 'cors';
import adminApi from './admin-api';
import reliability from './reliability';
import webhooks from './webhooks';
import { hashPassword } from './auth';
import { connectMongo } from './db';
import { runIngestOnce } from './ingest';
import { refreshHotspots, runDailyTrafficRollup } from './aggregations';
import { AdminUserModel } from './models';

const app = express();

/** Comma-separated origins, e.g. `http://localhost:3000,http://localhost:3001` when Vite picks the next free port. */
const corsOrigin = (): string | string[] | boolean => {
  const raw = process.env.ADMIN_FRONTEND_URL?.trim();
  if (!raw) return '*';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return '*';
  return list.length === 1 ? list[0] : list;
};

app.use(
  cors({
    origin: corsOrigin(),
    credentials: true,
  })
);
// Raw JSON for Brevo HMAC verification on transactional webhooks
app.use('/webhooks', express.raw({ type: 'application/json', limit: '15mb' }), webhooks);
app.use(express.json({ limit: '4mb' }));

app.use('/admin', adminApi);
app.use('/ops', reliability);

const bootstrap = async (): Promise<void> => {
  await connectMongo();

  const seedEmail = (
    process.env.ADMIN_SMOKE_EMAIL ||
    process.env.ADMIN_SEED_EMAIL ||
    'admin@farely.app'
  ).toLowerCase();
  const seedPassword =
    process.env.ADMIN_SMOKE_PASSWORD || process.env.ADMIN_SEED_PASSWORD || 'Admin@12345';
  const existing = await AdminUserModel().findOne({ email: seedEmail });
  if (!existing) {
    await AdminUserModel().create({
      email: seedEmail,
      fullName: 'Ops Admin',
      role: 'super_admin',
      passwordHash: await hashPassword(seedPassword),
      active: true,
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded admin user: ${seedEmail}`);
  } else {
    // Keep ops login aligned with ADMIN_SMOKE_* / ADMIN_SEED_* in .env (early-stage ops access).
    existing.passwordHash = await hashPassword(seedPassword);
    existing.active = true;
    if (existing.role !== 'super_admin') existing.role = 'super_admin';
    await existing.save();
    // eslint-disable-next-line no-console
    console.log(`Ensured admin login for: ${seedEmail}`);
  }

  await runIngestOnce();
  await refreshHotspots();
  await runDailyTrafficRollup();

  const ingestInterval = setInterval(() => void runIngestOnce(), 10000);
  const hotspotInterval = setInterval(() => void refreshHotspots(), 60 * 60 * 1000);
  const trafficInterval = setInterval(() => void runDailyTrafficRollup(), 24 * 60 * 60 * 1000);

  const port = Number(process.env.ADMIN_API_PORT ?? 4001);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Admin API listening on ${port}`);
  });

  process.on('SIGTERM', () => {
    clearInterval(ingestInterval);
    clearInterval(hotspotInterval);
    clearInterval(trafficInterval);
  });
};

void bootstrap();
