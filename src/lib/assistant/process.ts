/**
 * Un mensaje de alguien del equipo al número del espacio (docs/ASSISTANT.md): se le reconoce por su teléfono, se actúa
 * con sus permisos (como en Correos al CRM) y se le contesta por el mismo WhatsApp. Lo de los demás números sigue el
 * camino de los leads (inbound.ts).
 */
import type { EditReader } from './edits';
import type { AdminContext } from '../admin/auth';
import { cleanupContext } from '../crm/research-context';
import { env } from '../env';
import { claudeDrafter, fixtureDrafter, type Drafter } from './draft';
import type { Inbound, WhatsApp } from '../leads/whatsapp';
import type { AssistantDb, Member } from './db';
import { handle, type AssistantOps, type Incoming, type Reply } from './flow';
import type { Transcriber } from './transcribe';
import { shotText, type ScreenshotReader } from './screenshot';
import { placeIn, searchPlaces } from './places';
import { isPlaceKey, pathForKey } from '../accounts/spain';
import { assistantMessages } from './messages';
import { withUsageScope } from '../usage/meter';

export interface AssistantDeps {
  db: AssistantDb;
  wa: WhatsApp | null;
  transcribe: Transcriber | null;
  /** Lee capturas de conversaciones (Claude). */
  screenshot?: ScreenshotReader | null;
  /** Entiende los arreglos de fichas (edits.ts). */
  edits?: EditReader | null;
  actAs: (tenantId: string, userId: string) => Promise<AdminContext | null>;
  now: Date;
}
export const digitsOf = (phone: string) => phone.replace(/\D/g, '');

/** ¿Es del equipo de este espacio? (el número que recibe dice el espacio). */
export async function teamMember(db: AssistantDb, tenantId: string, from: string): Promise<Member | null> {
  const d = digitsOf(from);
  if (d.length < 9) return null;
  return (await db.membersByPhone(d)).find((m) => m.tenantId === tenantId) ?? null;
}

export function drafterFromEnv(): Drafter | null {
  if (env('AI_RESEARCH_FIXTURE') === '1') return fixtureDrafter;
  const k = env('ANTHROPIC_API_KEY');
  return k ? claudeDrafter(k) : null;
}
/** Mañana a las 10:00 (como los próximos pasos de la regla). */
const tomorrow = (now: Date) => { const d = new Date(now.getTime() + 86_400_000); return `${d.toISOString().slice(0, 10)}T10:00:00`; };

