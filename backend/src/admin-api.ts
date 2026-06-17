import mongoose from 'mongoose';
import { Router } from 'express';
import { comparePassword, expiresInSec, hashPassword, hashToken, issueRefreshToken, requireAuth, requireRole, signAccessToken } from './auth';
import {
  AdminSessionModel,
  AdminUserModel,
  AppUserModel,
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
import { sendAdminCredentialEmail, sendSupportReplyEmail } from './brevoSend';
import { PREDEFINED_AREAS, getCityCenter, getCities } from './predefined-areas';
import { isGoogleConfigured, measureTraffic } from './google-traffic';

const router = Router();

const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });
const fail = (code: string, message: string): ApiError => ({ success: false, error: { code, message } });

const parseLimit = (limitParam: unknown): number => {
  const parsed = Number(limitParam);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, parsed));
};

/** Maps DB subdoc → API; null means truly missing (not the old 0,0 placeholder). */
const rideCoordsDto = (c: unknown): { latitude: number; longitude: number } | null => {
  if (!c || typeof c !== 'object') return null;
  const lat = (c as { latitude?: unknown }).latitude;
  const lng = (c as { longitude?: unknown }).longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
};

const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

const sanitizeAdmin = (adminUser: any) => ({
  id: String(adminUser._id),
  email: String(adminUser.email || '').toLowerCase(),
  fullName: String(adminUser.fullName || ''),
  role: adminUser.role,
  active: Boolean(adminUser.active),
  mustChangePassword: Boolean(adminUser.mustChangePassword),
  createdAt: adminUser.createdAt || null,
  updatedAt: adminUser.updatedAt || null,
});

const randomPassword = (len = 14): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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

  const adminUser = await AdminUserModel().findOne({ email: normalizeEmail(email), active: true }).lean();
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
        mustChangePassword: Boolean((adminUser as any).mustChangePassword),
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
        mustChangePassword: Boolean((adminUser as any).mustChangePassword),
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

router.get('/me', async (req: any, res) => {
  const adminId = req.admin?.sub;
  if (!adminId) return res.status(401).json(fail('UNAUTHORIZED', 'Missing admin identity'));
  const admin = await AdminUserModel().findById(adminId).lean();
  if (!admin) return res.status(404).json(fail('NOT_FOUND', 'Admin not found'));
  return res.json(ok({ admin: sanitizeAdmin(admin) }));
});

router.patch('/me', async (req: any, res) => {
  const adminId = req.admin?.sub;
  if (!adminId) return res.status(401).json(fail('UNAUTHORIZED', 'Missing admin identity'));
  const fullName = String(req.body?.fullName || '').trim();
  if (!fullName || fullName.length < 2) return res.status(400).json(fail('VALIDATION_ERROR', 'Valid fullName is required'));
  const admin = await AdminUserModel().findByIdAndUpdate(
    adminId,
    { $set: { fullName: fullName.slice(0, 120) } },
    { new: true }
  );
  if (!admin) return res.status(404).json(fail('NOT_FOUND', 'Admin not found'));
  await AuditLogModel().create({
    action: 'admin.profile.updated',
    actorId: adminId,
    metadata: { fullName: admin.fullName },
  });
  return res.json(ok({ admin: sanitizeAdmin(admin.toObject()) }));
});

router.post('/me/change-password', async (req: any, res) => {
  const adminId = req.admin?.sub;
  if (!adminId) return res.status(401).json(fail('UNAUTHORIZED', 'Missing admin identity'));
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || !newPassword) return res.status(400).json(fail('VALIDATION_ERROR', 'currentPassword and newPassword are required'));
  if (newPassword.length < 10) return res.status(400).json(fail('VALIDATION_ERROR', 'newPassword must be at least 10 characters'));

  const admin = await AdminUserModel().findById(adminId);
  if (!admin) return res.status(404).json(fail('NOT_FOUND', 'Admin not found'));
  const currentOk = await comparePassword(currentPassword, String(admin.passwordHash));
  if (!currentOk) return res.status(401).json(fail('UNAUTHORIZED', 'Current password is incorrect'));

  admin.passwordHash = await hashPassword(newPassword);
  admin.mustChangePassword = false;
  await admin.save();
  await AdminSessionModel().deleteMany({ adminId: String(admin._id) });
  await AuditLogModel().create({
    action: 'admin.password.changed',
    actorId: String(admin._id),
    metadata: { forcedResetCleared: true },
  });
  return res.json(ok({ changed: true }));
});

