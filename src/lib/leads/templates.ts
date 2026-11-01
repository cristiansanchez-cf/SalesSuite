/**
 * Textos de los envíos (docs/LEADS.md §Plantillas): respuesta automática por email, aviso interno y las dos plantillas
 * de WhatsApp. Con la voz de quien firma (signer_name), en el idioma del lead (es, en o fr; si no, en). Sin contenido
 * promocional: son mensajes de servicio sobre lo que pidió. Las de WhatsApp tienen que estar aprobadas por Meta tal cual
 * (WA_BODIES); aquí solo se rellenan las variables.
 */
import type { LeadType } from './contract';
import type { Eta } from './schedule';

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
      general: () => ({ venue: 'tu local', festival: 'tu festival', wedding: 'vuestra boda', dj: 'tus sesiones' } as Record<string, string>)[f.event_type] ?? 'tu evento',
    },
    en: {
      venue: () => (f.venue_name ? `${f.venue_name}${where(f, l)}` : `your venue${where(f, l)}`),
      dj: () => `your DJ sets${where(f, l)}`,
      festival: () => (f.event_name ? f.event_name : 'your festival'),
      wedding: () => (f.wedding_date ? `your wedding on ${day(f.wedding_date, l)}` : 'your wedding'),
      wedding_partner: () => (f.company ? `working together with ${f.company}` : 'working together on weddings'),
      custom_dev: () => (f.company ? `a custom build for ${f.company}` : 'a custom build'),
      waitlist: () => 'the waiting list',
      general: () => ({ venue: 'your venue', festival: 'your festival', wedding: 'your wedding', dj: 'your DJ sets' } as Record<string, string>)[f.event_type] ?? 'your event',
    },
    fr: {
      venue: () => (f.venue_name ? `${f.venue_name}${where(f, l)}` : `ton établissement${where(f, l)}`),
      dj: () => `tes sets${where(f, l)}`,
      festival: () => (f.event_name ? f.event_name : 'ton festival'),
      wedding: () => (f.wedding_date ? `votre mariage du ${day(f.wedding_date, l)}` : 'votre mariage'),
      wedding_partner: () => (f.company ? `une collaboration avec ${f.company}` : 'une collaboration pour les mariages'),
      custom_dev: () => (f.company ? `un développement sur mesure pour ${f.company}` : 'un développement sur mesure'),
      waitlist: () => "la liste d'attente",
      general: () => ({ venue: 'ton établissement', festival: 'ton festival', wedding: 'votre mariage', dj: 'tes sets' } as Record<string, string>)[f.event_type] ?? 'ton événement',
    },
  };
  return T[l][type]();
}

