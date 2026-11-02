/**
 * Textos de los envíos (docs/LEADS.md §Plantillas): respuesta automática por email, aviso interno y las dos plantillas
 * de WhatsApp. Con la voz de quien firma (signer_name), en el idioma del lead (es, en o fr; si no, en). Sin contenido
 * promocional: son mensajes de servicio sobre lo que pidió. Las de WhatsApp se aprueban en Meta como «Utilidad»
 * (Utility): responden a su solicitud, sin descuentos, ofertas, vídeos ni lenguaje comercial. Las de WhatsApp tienen que estar aprobadas por Meta tal cual
 * (WA_BODIES); aquí solo se rellenan las variables.
 */
import type { LeadType } from './contract';
import type { Eta } from './schedule';
import type { EmailSignature, LeadMedia, LeadTemplates, LocaleTexts, QuestionKey } from './types';

export type MsgLocale = 'es' | 'en' | 'fr';
export const msgLocale = (l: string): MsgLocale => (l === 'es' || l === 'fr' ? l : 'en');

const MONTHS: Record<MsgLocale, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};
function day(iso: string, l: MsgLocale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = +m[3], mon = MONTHS[l][+m[2] - 1];
  return l === 'en' ? `${mon} ${d}, ${m[1]}` : l === 'fr' ? `${d} ${mon} ${m[1]}` : `${d} de ${mon} de ${m[1]}`;
}
const where = (f: Record<string, string>, l: MsgLocale) => (f.city ? (l === 'es' ? ` en ${f.city}` : l === 'fr' ? ` à ${f.city}` : ` in ${f.city}`) : '');

/** Lo que pidió, en una frase corta que encaja tras «me has escrito por…» / «you asked about…». */
export function summary(type: LeadType, f: Record<string, string>, loc: string): string {
  const l = msgLocale(loc);
  const T: Record<MsgLocale, Record<LeadType, () => string>> = {
    es: {
      venue: () => (f.venue_name ? `${f.venue_name}${where(f, l)}` : `tu local${where(f, l)}`),
      dj: () => `tus sesiones${where(f, l)}`,
      festival: () => (f.event_name ? f.event_name : 'tu festival'),
      wedding: () => (f.wedding_date ? `vuestra boda del ${day(f.wedding_date, l)}` : 'vuestra boda'),
      wedding_partner: () => (f.company ? `colaborar con ${f.company}` : 'colaborar en bodas'),
      custom_dev: () => (f.company ? `un desarrollo a medida para ${f.company}` : 'un desarrollo a medida'),
      waitlist: () => 'la lista de espera',
      general: () => ({ venue: 'tu local', festival: 'tu festival', wedding: 'vuestra boda', dj: 'tus sesiones' } as Record<string, string>)[f.event_type] ?? 'tu proyecto',
    },
    en: {
      venue: () => (f.venue_name ? `${f.venue_name}${where(f, l)}` : `your venue${where(f, l)}`),
      dj: () => `your DJ sets${where(f, l)}`,
      festival: () => (f.event_name ? f.event_name : 'your festival'),
      wedding: () => (f.wedding_date ? `your wedding on ${day(f.wedding_date, l)}` : 'your wedding'),
      wedding_partner: () => (f.company ? `working together with ${f.company}` : 'working together on weddings'),
      custom_dev: () => (f.company ? `a custom build for ${f.company}` : 'a custom build'),
      waitlist: () => 'the waiting list',
      general: () => ({ venue: 'your venue', festival: 'your festival', wedding: 'your wedding', dj: 'your DJ sets' } as Record<string, string>)[f.event_type] ?? 'your project',
    },
    fr: {
      venue: () => (f.venue_name ? `${f.venue_name}${where(f, l)}` : `ton établissement${where(f, l)}`),
      dj: () => `tes sets${where(f, l)}`,
      festival: () => (f.event_name ? f.event_name : 'ton festival'),
      wedding: () => (f.wedding_date ? `votre mariage du ${day(f.wedding_date, l)}` : 'votre mariage'),
      wedding_partner: () => (f.company ? `une collaboration avec ${f.company}` : 'une collaboration pour les mariages'),
      custom_dev: () => (f.company ? `un développement sur mesure pour ${f.company}` : 'un développement sur mesure'),
      waitlist: () => "la liste d'attente",
      general: () => ({ venue: 'ton établissement', festival: 'ton festival', wedding: 'votre mariage', dj: 'tes sets' } as Record<string, string>)[f.event_type] ?? 'ton projet',
    },
  };
  return T[l][type]();
}