router.get('/admin-users', requireRole(['super_admin']), async (_req: any, res) => {
  const admins = await AdminUserModel().find({}).sort({ createdAt: -1 }).lean();
  return res.json(ok({ items: admins.map((a) => sanitizeAdmin(a)) }));
});

router.post('/admin-users', requireRole(['super_admin']), async (req: any, res) => {
  const email = normalizeEmail(req.body?.email);
  const fullName = String(req.body?.fullName || '').trim();
  const role = String(req.body?.role || 'support');
  const providedPassword = String(req.body?.password || '');
  const validRole = ['super_admin', 'support', 'ops_analyst'].includes(role);
  if (!email || !fullName || !validRole) return res.status(400).json(fail('VALIDATION_ERROR', 'email, fullName, and valid role are required'));

  const existing = await AdminUserModel().findOne({ email }).lean();
  if (existing) return res.status(409).json(fail('CONFLICT', 'Admin email already exists'));

  const tempPassword = providedPassword || randomPassword();
  if (tempPassword.length < 10) return res.status(400).json(fail('VALIDATION_ERROR', 'password must be at least 10 characters'));

  const created = await AdminUserModel().create({
    email,
    fullName: fullName.slice(0, 120),
    role,
    active: true,
    mustChangePassword: true,
    passwordHash: await hashPassword(tempPassword),
  });

  await AuditLogModel().create({
    action: 'admin.user.created',
    actorId: req.admin?.sub || 'unknown',
    metadata: { adminId: String(created._id), email, role },
  });

  let emailSent = false;
  try {
    const base = process.env.ADMIN_CONSOLE_URL?.trim() || '';
    const loginUrl = base ? `${base.replace(/\/+$/g, '')}/login` : '';
    const subj = 'Your Farely Admin account';
    const body = `You have been added as a staff member in Farely Admin.\n\nLogin: ${email}\nTemporary password: ${tempPassword}\n${loginUrl ? `\nLogin URL: ${loginUrl}\n` : '\n'}\nSecurity: change your password immediately after first login.`;
    const sent = await sendAdminCredentialEmail({ toEmail: email, toName: fullName, subject: subj, textBody: body });
    emailSent = !!sent?.messageId;
  } catch {
    emailSent = false;
  }

  return res.status(201).json(
    ok({
      admin: sanitizeAdmin(created.toObject()),
      tempPassword,
      emailSent,
      message: 'Share temp password securely. User must change password at first login.',
    })
  );
});

router.patch('/admin-users/:id', requireRole(['super_admin']), async (req: any, res) => {
  const targetId = String(req.params.id || '');
  if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid admin id'));
  const actorId = String(req.admin?.sub || '');
  const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim().slice(0, 120) : undefined;
  const role = req.body?.role !== undefined ? String(req.body.role || '') : undefined;
  const active = req.body?.active !== undefined ? Boolean(req.body.active) : undefined;
  if (role && !['super_admin', 'support', 'ops_analyst'].includes(role)) {
    return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid role'));
  }

  const admin = await AdminUserModel().findById(targetId);
  if (!admin) return res.status(404).json(fail('NOT_FOUND', 'Admin not found'));

  if (actorId === targetId && role && role !== 'super_admin') {
    return res.status(400).json(fail('VALIDATION_ERROR', 'You cannot demote your own super_admin role'));
  }
  if (actorId === targetId && active === false) {
    return res.status(400).json(fail('VALIDATION_ERROR', 'You cannot deactivate your own account'));
  }
  if ((role && role !== 'super_admin') || active === false) {
    const countSuperActive = await AdminUserModel().countDocuments({ role: 'super_admin', active: true });
    if (admin.role === 'super_admin' && admin.active && countSuperActive <= 1) {
      return res.status(400).json(fail('VALIDATION_ERROR', 'At least one active super_admin is required'));
    }
  }

  if (fullName !== undefined) admin.fullName = fullName;
  if (role !== undefined) admin.role = role as any;
  if (active !== undefined) admin.active = active;
  await admin.save();

  if (active === false) {
    await AdminSessionModel().deleteMany({ adminId: String(admin._id) });
  }
  await AuditLogModel().create({
    action: 'admin.user.updated',
    actorId: actorId || 'unknown',
    metadata: { adminId: String(admin._id), role: admin.role, active: admin.active },
  });

  return res.json(ok({ admin: sanitizeAdmin(admin.toObject()) }));
});

