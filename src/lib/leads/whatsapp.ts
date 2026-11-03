/**
 * WhatsApp Cloud API de Meta (docs/LEADS.md §WhatsApp). Solo plantillas aprobadas (el primer mensaje de la empresa lo
 * exige) y la recepción de respuestas por webhook para parar la secuencia. Apagado mientras falten WHATSAPP_TOKEN y el
 * número en los ajustes del espacio. Nada de IA conversando: los textos son fijos y firmados.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

// v25.0: vigente hasta julio de 2028 (la v21.0 deja de funcionar el 21/01/2027).
const GRAPH = 'https://graph.facebook.com/v25.0';
const LANG: Record<string, string> = { es: 'es_ES', en: 'en', fr: 'fr' };

export interface WhatsApp {
  sendTemplate(phoneId: string, to: string, template: string, locale: string, params: string[]): Promise<{ id: string | null }>;
  /** Texto libre (solo dentro de las 24 h desde su último mensaje): lo usa el asistente (docs/ASSISTANT.md). */
  sendText?(phoneId: string, to: string, text: string): Promise<{ id: string | null }>;
  /** Texto con hasta 3 botones de respuesta. */
  sendButtons?(phoneId: string, to: string, text: string, buttons: Array<{ id: string; title: string }>): Promise<{ id: string | null }>;
  /** Un archivo recibido (audio): los bytes y su tipo. */
  media?(mediaId: string): Promise<{ bytes: Uint8Array; type: string }>;
}

export function cloudWhatsApp(token: string, fetchImpl: typeof fetch = fetch): WhatsApp {
  const post = async (phoneId: string, payload: Record<string, unknown>) => {
    const res = await fetchImpl(`${GRAPH}/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const body = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${body?.error?.message ?? ''} (${body?.error?.code ?? ''})`.slice(0, 300));
    return { id: body?.messages?.[0]?.id ?? null };
  };
  return {
    sendText: (phoneId, to, text) => post(phoneId, { to: to.replace(/^\+/, ''), type: 'text', text: { body: text.slice(0, 4096), preview_url: false } }),
    sendButtons: (phoneId, to, text, buttons) => post(phoneId, {
      to: to.replace(/^\+/, ''), type: 'interactive',
      interactive: { type: 'button', body: { text: text.slice(0, 1024) }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) } },
    }),
    async media(mediaId) {
      const meta = await fetchImpl(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const m = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number } | null;
      if (!meta.ok || !m?.url) throw new Error(`WhatsApp media ${meta.status}`);
      if ((m.file_size ?? 0) > 25 * 1024 * 1024) throw new Error('WhatsApp media: demasiado grande');
      const f = await fetchImpl(m.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!f.ok) throw new Error(`WhatsApp media ${f.status}`);
      return { bytes: new Uint8Array(await f.arrayBuffer()), type: m.mime_type ?? f.headers.get('content-type') ?? 'audio/ogg' };
    },
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
export interface DemoOut { to: string; template: string; locale: string; params: string[]; text?: string; buttons?: string[] }
type G = typeof globalThis & { [OUTBOX]?: DemoOut[] };
export function demoWhatsAppOutbox() { return ((globalThis as G)[OUTBOX] ??= []); }
export const demoWhatsApp: WhatsApp = {
  async sendTemplate(_p, to, template, locale, params) { demoWhatsAppOutbox().push({ to, template, locale, params }); return { id: `demo-${Date.now()}` }; },
  async sendText(_p, to, text) { demoWhatsAppOutbox().push({ to, template: '', locale: '', params: [], text }); return { id: `demo-${Date.now()}` }; },
  async sendButtons(_p, to, text, buttons) { demoWhatsAppOutbox().push({ to, template: '', locale: '', params: [], text, buttons: buttons.map((b) => b.id) }); return { id: `demo-${Date.now()}` }; },
  async media() { return { bytes: new Uint8Array([1, 2, 3]), type: 'audio/ogg' }; },
};

/** Firma de Meta (X-Hub-Signature-256: sha256=<hmac del cuerpo con el App Secret>). */
export function validSignature(raw: string, header: string | null, appSecret: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header ?? '');
  if (!m) return false;
  const want = createHmac('sha256', appSecret).update(raw).digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface Inbound {
  phoneId: string; from: string; text: string; at: Date; id: string;
  /** Para el asistente: qué es (texto, audio, botón u otra cosa), si es reenviado, el audio y el botón pulsado. */
  kind?: 'text' | 'audio' | 'button' | 'other'; forwarded?: boolean; mediaId?: string | null; buttonId?: string | null;
}
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
        const type = String(m.type ?? '');
        const ctx = (m.context ?? {}) as { forwarded?: boolean; frequently_forwarded?: boolean };
        const buttonId = (m.interactive as { button_reply?: { id?: string } } | undefined)?.button_reply?.id ?? null;
        const kind = type === 'text' ? 'text' : type === 'audio' ? 'audio' : type === 'interactive' && buttonId ? 'button' : type === 'button' ? 'text' : 'other';
        inbound.push({ phoneId, from: `+${String(m.from ?? '').replace(/^\+/, '')}`, text: String(text).slice(0, kind === 'text' ? 12000 : 2000), at: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()), id: String(m.id ?? ''),
          kind, forwarded: !!(ctx.forwarded || ctx.frequently_forwarded), mediaId: (m.audio as { id?: string } | undefined)?.id ?? null, buttonId });
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
