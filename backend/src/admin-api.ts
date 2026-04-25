import mongoose from 'mongoose';
import { Router } from 'express';
import { comparePassword, expiresInSec, hashToken, issueRefreshToken, requireAuth, requireRole, signAccessToken } from './auth';
import {
  AdminSessionModel,
  AdminUserModel,
  AppSourceFeedbackModel,
  AuditLogModel,
  FeedbackEntryModel,
  HotspotTileModel,
  RideSnapshotModel,
  SupportMessageModel,
  SupportThreadModel,
  TrafficDailyMetricModel,
  UserPresenceModel,
} from './models';
import { ApiError, ApiSuccess, RideStatus, ThreadPriority, ThreadStatus } from './types';
import { sendSupportReplyEmail } from './brevoSend';

const router = Router();

const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });
const fail = (code: string, message: string): ApiError => ({ success: false, error: { code, message } });

const parseLimit = (limitParam: unknown): number => {
  const parsed = Number(limitParam);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, parsed));
};

async function lastInboundSmtpMessageId(threadOid: mongoose.Types.ObjectId): Promise<string | null> {
  const m = await SupportMessageModel()
    .findOne({
      threadId: threadOid,
      direction: 'inbound',
      smtpMessageId: { $nin: [null, ''] },
    })
    .sort({ createdAt: -1 })
    .select('smtpMessageId')
    .lean();
  const id = m && (m as { smtpMessageId?: string }).smtpMessageId;
  return id ? String(id) : null;
}

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json(fail('VALIDATION_ERROR', 'Email and password are required'));

  const adminUser = await AdminUserModel().findOne({ email: String(email).toLowerCase(), active: true }).lean();
  if (!adminUser) return res.status(401).json(fail('UNAUTHORIZED', 'Invalid credentials'));

  const passwordOk = await comparePassword(String(password), String(adminUser.passwordHash));
  if (!passwordOk) return res.status(401).json(fail('UNAUTHORIZED', 'Invalid credentials'));

  const accessToken = signAccessToken({ sub: String((adminUser as any)._id), role: adminUser.role, email: adminUser.email });
  const { token: refreshToken, expiresAt } = issueRefreshToken();
  await AdminSessionModel().create({
    adminId: String((adminUser as any)._id),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return res.json(
    ok({
      accessToken,
      refreshToken,
      expiresInSec: expiresInSec(),
      admin: {
        id: String((adminUser as any)._id),
        email: adminUser.email,
        fullName: adminUser.fullName,
        role: adminUser.role,
      },
    })
  );
});

router.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json(fail('VALIDATION_ERROR', 'refreshToken is required'));

  const session = await AdminSessionModel()
    .findOne({ refreshTokenHash: hashToken(String(refreshToken)), expiresAt: { $gt: new Date() } })
    .lean();
  if (!session) return res.status(401).json(fail('UNAUTHORIZED', 'Invalid refresh token'));

  const adminUser = await AdminUserModel().findById(session.adminId).lean();
  if (!adminUser || !adminUser.active) return res.status(401).json(fail('UNAUTHORIZED', 'Admin not found'));

  const accessToken = signAccessToken({ sub: String((adminUser as any)._id), role: adminUser.role, email: adminUser.email });
  return res.json(
    ok({
      accessToken,
      refreshToken,
      expiresInSec: expiresInSec(),
      admin: {
        id: String((adminUser as any)._id),
        email: adminUser.email,
        fullName: adminUser.fullName,
        role: adminUser.role,
      },
    })
  );
});

router.post('/auth/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await AdminSessionModel().deleteOne({ refreshTokenHash: hashToken(String(refreshToken)) });
  }
  return res.json(ok({ loggedOut: true }));
});

router.use(requireAuth);

