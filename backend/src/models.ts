import mongoose, { Model, Schema } from 'mongoose';
import { adminConn, appConn } from './db';
import { EventEnvelope, RideStatus, ThreadPriority, ThreadStatus } from './types';

type AdminUserRole = 'super_admin' | 'support' | 'ops_analyst';

interface AdminUserDoc {
  email: string;
  fullName: string;
  role: AdminUserRole;
  passwordHash: string;
  active: boolean;
}

interface AdminSessionDoc {
  adminId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

interface AuditLogDoc {
  action: string;
  actorId: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
}

interface RideSnapshotDoc {
  sourceEventId?: string;
  sourceId: string;
  userId: string;
  provider: string;
  rideType: string;
  carAc: boolean;
  city: string;
  pickup: string;
  destination: string;
  pickupCoords?: { latitude: number; longitude: number };
  destinationCoords?: { latitude: number; longitude: number };
  estimatedFare?: number;
  status: RideStatus;
  redirectSucceeded: boolean;
  userConfirmedAt?: Date | null;
  createdAt: Date;
}

interface TrafficDailyMetricDoc {
  date: string;
  provider: string;
  city: string;
  rideType: string;
  searches: number;
  handoffAttempts: number;
  handoffSuccess: number;
  confirmedRides: number;
}

interface HotspotTileDoc {
  windowStart: Date;
  city: string;
  tileKey: string;
  center: { lat: number; lng: number };
  demandCount: number;
  confirmedRides: number;
  avgEtaMin: number;
  successRate: number;
}

interface SupportThreadDoc {
  sourceThreadId?: string;
  source: 'in_app' | 'email';
  subject: string;
  status: ThreadStatus;
  priority: ThreadPriority;
  customer: { userId?: string; name?: string; email: string };
  assigneeAdminId?: string | null;
  internalNote?: string;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  lastMessageAt: Date;
}

interface SupportMessageDoc {
  threadId: mongoose.Types.ObjectId;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'in_app';
  text: string;
  html?: string | null;
  attachments: string[];
  brevoMessageId?: string | null;
  /** RFC 5322 Message-ID from Brevo / remote MTA (threading + In-Reply-To). */
  smtpMessageId?: string | null;
  deliveryStatus: 'pending' | 'delivered' | 'bounced' | 'opened' | 'clicked' | 'replied';
}

interface IngestEventDoc {
  eventId: string;
  eventType: string;
  entityId: string;
  processedAt: Date;
  sourceOccurredAt: Date;
}

interface UserPresenceDoc {
  userId: string;
  lastSeenAt: Date;
  sourceEventId?: string;
}

interface FeedbackEntryDoc {
  sourceEventId?: string;
  sourceId: string;
  userId: string;
  stars: number;
  appExperience: string;
  timeSavingNote: string;
  source: string;
  handoffId?: string | null;
  provider?: string | null;
  createdAt: Date;
}

interface DeadLetterDoc {
  eventId: string;
  eventType: string;
  entityId: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError: string;
}

interface WebhookHashDoc {
  hash: string;
  source: string;
}

interface AppOutboxDoc extends EventEnvelope {}

/** Farely app `feedbacks` collection (APP_DB) — read-through for admin when ingest lags. */
interface AppSourceFeedbackRow {
  _id: mongoose.Types.ObjectId;
  userId: unknown;
  stars: number;
  appExperience: string;
  timeSavingNote: string;
  source: string;
  handoffId?: string | null;
  provider?: string | null;
  createdAt: Date;
}

const model = <T>(name: string, schema: Schema, useApp = false): Model<T> =>
  ((useApp ? appConn() : adminConn()).models[name] as Model<T>) || (useApp ? appConn() : adminConn()).model<T>(name, schema);

export const AdminUserModel = (): Model<AdminUserDoc> =>
  model<AdminUserDoc>(
    'admin_users',
    new Schema<AdminUserDoc>(
      {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        fullName: { type: String, required: true, trim: true },
        role: { type: String, enum: ['super_admin', 'support', 'ops_analyst'], default: 'support' },
        passwordHash: { type: String, required: true },
        active: { type: Boolean, default: true },
      },
      { timestamps: true }
    )
  );

export const AdminSessionModel = (): Model<AdminSessionDoc> =>
  model<AdminSessionDoc>(
    'admin_sessions',
    new Schema<AdminSessionDoc>(
      {
        adminId: { type: String, required: true, index: true },
        refreshTokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true, index: true },
      },
      { timestamps: true }
    )
  );

