/**
 * Correos al CRM (docs/CRM_DINAMICO.md §47): lo que hace el servidor con cada correo que llega a «apuntar-<token>@…».
 * 1. De quién es la dirección (si no existe, se ignora sin decir nada).
 * 2. Se lee el correo: reenviado o en copia, quién está al otro lado y lo nuevo del texto (parse.ts).
 * 3. Como esa persona (sus permisos): a qué empresa va (la persona del CRM con ese email, la empresa con ese email o la
 *    única de ese dominio; si es un lead de la web ya validado, su empresa). Si la encuentra, lo apunta como interacción
 *    por email («contestó» si lo escribió el otro, «sin respuesta» si lo mandó la persona) y el CRM propone el siguiente
 *    paso como siempre. Si no, queda en su lista «Sin empresa» para asignarlo.
 * 4. Si es un lead de la web: se apunta en su historial; si contestó, se para la secuencia automática.
 */
import type { AdminContext } from '../admin/auth';
import type { LeadsDb } from '../leads/db';
import type { InboxServerDb, InboundStatus } from './db';
import { domainOf, isFreeDomain, noteOf, readEmail, tokenFrom, type Incoming } from './parse';
import { withUsageScope } from '../usage/meter';

/** Lo que manda Resend en el webhook (email.received): solo los datos de cabecera. */
export interface ReceivedEvent { email_id: string; created_at: string; from: string; to: string[]; cc?: string[]; bcc?: string[]; received_for?: string[]; message_id: string; subject: string }
export interface FullEmail extends Incoming { messageId: string }

export interface ProcessDeps {
  db: InboxServerDb;
  /** El cuerpo del correo (Resend no lo manda en el webhook). */
  fetchEmail: (id: string) => Promise<FullEmail | null>;
  /** El contexto de esa persona en ese espacio (sus permisos), o null si ya no es del equipo. */
  actAs: (tenantId: string, userId: string) => Promise<AdminContext | null>;
  leads: LeadsDb | null;
  /** Dominio de las direcciones de apuntar (INBOUND_EMAIL_DOMAIN). */
  inboxDomain: string | null;
  now: Date;
}
export type ProcessResult = { status: 'unknown_address' | 'duplicate' | InboundStatus; accountId?: string | null; detail?: string };

