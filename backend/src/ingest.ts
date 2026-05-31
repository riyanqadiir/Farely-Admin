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

function nonEmptyPickupDest(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function coordsIfValid(p: unknown): { latitude: number; longitude: number } | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const lat = (p as { latitude?: number }).latitude;
  const lng = (p as { longitude?: number }).longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return undefined;
  }
  if (lat === 0 && lng === 0) return undefined;
  return { latitude: lat, longitude: lng };
}

/**
 * Each `ride.*` outbox event does an upsert keyed by `sourceId`. If the payload omits
 * pickup/destination/coords (common for status-only notifications), we must NOT `$set`
 * those fields to empty — that was wiping good data from earlier events and produced
 * ambiguous "— / no coordinates" rows in admin ride logs.
 */
const ingestRideEvent = async (event: any): Promise<void> => {
  const ride = event.payload || {};
  const sourceId = String(ride.id || event.entityId);
  const existing = (await RideSnapshotModel().findOne({ sourceId }).lean()) as Record<string, unknown> | null;

  const pickupIn = nonEmptyPickupDest(ride.pickup);
  const destIn = nonEmptyPickupDest(ride.destination);
  const pkCoordsIn = coordsIfValid(ride.pickupCoords);
  const destCoordsIn = coordsIfValid(ride.destinationCoords);

  const pickup = pickupIn ?? (existing ? String(existing.pickup ?? '').trim() : '');
  const destination = destIn ?? (existing ? String(existing.destination ?? '').trim() : '');

  let pickupCoords = coordsIfValid(existing?.pickupCoords);
  let destinationCoords = coordsIfValid(existing?.destinationCoords);
  if (pkCoordsIn) pickupCoords = pkCoordsIn;
  if (destCoordsIn) destinationCoords = destCoordsIn;

  const merged: Record<string, unknown> = {
    sourceEventId: event.eventId,
    sourceId,
    userId:
      ride.userId != null && String(ride.userId).trim() !== ''
        ? String(ride.userId)
        : existing?.userId != null
          ? String(existing.userId)
          : '',
    provider:
      ride.provider != null && String(ride.provider).trim() !== ''
        ? String(ride.provider)
        : existing?.provider != null
          ? String(existing.provider)
          : 'Unknown',
    rideType:
      ride.rideType != null && String(ride.rideType).trim() !== ''
        ? String(ride.rideType)
        : existing?.rideType != null
          ? String(existing.rideType)
          : 'car',
    carAc:
      typeof ride.carAc === 'boolean'
        ? ride.carAc
        : typeof existing?.carAc === 'boolean'
          ? existing.carAc
          : false,
    city:
      ride.city != null && String(ride.city).trim() !== ''
        ? String(ride.city)
        : existing?.city != null
          ? String(existing.city)
          : 'Lahore',
    pickup,
    destination,
    estimatedFare:
      typeof ride.estimatedFare === 'number'
        ? ride.estimatedFare
        : typeof existing?.estimatedFare === 'number'
          ? existing.estimatedFare
          : null,
    status:
      ride.status != null && String(ride.status).trim() !== ''
        ? String(ride.status)
        : existing?.status != null
          ? String(existing.status)
          : 'handoff_opened',
    redirectSucceeded:
      typeof ride.redirectSucceeded === 'boolean'
        ? ride.redirectSucceeded
        : typeof existing?.redirectSucceeded === 'boolean'
          ? existing.redirectSucceeded
          : false,
    userConfirmedAt:
      ride.userConfirmedAt != null
        ? new Date(ride.userConfirmedAt)
        : existing?.userConfirmedAt != null
          ? new Date(existing.userConfirmedAt as Date)
          : null,
    createdAt:
      ride.createdAt != null && ride.createdAt !== ''
        ? new Date(ride.createdAt)
        : existing?.createdAt != null
          ? new Date(existing.createdAt as Date)
          : new Date(event.occurredAt || Date.now()),
  };

  if (pickupCoords) merged.pickupCoords = pickupCoords;
  if (destinationCoords) merged.destinationCoords = destinationCoords;

  await RideSnapshotModel().updateOne({ sourceId }, { $set: merged }, { upsert: true });
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