export const AuditLogModel = (): Model<AuditLogDoc> =>
  model<AuditLogDoc>(
    'audit_logs',
    new Schema<AuditLogDoc>(
      {
        action: { type: String, required: true },
        actorId: { type: String, required: true },
        threadId: { type: String, default: null },
        metadata: { type: Schema.Types.Mixed, default: {} },
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    )
  );

export const RideSnapshotModel = (): Model<RideSnapshotDoc> =>
  model<RideSnapshotDoc>(
    'ride_events_snapshot',
    new Schema<RideSnapshotDoc>(
      {
        sourceEventId: { type: String, index: true, default: null },
        sourceId: { type: String, required: true, unique: true, index: true },
        userId: { type: String, required: true },
        provider: { type: String, required: true, index: true },
        rideType: { type: String, required: true, index: true },
        carAc: { type: Boolean, default: false },
        city: { type: String, required: true, index: true },
        pickup: { type: String, required: true },
        destination: { type: String, required: true },
        pickupCoords: {
          latitude: Number,
          longitude: Number,
        },
        destinationCoords: {
          latitude: Number,
          longitude: Number,
        },
        estimatedFare: { type: Number, default: null },
        status: { type: String, required: true, index: true },
        redirectSucceeded: { type: Boolean, default: false, index: true },
        userConfirmedAt: { type: Date, default: null },
        createdAt: { type: Date, required: true, index: true },
      },
      { timestamps: true }
    )
  );

export const TrafficDailyMetricModel = (): Model<TrafficDailyMetricDoc> =>
  model<TrafficDailyMetricDoc>(
    'traffic_daily_metrics',
    new Schema<TrafficDailyMetricDoc>(
      {
        date: { type: String, required: true, index: true },
        provider: { type: String, required: true, index: true },
        city: { type: String, required: true, index: true },
        rideType: { type: String, required: true, index: true },
        searches: { type: Number, required: true, default: 0 },
        handoffAttempts: { type: Number, required: true, default: 0 },
        handoffSuccess: { type: Number, required: true, default: 0 },
        confirmedRides: { type: Number, required: true, default: 0 },
      },
      { timestamps: true }
    )
  );

export const HotspotTileModel = (): Model<HotspotTileDoc> =>
  model<HotspotTileDoc>(
    'hotspot_tiles',
    new Schema<HotspotTileDoc>(
      {
        windowStart: { type: Date, required: true, index: true },
        city: { type: String, required: true, index: true },
        tileKey: { type: String, required: true, index: true },
        center: { lat: Number, lng: Number },
        demandCount: { type: Number, required: true },
        confirmedRides: { type: Number, required: true },
        avgEtaMin: { type: Number, required: true },
        successRate: { type: Number, required: true },
      },
      { timestamps: true }
    )
  );

export const SupportThreadModel = (): Model<SupportThreadDoc> =>
  model<SupportThreadDoc>(
    'support_threads',
    new Schema<SupportThreadDoc>(
      {
        sourceThreadId: { type: String, index: true, default: null },
        source: { type: String, enum: ['in_app', 'email'], required: true },
        subject: { type: String, required: true, trim: true },
        status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], required: true, index: true },
        priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], required: true, index: true },
        customer: {
          userId: { type: String, default: null },
          name: { type: String, default: null },
          email: { type: String, required: true, index: true },
        },
        assigneeAdminId: { type: String, default: null, index: true },
        internalNote: { type: String, default: '' },
        firstResponseAt: { type: Date, default: null },
        resolvedAt: { type: Date, default: null },
        lastMessageAt: { type: Date, required: true, index: true },
      },
      { timestamps: true }
    )
  );

export const SupportMessageModel = (): Model<SupportMessageDoc> =>
  model<SupportMessageDoc>(
    'support_messages',
    new Schema<SupportMessageDoc>(
      {
        threadId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'support_threads' },
        direction: { type: String, enum: ['inbound', 'outbound'], required: true },
        channel: { type: String, enum: ['email', 'in_app'], required: true },
        text: { type: String, required: true },
        html: { type: String, default: null },
        attachments: [{ type: String }],
        brevoMessageId: { type: String, default: null, index: true },
        smtpMessageId: { type: String, default: null, index: true },
        deliveryStatus: {
          type: String,
          enum: ['pending', 'delivered', 'bounced', 'opened', 'clicked', 'replied'],
          default: 'pending',
          index: true,
        },
      },
      { timestamps: { createdAt: true, updatedAt: true } }
    )
  );