router.post('/admin-users/:id/reset-password', requireRole(['super_admin']), async (req: any, res) => {
  const targetId = String(req.params.id || '');
  if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid admin id'));
  const nextPassword = String(req.body?.password || '') || randomPassword();
  if (nextPassword.length < 10) return res.status(400).json(fail('VALIDATION_ERROR', 'password must be at least 10 characters'));

  const admin = await AdminUserModel().findById(targetId);
  if (!admin) return res.status(404).json(fail('NOT_FOUND', 'Admin not found'));
  admin.passwordHash = await hashPassword(nextPassword);
  admin.mustChangePassword = true;
  await admin.save();
  await AdminSessionModel().deleteMany({ adminId: String(admin._id) });
  await AuditLogModel().create({
    action: 'admin.user.password_reset',
    actorId: req.admin?.sub || 'unknown',
    metadata: { adminId: String(admin._id) },
  });

  let emailSent = false;
  try {
    const base = process.env.ADMIN_CONSOLE_URL?.trim() || '';
    const loginUrl = base ? `${base.replace(/\/+$/g, '')}/login` : '';
    const subj = 'Farely Admin password reset';
    const body = `Your Farely Admin password was reset by an administrator.\n\nLogin: ${String(admin.email || '')}\nTemporary password: ${nextPassword}\n${loginUrl ? `\nLogin URL: ${loginUrl}\n` : '\n'}\nSecurity: change your password immediately after login.`;
    const sent = await sendAdminCredentialEmail({
      toEmail: String(admin.email || ''),
      toName: String(admin.fullName || ''),
      subject: subj,
      textBody: body,
    });
    emailSent = !!sent?.messageId;
  } catch {
    emailSent = false;
  }
  return res.json(
    ok({
      admin: sanitizeAdmin(admin.toObject()),
      tempPassword: nextPassword,
      emailSent,
      message: 'Share reset password securely. User must change password at next login.',
    })
  );
});

function sanitizeMobileUser(u: any, ride: { status: string; at: Date | null }, lastSeenAt: Date | null, openSupportThreads: number, activeSince: Date) {
  const id = String(u._id);
  const blockedRaw = (u as any).blocked;
  const blockedUntil = (u as any).blockedUntil ? new Date((u as any).blockedUntil) : null;
  const blockedNow =
    Boolean(blockedRaw) && (!blockedUntil || blockedUntil.getTime() > Date.now());
  const status: 'active' | 'inactive' | 'blocked' = blockedNow
    ? 'blocked'
    : lastSeenAt && lastSeenAt >= activeSince
      ? 'active'
      : 'inactive';
  return {
    id,
    fullName: String(u.fullName || ''),
    email: String(u.email || ''),
    phone: String(u.phone || ''),
    role: String(u.role || 'user'),
    city: String(u.city || ''),
    district: String(u.district || ''),
    emailVerified: Boolean(u.emailVerified),
    phoneVerified: Boolean(u.phoneVerified),
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    status,
    lastRideStatus: ride.status,
    lastRideAt: ride.at ? new Date(ride.at).toISOString() : null,
    openSupportThreads,
    createdAt: (u.createdAt ? new Date(u.createdAt) : new Date()).toISOString(),
    blocked: blockedNow,
    blockedAt: (u as any).blockedAt ? new Date((u as any).blockedAt).toISOString() : null,
    blockedUntil: blockedUntil ? blockedUntil.toISOString() : null,
    blockedReason: (u as any).blockedReason ? String((u as any).blockedReason) : null,
  };
}

