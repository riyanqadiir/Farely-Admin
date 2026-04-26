/**
 * Brevo transactional email (https://api.brevo.com/v3/smtp/email).
 * Same env keys as the main Farely backend: BREVO_API_KEY, BREVO_SENDER_EMAIL, etc.
 */

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

export type SendSupportReplyInput = {
  threadMongoId: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  textBody: string;
  /** RFC Message-ID of the message we are replying to (improves threading). */
  inReplyTo?: string | null;
};

export type SendSupportReplyResult = {
  messageId: string;
};

export type SendAdminCredentialEmailInput = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  textBody: string;
};

export type SendAdminCredentialEmailResult = {
  messageId: string;
};

function buildReplyToAddress(threadMongoId: string): string | null {
  const domain = process.env.BREVO_INBOUND_DOMAIN?.trim();
  if (!domain) return null;
  const local = process.env.BREVO_INBOUND_LOCAL_PREFIX?.trim() || 'farely';
  return `${local}+${threadMongoId}@${domain}`;
}

export function buildSupportReplyToAddress(threadMongoId: string): string | null {
  return buildReplyToAddress(threadMongoId);
}

export async function sendSupportReplyEmail(input: SendSupportReplyInput): Promise<SendSupportReplyResult | null> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  if (!apiKey || !senderEmail) {
    // eslint-disable-next-line no-console
    console.warn('[brevo] BREVO_API_KEY or BREVO_SENDER_EMAIL missing — support reply not emailed.');
    return null;
  }

  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Farely Support';
  const replyTo = buildReplyToAddress(input.threadMongoId);

  const headers: Record<string, string> = {
    'X-Farely-Thread-Id': input.threadMongoId,
  };
  if (input.inReplyTo) {
    const normalized = input.inReplyTo.includes('<') ? input.inReplyTo : `<${input.inReplyTo}>`;
    headers['In-Reply-To'] = normalized;
    headers.References = normalized;
  }

  const body: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: input.toEmail, name: input.toName || undefined }],
    subject: input.subject,
    textContent: input.textBody,
    tags: [`farely_thread_${input.threadMongoId}`, 'farely_support_reply'],
    headers,
  };

  if (replyTo) {
    body.replyTo = { email: replyTo, name: senderName };
  }

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error('[brevo] send failed', res.status, json);
    throw new Error(json?.message || `Brevo send failed (${res.status})`);
  }
  const messageId = json.messageId ? String(json.messageId) : '';
  if (!messageId) {
    // eslint-disable-next-line no-console
    console.warn('[brevo] response missing messageId', json);
    return null;
  }
  return { messageId };
}

export async function sendAdminCredentialEmail(
  input: SendAdminCredentialEmailInput
): Promise<SendAdminCredentialEmailResult | null> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  if (!apiKey || !senderEmail) {
    // eslint-disable-next-line no-console
    console.warn('[brevo] BREVO_API_KEY or BREVO_SENDER_EMAIL missing — admin credential email not sent.');
    return null;
  }

  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Farely';
  const body: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: input.toEmail, name: input.toName || undefined }],
    subject: input.subject,
    textContent: input.textBody,
    tags: ['farely_admin_credentials'],
  };

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error('[brevo] admin credential send failed', res.status, json);
    return null;
  }
  const messageId = json.messageId ? String(json.messageId) : '';
  if (!messageId) return null;
  return { messageId };
}
