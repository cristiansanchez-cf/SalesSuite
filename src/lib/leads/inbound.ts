/**
 * Respuestas por WhatsApp (docs/LEADS.md §WhatsApp): en cuanto el lead contesta, se para la secuencia, se apunta en su
 * historial, pasa a «respondió» y se avisa a quien atiende. Si pide que no le escriban, se le da de baja de WhatsApp.
 */
import type { LeadsDb } from './db';
import type { Inbound } from './whatsapp';
import { isStopWord } from './whatsapp';

export async function handleInbound(db: LeadsDb, msgs: Inbound[], now: Date): Promise<{ matched: number; unknown: number }> {
  let matched = 0, unknown = 0;
  for (const m of msgs) {
    const s = await db.settingsByWhatsappPhone(m.phoneId);
    const lead = s ? (await db.leadsByPhone(s.tenantId, m.from)).find((l) => !l.isTest) : null;
    if (!s || !lead) { unknown++; continue; }
    matched++;
    const at = m.at.toISOString();
    const stop = isStopWord(m.text);
    await db.cancelPending(lead.id, ['wa1', 'wa2']);
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'message_in', data: { channel: 'whatsapp', text: m.text, id: m.id } });
    const patch: Parameters<LeadsDb['updateLead']>[1] = { lastInboundAt: at };
    if (!lead.sequenceStoppedAt) { patch.sequenceStoppedAt = now.toISOString(); patch.sequenceStopReason = stop ? 'stop' : 'replied'; }
    if (lead.stage === 'new' || lead.stage === 'contacted') {
      patch.stage = 'replied';
      patch.stageAt = at;
      await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'stage', fromStage: lead.stage, toStage: 'replied', data: { auto: true, channel: 'whatsapp' } });
    }
    await db.updateLead(lead.id, patch);
    if (stop && lead.phoneE164) {
      await db.suppress(lead.tenantId, 'whatsapp', lead.phoneE164, 'Pidió por WhatsApp que no le escribamos');
      await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'suppressed', data: { channel: 'whatsapp', text: m.text } });
    }
    // Aviso a quien atiende: le toca a una persona.
    await db.enqueue(s.notifyEmails.map((to) => ({ tenantId: lead.tenantId, leadId: lead.id, channel: 'email' as const, step: 'notify' as const, toAddr: to, sendAt: now.toISOString(),
      payload: { kind: 'reply', text: m.text.slice(0, 500), base: lead.facts.base ?? '', brandName: s.brand } })));
  }
  return { matched, unknown };
}