// ---------------------------------------------------------------- Textos por defecto (cada empresa puede cambiarlos)

/**
 * Los textos de por defecto, con marcadores. Cada empresa los cambia en Leads → Ajustes → Mensajes (por idioma); lo que
 * deje vacío sale de aquí. Marcadores del email: {nombre}, {asunto}, {sobre} (« sobre Sala X» o nada si no está claro qué
 * es), {siguiente_paso}, {video} (el vídeo corto de su tipo, si lo hay), {reserva}, {firma}, {marca}, {firma_email} (la firma completa de Ajustes o, sin ella, nombre y marca). WhatsApp: {{1}} nombre, {{2}} lo que pidió, {{3}} la pregunta
 * (mensaje 1) o el enlace de reserva (mensaje 2), y {firma}/{marca}, que quedan fijos en la plantilla de Meta.
 */
export const DEFAULT_TEXTS: Record<MsgLocale, Required<Omit<LocaleTexts, 'questions'>> & { questions: Record<QuestionKey, string> }> = {
  es: {
    subject: '{asunto}',
    body: 'Hola {nombre}:\n\nGracias por escribir. Me llega tu mensaje{sobre} y lo leo yo.\n\n{siguiente_paso}\n\n{video}\n\n{reserva}\n\nY si quieres añadir algo, responde a este email.\n\nUn saludo,\n{firma_email}',
    wa1: 'Hola {{1}}, soy {firma}, de {marca}. Te escribo por la solicitud que nos enviaste desde la web sobre {{2}}.\n\nPara poder responderte: {{3}}\n\nPuedes contestar a este mensaje.\n\n{firma}',
    wa2: 'Hola {{1}}, sigo con tu solicitud sobre {{2}}. Si prefieres que lo hablemos por teléfono, puedes elegir la hora aquí: {{3}}\n\nTambién puedes contestar a este mensaje.\n\n{firma}',
    questions: { venue: '¿Qué noches abrís y cuánta gente os suele venir?', dj: '¿En qué salas estás pinchando ahora?', festival: '¿Para qué fechas lo estáis planteando?',
      wedding: '¿Tenéis ya el sitio de la celebración?', general: '¿Me cuentas un poco más de lo que tienes en mente?' },
  },
  en: {
    subject: '{asunto}',
    body: "Hi {nombre},\n\nThanks for getting in touch. I've got your message{sobre} and I'm reading it myself.\n\n{siguiente_paso}\n\n{video}\n\n{reserva}\n\nAnd if you want to add anything, just reply to this email.\n\nBest,\n{firma_email}",
    wa1: "Hi {{1}}, it's {firma} from {marca}. I'm writing about the request you sent us through the website about {{2}}.\n\nSo I can answer it: {{3}}\n\nYou can reply to this message.\n\n{firma}",
    wa2: "Hi {{1}}, following up on your request about {{2}}. If you'd rather discuss it by phone, you can pick a time here: {{3}}\n\nYou can also reply to this message.\n\n{firma}",
    questions: { venue: 'Which nights are you open and how many people do you usually get?', dj: 'Which venues are you playing at right now?', festival: 'Which dates are you planning for?',
      wedding: 'Do you already have the venue for the celebration?', general: 'Could you tell me a bit more about what you have in mind?' },
  },
  fr: {
    subject: '{asunto}',
    body: "Bonjour {nombre},\n\nMerci pour ton message{sobre}. Je le lis moi-même.\n\n{siguiente_paso}\n\n{video}\n\n{reserva}\n\nEt si tu veux ajouter quelque chose, réponds simplement à cet e-mail.\n\nÀ bientôt,\n{firma_email}",
    wa1: "Bonjour {{1}}, c'est {firma}, de {marca}. Je t'écris au sujet de la demande que tu nous as envoyée depuis le site à propos de {{2}}.\n\nPour pouvoir te répondre : {{3}}\n\nTu peux répondre à ce message.\n\n{firma}",
    wa2: "Bonjour {{1}}, je reviens vers toi au sujet de ta demande concernant {{2}}. Si tu préfères en parler par téléphone, tu peux choisir le créneau ici : {{3}}\n\nTu peux aussi répondre à ce message.\n\n{firma}",
    questions: { venue: 'Vous ouvrez quels soirs et combien de monde vient en général ?', dj: 'Dans quelles salles tu joues en ce moment ?', festival: 'Vous le prévoyez pour quelles dates ?',
      wedding: 'Avez-vous déjà le lieu de la réception ?', general: "Tu peux m'en dire un peu plus sur ce que tu as en tête ?" },
  },
};
/** El texto que toca: el de la empresa si lo ha escrito; si no, el de por defecto. */
const pick = <K extends 'subject' | 'body' | 'wa1' | 'wa2'>(k: K, l: MsgLocale, custom?: LeadTemplates) => (custom?.[l]?.[k]?.trim() || DEFAULT_TEXTS[l][k]);
/** Rellena {marcadores} y quita párrafos vacíos. */
export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Una pregunta sencilla que invite a contestar (mensaje 1). */
export function question(type: LeadType, f: Record<string, string>, loc: string, custom?: LeadTemplates): string {
  const l = msgLocale(loc);
  const raw = type === 'general' ? f.event_type ?? 'general' : type;
  const key: QuestionKey = (['venue', 'dj', 'festival', 'wedding'] as string[]).includes(raw) ? (raw as QuestionKey) : 'general';
  return custom?.[l]?.questions?.[key]?.trim() || DEFAULT_TEXTS[l].questions[key];
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** Tipos con vídeo y reserva propios en Ajustes (la lista de espera usa los generales). */
export const MEDIA_TYPES = ['general', 'venue', 'dj', 'festival', 'wedding', 'wedding_partner', 'custom_dev'] as const;
/**
 * El vídeo y el enlace de reserva de un lead: los de su tipo en su idioma; si no, los del tipo «general» en su idioma; si
 * no, los generales del espacio. Un lead «general» que dice qué es (event_type: venue, dj…) usa los de ese tipo.
 */
export function mediaFor(s: { bookingUrl: string | null; videoUrl: string | null; media?: LeadMedia }, type: LeadType, fields: Record<string, string>, locale: string): { booking: string | null; video: string | null } {
  const l = msgLocale(locale);
  const eff = type === 'general' && (MEDIA_TYPES as readonly string[]).includes(fields.event_type ?? '') ? fields.event_type! : type;
  const own = s.media?.[eff]?.[l];
  const gen = s.media?.general?.[l];
  return { booking: own?.booking || gen?.booking || s.bookingUrl || null, video: own?.video || gen?.video || s.videoUrl || null };
}

// ---------------------------------------------------------------- WhatsApp (plantillas para Meta)

/** Cuerpo de la plantilla tal y como se manda a aprobar a Meta (con {{1}}…{{3}}; firma y marca ya escritas). */
export function waBody(step: 'wa1' | 'wa2', loc: string, signer: string, brand: string, custom?: LeadTemplates): string {
  return fill(pick(step, msgLocale(loc), custom), { firma: signer, marca: brand });
}
/** Compatibilidad: los cuerpos por defecto como funciones (docs y pruebas). */
export const WA_BODIES: Record<'wa1' | 'wa2', Record<MsgLocale, (signer: string, brand: string) => string>> = {
  wa1: { es: (s, b) => waBody('wa1', 'es', s, b), en: (s, b) => waBody('wa1', 'en', s, b), fr: (s, b) => waBody('wa1', 'fr', s, b) },
  wa2: { es: (s, b) => waBody('wa2', 'es', s, b), en: (s, b) => waBody('wa2', 'en', s, b), fr: (s, b) => waBody('wa2', 'fr', s, b) },
};

export function waParams(step: 'wa1' | 'wa2', d: { name: string; type: LeadType; fields: Record<string, string>; locale: string; bookingUrl: string | null; videoUrl: string | null; custom?: LeadTemplates }): string[] {
  const p = [firstName(d.name), summary(d.type, d.fields, d.locale)];
  if (step === 'wa1') p.push(question(d.type, d.fields, d.locale, d.custom));
  // Solo el enlace de reserva (para hablar de lo que pidió). Nada de vídeos ni contenido: Utility, no Marketing.
  else p.push(d.bookingUrl ?? '');
  return p;
}
/** El texto que verá el lead (para la ficha y para probar sin WhatsApp). */
export function waPreview(step: 'wa1' | 'wa2', locale: string, signer: string, brand: string, params: string[], custom?: LeadTemplates): string {
  return waBody(step, locale, signer, brand, custom).replace(/\{\{(\d)\}\}/g, (_, i) => params[+i - 1] ?? '');
}

// ---------------------------------------------------------------- Email: respuesta automática

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Aspecto de texto plano: párrafos y enlaces, sin plantilla gráfica. */
function plainHtml(text: string): string {
  const linked = (s: string) => esc(s).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:560px">${
    text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linked(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
}

export interface AutoreplyData {
  name: string; type: LeadType; fields: Record<string, string>; locale: string; signer: string; brand: string;
  channel: 'whatsapp' | 'email'; eta: Eta; bookingUrl: string | null; unsubscribeUrl: string | null;
  /** El vídeo corto de su tipo (Ajustes → Vídeo y reserva por tipo). */
  videoUrl?: string | null;
  /** false si no está claro qué es (marca, prensa, otro…): el email no nombra lo que pidió. Por defecto, true. */
  specific?: boolean;
  custom?: LeadTemplates;
  signature?: EmailSignature;
}
const SIG = '\u0007SIG\u0007';
export const hasSignature = (s?: EmailSignature | null) => !!s && Object.values(s).some((v) => typeof v === 'string' && v.trim());
/** La firma en texto (para la versión sin formato del email). */
export function signatureText(s: EmailSignature): string {
  return [s.name, s.title, s.phone, s.address, s.email, s.website, s.legal ? `\n${s.legal}` : ''].filter((x) => x && x.trim()).join('\n');
}
/** La firma maquetada: nombre y cargo en negrita, datos, logo y el texto legal en pequeño. Tablas e inline: va en Gmail y Outlook. */
export function signatureHtml(s: EmailSignature): string {
  const tel = s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}" style="color:#1a56db">${esc(s.phone)}</a>` : '';
  const mail = s.email ? `<a href="mailto:${esc(s.email)}" style="color:#1a56db">${esc(s.email)}</a>` : '';
  const web = s.website ? `<a href="${esc(s.website)}" style="color:#1a56db">${esc(s.website.replace(/^https?:\/\//, ''))}</a>` : '';
  const lines = [
    s.name ? `<strong style="font-size:16px">${esc(s.name)}</strong>` : '', s.title ? `<strong>${esc(s.title)}</strong>` : '',
    tel ? `M. ${tel}` : '', s.address ? esc(s.address) : '', mail, web,
  ].filter(Boolean).join('<br>');
  const logo = s.logoUrl ? `<tr><td style="padding-top:14px"><img src="${esc(s.logoUrl)}" alt="" height="40" style="display:block;height:40px;width:auto;border:0"></td></tr>` : '';
  const legal = s.legal ? `<tr><td style="padding-top:12px;font-size:11px;line-height:1.4;color:#555">${esc(s.legal).replace(/\n/g, '<br>')}</td></tr>` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:#111;max-width:560px"><tr><td>${lines}</td></tr>${logo}${legal}</table>`;
}
const PHRASES = {
  es: { about: (w: string) => ` sobre ${w}`, subject: (w: string | null) => (w ? `Sobre ${w}` : 'Gracias por escribir'),
    wa: (when: string) => `Te escribo por WhatsApp ${when} para que me cuentes un poco más.`, email: 'Te contesto yo personalmente a este mismo email, normalmente en el día.',
    book: (u: string) => `Si prefieres hablarlo directamente, elige aquí la hora que te venga bien: ${u}`, unsub: 'Si no quieres que te escribamos más:',
    video: (u: string) => `Mientras, aquí tienes un vídeo corto para verlo en marcha: ${u}`,
    when: { minutes: 'en unos minutos', today: 'hoy a primera hora', next_business_day: 'mañana a primera hora' } },
  en: { about: (w: string) => ` about ${w}`, subject: (w: string | null) => (w ? `About ${w}` : 'Thanks for getting in touch'),
    wa: (when: string) => `I'll message you on WhatsApp ${when} so you can tell me a bit more.`, email: "I'll reply to this email personally, usually the same day.",
    book: (u: string) => `If you'd rather talk it through, pick a time that suits you here: ${u}`, unsub: "If you'd rather not hear from us again:",
    video: (u: string) => `In the meantime, here's a short video to see it in action: ${u}`,
    when: { minutes: 'in a few minutes', today: 'first thing today', next_business_day: 'first thing tomorrow' } },
  fr: { about: (w: string) => ` à propos de ${w}`, subject: (w: string | null) => (w ? `À propos de ${w}` : 'Merci pour ton message'),
    wa: (when: string) => `Je t'écris sur WhatsApp ${when} pour que tu m'en dises un peu plus.`, email: 'Je te réponds personnellement à cet e-mail, en général dans la journée.',
    book: (u: string) => `Si tu préfères en parler directement, choisis ici le créneau qui te convient : ${u}`, unsub: 'Si tu ne veux plus recevoir de messages de notre part :',
    video: (u: string) => `En attendant, voici une courte vidéo pour le voir en action : ${u}`,
    when: { minutes: "d'ici quelques minutes", today: "aujourd'hui en début de matinée", next_business_day: 'demain en début de matinée' } },
} as const;

export function autoreplyEmail(d: AutoreplyData): { subject: string; text: string; html: string } {
  const l = msgLocale(d.locale);
  const P = PHRASES[l];
  const what = d.specific === false ? null : summary(d.type, d.fields, l);
  const sig = hasSignature(d.signature) ? d.signature! : null;
  const vars = {
    nombre: firstName(d.name), asunto: P.subject(what), sobre: what ? P.about(what) : '',
    siguiente_paso: d.channel === 'whatsapp' ? P.wa(P.when[d.eta]) : P.email, reserva: d.bookingUrl ? P.book(d.bookingUrl) : '', video: d.videoUrl ? P.video(d.videoUrl) : '',
    firma: d.signer, marca: d.brand, firma_email: sig ? SIG : `${d.signer}\n${d.brand}`,
  };
  const subject = fill(pick('subject', l, d.custom), vars).replace(/\s+/g, ' ').slice(0, 200);
  let body = fill(pick('body', l, d.custom), vars);
  // Con firma y un texto propio sin {firma_email}: la firma va al final.
  if (sig && !body.includes(SIG)) body = `${body}\n\n${SIG}`;
  const unsub = d.unsubscribeUrl ? `—\n${P.unsub} ${d.unsubscribeUrl}` : '';
  const text = [body.replace(SIG, sig ? signatureText(sig) : ''), unsub].filter(Boolean).join('\n\n');
  let html = plainHtml([body, unsub].filter(Boolean).join('\n\n'));
  if (sig) html = html.replace(/(<br>)?\u0007SIG\u0007/, `</p>${signatureHtml(sig)}<p style="margin:0">`).replace(/<p style="margin:0( 0 14px)?"><\/p>/g, '');
  return { subject, text, html };
}

// ---------------------------------------------------------------- Email: aviso interno (en español: es para el equipo)

export interface NotifyData {
  brand: string; leadUrl: string; name: string; email: string; emailKind: string; phone: string | null; phoneE164: string | null; type: LeadType;
  fields: Record<string, string>; message: string | null; cta: string | null; page: string | null; source: string | null;
  score: number | null; band: string | null; repeat: number; quarantine: string[]; next: string; test: boolean;
  /** Qué parece (y si se le escribe solo o lo sigues tú). */
  classification?: string | null;
}
const TYPE_ES: Record<LeadType, string> = { general: 'General', venue: 'Local', dj: 'DJ', festival: 'Festival', wedding: 'Boda', wedding_partner: 'Proveedor de bodas', custom_dev: 'Desarrollo a medida', waitlist: 'Lista de espera' };
export function notifyEmail(d: NotifyData): { subject: string; text: string; html: string } {
  const flag = d.test ? '[PRUEBA] ' : d.quarantine.length ? '[Cuarentena] ' : d.band === 'hot' ? '🔥 ' : '';
  const subject = `${flag}Lead ${d.brand}: ${d.name} · ${TYPE_ES[d.type]}${d.repeat > 1 ? ` (envío nº ${d.repeat})` : ''}`;
  const rows: [string, string | null][] = [
    ['Nombre', d.name], ['Email', `${d.email} (${d.emailKind})`], ['Teléfono', d.phoneE164 ?? d.phone ?? null], ['Tipo', TYPE_ES[d.type]],
    ...Object.entries(d.fields).map(([k, v]) => [k, v] as [string, string]),
    ['Mensaje', d.message], ['Botón', d.cta], ['Página', d.page], ['Origen', d.source],
    ['Qué parece', d.classification ?? null],
    ['Puntuación', d.score != null ? `${d.score} (${d.band})` : null], ['Cuarentena', d.quarantine.length ? d.quarantine.join(', ') : null],
    ['Siguiente paso', d.next],
  ];
  const text = [...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '', `Abrir en el CRM: ${d.leadUrl}`, 'Responde a este email para escribirle directamente.'].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111"><table style="border-collapse:collapse">${
    rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v!)}</td></tr>`).join('')
  }</table><p style="margin-top:16px"><a href="${esc(d.leadUrl)}">Abrir en el CRM</a> · Responde a este email para escribirle directamente.</p></div>`;
  return { subject, text, html };
}
