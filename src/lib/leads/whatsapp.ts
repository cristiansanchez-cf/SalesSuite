/**
 * WhatsApp Cloud API de Meta (docs/LEADS.md §WhatsApp). Solo plantillas aprobadas (el primer mensaje de la empresa lo
 * exige) y la recepción de respuestas por webhook para parar la secuencia. Apagado mientras falten WHATSAPP_TOKEN y el
 * número en los ajustes del espacio. Nada de IA conversando: los textos son fijos y firmados.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { meterUnits } from '../usage/meter';

// v25.0: vigente hasta julio de 2028 (la v21.0 deja de funcionar el 21/01/2027).
const GRAPH = 'https://graph.facebook.com/v25.0';
/** El código de idioma de las plantillas en Meta. */
export const META_LANG: Record<string, string> = { es: 'es_ES', en: 'en', fr: 'fr' };
const LANG = META_LANG;

export interface WhatsApp {
  sendTemplate(phoneId: string, to: string, template: string, locale: string, params: string[]): Promise<{ id: string | null }>;
  /** Texto libre (solo dentro de las 24 h desde su último mensaje): lo usa el asistente (docs/ASSISTANT.md). */
  sendText?(phoneId: string, to: string, text: string): Promise<{ id: string | null }>;
  /** Texto con hasta 3 botones de respuesta. */
  sendButtons?(phoneId: string, to: string, text: string, buttons: Array<{ id: string; title: string }>): Promise<{ id: string | null }>;
  /** Texto con una lista desplegable de hasta 10 opciones (cuando no caben en 3 botones). */
  sendList?(phoneId: string, to: string, text: string, button: string, rows: Array<{ id: string; title: string }>): Promise<{ id: string | null }>;
  /** Marca su mensaje como leído y enseña «escribiendo…» (hasta 25 s o hasta que respondamos). */
  typing?(phoneId: string, messageId: string): Promise<void>;
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
    // Las respuestas dentro de las 24 horas no se cobran: se apuntan (a 0) para ver el volumen.
    await meterUnits('whatsapp.reply', 'meta', 1, { costUsd: 0 });
    return { id: body?.messages?.[0]?.id ?? null };
  };
  return {
    sendText: (phoneId, to, text) => post(phoneId, { to: to.replace(/^\+/, ''), type: 'text', text: { body: text.slice(0, 4096), preview_url: false } }),
    sendButtons: (phoneId, to, text, buttons) => post(phoneId, {
      to: to.replace(/^\+/, ''), type: 'interactive',
      interactive: { type: 'button', body: { text: text.slice(0, 1024) }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) } },
    }),
    sendList: (phoneId, to, text, button, rows) => post(phoneId, {
      to: to.replace(/^\+/, ''), type: 'interactive',
      interactive: { type: 'list', body: { text: text.slice(0, 1024) }, action: { button: button.slice(0, 20), sections: [{ rows: rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24) })) }] } },
    }),
    async typing(phoneId, messageId) {
      // Sin coste ni registro: solo el aviso de que está pasando algo (docs/ASSISTANT.md §Respuesta inmediata).
      await fetchImpl(`${GRAPH}/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }),
      }).catch(() => null);
    },
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
      const send = (code: string) => fetchImpl(`${GRAPH}/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'template',
          template: { name: template, language: { code }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
        }),
      });
      type Body = { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
      const code = LANG[locale] ?? 'en';
      let res = await send(code);
      let body = (await res.json().catch(() => null)) as Body;
      // 132001 «no existe en ese idioma»: en Meta «Español» (es) y «Español (España)» (es_ES) son idiomas distintos.
      // Si se dio de alta con el otro, se prueba ese (es_ES → es; es → es_ES).
      if (!res.ok && body?.error?.code === 132001) {
        const other = code.includes('_') ? code.split('_')[0]! : Object.values(LANG).find((c) => c.startsWith(`${code}_`));
        if (other && other !== code) { res = await send(other); body = (await res.json().catch(() => null)) as Body; }
      }
      if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${body?.error?.message ?? ''} (${body?.error?.code ?? ''})`.slice(0, 300));
      // Nuestras plantillas son Utility (las de los leads y el recordatorio al equipo).
      await meterUnits('whatsapp.template', 'meta', 1, { model: 'utility' });
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
  async sendList(_p, to, text, _b, rows) { demoWhatsAppOutbox().push({ to, template: '', locale: '', params: [], text, buttons: rows.map((r) => r.id) }); return { id: `demo-${Date.now()}` }; },
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
  kind?: 'text' | 'audio' | 'button' | 'image' | 'contact' | 'other'; forwarded?: boolean; mediaId?: string | null; buttonId?: string | null;
}
/**
 * La tarjeta de contacto que se comparte en WhatsApp, en texto para la IA: «Contacto compartido: Jorge Pérez · Teléfono:
 * +34 600… · Email: … · Empresa: … · Cargo: …» (una línea por contacto). Vacío si no trae nada útil.
 */
export function contactCard(raw: unknown): string {
  const list = Array.isArray(raw) ? raw.slice(0, 5) : [];
  return list.map((c) => {
    const x = (c ?? {}) as { name?: { formatted_name?: string; first_name?: string; last_name?: string }; phones?: Array<{ phone?: string; wa_id?: string }>; emails?: Array<{ email?: string }>; org?: { company?: string; title?: string } };
    const clean = (v: unknown, n = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
    const name = clean(x.name?.formatted_name) || [clean(x.name?.first_name), clean(x.name?.last_name)].filter(Boolean).join(' ');
    const phones = (x.phones ?? []).map((p) => clean(p.phone, 40) || (p.wa_id ? `+${clean(p.wa_id, 20)}` : '')).filter(Boolean).slice(0, 3);
    const emails = (x.emails ?? []).map((e) => clean(e.email, 120)).filter(Boolean).slice(0, 2);
    const parts = [name, phones.length ? `Teléfono: ${phones.join(', ')}` : '', emails.length ? `Email: ${emails.join(', ')}` : '',
      clean(x.org?.company) ? `Empresa: ${clean(x.org?.company)}` : '', clean(x.org?.title) ? `Cargo: ${clean(x.org?.title)}` : ''].filter(Boolean);
    return name || phones.length ? `Contacto compartido: ${parts.join(' · ')}` : '';
  }).filter(Boolean).join('\n');
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
        const inter = m.interactive as { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } } | undefined;
        const image = m.image as { id?: string; caption?: string } | undefined;
        const text = (m.text as { body?: string } | undefined)?.body ?? (m.button as { text?: string } | undefined)?.text ?? image?.caption
          ?? inter?.button_reply?.title ?? inter?.list_reply?.title ?? `[${String(m.type ?? 'mensaje')}]`;
        const type = String(m.type ?? '');
        const ctx = (m.context ?? {}) as { forwarded?: boolean; frequently_forwarded?: boolean };
        // Botón de un mensaje interactivo (su id) o de respuesta rápida de una plantilla (su payload, que es su texto).
        const tplButton = (m.button as { payload?: string; text?: string } | undefined);
        const buttonId = inter?.button_reply?.id ?? inter?.list_reply?.id ?? (tplButton ? tplButton.payload || tplButton.text || null : null);
        // Tarjeta de contacto compartida (para el asistente: «este es Jorge, el encargado de…»).
        const card = type === 'contacts' ? contactCard(m.contacts) : '';
        const kind = type === 'text' ? 'text' : type === 'audio' ? 'audio' : type === 'image' && image?.id ? 'image' : (type === 'interactive' || type === 'button') && buttonId ? 'button' : card ? 'contact' : 'other';
        inbound.push({ phoneId, from: `+${String(m.from ?? '').replace(/^\+/, '')}`, text: (card || String(text)).slice(0, kind === 'text' ? 12000 : 2000), at: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()), id: String(m.id ?? ''),
          kind, forwarded: !!(ctx.forwarded || ctx.frequently_forwarded), mediaId: (m.audio as { id?: string } | undefined)?.id ?? image?.id ?? null, buttonId });
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