router.get('/users/mobile', async (req: any, res) => {
  const limit = parseLimit(req.query.limit);
  const q = String(req.query.q || '').trim().toLowerCase();
  const activeWithinHours = Math.max(1, Math.min(720, Number(req.query.activeWithinHours) || 168));
  const activeSince = new Date(Date.now() - activeWithinHours * 60 * 60 * 1000);

  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
    ];
  }

  const users = await AppUserModel().find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  const userIds = users.map((u) => String(u._id));
  const [presenceRows, rideRows, supportCounts] = await Promise.all([
    UserPresenceModel().find({ userId: { $in: userIds } }).lean(),
    RideSnapshotModel()
      .find({ userId: { $in: userIds } })
      .sort({ createdAt: -1 })
      .lean(),
    SupportThreadModel()
      .aggregate([
        { $match: { 'customer.userId': { $in: userIds }, status: { $in: ['open', 'in_progress'] } } },
        { $group: { _id: '$customer.userId', count: { $sum: 1 } } },
      ])
      .exec(),
  ]);
  const presenceMap = new Map(presenceRows.map((r) => [String(r.userId), r.lastSeenAt]));
  const latestRideMap = new Map<string, { status: string; at: Date | null }>();
  for (const r of rideRows) {
    const uid = String(r.userId);
    if (!latestRideMap.has(uid)) latestRideMap.set(uid, { status: String(r.status), at: (r as any).createdAt || null });
  }
  const openSupportMap = new Map<string, number>(supportCounts.map((r: any) => [String(r._id), Number(r.count || 0)]));

  const items = users.map((u) => {
    const uid = String(u._id);
    const lastSeenAt = presenceMap.get(uid) || (u.lastActiveAt ? new Date(u.lastActiveAt) : null);
    const ride = latestRideMap.get(uid) || { status: 'none', at: null };
    const openSupportThreads = openSupportMap.get(uid) || 0;
    return sanitizeMobileUser(u, ride, lastSeenAt, openSupportThreads, activeSince);
  });
  return res.json(ok({ items }));
});

router.get('/users/mobile/:id', async (req: any, res) => {
  const id = String(req.params.id || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid user id'));
  }
  const user = await AppUserModel().findById(id).lean();
  if (!user) return res.status(404).json(fail('NOT_FOUND', 'User not found'));

  const activeSince = new Date(Date.now() - 168 * 60 * 60 * 1000);
  const [presence, rides, supportThreads] = await Promise.all([
    UserPresenceModel().findOne({ userId: id }).lean(),
    RideSnapshotModel().find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean(),
    SupportThreadModel().find({ 'customer.userId': id }).sort({ lastMessageAt: -1 }).limit(10).lean(),
  ]);

  const lastSeenAt = (presence as any)?.lastSeenAt
    ? new Date((presence as any).lastSeenAt)
    : (user as any).lastActiveAt
      ? new Date((user as any).lastActiveAt)
      : null;
  const latestRide = rides[0] || null;
  const openSupportThreads = supportThreads.filter((t: any) =>
    ['open', 'in_progress'].includes(String(t.status)),
  ).length;

  const summary = rides.reduce(
    (acc, r) => {
      acc.totalRides += 1;
      if (String(r.status) === 'ride_confirmed') acc.confirmedRides += 1;
      if (typeof r.estimatedFare === 'number') {
        acc.fareSum += r.estimatedFare;
        acc.fareCount += 1;
      }
      const pk = String(r.pickup || '').split(',')[0].trim();
      const dk = String(r.destination || '').split(',')[0].trim();
      if (pk) acc.pickupCounts[pk] = (acc.pickupCounts[pk] || 0) + 1;
      if (dk) acc.destinationCounts[dk] = (acc.destinationCounts[dk] || 0) + 1;
      return acc;
    },
    {
      totalRides: 0,
      confirmedRides: 0,
      fareSum: 0,
      fareCount: 0,
      pickupCounts: {} as Record<string, number>,
      destinationCounts: {} as Record<string, number>,
    },
  );

  const topPickup = Object.entries(summary.pickupCounts).sort((a, b) => b[1] - a[1])[0] || null;
  const topDestination =
    Object.entries(summary.destinationCounts).sort((a, b) => b[1] - a[1])[0] || null;

  const profile = sanitizeMobileUser(
    user,
    latestRide ? { status: String(latestRide.status), at: (latestRide as any).createdAt || null } : { status: 'none', at: null },
    lastSeenAt,
    openSupportThreads,
    activeSince,
  );

  return res.json(
    ok({
      profile,
      stats: {
        totalRides: summary.totalRides,
        confirmedRides: summary.confirmedRides,
        avgFare: summary.fareCount ? Number((summary.fareSum / summary.fareCount).toFixed(2)) : null,
        topPickup: topPickup ? { name: topPickup[0], count: topPickup[1] } : null,
        topDestination: topDestination
          ? { name: topDestination[0], count: topDestination[1] }
          : null,
      },
      recentRides: rides.slice(0, 10).map((r: any) => ({
        id: r.sourceId,
        provider: r.provider,
        pickup: r.pickup,
        destination: r.destination,
        status: r.status,
        estimatedFare: typeof r.estimatedFare === 'number' ? r.estimatedFare : null,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      })),
      supportThreads: supportThreads.map((t: any) => ({
        id: String(t._id),
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        lastMessageAt: t.lastMessageAt ? new Date(t.lastMessageAt).toISOString() : null,
      })),
    }),
  );
});

