/**
 * Un mensaje de alguien del equipo al número del espacio (docs/ASSISTANT.md): se le reconoce por su teléfono, se actúa
 * con sus permisos (como en Correos al CRM) y se le contesta por el mismo WhatsApp. Lo de los demás números sigue el
 * camino de los leads (inbound.ts).
 */
import type { AdminContext } from '../admin/auth';
import { cleanupContext } from '../crm/research-context';
import type { Inbound, WhatsApp } from '../leads/whatsapp';
import type { AssistantDb, Member } from './db';
import { handle, type AssistantOps, type Incoming, type Reply } from './flow';
import type { Transcriber } from './transcribe';

export interface AssistantDeps {
  db: AssistantDb;
  wa: WhatsApp | null;
  transcribe: Transcriber | null;
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

export function opsFor(admin: AdminContext): AssistantOps {
  let ctx: Awaited<ReturnType<typeof cleanupContext>> | null = null;
  return {
    async split(text) { ctx ??= await cleanupContext(admin).catch(() => ({ seller: '', clients: [], sectors: {} })); return admin.crm.notesSplit(text, ctx); },
    search: (q) => admin.crm.accountSearch(q),
    apply: (rows) => admin.crm.notesApply(rows),
  };
}

async function send(wa: WhatsApp, phoneId: string, to: string, r: Reply) {
  if (r.buttons?.length && wa.sendButtons) await wa.sendButtons(phoneId, to, r.text, r.buttons);
  else if (wa.sendText) await wa.sendText(phoneId, to, r.text);
}

export type AssistantResult = 'handled' | 'duplicate' | 'not_member';
export async function processAssistant(d: AssistantDeps, phoneId: string, member: Member, m: Inbound): Promise<AssistantResult> {
  const { tenantId, userId } = member;
  const first = await d.db.get(tenantId, userId);
  if (m.id && first.seen.includes(m.id)) return 'duplicate';
  const admin = await d.actAs(tenantId, userId);
  if (!admin) return 'not_member';
  const locale = (await d.db.userLocale(userId).catch(() => null)) ?? 'es';
  let incoming: Incoming;
  if (m.kind === 'button' && m.buttonId) incoming = { kind: 'button', id: m.buttonId };
  else if (m.kind === 'audio') {
    let text: string | null = null;
    if (d.transcribe && m.mediaId && d.wa?.media) {
      try { text = (await d.transcribe(await d.wa.media(m.mediaId), locale)) || null; } catch (e) { console.warn('[assistant] audio', e instanceof Error ? e.message : e); }
    }
    incoming = { kind: 'audio', text };
  } else if (m.kind === 'other') incoming = { kind: 'other' };
  else incoming = { kind: 'text', text: m.text, forwarded: !!m.forwarded };

  const ops = opsFor(admin);
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
