import crypto from 'crypto';

/** Verify Brevo transactional / marketing webhook `X-Brevo-Signature: sha256=<hex>`. */
export function verifyBrevoWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!secret?.trim()) return false;
  if (!signatureHeader || !rawBody?.length) return false;
  const cleaned = String(signatureHeader).replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', secret.trim()).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(cleaned, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseInboundThreadIdFromAddress(address: string | undefined | null): string | null {
  if (!address) return null;
  const domain = process.env.BREVO_INBOUND_DOMAIN?.trim().toLowerCase();
  if (!domain) return null;
  const lower = address.trim().toLowerCase();
  if (!lower.endsWith(`@${domain}`)) return null;
  const local = lower.slice(0, lower.indexOf('@'));
  const prefix = (process.env.BREVO_INBOUND_LOCAL_PREFIX?.trim() || 'farely').toLowerCase();
  const plus = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\+([a-f0-9]{24})$`, 'i');
  const m = local.match(plus);
  return m ? m[1] : null;
}

export function headerFromParsed(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const v = headers[key];
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  if (v == null) return undefined;
  return String(v);
}
