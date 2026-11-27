/**
 * Respuestas por WhatsApp (docs/LEADS.md §WhatsApp): en cuanto el lead contesta, se para la secuencia, se apunta en su
 * historial, pasa a «respondió» y se avisa a quien atiende. Si pide que no le escriban, se le da de baja de WhatsApp.
 */
import type { LeadsDb } from './db';

/**
 * Oír un audio (criterio de Cristian: «¿y los audios? que se transcriban»): el id del archivo en WhatsApp y el idioma →
 * lo que dice, o null si no se ha podido. Sin él (sin clave de Whisper), queda «[audio]».
 */
export type Hear = (mediaId: string, locale: string, tenantId: string) => Promise<string | null>;
/** Lo que se guarda de un mensaje: el texto o, si es un audio y se ha podido oír, lo que dice (marcado como audio). */
async function said(m: { text: string; kind?: string; mediaId?: string | null }, locale: string, tenantId: string, hear?: Hear): Promise<{ text: string; audio?: true; mediaId?: string }> {
  if (m.kind !== 'audio' || !m.mediaId) return { text: m.text };
  const heard = hear ? await hear(m.mediaId, locale, tenantId).catch((e) => { console.warn('[lead audio]', e instanceof Error ? e.message : e); return null; }) : null;
  return heard?.trim() ? { text: heard.trim().slice(0, 4000), audio: true, mediaId: m.mediaId } : { text: m.text, mediaId: m.mediaId };
}
import type { Echo, Inbound } from './whatsapp';
import { isStopWord } from './whatsapp';

/**
 * Lo que la empresa le escribe al lead desde su app de WhatsApp Business (coexistencia): queda en su historial, cuenta
 * como primer contacto y para lo automático (no se le manda el WhatsApp de bienvenida encima de su mensaje).
 */
/** Horas de silencio tras las que una respuesta vuelve a avisar. */
export const QUIET_HOURS = 12;
/** ¿Avisamos de esta respuesta? Su primera, o tras QUIET_HOURS sin hablar (ni él ni tú desde tu WhatsApp). */
export function replyWorthNotifying(lead: { lastInboundAt: string | null; facts: Record<string, unknown> }, at: Date): boolean {
  const quiet = QUIET_HOURS * 3_600_000;
  const recent = (iso: unknown) => typeof iso === 'string' && at.getTime() - Date.parse(iso) < quiet;
  return !recent(lead.lastInboundAt) && !recent(lead.facts.lastManualAt);
}

export async function handleEchoes(db: LeadsDb, echoes: Echo[], now: Date, hear?: Hear): Promise<number> {
  let matched = 0;
  for (const m of echoes) {
    const s = await db.settingsByWhatsappPhone(m.phoneId);
    const lead = s ? (await db.leadsByPhone(s.tenantId, m.to)).find((l) => !l.isTest) : null;
    if (!s || !lead) continue;
    matched++;
    const at = m.at.toISOString();
    await db.cancelPending(lead.id, ['wa1', 'wa2']);
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'message_out', data: { channel: 'whatsapp', manual: true, ...(await said(m, lead.locale, lead.tenantId, hear)), id: m.id } });
    const patch: Parameters<LeadsDb['updateLead']>[1] = {};
    if (!lead.sequenceStoppedAt) { patch.sequenceStoppedAt = now.toISOString(); patch.sequenceStopReason = 'manual'; }
    if (!lead.firstResponseAt) patch.firstResponseAt = at;
    if (lead.stage === 'new') {
      patch.stage = 'contacted'; patch.stageAt = at;
      await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'stage', fromStage: 'new', toStage: 'contacted', data: { auto: true, channel: 'whatsapp' } });
    }
    patch.facts = { ...lead.facts, waAwaiting: false, lastManualAt: at };
    if (Object.keys(patch).length) await db.updateLead(lead.id, patch);
  }
  return matched;
}

export async function handleInbound(db: LeadsDb, msgs: Inbound[], now: Date, hear?: Hear): Promise<{ matched: number; unknown: number }> {
  let matched = 0, unknown = 0;
  for (const m of msgs) {
    const s = await db.settingsByWhatsappPhone(m.phoneId);
    const lead = s ? (await db.leadsByPhone(s.tenantId, m.from)).find((l) => !l.isTest) : null;
    if (!s || !lead) { unknown++; continue; }
    matched++;
    const at = m.at.toISOString();
    const heard = await said(m, lead.locale, lead.tenantId, hear);
    const stop = isStopWord(heard.text);
    await db.cancelPending(lead.id, ['wa1', 'wa2']);
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, at, kind: 'message_in', data: { channel: 'whatsapp', ...heard, id: m.id } });
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
    // Aviso a quien atiende: le toca a una persona. Uno por conversación, no uno por mensaje: solo si es su primera
    // respuesta o vuelve a escribir tras QUIET horas de silencio, y nunca si ya le estás escribiendo tú desde tu WhatsApp.
    if (replyWorthNotifying(lead, m.at)) {
      await db.enqueue(s.notifyEmails.map((to) => ({ tenantId: lead.tenantId, leadId: lead.id, channel: 'email' as const, step: 'notify' as const, toAddr: to, sendAt: now.toISOString(),
        payload: { kind: 'reply', text: `${heard.audio ? '🎤 ' : ''}${heard.text}`.slice(0, 500), base: lead.facts.base ?? '', brandName: s.brand } })));
    }
  }
  return { matched, unknown };
}
