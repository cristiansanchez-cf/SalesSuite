/**
 * WhatsApp Cloud API de Meta (docs/LEADS.md §WhatsApp). Solo plantillas aprobadas (el primer mensaje de la empresa lo
 * exige) y la recepción de respuestas por webhook para parar la secuencia. Apagado mientras falten WHATSAPP_TOKEN y el
 * número en los ajustes del espacio. Nada de IA conversando: los textos son fijos y firmados.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';
const LANG: Record<string, string> = { es: 'es_ES', en: 'en', fr: 'fr' };

export interface WhatsApp {
  sendTemplate(phoneId: string, to: string, template: string, locale: string, params: string[]): Promise<{ id: string | null }>;
}

export function cloudWhatsApp(token: string, fetchImpl: typeof fetch = fetch): WhatsApp {
  return {
    async sendTemplate(phoneId, to, template, locale, params) {
      const res = await fetchImpl(`${GRAPH}/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'template',
          template: { name: template, language: { code: LANG[locale] ?? 'en' }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
        }),
      });
      const body = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
      if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${body?.error?.message ?? ''} (${body?.error?.code ?? ''})`.slice(0, 300));
      return { id: body?.messages?.[0]?.id ?? null };
    },
  };
}

const OUTBOX = Symbol.for('salessuite.demoWhatsApp');
type G = typeof globalThis & { [OUTBOX]?: { to: string; template: string; locale: string; params: string[] }[] };
export function demoWhatsAppOutbox() { return ((globalThis as G)[OUTBOX] ??= []); }
export const demoWhatsApp: WhatsApp = { async sendTemplate(_p, to, template, locale, params) { demoWhatsAppOutbox().push({ to, template, locale, params }); return { id: `demo-${Date.now()}` }; } };

/** Firma de Meta (X-Hub-Signature-256: sha256=<hmac del cuerpo con el App Secret>). */
export function validSignature(raw: string, header: string | null, appSecret: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header ?? '');
  if (!m) return false;
  const want = createHmac('sha256', appSecret).update(raw).digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface Inbound { phoneId: string; from: string; text: string; at: Date; id: string }
export interface StatusUpdate { phoneId: string; id: string; status: string; error: string | null }

/** Lo que interesa del webhook: mensajes recibidos (para parar la secuencia) y fallos de entrega. */
export function parseWebhook(body: unknown): { inbound: Inbound[]; statuses: StatusUpdate[] } {
  const inbound: Inbound[] = [];
  const statuses: StatusUpdate[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry ?? [];
  for (const e of entries as { changes?: { value?: Record<string, unknown> }[] }[]) {
    for (const ch of e.changes ?? []) {
      const v = ch.value ?? {};
      const phoneId = String((v.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? '');
      for (const m of (v.messages as Record<string, unknown>[] | undefined) ?? []) {
        const text = (m.text as { body?: string } | undefined)?.body ?? (m.button as { text?: string } | undefined)?.text
          ?? (m.interactive as { button_reply?: { title?: string } } | undefined)?.button_reply?.title ?? `[${String(m.type ?? 'mensaje')}]`;
        inbound.push({ phoneId, from: `+${String(m.from ?? '').replace(/^\+/, '')}`, text: String(text).slice(0, 2000), at: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()), id: String(m.id ?? '') });
      }
      for (const st of (v.statuses as Record<string, unknown>[] | undefined) ?? []) {
        const err = (st.errors as { title?: string; message?: string }[] | undefined)?.[0];
        statuses.push({ phoneId, id: String(st.id ?? ''), status: String(st.status ?? ''), error: err ? String(err.message ?? err.title ?? '').slice(0, 300) : null });
      }
    }
  }
  return { inbound, statuses };
}

/** «Baja», «stop», «no me escribas»…: se para todo y no se le vuelve a escribir por WhatsApp. */
export const isStopWord = (text: string) => /^\s*(stop|baja|para|parar|no me escribas|no escribir|unsubscribe|arr[eê]te|stop please|d[ée]sabonner)\b/i.test(text.trim());
