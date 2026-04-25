import { connectMongo } from '../db';
import { runDailyTrafficRollup, refreshHotspots } from '../aggregations';
import { runIngestOnce } from '../ingest';

async function main() {
  await connectMongo();
  await runIngestOnce();
  await refreshHotspots();
  await runDailyTrafficRollup();
  // eslint-disable-next-line no-console
  console.log('Backfill completed: ingest + hotspot + traffic rollup');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Backfill failed:', err?.message || err);
  process.exit(1);
});
