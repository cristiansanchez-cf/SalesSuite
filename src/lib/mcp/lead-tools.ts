/**
 * Leads entrantes por MCP (docs/LEADS.md §2f): la IA de la persona ve lo que espera validación y lo valida o lo rechaza,
 * igual que en la bandeja. Al validar, si el espacio tiene su WhatsApp conectado y al lead se le puede escribir, le sale
 * el primer WhatsApp a los minutos de Ajustes; la respuesta dice lo que ha pasado de verdad. Solo admin o gerente.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AdminContext } from '../admin/auth';
import { leadsFor } from '../leads/service';
import { summary } from '../leads/templates';

type Json = Record<string, unknown> | unknown[];
type Out = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type Run = <A>(fn: (admin: AdminContext, args: A) => Promise<Json>) => (args: A) => Promise<Out>;

const WHY: Record<string, string> = {
  notConnected: 'este espacio no tiene WhatsApp conectado', noPhone: 'no dejó teléfono', noConsent: 'no aceptó que le escribamos por WhatsApp',
  suppressed: 'pidió que no le escribamos', already: 'ya se le escribió o ha contestado', closed: 'está cerrado', test: 'es una prueba',
};

export function registerLeadTools(server: McpServer, run: Run) {
  server.registerTool('leads_por_validar', {
    title: 'Leads: por validar',
    description: 'Los leads entrantes (web o app) que esperan que alguien los valide: id, nombre, email, teléfono, tipo, lo que pidió, su mensaje y si espera para el WhatsApp.',
    inputSchema: { buscar: z.string().max(80).optional() },
    annotations: { readOnlyHint: true },
  }, run(async (admin, a: { buscar?: string }) => {
    const svc = await leadsFor(admin);
    const rows = await svc.list('inbox', a.buscar ?? '');
    return rows.slice(0, 30).map((l) => ({
      id: l.id, nombre: l.name, email: l.email, telefono: l.phoneE164 ?? l.phoneRaw, tipo: l.type,
      pidio: summary(l.type, (l.facts.fields as Record<string, string>) ?? {}, 'es'), llego: l.lastSubmissionAt,
      clasificacion: (l.facts.classification as { category?: string; auto?: boolean } | undefined) ?? null,
      espera_whatsapp: !!l.facts.waAwaiting,
    }));
  }));

  server.registerTool('lead_validar', {
    title: 'Leads: validar',
    description: 'Valida un lead: entra al CRM como persona (y su empresa, si la dijo). Si el espacio tiene su WhatsApp conectado y se le puede escribir, '
      + 'le sale el WhatsApp de bienvenida a los minutos de Ajustes (con whatsapp: false, no). Antes de validar, confirma con la persona.',
    inputSchema: { lead_id: z.string().uuid(), whatsapp: z.boolean().optional() },
  }, run(async (admin, a: { lead_id: string; whatsapp?: boolean }) => {
    const r = await (await leadsFor(admin)).accept(a.lead_id, { whatsapp: a.whatsapp !== false });
    return {
      validado: true, nombre: r.name, contacto_id: r.contactId ?? null, empresa_id: r.accountId ?? null,
      whatsapp: r.whatsapp ? (r.whatsapp.soon ? `sale a los ${r.whatsapp.minutes} min` : 'sale al abrir el horario de envío') : `no sale${r.why ? `: ${WHY[r.why] ?? r.why}` : ''}`,
    };
  }));

  server.registerTool('lead_rechazar', {
    title: 'Leads: rechazar',
    description: 'Rechaza un lead: pasa a Descartado con el motivo, se cancela lo automático pendiente y no se le escribe nada. No lo borra. Antes, confirma con la persona.',
    inputSchema: { lead_id: z.string().uuid(), motivo: z.string().min(2).max(240) },
  }, run(async (admin, a: { lead_id: string; motivo: string }) => {
    const svc = await leadsFor(admin);
    await svc.reject(a.lead_id, a.motivo);
    return { rechazado: true, motivo: a.motivo };
  }));
}
