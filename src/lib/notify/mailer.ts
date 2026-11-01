/**
 * Envío de emails con Resend (https://resend.com/docs/api-reference/emails/send-email).
 * RESEND_API_KEY y RESEND_FROM viven solo en el servidor. En demo, los emails se guardan en memoria.
 */
export interface Email {
  to: string; subject: string; html: string; text: string; tag: string;
  /** Remitente de este envío (si no, RESEND_FROM). Leads: el de cada empresa, con su dominio verificado. */
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}
export interface SentEmail { id: string | null }
export interface Mailer { send(e: Email): Promise<SentEmail | void> }

export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send(e) {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: e.from ?? from, to: [e.to], subject: e.subject, html: e.html, text: e.text, tags: [{ name: 'kind', value: e.tag }],
          ...(e.replyTo ? { reply_to: e.replyTo } : {}), ...(e.headers ? { headers: e.headers } : {}) }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const out = (await res.json().catch(() => null)) as { id?: string } | null;
      return { id: out?.id ?? null };
    },
  };
}

const OUTBOX = Symbol.for('salessuite.demoOutbox');
type G = typeof globalThis & { [OUTBOX]?: Email[] };
/** Demo: no sale nada; se puede consultar lo que se habría enviado. */
export function demoOutbox(): Email[] { return ((globalThis as G)[OUTBOX] ??= []); }
export const demoMailer: Mailer = { async send(e) { demoOutbox().push(e); } };
