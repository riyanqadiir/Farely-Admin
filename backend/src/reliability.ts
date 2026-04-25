import { Router } from 'express';
import { AppOutboxModel, DeadLetterModel, IngestEventModel, RideSnapshotModel, WebhookHashModel } from './models';

const router = Router();

router.get('/health', async (_req, res) => {
  const [deadLetterCount, pendingOutbox, webhookHashes, latestIngest] = await Promise.all([
    DeadLetterModel().countDocuments(),
    AppOutboxModel().countDocuments({ processedAt: null }),
    WebhookHashModel().countDocuments(),
    IngestEventModel().findOne().sort({ processedAt: -1 }).lean(),
  ]);
  return res.json({
    success: true,
    data: {
      ingestLagTargetSec: 30,
      chartFreshnessTargetMin: 5,
      deadLetterCount,
      pendingOutbox,
      webhookHashes,
      lastIngestAt: latestIngest?.processedAt || null,
    },
  });
});

router.get('/reconcile', async (_req, res) => {
  const [sourceCount, snapshotCount] = await Promise.all([
    AppOutboxModel().countDocuments({ eventType: { $regex: '^ride\\.' } }),
    RideSnapshotModel().countDocuments(),
  ]);
  return res.json({
    success: true,
    data: {
      sourceCount,
      snapshotCount,
      delta: sourceCount - snapshotCount,
      matched: sourceCount === snapshotCount,
    },
  });
});

export default router;
