import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { SupportMessageModel, SupportThreadModel, WebhookHashModel } from './models';
import { headerFromParsed, parseInboundThreadIdFromAddress, verifyBrevoWebhookSignature } from './brevoWebhook';

const router = Router();

const hashPayload = (value: unknown): string => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function parseJsonBody(req: { body: unknown }): Record<string, unknown> | null {
  const b = req.body;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (b && typeof b === 'object') return b as Record<string, unknown>;
  return null;
}

function inboundAuthOk(req: { query: Record<string, unknown> }): boolean {
  const token = process.env.BREVO_INBOUND_TOKEN?.trim();
  if (!token) return true;
  return String(req.query?.token || '') === token;
}

/** All addresses the message was delivered to (Gmail forwards / Brevo `Recipients` / etc.). */
function collectRecipientEmails(item: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (addr: string | undefined | null) => {
    const a = String(addr || '')
      .trim()
      .toLowerCase();
    if (a.includes('@')) out.add(a.replace(/^<|>$/g, ''));
  };
  const mailboxes = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (typeof x === 'string') add(x);
      else if (x && typeof x === 'object' && 'Address' in (x as object))
        add((x as { Address?: string }).Address);
    }
  };
  mailboxes(item.To);
  mailboxes(item.Cc);
  const rec = item.Recipients;
  if (Array.isArray(rec)) {
    for (const r of rec) {
      if (typeof r === 'string') add(r);
      else if (r && typeof r === 'object' && 'Address' in (r as object)) add((r as { Address?: string }).Address);
    }
  }
  const headers = item.Headers as Record<string, unknown> | undefined;
  const delivered = headerFromParsed(headers, 'Delivered-To');
  if (delivered) add(delivered.split(',')[0]);
  return [...out];
}

function mapTransactionalStatus(event: string): 'delivered' | 'opened' | 'clicked' | 'bounced' | 'pending' | 'replied' {
  const e = (event || '').toLowerCase().replace(/-/g, '_');
  if (e.includes('bounce') || e === 'invalid' || e === 'spam' || e === 'blocked' || e === 'error') return 'bounced';
  if (e === 'opened') return 'opened';
  if (e === 'clicked') return 'clicked';
  if (e === 'delivered') return 'delivered';
  return 'pending';
}