export const UserPresenceModel = (): Model<UserPresenceDoc> =>
  model<UserPresenceDoc>(
    'user_presence',
    new Schema<UserPresenceDoc>(
      {
        userId: { type: String, required: true, unique: true, index: true },
        lastSeenAt: { type: Date, required: true, index: true },
        sourceEventId: { type: String, default: null, index: true },
      },
      { timestamps: true }
    )
  );

export const FeedbackEntryModel = (): Model<FeedbackEntryDoc> =>
  model<FeedbackEntryDoc>(
    'feedback_entries',
    new Schema<FeedbackEntryDoc>(
      {
        sourceEventId: { type: String, default: null, index: true },
        sourceId: { type: String, required: true, unique: true, index: true },
        userId: { type: String, required: true, index: true },
        stars: { type: Number, required: true },
        appExperience: { type: String, default: '' },
        timeSavingNote: { type: String, default: '' },
        source: { type: String, required: true, index: true },
        handoffId: { type: String, default: null },
        provider: { type: String, default: null },
      },
      { timestamps: { createdAt: 'createdAt', updatedAt: false } }
    )
  );

export const AppSourceFeedbackModel = (): Model<AppSourceFeedbackRow> =>
  model<AppSourceFeedbackRow>(
    'AppSourceFeedback',
    new Schema<AppSourceFeedbackRow>(
      {
        userId: { type: Schema.Types.Mixed, required: true, index: true },
        stars: { type: Number, required: true },
        appExperience: { type: String, default: '' },
        timeSavingNote: { type: String, default: '' },
        source: { type: String, required: true, index: true },
        handoffId: { type: String, default: null },
        provider: { type: String, default: null },
      },
      { collection: 'feedbacks', strict: false, timestamps: true }
    ),
    true
  );

export const IngestEventModel = (): Model<IngestEventDoc> =>
  model<IngestEventDoc>(
    'ingest_events',
    new Schema<IngestEventDoc>(
      {
        eventId: { type: String, required: true, unique: true, index: true },
        eventType: { type: String, required: true, index: true },
        entityId: { type: String, required: true, index: true },
        processedAt: { type: Date, required: true, index: true },
        sourceOccurredAt: { type: Date, required: true, index: true },
      },
      { timestamps: true }
    )
  );

export const DeadLetterModel = (): Model<DeadLetterDoc> =>
  model<DeadLetterDoc>(
    'dead_letter_events',
    new Schema<DeadLetterDoc>(
      {
        eventId: { type: String, required: true, index: true },
        eventType: { type: String, required: true, index: true },
        entityId: { type: String, required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        attempts: { type: Number, required: true },
        lastError: { type: String, required: true },
      },
      { timestamps: true }
    )
  );

export const WebhookHashModel = (): Model<WebhookHashDoc> =>
  model<WebhookHashDoc>(
    'webhook_hashes',
    new Schema<WebhookHashDoc>(
      {
        hash: { type: String, required: true, unique: true, index: true },
        source: { type: String, required: true },
      },
      { timestamps: true }
    )
  );

// Must match Farely’s EventOutbox model, which uses Mongoose’s default
// collection name: `eventoutboxes` (not `event_outboxes`).
export const AppOutboxModel = (): Model<AppOutboxDoc> =>
  model<AppOutboxDoc>(
    'EventOutbox',
    new Schema<AppOutboxDoc>(
      {
        eventId: { type: String, required: true, unique: true, index: true },
        eventType: { type: String, required: true, index: true },
        entityId: { type: String, required: true },
        occurredAt: { type: String, required: true, index: true },
        version: { type: Number, required: true, default: 1 },
        payload: { type: Schema.Types.Mixed, required: true },
        processedAt: { type: String, default: null, index: true },
        attemptCount: { type: Number, default: 0 },
        lastError: { type: String, default: null },
      },
      { timestamps: true, collection: 'eventoutboxes' }
    ),
    true
  );