export function opsFor(admin: AdminContext, o: { drafter?: Drafter | null; locale?: string; now?: Date; editor?: EditReader | null } = {}): AssistantOps {
  let ctx: Awaited<ReturnType<typeof cleanupContext>> | null = null;
  const context = async () => (ctx ??= await cleanupContext(admin).catch(() => ({ seller: '', clients: [], sectors: {} })));
  const drafter = o.drafter === undefined ? drafterFromEnv() : o.drafter;
  return {
    async split(text) { return admin.crm.notesSplit(text, await context()); },
    search: (q) => admin.crm.accountSearch(q),
    // La ciudad de las empresas nuevas (places.ts) → su zona, creándola si falta (como el buscador de ciudades del CRM).
    async apply(rows) {
      const out = [];
      // La hora del próximo paso, en su zona horaria (la de su resumen de la mañana).
      const tz = (await admin.notifications.dailyPref().catch(() => null))?.timezone ?? 'Europe/Madrid';
      for (const r of rows as Array<Record<string, unknown>>) {
        const { place, ...row } = r;
        let zoneId: string | null = null;
        if (typeof place === 'string' && place) {
          try {
            const path = isPlaceKey(place) ? pathForKey(place) : null;
            zoneId = path ? await admin.accounts.ensurePath(path) : await admin.crm.pickZone(place);
          } catch (e) { console.warn('[assistant] ciudad', e instanceof Error ? e.message : e); }
        }
        out.push({ ...row, tz, ...(zoneId ? { zoneId } : {}) });
      }
      return admin.crm.notesApply(out);
    },
    async edit(accountId, e) {
      // Arreglar una ficha: solo lo que pide (nombre, ciudad, tipo, descartar o recuperar, con quién trabaja, una nota).
      const a = (await admin.accounts.get(accountId)).account;
      if (e.name || e.place) {
        let zoneId = a.zoneId;
        if (e.place) {
          const path = isPlaceKey(e.place.v) ? pathForKey(e.place.v) : null;
          zoneId = path ? await admin.accounts.ensurePath(path) : await admin.crm.pickZone(e.place.v);
        }
        await admin.accounts.update(accountId, { name: e.name ?? a.name, zoneId, segmentId: a.segmentId, address: a.address, externalRef: a.externalRef, notes: a.notes });
      }
      if (e.kind) await admin.crm.classifyAccount(accountId, { kind: e.kind });
      if (e.discard) await admin.crm.classifyAccount(accountId, { reason: e.discard.reason, note: e.discard.note ?? null });
      else if (e.restore) await admin.crm.classifyAccount(accountId, { reason: null });
      if (e.linkTo) await admin.crm.workLinkAdd(accountId, e.linkTo.id ? { otherId: e.linkTo.id } : { name: e.linkTo.name });
      if (e.note) await admin.crm.logActivity(accountId, { channel: 'other', outcome: 'note', note: e.note });
      const b = (await admin.accounts.get(accountId)).account;
      return { name: b.name, zone: b.zonePath ?? '' };
    },
    // Sin lector de IA (sin clave): no hay «understand» y se usan las frases fijas («Corrige X: …»).
    ...(o.editor ? { async understand(text: string) {
      const kinds = (await admin.accounts.kinds().catch(() => [])).map((k) => ({ key: k.key, label: k.label }));
      return o.editor!(text, { kinds, today: (o.now ?? new Date()).toISOString().slice(0, 10) });
    } } : {}),
    async kindLabel(key) { return (await admin.accounts.kinds().catch(() => [])).find((k) => k.key === key)?.label ?? key; },
    async placeIn(text) { return placeIn(text, (await admin.accounts.territory()).zones); },
    async places(q) {
      const zones = (await admin.accounts.territory()).zones;
      const own = searchPlaces(q, zones);
      if (own.length) return own;
      // Fuera del catálogo (otro país, un pueblo): Google, como el buscador de ciudades.
      const g = await admin.crm.citySearch(q).catch(() => []);
      return g.slice(0, 5).map((x) => ({ v: x.v, label: [x.n, x.p].filter(Boolean).join(' · ') }));
    },
    async draft(item) {
      if (!drafter) throw new Error('sin IA');
      const c = await context();
      const text = await drafter(item, { seller: c.seller, signer: admin.session.displayName || admin.session.email, locale: o.locale ?? 'es' });
      if (!text) throw new Error('sin propuesta');
      return text;
    },
    // «Hecho»: le ha escrito (por WhatsApp) y está esperando respuesta; la regla propone lo siguiente.
    async done(accountId) {
      const { account } = await admin.accounts.get(accountId);
      const next = await admin.crm.logActivity(accountId, { channel: 'whatsapp', outcome: 'no_reply', note: 'Mensaje de seguimiento (recordatorio del asistente de WhatsApp)' });
      return { name: account.name, nextAt: next?.at ? new Date(next.at).toISOString() : null };
    },
    async later(accountId) {
      const { account } = await admin.accounts.get(accountId);
      await admin.crm.setNextStep(accountId, { step: account.nextStep ?? undefined, at: tomorrow(o.now ?? new Date()), contactId: account.nextContactId ?? null, channel: account.nextChannel ?? null });
      return { name: account.name };
    },
  };
}

async function send(wa: WhatsApp, phoneId: string, to: string, r: Reply) {
  if (r.buttons?.length && wa.sendButtons) await wa.sendButtons(phoneId, to, r.text, r.buttons);
  else if (wa.sendText) await wa.sendText(phoneId, to, r.text);
}

