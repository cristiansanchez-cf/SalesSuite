/**
 * Servidor MCP del CRM (docs/MCP.md): lo que hace el asistente de WhatsApp, para la IA de cada persona (Claude, ChatGPT,
 * Cursor…). Criterio de Cristian: «lo que ya hacemos por WhatsApp, por MCP, para que los usuarios lo puedan conectar a su
 * IA directamente».
 *
 * Todo pasa por los mismos servicios que la web y WhatsApp (AdminContext de esa persona): mismos permisos, mismas
 * reglas (reserva, próximos pasos, cualificación). Dos maneras de apuntar:
 *  · Con la IA del espacio, como WhatsApp: preparar_apunte (texto libre → qué se guardaría, por empresa) y guardar_apunte.
 *  · Con las herramientas una a una (registrar_contacto, proximo_paso, cualificar, anotar_dato…): la IA de la persona
 *    entiende y la app guarda. No gasta la IA del espacio.
 * El contexto se monta solo al llamar a una herramienta (initialize y tools/list no tocan la base de datos).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AdminContext } from '../admin/auth';
import { AdminError } from '../admin/service';
import { CHANNELS, OUTCOMES } from '../crm/followup';
import { qualLabeler } from '../crm/qual-labels';
import { MULTI_QUAL, multiOf } from '../crm/priority';
import { opsFor } from '../assistant/process';
import { isPlaceKey, pathForKey } from '../accounts/spain';
import type { NoteItem } from '../crm/notes';
import type { Locale } from '../i18n/core';

export const MCP_NAME = 'cofundo-ventas';
export const MCP_VERSION = '1.0.0';

type Json = Record<string, unknown> | unknown[];
const out = (v: Json) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lo que va a guardar_apunte (lo mismo que confirma WhatsApp), sin la empresa elegida. */
function rowFromItem(it: NoteItem) {
  return {
    interaction: it.interaction, keyFacts: it.keyFacts.slice(0, 5), facts: it.facts.slice(0, 40), fit: it.fit, fields: it.fields, channel: it.channel,
    outcome: it.outcome, day: it.day, qualification: it.qualification, nextStep: it.nextStep, nextDays: it.nextDays, nextTime: it.nextTime ?? null,
    agreement: it.agreement ?? null, agreementPackages: it.agreementPackages ?? [], agreementPrice: it.agreementPrice ?? null, trialUntil: it.trialUntil ?? null,
    discard: it.discard ?? null, discardNote: it.discard ? it.discardWhy ?? null : null, worksAt: [], people: it.people ?? [], contact: it.contact ?? {},
  };
}

export const INSTRUCTIONS = (space: string) => `Eres el asistente del CRM de ventas de «${space}» (Cofundo Ventas). Actúas como la persona conectada, con sus permisos.
- Antes de crear una empresa, búscala (buscar_empresas): casi siempre ya está. Las empresas se identifican por su id.
- Para contar una conversación o una visita con tus palabras, usa preparar_apunte y, cuando la persona confirme la empresa y lo que se guarda, guardar_apunte (lo mismo que el asistente de WhatsApp).
- Para cambios concretos, usa las herramientas una a una: registrar_contacto, proximo_paso, cualificar (primero preguntas_cualificacion), anotar_dato, anadir_persona.
- Fechas en AAAA-MM-DD; horas en HH:MM (en la zona horaria de la persona).
- Antes de guardar algo que la persona no haya pedido claramente, pregúntale.`;

/**
 * El servidor con sus herramientas. `ctx` monta el contexto de la persona (se llama solo al usar una herramienta).
 * Los errores del CRM (AdminError) vuelven como texto para la IA, en el idioma de la persona.
 */