router.post(
  '/users/mobile/:id/block',
  requireRole(['super_admin', 'support']),
  async (req: any, res) => {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid user id'));
    }
    const daysRaw = req.body?.days;
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!reason) return res.status(400).json(fail('VALIDATION_ERROR', 'reason is required'));

    let blockedUntil: Date | null = null;
    if (daysRaw !== undefined && daysRaw !== null && String(daysRaw).toLowerCase() !== 'permanent') {
      const n = Number(daysRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 365) {
        return res.status(400).json(fail('VALIDATION_ERROR', 'days must be 1..365 or "permanent"'));
      }
      blockedUntil = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    }

    const updated = await AppUserModel().findByIdAndUpdate(
      id,
      {
        $set: {
          blocked: true,
          blockedAt: new Date(),
          blockedUntil,
          blockedReason: reason,
          blockedByAdminId: String(req.admin?.sub || 'unknown'),
        },
      },
      { new: true },
    );
    if (!updated) return res.status(404).json(fail('NOT_FOUND', 'User not found'));

    await AuditLogModel().create({
      action: 'user.mobile.blocked',
      actorId: req.admin?.sub || 'unknown',
      metadata: { userId: id, reason, blockedUntil: blockedUntil?.toISOString() || null },
    });

    return res.json(
      ok({
        userId: id,
        blocked: true,
        blockedUntil: blockedUntil ? blockedUntil.toISOString() : null,
        blockedReason: reason,
      }),
    );
  },
);

router.post(
  '/users/mobile/:id/unblock',
  requireRole(['super_admin', 'support']),
  async (req: any, res) => {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid user id'));
    }
    const updated = await AppUserModel().findByIdAndUpdate(
      id,
      {
        $set: {
          blocked: false,
          blockedAt: null,
          blockedUntil: null,
          blockedReason: null,
          blockedByAdminId: null,
        },
      },
      { new: true },
    );
    if (!updated) return res.status(404).json(fail('NOT_FOUND', 'User not found'));

    await AuditLogModel().create({
      action: 'user.mobile.unblocked',
      actorId: req.admin?.sub || 'unknown',
      metadata: { userId: id },
    });
    return res.json(ok({ userId: id, blocked: false }));
  },
);

router.delete('/users/mobile/:id', requireRole(['super_admin']), async (req: any, res) => {
  const id = String(req.params.id || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid user id'));
  }
  const deleted = await AppUserModel().findByIdAndDelete(id);
  if (!deleted) return res.status(404).json(fail('NOT_FOUND', 'User not found'));
  await AuditLogModel().create({
    action: 'user.mobile.deleted',
    actorId: req.admin?.sub || 'unknown',
    metadata: { userId: id, email: (deleted as any).email || null },
  });
  return res.json(ok({ userId: id, deleted: true }));
});

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

function looksLikePlusCode(value: string): boolean {
  return /[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i.test(value);
}

function cleanLocationName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (looksLikePlusCode(trimmed)) return null;
  const withoutCountry = trimmed.replace(/,\s*Pakistan\s*$/i, '');
  const segments = withoutCountry.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  const candidate = segments.slice(0, 2).join(', ');
  if (candidate.length > 80) return candidate.slice(0, 80) + '…';
  return candidate;
}

function roundCoord(n: number, step = 0.005): number {
  return Math.round(n / step) * step;
}