router.get('/metrics/traffic', async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const provider = req.query.provider ? String(req.query.provider) : null;
  const city = req.query.city ? String(req.query.city) : null;
  const rideType = req.query.rideType ? String(req.query.rideType) : null;

  const query: Record<string, unknown> = {};
  if (from || to) query.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (provider) query.provider = provider;
  if (city) query.city = city;
  if (rideType) query.rideType = rideType;

  const rides = await RideSnapshotModel().find(query).sort({ createdAt: -1 }).limit(10000).lean();
  const summary = rides.reduce(
    (acc, ride) => {
      acc.searches += 1;
      if (ride.status !== 'ride_not_taken') acc.handoffAttempts += 1;
      if (ride.status === 'ride_confirmed') {
        acc.handoffSuccess += 1;
        acc.confirmedRides += 1;
      }
      return acc;
    },
    { searches: 0, handoffAttempts: 0, handoffSuccess: 0, confirmedRides: 0 }
  );

  const providerMap = new Map<string, { provider: string; searches: number; handoffAttempts: number; confirmedRides: number; conversionRate: number }>();
  rides.forEach((ride) => {
    if (!providerMap.has(ride.provider)) {
      providerMap.set(ride.provider, { provider: ride.provider, searches: 0, handoffAttempts: 0, confirmedRides: 0, conversionRate: 0 });
    }
    const item = providerMap.get(ride.provider)!;
    item.searches += 1;
    if (ride.status !== 'ride_not_taken') item.handoffAttempts += 1;
    if (ride.status === 'ride_confirmed') item.confirmedRides += 1;
    item.conversionRate = item.searches ? Number((item.confirmedRides / item.searches).toFixed(3)) : 0;
  });

  const daily = await TrafficDailyMetricModel()
    .find({
      ...(from || to
        ? { date: { ...(from ? { $gte: from.toISOString().slice(0, 10) } : {}), ...(to ? { $lte: to.toISOString().slice(0, 10) } : {}) } }
        : {}),
      ...(provider ? { provider } : {}),
      ...(city ? { city } : {}),
      ...(rideType ? { rideType } : {}),
    })
    .sort({ date: 1 })
    .lean();

  let timeseries = daily.map((d) => ({
    bucket: d.date,
    searches: d.searches,
    handoffAttempts: d.handoffAttempts,
    handoffSuccess: d.handoffSuccess,
    confirmedRides: d.confirmedRides,
  }));

  if (timeseries.length === 0 && rides.length > 0) {
    const byDay = new Map<
      string,
      { bucket: string; searches: number; handoffAttempts: number; handoffSuccess: number; confirmedRides: number }
    >();
    for (const ride of rides) {
      const day = new Date(ride.createdAt as Date).toISOString().slice(0, 10);
      if (!byDay.has(day)) {
        byDay.set(day, { bucket: day, searches: 0, handoffAttempts: 0, handoffSuccess: 0, confirmedRides: 0 });
      }
      const row = byDay.get(day)!;
      row.searches += 1;
      if (ride.status !== 'ride_not_taken') row.handoffAttempts += 1;
      if (ride.status === 'ride_confirmed') {
        row.handoffSuccess += 1;
        row.confirmedRides += 1;
      }
    }
    timeseries = Array.from(byDay.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  return res.json(
    ok({
      summary,
      timeseries,
      providerBreakdown: Array.from(providerMap.values()),
    })
  );
});

router.get('/metrics/active-users', async (req, res) => {
  const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const fromPresence = await UserPresenceModel().countDocuments({ lastSeenAt: { $gte: since } });
  const rideUserIds = await RideSnapshotModel().distinct('userId', { createdAt: { $gte: since } });
  return res.json(
    ok({
      hours,
      fromAppHeartbeat: fromPresence,
      fromRideActivity: rideUserIds.length,
      displayCount: Math.max(fromPresence, rideUserIds.length),
    })
  );
});

router.get('/metrics/hotspots', async (req, res) => {
  const cityFilter = req.query.city ? String(req.query.city).toLowerCase() : null;
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;

  if (from || to) {
    const tiles = await HotspotTileModel()
      .find({
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(from || to ? { windowStart: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
      })
      .sort({ windowStart: -1 })
      .limit(500)
      .lean();
    const maxDemand = tiles.length ? Math.max(1, ...tiles.map((t) => t.demandCount)) : 1;
    const maxConfirmed = tiles.length ? Math.max(1, ...tiles.map((t) => t.confirmedRides)) : 1;
    const totalRides = tiles.reduce((s, t) => s + t.demandCount, 0);
    const totalConfirmed = tiles.reduce((s, t) => s + t.confirmedRides, 0);
    return res.json(
      ok({
        windowStart: tiles[0]?.windowStart || null,
        summary: {
          totalRides,
          totalConfirmed,
          avgSuccessRate: totalRides ? Number((totalConfirmed / totalRides).toFixed(3)) : 0,
          tileCount: tiles.length,
        },
        tiles: tiles.map((t) => ({
          tileKey: t.tileKey,
          city: t.city,
          center: t.center,
          demandCount: t.demandCount,
          confirmedRides: t.confirmedRides,
          avgEtaMin: t.avgEtaMin,
          successRate: t.successRate,
          demandIndex: Math.round((t.demandCount / maxDemand) * 100),
          supplyScore: Math.round((t.confirmedRides / maxConfirmed) * 100),
        })),
      })
    );
  }

  const latest = await HotspotTileModel().findOne().sort({ windowStart: -1 }).lean();
  if (!latest) {
    return res.json(
      ok({
        windowStart: null,
        summary: { totalRides: 0, totalConfirmed: 0, avgSuccessRate: 0, tileCount: 0 },
        tiles: [],
      })
    );
  }
  const ws = latest.windowStart;
  const rawTiles = await HotspotTileModel()
    .find({ windowStart: ws, ...(cityFilter ? { city: cityFilter } : {}) })
    .sort({ demandCount: -1 })
    .lean();
  const maxDemand = Math.max(1, ...rawTiles.map((t) => t.demandCount));
  const maxConfirmed = Math.max(1, ...rawTiles.map((t) => t.confirmedRides));
  const totalRides = rawTiles.reduce((s, t) => s + t.demandCount, 0);
  const totalConfirmed = rawTiles.reduce((s, t) => s + t.confirmedRides, 0);
  return res.json(
    ok({
      windowStart: ws,
      summary: {
        totalRides,
        totalConfirmed,
        avgSuccessRate: totalRides ? Number((totalConfirmed / totalRides).toFixed(3)) : 0,
        tileCount: rawTiles.length,
      },
      tiles: rawTiles.map((t) => ({
        tileKey: t.tileKey,
        city: t.city,
        center: t.center,
        demandCount: t.demandCount,
        confirmedRides: t.confirmedRides,
        avgEtaMin: t.avgEtaMin,
        successRate: t.successRate,
        demandIndex: Math.round((t.demandCount / maxDemand) * 100),
        supplyScore: Math.round((t.confirmedRides / maxConfirmed) * 100),
      })),
    })
  );
});

router.get('/feedback', async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const cap = Math.min(500, limit * 3);
  const map = new Map<
    string,
    {
      id: string;
      userId: string;
      stars: number;
      appExperience: string;
      timeSavingNote: string;
      source: string;
      handoffId: string | null;
      provider: string | null;
      createdAt: Date;
    }
  >();

  try {
    const appRows = await AppSourceFeedbackModel().find({}).sort({ createdAt: -1 }).limit(cap).lean();
    for (const f of appRows) {
      const id = String(f._id);
      const created = (f as { createdAt?: Date }).createdAt;
      map.set(id, {
        id,
        userId: f.userId != null ? String(f.userId) : '',
        stars: f.stars,
        appExperience: String(f.appExperience || ''),
        timeSavingNote: String(f.timeSavingNote || ''),
        source: String(f.source || ''),
        handoffId: f.handoffId != null && f.handoffId !== '' ? String(f.handoffId) : null,
        provider: f.provider != null && f.provider !== '' ? String(f.provider) : null,
        createdAt: created ? new Date(created) : new Date(),
      });
    }
  } catch (e) {
    // Wrong APP_DB_NAME, URI, or no app DB: still return ingested copy below
    // eslint-disable-next-line no-console
    console.error('[admin] AppSourceFeedback read failed (check APP_DB_NAME / MONGO_URI):', e);
  }

  const adminRows = await FeedbackEntryModel().find({}).sort({ createdAt: -1 }).limit(cap).lean();
  for (const f of adminRows) {
    const id = f.sourceId;
    if (map.has(id)) continue;
    map.set(id, {
      id,
      userId: f.userId,
      stars: f.stars,
      appExperience: f.appExperience,
      timeSavingNote: f.timeSavingNote,
      source: f.source,
      handoffId: f.handoffId != null && f.handoffId !== '' ? String(f.handoffId) : null,
      provider: f.provider != null && f.provider !== '' ? String(f.provider) : null,
      createdAt: (f as { createdAt?: Date }).createdAt
        ? new Date((f as { createdAt: Date }).createdAt)
        : new Date(),
    });
  }

  const items = Array.from(map.values())
    .sort((a, b) => +b.createdAt - +a.createdAt)
    .slice(0, limit);
  return res.json(ok({ items }));
});

router.get('/rides/logs', async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const cursor = Number(req.query.cursor ?? 0) || 0;
  const status = req.query.status as RideStatus | undefined;
  const provider = req.query.provider as string | undefined;
  const q = String(req.query.q ?? '').toLowerCase();

  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (provider) query.provider = provider;
  if (q) query.$or = [{ pickup: { $regex: q, $options: 'i' } }, { destination: { $regex: q, $options: 'i' } }];

  const items = await RideSnapshotModel().find(query).sort({ createdAt: -1 }).lean();
  const mapped = items.map((item) => ({
    ...item,
    id: item.sourceId,
    carAc: Boolean((item as any).carAc),
    pickupCoords: item.pickupCoords || { latitude: 0, longitude: 0 },
    destinationCoords: item.destinationCoords || { latitude: 0, longitude: 0 },
    userConfirmedAt: item.userConfirmedAt || null,
  }));
  const page = mapped.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < mapped.length ? String(cursor + limit) : null;
  return res.json(ok({ items: page, nextCursor }));
});

router.get('/support/threads', async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const cursor = Number(req.query.cursor ?? 0) || 0;
  const status = req.query.status as ThreadStatus | undefined;
  const priority = req.query.priority as ThreadPriority | undefined;
  const assigneeId = req.query.assigneeId as string | undefined;
  const q = String(req.query.q ?? '').toLowerCase();

  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (assigneeId) query.assigneeAdminId = assigneeId;
  if (q) query.subject = { $regex: q, $options: 'i' };

  const items = await SupportThreadModel().find(query).sort({ lastMessageAt: -1 }).lean();
  const page = items.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < items.length ? String(cursor + limit) : null;
  return res.json(
    ok({
      items: page.map((item) => ({
        id: String((item as any)._id),
        subject: item.subject,
        status: item.status,
        priority: item.priority,
        source: item.source,
        customer: item.customer,
        assignee: item.assigneeAdminId ? { adminId: item.assigneeAdminId, name: 'Assigned Admin' } : null,
        lastMessageAt: item.lastMessageAt,
        createdAt: (item as any).createdAt,
      })),
      nextCursor,
    })
  );
});