/** Una pregunta sencilla que invite a contestar (mensaje 1). */
export function question(type: LeadType, f: Record<string, string>, loc: string): string {
  const l = msgLocale(loc);
  const kind = type === 'general' ? (f.event_type as LeadType | undefined) ?? 'general' : type;
  const Q: Record<MsgLocale, Partial<Record<LeadType | 'other', string>>> = {
    es: { venue: '¿Qué noches abrís y cuánta gente os suele venir?', dj: '¿En qué salas estás pinchando ahora?', festival: '¿Para qué fechas lo estáis planteando?',
      wedding: '¿Tenéis ya el sitio de la celebración?', wedding_partner: '¿Con cuántas bodas trabajáis más o menos al año?', custom_dev: '¿Para cuándo lo necesitarías?',
      waitlist: '¿Para qué tipo de evento te gustaría usarlo?', general: '¿Me cuentas un poco más de lo que tienes en mente?' },
    en: { venue: 'Which nights are you open and how many people do you usually get?', dj: 'Which venues are you playing at right now?', festival: 'Which dates are you planning for?',
      wedding: 'Do you already have the venue for the celebration?', wedding_partner: 'Roughly how many weddings do you work on each year?', custom_dev: 'When would you need it by?',
      waitlist: 'What kind of event would you like to use it for?', general: 'Could you tell me a bit more about what you have in mind?' },
    fr: { venue: 'Vous ouvrez quels soirs et combien de monde vient en général ?', dj: 'Dans quelles salles tu joues en ce moment ?', festival: 'Vous le prévoyez pour quelles dates ?',
      wedding: 'Avez-vous déjà le lieu de la réception ?', wedding_partner: 'Avec combien de mariages travaillez-vous environ par an ?', custom_dev: "Pour quand en aurais-tu besoin ?",
      waitlist: "Pour quel type d'événement aimerais-tu l'utiliser ?", general: "Tu peux m'en dire un peu plus sur ce que tu as en tête ?" },
  };
  return Q[l][kind] ?? Q[l].general!;
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

// ---------------------------------------------------------------- WhatsApp (plantillas para Meta)

/**
 * Cuerpo de las plantillas tal y como se mandan a aprobar a Meta. Variables: {{1}} nombre, {{2}} lo que pidió,
 * {{3}} la pregunta (wa1) o el enlace de reserva (wa2). La firma va fija en la plantilla.
 */
export const WA_BODIES: Record<'wa1' | 'wa2', Record<MsgLocale, (signer: string, brand: string) => string>> = {
  wa1: {
    es: (s, b) => `Hola {{1}}, soy ${s}, de ${b}. He visto tu mensaje sobre {{2}} y quería escribirte yo directamente.\n\n{{3}}\n\nCon eso te digo cómo lo veo.\n\n${s}`,
    en: (s, b) => `Hi {{1}}, it's ${s} from ${b}. I saw your message about {{2}} and wanted to get back to you myself.\n\n{{3}}\n\nWith that I can tell you how I see it.\n\n${s}`,
    fr: (s, b) => `Bonjour {{1}}, c'est ${s}, de ${b}. J'ai vu ton message à propos de {{2}} et je voulais te répondre moi-même.\n\n{{3}}\n\nAvec ça, je te dis ce que j'en pense.\n\n${s}`,
  },
  wa2: {
    es: (s) => `Hola {{1}}, te escribo de nuevo por lo de {{2}}. Si te va mejor hablarlo, elige aquí la hora que te venga bien: {{3}}\n\nY si prefieres seguir por aquí, contéstame cuando puedas.\n\n${s}`,
    en: (s) => `Hi {{1}}, following up on {{2}}. If it's easier to talk it through, pick a time that suits you here: {{3}}\n\nOr just reply here whenever you can.\n\n${s}`,
    fr: (s) => `Bonjour {{1}}, je reviens vers toi pour {{2}}. Si c'est plus simple d'en parler, choisis ici le créneau qui te convient : {{3}}\n\nSinon, réponds-moi ici quand tu peux.\n\n${s}`,
  },
};

export function waParams(step: 'wa1' | 'wa2', d: { name: string; type: LeadType; fields: Record<string, string>; locale: string; bookingUrl: string | null; videoUrl: string | null }): string[] {
  const p = [firstName(d.name), summary(d.type, d.fields, d.locale)];
  if (step === 'wa1') p.push(question(d.type, d.fields, d.locale));
  else p.push(d.bookingUrl ?? d.videoUrl ?? '');
  return p;
}
/** El texto que verá el lead (para la ficha y para probar sin WhatsApp). */
export function waPreview(step: 'wa1' | 'wa2', locale: string, signer: string, brand: string, params: string[]): string {
  return WA_BODIES[step][msgLocale(locale)](signer, brand).replace(/\{\{(\d)\}\}/g, (_, i) => params[+i - 1] ?? '');
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
}
export function autoreplyEmail(d: AutoreplyData): { subject: string; text: string; html: string } {
  const l = msgLocale(d.locale);
  const what = summary(d.type, d.fields, l);
  const n = firstName(d.name);
  const when = {
    es: { minutes: 'en unos minutos', today: 'hoy a primera hora', next_business_day: 'mañana a primera hora' },
    en: { minutes: 'in a few minutes', today: 'first thing today', next_business_day: 'first thing tomorrow' },
    fr: { minutes: "d'ici quelques minutes", today: "aujourd'hui en début de matinée", next_business_day: 'demain en début de matinée' },
  }[l][d.eta];
  const L = {
    es: {
      subject: `Sobre ${what}`,
      body: [
        `Hola ${n}:`,
        `Gracias por escribir. Me llega tu mensaje sobre ${what} y lo leo yo.`,
        d.channel === 'whatsapp' ? `Te escribo por WhatsApp ${when} para que me cuentes un poco más.` : 'Te contesto yo personalmente a este mismo email, normalmente en el día.',
        d.bookingUrl ? `Si prefieres hablarlo directamente, elige aquí la hora que te venga bien: ${d.bookingUrl}` : '',
        'Y si quieres añadir algo, responde a este email.',
        `Un saludo,\n${d.signer}\n${d.brand}`,
      ],
      unsub: 'Si no quieres que te escribamos más:',
    },
    en: {
      subject: `About ${what}`,
      body: [
        `Hi ${n},`,
        `Thanks for getting in touch. I've got your message about ${what} and I'm reading it myself.`,
        d.channel === 'whatsapp' ? `I'll message you on WhatsApp ${when} so you can tell me a bit more.` : "I'll reply to this email personally, usually the same day.",
        d.bookingUrl ? `If you'd rather talk it through, pick a time that suits you here: ${d.bookingUrl}` : '',
        'And if you want to add anything, just reply to this email.',
        `Best,\n${d.signer}\n${d.brand}`,
      ],
      unsub: "If you'd rather not hear from us again:",
    },
    fr: {
      subject: `À propos de ${what}`,
      body: [
        `Bonjour ${n},`,
        `Merci pour ton message à propos de ${what}. Je le lis moi-même.`,
        d.channel === 'whatsapp' ? `Je t'écris sur WhatsApp ${when} pour que tu m'en dises un peu plus.` : 'Je te réponds personnellement à cet e-mail, en général dans la journée.',
        d.bookingUrl ? `Si tu préfères en parler directement, choisis ici le créneau qui te convient : ${d.bookingUrl}` : '',
        "Et si tu veux ajouter quelque chose, réponds simplement à cet e-mail.",
        `À bientôt,\n${d.signer}\n${d.brand}`,
      ],
      unsub: 'Si tu ne veux plus recevoir de messages de notre part :',
    },
  }[l];
  const text = [...L.body.filter(Boolean), d.unsubscribeUrl ? `—\n${L.unsub} ${d.unsubscribeUrl}` : ''].filter(Boolean).join('\n\n');
  return { subject: L.subject, text, html: plainHtml(text) };
}

// ---------------------------------------------------------------- Email: aviso interno (en español: es para el equipo)

export interface NotifyData {
  brand: string; leadUrl: string; name: string; email: string; emailKind: string; phone: string | null; phoneE164: string | null; type: LeadType;
  fields: Record<string, string>; message: string | null; cta: string | null; page: string | null; source: string | null;
  score: number | null; band: string | null; repeat: number; quarantine: string[]; next: string; test: boolean;
}
const TYPE_ES: Record<LeadType, string> = { general: 'General', venue: 'Local', dj: 'DJ', festival: 'Festival', wedding: 'Boda', wedding_partner: 'Proveedor de bodas', custom_dev: 'Desarrollo a medida', waitlist: 'Lista de espera' };
export function notifyEmail(d: NotifyData): { subject: string; text: string; html: string } {
  const flag = d.test ? '[PRUEBA] ' : d.quarantine.length ? '[Cuarentena] ' : d.band === 'hot' ? '🔥 ' : '';
  const subject = `${flag}Lead ${d.brand}: ${d.name} · ${TYPE_ES[d.type]}${d.repeat > 1 ? ` (envío nº ${d.repeat})` : ''}`;
  const rows: [string, string | null][] = [
    ['Nombre', d.name], ['Email', `${d.email} (${d.emailKind})`], ['Teléfono', d.phoneE164 ?? d.phone ?? null], ['Tipo', TYPE_ES[d.type]],
    ...Object.entries(d.fields).map(([k, v]) => [k, v] as [string, string]),
    ['Mensaje', d.message], ['Botón', d.cta], ['Página', d.page], ['Origen', d.source],
    ['Puntuación', d.score != null ? `${d.score} (${d.band})` : null], ['Cuarentena', d.quarantine.length ? d.quarantine.join(', ') : null],
    ['Siguiente paso', d.next],
  ];
  const text = [...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '', `Abrir en el CRM: ${d.leadUrl}`, 'Responde a este email para escribirle directamente.'].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111"><table style="border-collapse:collapse">${
    rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v!)}</td></tr>`).join('')
  }</table><p style="margin-top:16px"><a href="${esc(d.leadUrl)}">Abrir en el CRM</a> · Responde a este email para escribirle directamente.</p></div>`;
  return { subject, text, html };
}