export async function processReceived(d: ProcessDeps, ev: ReceivedEvent): Promise<ProcessResult> {
  const token = tokenFrom([...(ev.received_for ?? []), ...ev.to, ...(ev.cc ?? []), ...(ev.bcc ?? [])], d.inboxDomain);
  const addr = token ? await d.db.address(token) : null;
  if (!addr) return { status: 'unknown_address' };
  // Lo que cueste (la IA que lo apunta) es de su espacio y de quien lo reenvía (docs/COSTES.md).
  return withUsageScope({ tenantId: addr.tenantId, userId: addr.userId }, () => processFor(d, ev, addr.tenantId, addr.userId));
}
async function processFor(d: ProcessDeps, ev: ReceivedEvent, tenantId: string, userId: string): Promise<ProcessResult> {
  const messageId = (ev.message_id || ev.email_id).slice(0, 500);
  if (await d.db.seen(tenantId, userId, messageId)) return { status: 'duplicate' };

  const base = { tenantId, userId, providerId: ev.email_id, messageId, receivedAt: ev.created_at || d.now.toISOString(), fromAddr: ev.from?.slice(0, 320) ?? null,
    accountId: null as string | null, activityId: null as string | null };
  const save = async (status: InboundStatus, x: { counterpart?: string | null; subject?: string | null; snippet?: string | null; direction?: 'in' | 'out'; detail?: string | null; accountId?: string | null; receivedAt?: string }) => {
    await d.db.record({ ...base, counterpart: x.counterpart ?? null, subject: x.subject ?? ev.subject ?? null, snippet: x.snippet ?? null, direction: x.direction ?? 'in',
      status, detail: x.detail ?? null, accountId: x.accountId ?? null, receivedAt: x.receivedAt ?? base.receivedAt });
    return { status, accountId: x.accountId ?? null, detail: x.detail ?? undefined };
  };

  const full = await d.fetchEmail(ev.email_id);
  if (!full) return save('error', { detail: 'No se pudo leer el correo' });
  const admin = await d.actAs(tenantId, userId);
  if (!admin) return save('ignored', { detail: 'Ya no eres del equipo de este espacio' });

  const me = (await d.db.userEmail(userId))?.toLowerCase() ?? admin.session.email.toLowerCase();
  const internal = [...await d.db.internalDomains(tenantId), domainOf(me)].filter((x) => x && !isFreeDomain(x));
  const r = readEmail(full, { own: [me, admin.session.email.toLowerCase()], internal, inbox: d.inboxDomain });
  const note = noteOf(r);
  const common = { subject: r.subject || full.subject, snippet: note, direction: r.direction, receivedAt: r.at };
  const counterpart = r.counterparts[0] ?? null;
  if (!counterpart) return save('ignored', { ...common, detail: 'Correo entre compañeros: no hay cliente al otro lado' });

  // ¿Es un lead de la web? (se apunta en su historial aunque no tenga empresa todavía)
  const lead = d.leads ? await d.leads.leadByEmail(tenantId, counterpart, false).catch(() => null) : null;
  if (lead && d.leads) await recordOnLead(d.leads, lead, r.direction, r.at, r.subject, note, d.now);

  const domains = r.counterparts.map(domainOf).filter((x) => x && !isFreeDomain(x));
  let match = await admin.crm.findByEmail(r.counterparts, domains).catch(() => ({ accountId: null, contactId: null, how: null }));
  if (!match.accountId && lead?.accountId) match = { accountId: lead.accountId, contactId: lead.contactId ?? null, how: 'account' };
  if (!match.accountId) return save('unmatched', { ...common, counterpart, detail: lead ? 'Es un lead de la web sin validar: valídalo o elige su empresa' : null });

  try {
    await admin.crm.logActivity(match.accountId, { contactId: match.contactId, channel: 'email', outcome: r.direction === 'in' ? 'replied' : 'no_reply', note, happenedAt: r.at });
    return save('logged', { ...common, counterpart, accountId: match.accountId });
  } catch (e) {
    // P. ej. la empresa es de otro comercial: queda para asignarla (o pedirla) a mano.
    return save('unmatched', { ...common, counterpart, accountId: null, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
  }
}

/** En el lead de la web: el correo en su historial; si contestó, se para la secuencia y pasa a «respondió». */
async function recordOnLead(db: LeadsDb, lead: NonNullable<Awaited<ReturnType<LeadsDb['leadByEmail']>>>, dir: 'in' | 'out', at: string, subject: string, note: string, now: Date) {
  await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: dir === 'in' ? 'message_in' : 'message_out', data: { channel: 'email', subject, text: note.slice(0, 1500), via: 'apuntar' } });
  if (dir === 'in') {
    await db.cancelPending(lead.id, ['wa1', 'wa2']);
    const patch: Parameters<LeadsDb['updateLead']>[1] = { lastInboundAt: at };
    if (!lead.sequenceStoppedAt) { patch.sequenceStoppedAt = now.toISOString(); patch.sequenceStopReason = 'replied'; }
    if (lead.stage === 'new' || lead.stage === 'contacted') {
      patch.stage = 'replied'; patch.stageAt = at;
      await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'stage', fromStage: lead.stage, toStage: 'replied', data: { auto: true, channel: 'email' } });
    }
    await db.updateLead(lead.id, patch);
  } else if (lead.stage === 'new') {
    await db.updateLead(lead.id, { stage: 'contacted', stageAt: at, ...(lead.firstResponseAt ? {} : { firstResponseAt: at }) });
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'stage', fromStage: 'new', toStage: 'contacted', data: { auto: true, channel: 'email' } });
  }
}