router.get('/metrics/area-frequency', async (req, res) => {
  const requestedDays = Math.min(365, Math.max(1, Number(req.query.days) || 7));
  const limit = Math.min(20, Math.max(3, Number(req.query.limit) || 10));

  const tryWindows = Array.from(new Set([requestedDays, 30, 90, 365])).filter(
    (d) => d >= requestedDays,
  );

  let rides: any[] = [];
  let usedDays = requestedDays;
  let usedFallback = false;
  for (const d of tryWindows) {
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    rides = await RideSnapshotModel().find({ createdAt: { $gte: since } }).lean();
    if (rides.length > 0) {
      usedDays = d;
      usedFallback = d !== requestedDays;
      break;
    }
  }

  if (rides.length === 0) {
    rides = await RideSnapshotModel().find({}).limit(2000).lean();
    if (rides.length > 0) {
      usedFallback = true;
      usedDays = 0;
    }
  }

  const since = usedDays > 0 ? new Date(Date.now() - usedDays * 24 * 60 * 60 * 1000) : new Date(0);

  type Bucket = {
    key: string;
    name: string | null;
    sumLat: number;
    sumLng: number;
    sampleCount: number;
    pickupCount: number;
    destinationCount: number;
    pickupConfirmed: number;
    destinationConfirmed: number;
  };
  const buckets = new Map<string, Bucket>();

  const upsert = (
    type: 'pickup' | 'destination',
    raw: string | undefined,
    coords: { latitude?: number; longitude?: number } | undefined,
    confirmed: boolean,
  ): void => {
    const name = cleanLocationName(raw);
    const lat =
      typeof coords?.latitude === 'number' && Number.isFinite(coords.latitude) ? coords.latitude : null;
    const lng =
      typeof coords?.longitude === 'number' && Number.isFinite(coords.longitude) ? coords.longitude : null;

    const key = name
      ? `n:${name.toLowerCase()}`
      : lat !== null && lng !== null
        ? `c:${roundCoord(lat).toFixed(3)}:${roundCoord(lng).toFixed(3)}`
        : null;
    if (!key) return;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        name,
        sumLat: 0,
        sumLng: 0,
        sampleCount: 0,
        pickupCount: 0,
        destinationCount: 0,
        pickupConfirmed: 0,
        destinationConfirmed: 0,
      };
      buckets.set(key, bucket);
    }
    if (lat !== null && lng !== null) {
      bucket.sumLat += lat;
      bucket.sumLng += lng;
      bucket.sampleCount += 1;
    }
    if (type === 'pickup') {
      bucket.pickupCount += 1;
      if (confirmed) bucket.pickupConfirmed += 1;
    } else {
      bucket.destinationCount += 1;
      if (confirmed) bucket.destinationConfirmed += 1;
    }
  };

  for (const ride of rides) {
    const confirmed = String(ride.status) === 'ride_confirmed';
    upsert('pickup', ride.pickup, ride.pickupCoords, confirmed);
    upsert('destination', ride.destination, ride.destinationCoords, confirmed);
  }

  const rawItems = Array.from(buckets.values())
    .map((b) => ({
      key: b.key,
      name: b.name,
      lat: b.sampleCount ? Number((b.sumLat / b.sampleCount).toFixed(6)) : null,
      lng: b.sampleCount ? Number((b.sumLng / b.sampleCount).toFixed(6)) : null,
      pickupCount: b.pickupCount,
      destinationCount: b.destinationCount,
      pickupConfirmed: b.pickupConfirmed,
      destinationConfirmed: b.destinationConfirmed,
      totalCount: b.pickupCount + b.destinationCount,
    }))
    .filter((b) => b.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);

  const maxTotal = rawItems.reduce((m, i) => Math.max(m, i.totalCount), 0) || 1;

  const items = rawItems.slice(0, limit).map((item) => {
    const intensity = item.totalCount / maxTotal;
    let surgeMultiplier = 1.0;
    let surgeLevel: 'high' | 'medium' | 'low' | 'normal' = 'normal';
    if (intensity >= 0.7) {
      surgeMultiplier = 1.5;
      surgeLevel = 'high';
    } else if (intensity >= 0.4) {
      surgeMultiplier = 1.25;
      surgeLevel = 'medium';
    } else if (intensity >= 0.2) {
      surgeMultiplier = 1.1;
      surgeLevel = 'low';
    }
    return {
      ...item,
      intensity: Number(intensity.toFixed(3)),
      surgeMultiplier,
      surgeLevel,
      surgePercent: Math.round((surgeMultiplier - 1) * 100),
    };
  });

  return res.json(
    ok({
      days: usedDays,
      requestedDays,
      usedFallback,
      windowStart: since.toISOString(),
      maxTotal,
      items,
    }),
  );
});