export type AssistantResult = 'handled' | 'duplicate' | 'not_member';
export function processAssistant(d: AssistantDeps, phoneId: string, member: Member, m: Inbound): Promise<AssistantResult> {
  // Lo que cueste (audio, IA) es de su espacio y de quien escribe (docs/COSTES.md).
  return withUsageScope({ tenantId: member.tenantId, userId: member.userId }, () => processInScope(d, phoneId, member, m));
}
async function processInScope(d: AssistantDeps, phoneId: string, member: Member, m: Inbound): Promise<AssistantResult> {
  const { tenantId, userId } = member;
  const first = await d.db.get(tenantId, userId);
  if (m.id && first.seen.includes(m.id)) return 'duplicate';
  const admin = await d.actAs(tenantId, userId);
  if (!admin) return 'not_member';
  const locale = (await d.db.userLocale(userId).catch(() => null)) ?? 'es';
  const T0 = assistantMessages[locale as keyof typeof assistantMessages] ?? assistantMessages.es;
  // Respuesta inmediata (criterio de Cristian): «escribiendo…» nada más llegar, para que se sepa que está en ello y no
  // escriba más mientras; y con audios o capturas, que tardan, un aviso antes de ponerse.
  const typing = () => (m.id && d.wa?.typing ? d.wa.typing(phoneId, m.id).catch(() => undefined) : Promise.resolve());
  await typing();
  const slow = (m.kind === 'audio' && d.transcribe) || (m.kind === 'image' && d.screenshot);
  if (slow && d.wa?.sendText && m.mediaId) {
    await d.wa.sendText(phoneId, m.from, m.kind === 'audio' ? T0.listening : T0.reading).catch(() => undefined);
    await typing();
  }
  let incoming: Incoming;
  if (m.kind === 'button' && m.buttonId) incoming = { kind: 'button', id: m.buttonId };
  else if (m.kind === 'audio') {
    let text: string | null = null;
    if (d.transcribe && m.mediaId && d.wa?.media) {
      try { text = (await d.transcribe(await d.wa.media(m.mediaId), locale)) || null; } catch (e) { console.warn('[assistant] audio', e instanceof Error ? e.message : e); }
    }
    incoming = { kind: 'audio', text };
  } else if (m.kind === 'image') {
    // Captura de una conversación: la conversación literal (quién dijo qué) y el nombre de arriba.
    let shot: Awaited<ReturnType<ScreenshotReader>> = null;
    if (d.screenshot && m.mediaId && d.wa?.media) {
      try { shot = await d.screenshot(await d.wa.media(m.mediaId)); } catch (e) { console.warn('[assistant] captura', e instanceof Error ? e.message : e); }
    }
    const T = assistantMessages[locale as keyof typeof assistantMessages] ?? assistantMessages.es;
    const caption = m.text && !/^\[image\]$/.test(m.text) ? m.text.trim() : '';
    incoming = shot?.isChat
      ? { kind: 'image', lines: shotText(shot, { us: T.shotUs, them: T.shotThem }), contact: shot.contact, caption, channel: shot.channel, ready: !!d.screenshot }
      : { kind: 'image', lines: null, contact: '', caption, channel: 'other', ready: !!d.screenshot };
  } else if (m.kind === 'contact') incoming = { kind: 'contact', text: m.text };
  else if (m.kind === 'other') incoming = { kind: 'other' };
  else incoming = { kind: 'text', text: m.text, forwarded: !!m.forwarded };

  const ops = opsFor(admin, { locale, now: d.now, editor: d.edits ?? null });
  // Varios reenviados llegan a la vez: si otro mensaje cambió el estado entre medias, se vuelve a leer (sin efectos aún).
  let conv = first;
  let r = await handle({ ops, now: d.now, locale }, incoming, conv.state);
  for (let i = 0; i < 3; i++) {
    if (await d.db.save(tenantId, userId, { state: r.state, seen: [...conv.seen, m.id].filter(Boolean), version: conv.version }, conv.version)) break;
    conv = await d.db.get(tenantId, userId);
    if (m.id && conv.seen.includes(m.id)) return 'duplicate';
    if (incoming.kind === 'text' && incoming.forwarded) r = await handle({ ops, now: d.now, locale }, incoming, conv.state);
  }
  if (d.wa) {
    for (const reply of r.replies) {
      try { await send(d.wa, phoneId, m.from, reply); } catch (e) { console.error('[assistant] responder', e instanceof Error ? e.message : e); }
    }
  }
  return 'handled';
}