export function buildMcpServer(ctx: () => Promise<AdminContext>, info: { space: string; locale: Locale }): McpServer {
  const server = new McpServer({ name: MCP_NAME, version: MCP_VERSION }, { instructions: INSTRUCTIONS(info.space) });
  const run = <A>(fn: (admin: AdminContext, args: A) => Promise<Json>) => async (args: A) => {
    try { return out(await fn(await ctx(), args)); } catch (e) {
      if (e instanceof AdminError) return fail([e.message, ...(e.details ?? [])].join('\n'));
      console.warn('[mcp]', e instanceof Error ? e.message : e);
      return fail('Algo ha fallado en el CRM; prueba de nuevo en un momento.');
    }
  };
  const id = z.string().uuid().describe('El id de la empresa (de buscar_empresas o lo_de_hoy).');
  const tz = async (admin: AdminContext) => (await admin.notifications.dailyPref().catch(() => null))?.timezone ?? 'Europe/Madrid';

  server.registerTool('buscar_empresas', {
    title: 'Buscar empresas',
    description: 'Busca empresas del CRM por su nombre (aunque esté escrito a medias o sin tildes). Devuelve su id, nombre, ciudad y tipo.',
    inputSchema: { texto: z.string().min(2).max(160).describe('Nombre o parte del nombre.') },
    annotations: { readOnlyHint: true },
  }, run(async (admin, a: { texto: string }) => {
    const kinds = await admin.accounts.kinds().catch(() => []);
    const r = await admin.crm.accountSearch(a.texto);
    return r.slice(0, 10).map((c) => ({ id: c.id, nombre: c.name, ciudad: c.zone || null, tipo: kinds.find((k) => k.key === c.kind)?.label ?? null, descartada: c.discarded || undefined, coincidencia: Math.round(c.score * 100) / 100 }));
  }));

  server.registerTool('ver_empresa', {
    title: 'Ver la ficha de una empresa',
    description: 'La ficha de una empresa: estado, quién la lleva, contacto, próximo paso, cualificación (y lo que falta por saber), lo importante, personas, últimas interacciones y propuestas.',
    inputSchema: { empresa_id: id },
    annotations: { readOnlyHint: true },
  }, run(async (admin, a: { empresa_id: string }) => {
    const [{ account: x, dossiers }, tl, co, gaps, kinds] = await Promise.all([
      admin.accounts.get(a.empresa_id), admin.crm.timeline(a.empresa_id), admin.crm.company(a.empresa_id),
      admin.crm.qualGaps(a.empresa_id).catch(() => null), admin.accounts.kinds().catch(() => []),
    ]);
    const ql = qualLabeler(info.locale);
    const qual = Object.entries(x.qualification ?? {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => ql(k, Array.isArray(v) ? v.join(',') : String(v)));
    return {
      id: x.id, nombre: x.name, tipo: kinds.find((k) => k.key === x.kind)?.label ?? null, ciudad: x.zonePath || null, estado: x.state, la_lleva: x.ownerName,
      contacto: Object.fromEntries(Object.entries({ telefono: x.phone, email: x.email, web: x.website, instagram: x.instagram, linkedin: x.linkedin }).filter(([, v]) => v)),
      proximo_paso: tl.next ? { que: tl.next.step, cuando: tl.next.at, con: tl.next.contactName, canal: tl.next.channel } : null,
      cualificacion: qual, falta_por_saber: gaps?.gaps.map((g) => g.question) ?? [],
      lo_importante: (x.facts ?? []).filter((f) => f.key).map((f) => f.text).slice(0, 10),
      datos: (x.facts ?? []).filter((f) => !f.key).map((f) => f.text).slice(0, 20),
      personas: co.people.map((p) => ({ id: p.id, nombre: p.name, papel: p.role, telefono: p.phone, email: p.email })),
      ultimas_interacciones: tl.items.slice(0, 10).map((i) => ({ cuando: i.happenedAt, canal: i.channel, resultado: i.outcome, nota: i.note, quien: i.userName, con: i.contactName })),
      propuestas: dossiers.map((d) => ({ titulo: d.title, estado: d.status, resultado: d.outcome })),
    };
  }));

  server.registerTool('lo_de_hoy', {
    title: 'Lo de hoy',
    description: 'Lo que toca hoy a la persona: empresas que se enfrían (contestaron y llevan días sin respuesta), pasos atrasados, de hoy y de mañana, con lo último que pasó y con quién hablar.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, run(async (admin) => {
    const r = await admin.crm.today();
    return { cuantas: r.counts, empresas: r.items.slice(0, 40).map((i) => ({
      id: i.id, nombre: i.name, por_que: i.bucket, dias_enfriandose: i.cooling, proximo_paso: i.nextStep, cuando: i.nextStepAt,
      con: i.contactName, telefono: i.contactPhone, instagram: i.contactInstagram, ultimo: i.last ? { cuando: i.last.happenedAt, resultado: i.last.outcome, nota: i.last.note } : null,
    })) };
  }));

  server.registerTool('registrar_contacto', {
    title: 'Registrar un contacto',
    description: 'Apunta que se ha hablado con una empresa (llamada, WhatsApp, visita, email…) y cómo fue. Cuenta como contacto (renueva la reserva). Si no se pone próximo paso, el CRM propone uno.',
    inputSchema: {
      empresa_id: id,
      canal: z.enum(CHANNELS).describe('instagram, linkedin, whatsapp, phone, email, visit, meeting u other.'),
      resultado: z.enum(OUTCOMES).describe('no_reply (sin respuesta), replied (contestó), interested (interesado), not_interested (no le interesa), meeting (reunión), note (solo una nota).'),
      nota: z.string().max(4000).optional().describe('Qué se habló, con sus palabras.'),
      dia: z.string().regex(DAY).optional().describe('AAAA-MM-DD si no fue hoy.'),
    },
  }, run(async (admin, a: { empresa_id: string; canal: (typeof CHANNELS)[number]; resultado: (typeof OUTCOMES)[number]; nota?: string; dia?: string }) => {
    const next = await admin.crm.logActivity(a.empresa_id, { channel: a.canal, outcome: a.resultado, note: a.nota ?? '', happenedAt: a.dia ? `${a.dia}T12:00:00` : undefined });
    return { guardado: true, proximo_paso_propuesto: next ? { cuando: next.at ? new Date(next.at).toISOString() : null, canal: next.channel } : null };
  }));

  server.registerTool('proximo_paso', {
    title: 'Poner el próximo paso',
    description: 'Pone (o cambia) el próximo paso de una empresa: qué hay que hacer y cuándo. Sale en «lo de hoy», en el calendario y en el recordatorio de la mañana.',
    inputSchema: {
      empresa_id: id,
      que: z.string().min(2).max(1000).describe('Qué hay que hacer («Llamar a Jorge para cerrar la prueba»).'),
      dia: z.string().regex(DAY).describe('AAAA-MM-DD.'),
      hora: z.string().regex(HOUR).optional().describe('HH:MM, si hay hora.'),
      canal: z.enum(CHANNELS).optional(),
    },
  }, run(async (admin, a: { empresa_id: string; que: string; dia: string; hora?: string; canal?: (typeof CHANNELS)[number] }) => {
    await admin.crm.setNextStep(a.empresa_id, { step: a.que, at: a.dia, time: a.hora ?? null, tz: await tz(admin), channel: a.canal ?? null });
    return { guardado: true, que: a.que, cuando: a.hora ? `${a.dia} ${a.hora}` : a.dia };
  }));

  server.registerTool('preguntas_cualificacion', {
    title: 'Qué falta por saber',
    description: 'Las preguntas de cualificación que le faltan a una empresa, con sus opciones (campo y valor para cualificar).',
    inputSchema: { empresa_id: id },
    annotations: { readOnlyHint: true },
  }, run(async (admin, a: { empresa_id: string }) => {
    const r = await admin.crm.qualGaps(a.empresa_id);
    return { empresa: r.name, preguntas: r.gaps.map((g) => ({ campo: g.field, pregunta: g.question, opciones: g.options.map((o) => ({ valor: o.v, texto: o.label })) })) };
  }));

  server.registerTool('cualificar', {
    title: 'Cualificar',
    description: 'Marca respuestas de cualificación (campo y valor de preguntas_cualificacion). No desmarca lo que ya estaba.',
    inputSchema: { empresa_id: id, respuestas: z.array(z.object({ campo: z.string().max(40), valor: z.string().max(60) })).min(1).max(12) },
  }, run(async (admin, a: { empresa_id: string; respuestas: Array<{ campo: string; valor: string }> }) => {
    const cur = (await admin.accounts.get(a.empresa_id)).account.qualification as Record<string, unknown>;
    const ql = qualLabeler(info.locale);
    const marked: string[] = [];
    for (const r of a.respuestas) {
      const already = MULTI_QUAL.includes(r.campo) ? multiOf(cur, r.campo).includes(r.valor) : cur[r.campo] === r.valor || (r.valor === 'true' && cur[r.campo] === true);
      if (!already) await admin.crm.qualify(a.empresa_id, `${r.campo}:${r.valor}`);
      marked.push(ql(r.campo, r.valor));
    }
    return { marcado: marked };
  }));

  server.registerTool('anotar_dato', {
    title: 'Anotar un dato',
    description: 'Guarda algo que se sabe de la empresa («Abren una segunda sede en primavera»). importante=true lo pone arriba, en grande.',
    inputSchema: { empresa_id: id, texto: z.string().min(2).max(600), importante: z.boolean().optional() },
  }, run(async (admin, a: { empresa_id: string; texto: string; importante?: boolean }) => {
    await admin.crm.factAdd(a.empresa_id, a.texto, a.importante ? 'key' : 'fact');
    return { guardado: true };
  }));

  server.registerTool('crear_empresa', {
    title: 'Crear una empresa',
    description: 'Da de alta una empresa nueva. Antes, búscala: si ya hay una con ese nombre, la devuelve y no crea otra (salvo forzar=true).',
    inputSchema: {
      nombre: z.string().min(2).max(160), ciudad: z.string().max(120).optional().describe('Ciudad o zona («Torremolinos»).'),
      tipo: z.string().max(40).optional().describe('El tipo del espacio (p. ej. «promotora»), si se sabe.'), forzar: z.boolean().optional(),
    },
  }, run(async (admin, a: { nombre: string; ciudad?: string; tipo?: string; forzar?: boolean }) => {
    const same = (await admin.crm.accountSearch(a.nombre)).find((c) => c.score >= 0.95);
    if (same && !a.forzar) return { creada: false, ya_existe: { id: same.id, nombre: same.name, ciudad: same.zone || null } };
    const kinds = await admin.accounts.kinds().catch(() => []);
    const kind = a.tipo ? kinds.find((k) => k.key === a.tipo || k.label.toLowerCase() === a.tipo!.toLowerCase())?.key : undefined;
    // La ciudad → su zona, como el asistente de WhatsApp: sus zonas, el catálogo de España o Google (creándola si falta).
    let zoneId: string | null = null;
    if (a.ciudad) {
      const v = (await opsFor(admin, { locale: info.locale }).places?.(a.ciudad).catch(() => []))?.[0]?.v;
      const path = v && isPlaceKey(v) ? pathForKey(v) : null;
      if (v) zoneId = await (path ? admin.accounts.ensurePath(path) : admin.crm.pickZone(v)).catch(() => null);
    }
    const newId = await admin.accounts.create({ name: a.nombre, zoneId, kind });
    return { creada: true, id: newId };
  }));

  server.registerTool('anadir_persona', {
    title: 'Añadir una persona',
    description: 'Da de alta una persona (encargado, dueño, DJ…) y, si se dice, la vincula a una empresa con su papel.',
    inputSchema: {
      nombre: z.string().min(1).max(160), empresa_id: id.optional(), papel: z.string().max(80).optional(),
      telefono: z.string().max(40).optional(), email: z.string().max(200).optional(), instagram: z.string().max(300).optional(),
    },
  }, run(async (admin, a: { nombre: string; empresa_id?: string; papel?: string; telefono?: string; email?: string; instagram?: string }) => {
    const r = await admin.crm.quickAdd({ name: a.nombre, accountId: a.empresa_id ?? null, role: a.papel ?? '', phone: a.telefono ?? '', email: a.email ?? '', instagram: a.instagram ?? '' });
    return { creada: true, id: r.id, empresa_id: r.accountId };
  }));

  server.registerTool('preparar_apunte', {
    title: 'Preparar un apunte (como WhatsApp)',
    description: 'Lo que cuenta la persona con sus palabras («he estado en el 12 Torremolinos, el encargado es Jorge, quieren probar en enero…») → lo que se guardaría en cada empresa (interacción, próximo paso, cualificación, datos, personas) y las empresas candidatas. No guarda nada: luego, guardar_apunte. Usa la IA del espacio (cuenta en su tope diario).',
    inputSchema: { texto: z.string().min(10).max(8000) },
    annotations: { readOnlyHint: true },
  }, run(async (admin, a: { texto: string }) => {
    if (!admin.crm.hasNotes()) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const items = await opsFor(admin, { locale: info.locale }).split(a.texto);
    return {
      apuntes: items.map((it, i) => ({
        ref: i, empresa_mencionada: it.venue,
        candidatas: it.candidates.slice(0, 5).map((c) => ({ id: c.id, nombre: c.name, ciudad: c.zone || null, coincidencia: Math.round(c.score * 100) / 100, descartada: c.discarded || undefined })),
        resumen: {
          interaccion: it.interaction, canal: it.channel, resultado: it.outcome, dia: it.day,
          proximo_paso: it.nextStep, en_dias: it.nextDays, hora: it.nextTime ?? null,
          cualificacion: it.qualLabels ?? [], lo_importante: it.keyFacts, datos: it.facts, encaje: it.fit,
          personas: (it.people ?? []).map((p) => p.name), acuerdo: it.agreementLabel ?? it.agreement ?? null, prueba_hasta: it.trialUntil ?? null, descartar: it.discard ?? null,
        },
        fila: rowFromItem(it),
      })),
      siguiente: 'Confirma con la persona la empresa de cada apunte (una candidata o crear una nueva) y llama a guardar_apunte con la fila tal cual.',
    };
  }));

  server.registerTool('guardar_apunte', {
    title: 'Guardar un apunte',
    description: 'Guarda lo preparado con preparar_apunte: cada apunte con su fila (tal cual) y la empresa (empresa_id de una candidata, o crear con su nombre y ciudad).',
    inputSchema: {
      apuntes: z.array(z.object({
        fila: z.record(z.unknown()).describe('La fila de preparar_apunte, sin cambiar.'),
        empresa_id: id.optional(), crear: z.string().max(160).optional().describe('Nombre de la empresa nueva, si no es ninguna candidata.'),
        ciudad: z.string().max(120).optional().describe('Ciudad de la empresa nueva.'),
      })).min(1).max(20),
    },
  }, run(async (admin, a: { apuntes: Array<{ fila: Record<string, unknown>; empresa_id?: string; crear?: string; ciudad?: string }> }) => {
    const ops = opsFor(admin, { locale: info.locale });
    const rows = [];
    for (const x of a.apuntes) {
      if (!x.empresa_id && !x.crear) throw new AdminError(422, 'Cada apunte necesita una empresa (empresa_id) o el nombre de la nueva (crear)');
      const { accountId: _a, create: _c, zoneId: _z, ...fila } = x.fila;
      const place = x.crear && x.ciudad ? (await ops.places?.(x.ciudad).catch(() => []))?.[0]?.v : undefined;
      rows.push({ ...fila, accountId: x.empresa_id ?? null, create: x.empresa_id ? null : x.crear, ...(place ? { place } : {}) });
    }
    const r = await ops.apply(rows);
    return { guardados: r.map((x) => ({ empresa: x.name, id: x.accountId, ok: x.ok, error: x.error, acuerdo: x.agreement, prueba: x.trial, descartada: x.discarded })) };
  }));

  return server;
}