function surgeFromRatio(ratio: number): {
  surgeMultiplier: number;
  surgeLevel: 'high' | 'medium' | 'low' | 'normal';
  surgePercent: number;
} {
  let surgeMultiplier = 1.0;
  let surgeLevel: 'high' | 'medium' | 'low' | 'normal' = 'normal';
  if (ratio >= 1.5) {
    surgeMultiplier = 1.5;
    surgeLevel = 'high';
  } else if (ratio >= 1.25) {
    surgeMultiplier = 1.25;
    surgeLevel = 'medium';
  } else if (ratio >= 1.1) {
    surgeMultiplier = 1.1;
    surgeLevel = 'low';
  }
  return {
    surgeMultiplier,
    surgeLevel,
    surgePercent: Math.round((surgeMultiplier - 1) * 100),
  };
}

router.get('/metrics/traffic-hotspots', async (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).json(
      fail(
        'CONFIG_MISSING',
        'GOOGLE_MAPS_API_KEY is not set on the backend. Add it to backend/.env to enable live traffic hotspots.',
      ),
    );
  }

  const cityFilter = req.query.city ? String(req.query.city).toLowerCase().trim() : null;
  const areas = cityFilter
    ? PREDEFINED_AREAS.filter((a) => a.city.toLowerCase() === cityFilter)
    : PREDEFINED_AREAS;

  const measurements = await Promise.all(
    areas.map(async (area) => {
      const measurement = await measureTraffic(area, getCityCenter(area.city));
      return { area, measurement };
    }),
  );

  const items = measurements
    .map(({ area, measurement }) => {
      const ratio = measurement?.ratio ?? null;
      const tier = ratio !== null ? surgeFromRatio(ratio) : { surgeMultiplier: 1, surgeLevel: 'normal' as const, surgePercent: 0 };
      return {
        key: area.key,
        name: area.name,
        city: area.city,
        lat: area.lat,
        lng: area.lng,
        duration: measurement?.duration ?? null,
        durationInTraffic: measurement?.durationInTraffic ?? null,
        congestionRatio: ratio !== null ? Number(ratio.toFixed(3)) : null,
        delayMinutes:
          measurement && measurement.duration > 0
            ? Math.max(0, Math.round((measurement.durationInTraffic - measurement.duration) / 60))
            : null,
        ...tier,
        available: measurement !== null,
      };
    })
    .sort((a, b) => (b.congestionRatio || 0) - (a.congestionRatio || 0));

  const successfulItems = items.filter((i) => i.available);
  const highSurgeCount = items.filter((i) => i.surgeLevel === 'high').length;
  const avgDelayMinutes = successfulItems.length
    ? Math.round(
        successfulItems.reduce((s, i) => s + (i.delayMinutes || 0), 0) / successfulItems.length,
      )
    : 0;

  return res.json(
    ok({
      fetchedAt: new Date().toISOString(),
      cityFilter,
      cities: getCities(),
      summary: {
        totalAreas: items.length,
        availableAreas: successfulItems.length,
        highSurgeCount,
        avgDelayMinutes,
      },
      items,
    }),
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

  const includeDrafts =
    req.query.includeDrafts === 'true' || req.query.includeDrafts === '1';
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (provider) query.provider = provider;
  if (q) query.$or = [{ pickup: { $regex: q, $options: 'i' } }, { destination: { $regex: q, $options: 'i' } }];
  if (!includeDrafts) {
    const draftGuard = {
      status: { $ne: 'route_planned' },
      provider: { $nin: ['Pending', 'Unknown'] },
    };
    if (Object.keys(query).length === 0) {
      Object.assign(query, draftGuard);
    } else {
      query.$and = [...(Array.isArray(query.$and) ? query.$and : []), draftGuard];
    }
  }
  if (provider) query.provider = provider;
  if (q) query.$or = [{ pickup: { $regex: q, $options: 'i' } }, { destination: { $regex: q, $options: 'i' } }];
  if (!includeDrafts) {
    const draftGuard = {
      status: { $ne: 'route_planned' },
      provider: { $nin: ['Pending', 'Unknown'] },
    };
    if (Object.keys(query).length === 0) {
      Object.assign(query, draftGuard);
    } else {
      query.$and = [...(Array.isArray(query.$and) ? query.$and : []), draftGuard];
    }
  }

  const items = await RideSnapshotModel().find(query).sort({ createdAt: -1 }).lean();
  const mapped = items.map((item) => ({
    ...item,
    id: item.sourceId,
    carAc: Boolean((item as any).carAc),
    pickupCoords: rideCoordsDto(item.pickupCoords),
    destinationCoords: rideCoordsDto(item.destinationCoords),
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