router.get('/support/threads/:id/messages', async (req, res) => {
  const thread = await SupportThreadModel().findById(req.params.id).lean();
  if (!thread) return res.status(404).json(fail('NOT_FOUND', 'Thread not found'));
  const messages = await SupportMessageModel().find({ threadId: req.params.id }).sort({ createdAt: 1 }).lean();
  return res.json(
    ok({
      thread: { id: String((thread as any)._id), subject: thread.subject, status: thread.status, priority: thread.priority },
      messages: messages.map((msg) => ({
        id: String((msg as any)._id),
        direction: msg.direction,
        channel: msg.channel,
        text: msg.text,
        html: msg.html || null,
        createdAt: (msg as any).createdAt,
        brevoMessageId: msg.brevoMessageId || null,
      })),
    })
  );
});

router.post('/support/threads/:id/reply', requireRole(['super_admin', 'support']), async (req: any, res) => {
  const thread = await SupportThreadModel().findById(req.params.id);
  if (!thread) return res.status(404).json(fail('NOT_FOUND', 'Thread not found'));
  const text = req.body?.text as string | undefined;
  if (!text?.trim()) return res.status(400).json(fail('VALIDATION_ERROR', 'text is required'));

  const created = await SupportMessageModel().create({
    threadId: thread._id,
    direction: 'outbound',
    channel: 'email',
    text,
    html: null,
    attachments: [],
    deliveryStatus: 'pending',
    brevoMessageId: null,
    smtpMessageId: null,
  });

  if (!thread.firstResponseAt) thread.firstResponseAt = new Date();
  thread.lastMessageAt = new Date();
  thread.status = thread.status === 'open' ? 'in_progress' : thread.status;
  await thread.save();

  const subjectBase = thread.subject?.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
  let emailSent = false;
  let brevoMessageId: string | null = null;

  try {
    const inReplyTo = await lastInboundSmtpMessageId(thread._id);
    const sent = await sendSupportReplyEmail({
      threadMongoId: String(thread._id),
      toEmail: thread.customer.email,
      toName: thread.customer.name,
      subject: subjectBase,
      textBody: text.trim(),
      inReplyTo: inReplyTo,
    });
    if (sent?.messageId) {
      brevoMessageId = sent.messageId;
      emailSent = true;
      created.brevoMessageId = sent.messageId;
      created.smtpMessageId = sent.messageId;
      created.deliveryStatus = 'pending';
      await created.save();
    } else {
      created.brevoMessageId = `local_${Date.now()}`;
      created.deliveryStatus = 'pending';
      await created.save();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Email send failed';
    created.deliveryStatus = 'bounced';
    created.brevoMessageId = `error:${msg}`.slice(0, 500);
    await created.save();
    return res.status(502).json(fail('BREVO_SEND_FAILED', msg));
  }

  await AuditLogModel().create({
    action: 'support.reply.created',
    actorId: req.admin?.sub || 'unknown',
    threadId: String(thread._id),
    metadata: { messageId: String(created._id), emailSent, brevoMessageId },
  });
  return res.json(
    ok({
      sent: true,
      emailSent,
      messageId: String(created._id),
      brevoMessageId,
    })
  );
});

router.patch('/support/threads/:id', requireRole(['super_admin', 'support']), async (req: any, res) => {
  const thread = await SupportThreadModel().findById(req.params.id);
  if (!thread) return res.status(404).json(fail('NOT_FOUND', 'Thread not found'));
  const { status, priority, assigneeAdminId, internalNote } = req.body || {};
  if (status) thread.status = status;
  if (priority) thread.priority = priority;
  if (assigneeAdminId !== undefined) thread.assigneeAdminId = assigneeAdminId || null;
  if (internalNote !== undefined) thread.internalNote = internalNote;
  if (status === 'resolved') thread.resolvedAt = new Date();
  thread.lastMessageAt = new Date();
  await thread.save();
  await AuditLogModel().create({
    action: 'thread.patch',
    actorId: req.admin?.sub || 'unknown',
    threadId: String(thread._id),
    metadata: { status, priority, assigneeAdminId },
  });
  return res.json(ok({ updated: true, threadId: String(thread._id) }));
});

export default router;