/** Brevo inbound parse webhook: body has `items[]`. */
router.post('/brevo/inbound', async (req, res) => {
  if (!inboundAuthOk(req as { query: Record<string, unknown> })) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid inbound token' } });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
  const duplicate = await WebhookHashModel().findOne({ hash: payloadHash }).lean();
  if (duplicate) return res.json({ success: true, data: { duplicate: true } });

  const parsed = parseJsonBody(req);
  if (!parsed) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } });

  const items = parsed.items as unknown;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'items[] required' } });
  }

  let ingested = 0;
  for (const item of items as Record<string, unknown>[]) {
    const from = item.From as { Address?: string; Name?: string } | undefined;
    const fromEmail = from?.Address ? String(from.Address).toLowerCase() : '';
    const fromName = from?.Name ? String(from.Name) : '';
    const headers = item.Headers as Record<string, unknown> | undefined;
    const smtpId = item.MessageId != null ? String(item.MessageId) : '';

    const text =
      (item.RawTextBody != null ? String(item.RawTextBody) : '') ||
      (item.ExtractedMarkdownMessage != null ? String(item.ExtractedMarkdownMessage) : '') ||
      '';
    const html = item.RawHtmlBody != null ? String(item.RawHtmlBody) : null;

    let threadId: string | null = headerFromParsed(headers, 'X-Farely-Thread-Id')?.trim() || null;
    if (threadId && !mongoose.Types.ObjectId.isValid(threadId)) threadId = null;

    const recipientEmails = collectRecipientEmails(item);
    for (const addr of recipientEmails) {
      if (threadId) break;
      const extracted = parseInboundThreadIdFromAddress(addr);
      if (extracted && mongoose.Types.ObjectId.isValid(extracted)) threadId = extracted;
    }

    if (!threadId && smtpId) {
      const norm = smtpId.replace(/^<|>$/g, '');
      const msg = await SupportMessageModel()
        .findOne({
          $or: [{ smtpMessageId: smtpId }, { smtpMessageId: norm }, { brevoMessageId: smtpId }, { brevoMessageId: norm }],
        })
        .sort({ createdAt: -1 })
        .lean();
      if (msg) threadId = String(msg.threadId);
    }

    if (!threadId && fromEmail) {
      const t = await SupportThreadModel()
        .findOne({ 'customer.email': new RegExp(`^${escapeRegex(fromEmail)}$`, 'i'), status: { $ne: 'closed' } })
        .sort({ lastMessageAt: -1 })
        .lean();
      if (t) threadId = String((t as { _id: mongoose.Types.ObjectId })._id);
    }

    let thread = threadId ? await SupportThreadModel().findById(threadId) : null;

    const publicInbox = process.env.BREVO_PUBLIC_SUPPORT_EMAIL?.trim().toLowerCase();
    const toMatchesPublicInbox = !!publicInbox && recipientEmails.some((e) => e === publicInbox);

    if (!thread && fromEmail && toMatchesPublicInbox) {
      const subject = item.Subject != null ? String(item.Subject) : 'Support (email)';
      thread = await SupportThreadModel().create({
        sourceThreadId: null,
        source: 'email',
        subject: subject.slice(0, 500),
        status: 'open',
        priority: 'medium',
        customer: { userId: null, name: fromName || null, email: fromEmail },
        lastMessageAt: new Date(),
      });
    }

    if (!thread) continue;

    if (thread.status === 'resolved' || thread.status === 'closed') thread.status = 'in_progress';
    thread.lastMessageAt = new Date();
    await thread.save();

    await SupportMessageModel().create({
      threadId: thread._id,
      direction: 'inbound',
      channel: 'email',
      text: text.slice(0, 500_000),
      html: html ? html.slice(0, 500_000) : null,
      attachments: [],
      brevoMessageId: smtpId || null,
      smtpMessageId: smtpId || null,
      deliveryStatus: 'delivered',
    });
    ingested += 1;
  }

  try {
    await WebhookHashModel().create({ hash: payloadHash, source: 'brevo.inbound' });
  } catch {
    // ignore duplicate race
  }
  return res.json({ success: true, data: { ingested } });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Brevo transactional / SMTP events (delivered, opened, …). */
router.post('/brevo/events', async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const secret = process.env.BREVO_WEBHOOK_SECRET?.trim();
  const sig = (req.headers['x-brevo-signature'] || req.headers['X-Brevo-Signature']) as string | undefined;
  if (secret) {
    if (!verifyBrevoWebhookSignature(raw, sig, secret)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } });
    }
  }

  const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
  const duplicate = await WebhookHashModel().findOne({ hash: payloadHash }).lean();
  if (duplicate) return res.json({ success: true, data: { duplicate: true } });

  const parsed = parseJsonBody(req);
  if (!parsed) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } });

  const event = String(parsed.event ?? '');
  const messageIdRaw = (parsed['message-id'] as string) || (parsed.messageId as string) || '';
  const messageId = messageIdRaw ? String(messageIdRaw).replace(/^<|>$/g, '') : '';

  if (messageId) {
    const nextStatus = mapTransactionalStatus(event);
    await SupportMessageModel().updateMany(
      {
        $or: [
          { brevoMessageId: messageIdRaw },
          { brevoMessageId: `<${messageId}>` },
          { brevoMessageId: messageId },
          { smtpMessageId: messageIdRaw },
          { smtpMessageId: `<${messageId}>` },
          { smtpMessageId: messageId },
        ],
      },
      { $set: { deliveryStatus: nextStatus } }
    );
  }

  try {
    await WebhookHashModel().create({ hash: payloadHash, source: 'brevo.events' });
  } catch {
    // ignore duplicate race
  }
  return res.json({ success: true, data: { updated: true } });
});

export default router;
