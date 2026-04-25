import {
  AppOutboxModel,
  DeadLetterModel,
  FeedbackEntryModel,
  IngestEventModel,
  RideSnapshotModel,
  SupportMessageModel,
  SupportThreadModel,
  UserPresenceModel,
} from './models';

const MAX_ATTEMPTS = 3;

const ingestRideEvent = async (event: any): Promise<void> => {
  const ride = event.payload || {};
  const sourceId = String(ride.id || event.entityId);
  await RideSnapshotModel().updateOne(
    { sourceId },
    {
      $set: {
        sourceEventId: event.eventId,
        sourceId,
        userId: String(ride.userId || ''),
        provider: String(ride.provider || 'Unknown'),
        rideType: String(ride.rideType || 'car'),
        carAc: Boolean(ride.carAc),
        city: String(ride.city || 'Lahore'),
        pickup: String(ride.pickup || ''),
        destination: String(ride.destination || ''),
        pickupCoords: ride.pickupCoords || undefined,
        destinationCoords: ride.destinationCoords || undefined,
        estimatedFare: typeof ride.estimatedFare === 'number' ? ride.estimatedFare : null,
        status: String(ride.status || 'handoff_opened'),
        redirectSucceeded: Boolean(ride.redirectSucceeded),
        userConfirmedAt: ride.userConfirmedAt ? new Date(ride.userConfirmedAt) : null,
        createdAt: ride.createdAt ? new Date(ride.createdAt) : new Date(event.occurredAt || Date.now()),
      },
    },
    { upsert: true }
  );
};

const ingestSupportThreadCreated = async (event: any): Promise<void> => {
  const p = event.payload || {};
  const sourceThreadId = String(p.id || event.entityId);
  await SupportThreadModel().updateOne(
    { sourceThreadId },
    {
      $setOnInsert: {
        sourceThreadId,
      },
      $set: {
        source: 'in_app',
        subject: String(p.subject || 'Support request'),
        status: 'open',
        priority: ['low', 'medium', 'high', 'urgent'].includes(String(p.priority)) ? String(p.priority) : 'medium',
        customer: {
          userId: p.userId ? String(p.userId) : null,
          name: p.customerName ? String(p.customerName) : null,
          email: String(p.customerEmail || 'unknown@farely.app'),
        },
        lastMessageAt: new Date(event.occurredAt || Date.now()),
      },
    },
    { upsert: true }
  );
  const thread = await SupportThreadModel().findOne({ sourceThreadId }).lean();
  if (!thread) return;
  const n = await SupportMessageModel().countDocuments({ threadId: (thread as any)._id });
  if (n === 0 && p.description) {
    await SupportMessageModel().create({
      threadId: (thread as any)._id,
      direction: 'inbound',
      channel: 'in_app',
      text: String(p.description),
      html: null,
      attachments: [],
      brevoMessageId: null,
      smtpMessageId: null,
      deliveryStatus: 'delivered',
    });
  }
};

const ingestUserHeartbeat = async (event: any): Promise<void> => {
  const p = event.payload || {};
  const userId = String(p.userId || event.entityId || '');
  if (!userId) return;
  await UserPresenceModel().updateOne(
    { userId },
    {
      $set: {
        lastSeenAt: new Date(p.at || event.occurredAt || Date.now()),
        sourceEventId: event.eventId,
      },
    },
    { upsert: true }
  );
};

const ingestFeedbackSubmitted = async (event: any): Promise<void> => {
  const p = event.payload || {};
  const sourceId = String(p.id || event.entityId);
  await FeedbackEntryModel().updateOne(
    { sourceId },
    {
      $set: {
        sourceEventId: event.eventId,
        sourceId,
        userId: String(p.userId || ''),
        stars: Math.min(5, Math.max(1, Number(p.stars) || 0)),
        appExperience: String(p.appExperience || ''),
        timeSavingNote: String(p.timeSavingNote || ''),
        source: String(p.source || 'app'),
        handoffId: p.handoffId ? String(p.handoffId) : null,
        provider: p.provider ? String(p.provider) : null,
      },
    },
    { upsert: true }
  );
};

export const runIngestOnce = async (): Promise<void> => {
  const outboxEvents = await AppOutboxModel()
    .find({ processedAt: null })
    .sort({ createdAt: 1 })
    .limit(200);

  for (const event of outboxEvents) {
    const alreadyDone = await IngestEventModel().findOne({ eventId: event.eventId }).lean();
    if (alreadyDone) {
      event.processedAt = new Date().toISOString();
      await event.save();
      continue;
    }
    try {
      let handled = false;
      if (String(event.eventType).startsWith('ride.')) {
        await ingestRideEvent(event);
        handled = true;
      } else if (event.eventType === 'support.thread.created') {
        await ingestSupportThreadCreated(event);
        handled = true;
      } else if (event.eventType === 'user.heartbeat') {
        await ingestUserHeartbeat(event);
        handled = true;
      } else if (event.eventType === 'feedback.submitted') {
        await ingestFeedbackSubmitted(event);
        handled = true;
      }

      if (!handled) {
        // Leave processedAt null so a future version can process new event types
        continue;
      }

      await IngestEventModel().create({
        eventId: event.eventId,
        eventType: event.eventType,
        entityId: event.entityId,
        processedAt: new Date(),
        sourceOccurredAt: new Date(event.occurredAt),
      });

      event.processedAt = new Date().toISOString();
      await event.save();
    } catch (error) {
      event.attemptCount = Number(event.attemptCount || 0) + 1;
      event.lastError = error instanceof Error ? error.message : 'Unknown ingest error';
      if (event.attemptCount >= MAX_ATTEMPTS) {
        await DeadLetterModel().create({
          eventId: event.eventId,
          eventType: event.eventType,
          entityId: event.entityId,
          payload: event.payload,
          attempts: event.attemptCount,
          lastError: event.lastError,
        });
        event.processedAt = new Date().toISOString();
      }
      await event.save();
    }
  }
};
