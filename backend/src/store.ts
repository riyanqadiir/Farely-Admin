import { EventEnvelope, RideStatus, ThreadPriority, ThreadStatus } from './types';

type RideSnapshot = {
  id: string;
  userId: string;
  provider: string;
  rideType: string;
  city: string;
  pickup: string;
  destination: string;
  status: RideStatus;
  estimatedFare: number;
  redirectSucceeded: boolean;
  createdAt: string;
  userConfirmedAt: string | null;
};

type SupportThread = {
  id: string;
  subject: string;
  status: ThreadStatus;
  priority: ThreadPriority;
  source: 'in_app' | 'email';
  customer: { userId: string; name: string; email: string };
  assignee: { adminId: string; name: string } | null;
  internalNote?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  lastMessageAt: string;
  createdAt: string;
};

type SupportMessage = {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'in_app';
  text: string;
  html: string | null;
  attachments: string[];
  brevoMessageId: string | null;
  deliveryStatus: 'pending' | 'delivered' | 'bounced' | 'opened' | 'clicked' | 'replied';
  createdAt: string;
};

export const appDb = {
  outbox: [] as EventEnvelope[],
  rides: [] as RideSnapshot[],
};

export const adminDb = {
  adminUsers: [{ id: 'adm_1', email: 'admin@farely.app', fullName: 'Ops Admin', role: 'super_admin' }],
  rideEventsSnapshot: [] as RideSnapshot[],
  trafficDailyMetrics: [] as Array<{ date: string; provider: string; city: string; rideType: string; searches: number; handoffAttempts: number; handoffSuccess: number; confirmedRides: number }>,
  hotspotTiles: [] as Array<{ windowStart: string; city: string; tileKey: string; center: { lat: number; lng: number }; demandCount: number; confirmedRides: number; avgEtaMin: number; successRate: number }>,
  supportThreadsView: [] as SupportThread[],
  supportMessages: [] as SupportMessage[],
  ingestEvents: new Set<string>(),
  deadLetter: [] as EventEnvelope[],
  webhookHashes: new Set<string>(),
  auditLogs: [] as Array<{ id: string; action: string; at: string; actorId: string; threadId?: string }>,
};

const now = new Date().toISOString();
adminDb.rideEventsSnapshot.push(
  {
    id: 'rh_1',
    userId: 'usr_1',
    provider: 'Yango',
    rideType: 'car',
    city: 'Lahore',
    pickup: 'Service Rd',
    destination: 'Main Boulevard',
    status: 'ride_confirmed',
    estimatedFare: 220,
    redirectSucceeded: true,
    createdAt: now,
    userConfirmedAt: now,
  },
  {
    id: 'rh_2',
    userId: 'usr_2',
    provider: 'Uber',
    rideType: 'bike',
    city: 'Lahore',
    pickup: 'MM Alam',
    destination: 'Gulberg',
    status: 'handoff_failed',
    estimatedFare: 180,
    redirectSucceeded: false,
    createdAt: now,
    userConfirmedAt: null,
  },
);

adminDb.supportThreadsView.push({
  id: 'th_1',
  subject: 'Driver did not arrive',
  status: 'open',
  priority: 'high',
  source: 'in_app',
  customer: { userId: 'usr_1', name: 'Rayan', email: 'rayan@example.com' },
  assignee: { adminId: 'adm_2', name: 'Support Agent' },
  lastMessageAt: now,
  createdAt: now,
});

adminDb.supportMessages.push({
  id: 'msg_1',
  threadId: 'th_1',
  direction: 'inbound',
  channel: 'email',
  text: 'My driver canceled at the last minute.',
  html: null,
  attachments: [],
  brevoMessageId: 'abc-123',
  deliveryStatus: 'replied',
  createdAt: now,
});
