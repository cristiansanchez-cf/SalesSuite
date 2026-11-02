/**
 * Qué es de verdad cada lead (docs/LEADS.md §Clasificar), antes de escribirle nada automático. El tipo de formulario
 * no basta: una marca de bebidas que quiere un acuerdo puede escribir desde «locales» o desde «otro», y mandarle un
 * WhatsApp pensado para un local quedaría fatal. Primero reglas (al momento, sin coste) y, si hay IA, una comprobación
 * con Haiku sobre su dominio, su empresa y lo que escribió. Prudente a propósito: ante la duda, lo mira una persona.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { LeadType } from './contract';
import type { EmailKind } from './normalize';

export const CATEGORIES = ['venue', 'dj', 'promoter', 'festival', 'event', 'wedding', 'partner', 'press', 'vendor', 'job', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export interface Classification { category: Category; confidence: number; reason: string; by: 'rules' | 'ai'; auto: boolean; expected: Category | null }

export interface ClassifyInput {
  type: LeadType; fields: Record<string, string>; message: string | null; name: string; email: string; emailKind: EmailKind;
  cta: string | null; page: string | null;
}

/** Lo que el formulario dice que es (null = no hay mensaje automático pensado para eso: siempre una persona). */
export function expectedCategory(type: LeadType, fields: Record<string, string>): Category | null {
  if (type === 'venue' || type === 'dj' || type === 'festival' || type === 'wedding') return type;
  if (type === 'general' && ['venue', 'dj', 'festival', 'wedding'].includes(fields.event_type ?? '')) return fields.event_type as Category;
  // «Otro» del formulario general: un evento o un espacio que no está en la lista (gimnasio, hotel, congreso…). Va con la
  // pregunta general, y solo si nada dice que sea otra cosa (la IA lo confirma antes de enviar).
  if (type === 'general') return 'event';
  return null; // wedding_partner, custom_dev, waitlist: siempre una persona
}

const SIGNALS: [Category, RegExp][] = [
  // Una marca o alianza (no «vendemos bebidas»: eso lo dice cualquier local).
  ['partner', /patrocin|sponsor|alianza|partnership|acuerdo (comercial|de colaboraci)|colaboraci[oó]n comercial|distribuidor|distribuci[oó]n de|nuestra marca|our brand|brand (deal|partnership|activation|ambassador)|activaci[oó]n de marca|marca de (bebida|cerveza|licor|ron|ginebra|vodka|whisky|refresco|energ)|inversor|investor|ronda de inversi|white ?label|marca blanca|revend|resell|partenariat|sponsoring/i],
  ['press', /prensa|periodist|journalist|\bpress\b|reportaje|art[ií]culo sobre|entrevista|interview|podcast|medio de comunicaci|magazine|revista|journaliste/i],
  ['job', /busco trabajo|trabajar con vosotros|oferta de (trabajo|empleo)|\bempleo\b|vacante|\bcv\b|curr[ií]cul|candidat|pr[aá]cticas|internship|becari|candidature|\bemploi\b/i],
  ['vendor', /ofrecemos|we offer|nos dedicamos a|nuestros servicios|our services|agencia de (marketing|publicidad|seo)|marketing agency|\bseo\b|posicionamiento web|desarrollo web|web development|leads? cualificad|captaci[oó]n de clientes|somos proveedores|nous proposons/i],
  ['promoter', /promotora|promotor\b|promoter|organizamos (fiestas|eventos)|ciclo de fiestas|nuestras fiestas|our parties|soir[eé]es/i],
];

/** Señales en lo que escribió (mensaje, empresa, nombre del evento o del local). */
export function signals(i: ClassifyInput): Category[] {
  const text = [i.message, i.fields.company, i.fields.event_name, i.fields.venue_name, i.fields.website, i.name].filter(Boolean).join(' \n ');
  return SIGNALS.filter(([, re]) => re.test(text)).map(([c]) => c);
}

const SAFE_WITH: Partial<Record<Category, Category[]>> = { festival: ['festival', 'promoter'], venue: ['venue'], dj: ['dj'], wedding: ['wedding'], event: ['event', 'venue', 'promoter', 'festival'] };
const RISKY: Category[] = ['partner', 'press', 'job', 'vendor'];

/** Solo reglas: al momento, en la entrada. Automático si el formulario es de un tipo con mensaje y no hay señales de otra cosa. */
export function classifyRules(i: ClassifyInput): Classification {
  const expected = expectedCategory(i.type, i.fields);
  const sig = signals(i);
  const risky = sig.find((c) => RISKY.includes(c));
  if (risky) return { category: risky, confidence: 0.8, reason: `Señales de ${risky} en lo que escribió`, by: 'rules', auto: false, expected };
  if (!expected) return { category: sig[0] ?? 'other', confidence: 0.4, reason: 'El formulario no dice qué es (otro, proveedor, desarrollo, lista de espera)', by: 'rules', auto: false, expected };
  const cat = sig.includes('promoter') && expected === 'festival' ? 'promoter' : expected;
  if (sig.includes('promoter') && expected !== 'festival') return { category: 'promoter', confidence: 0.6, reason: 'Parece una promotora, no lo que dice el formulario', by: 'rules', auto: false, expected };
  return { category: cat, confidence: 0.7, reason: 'Encaja con el formulario y no hay señales de otra cosa', by: 'rules', auto: true, expected };
}

/** Lo que dice la IA, combinado con lo que se esperaba: automático solo si coincide y está segura. */
export function decide(expected: Category | null, ai: { category: Category; confidence: number; reason: string }): Classification {
  const ok = !!expected && (SAFE_WITH[expected] ?? [expected]).includes(ai.category) && ai.confidence >= 0.75;
  return { ...ai, by: 'ai', auto: ok, expected };
}

export type Classifier = (i: ClassifyInput, context: string | null) => Promise<{ category: Category; confidence: number; reason: string } | null>;

export const CLASSIFY_MODEL = 'claude-haiku-5-5';
const TOOL = {
  name: 'classify_lead',
  description: 'Clasifica quién ha escrito por el formulario de la web.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['category', 'confidence', 'reason'],
    properties: {
      category: { type: 'string', enum: [...CATEGORIES], description: 'venue = cualquier espacio con público que lo usaría: discoteca, bar, sala, pub, hotel, restaurante, gimnasio, centro deportivo, club, caseta de feria…; dj; promoter = promotora u organizador de fiestas recurrentes; festival; event = alguien que organiza un evento puntual (corporativo, privado, congreso, cumpleaños, concierto) que no es boda ni festival; wedding = una pareja que se casa; partner = marca, patrocinador, distribuidor, inversor o alianza comercial; press = prensa o medio; vendor = alguien que nos quiere vender algo; job = busca trabajo; other = no está claro.' },
      confidence: { type: 'number', description: 'De 0 a 1. Por debajo de 0.75 si hay cualquier duda.' },
      reason: { type: 'string', description: 'Una frase corta en español con la pista que lo decide.' },
    },
  },
} as const;

export function claudeClassifier(apiKey: string, fetchImpl?: typeof fetch): Classifier {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (i, context) => {
    const domain = i.email.slice(i.email.lastIndexOf('@') + 1);
    const res = await client.messages.create({
      model: CLASSIFY_MODEL, max_tokens: 400,
      system: `Eres prudente. Decides si un mensaje automático pensado para un tipo de cliente encajaría con quien ha escrito. ${context ? `Contexto de la empresa que recibe el lead: ${context}` : ''}\nSi hay señales de que es una marca, patrocinador, distribuidor, prensa, alguien que vende algo o busca trabajo, dilo aunque el formulario diga otra cosa. El dominio del email ayuda (p. ej. el de una marca de bebidas). Ante la duda, confianza baja.`,
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: [
        `Formulario: ${i.type}${i.fields.event_type ? ` (${i.fields.event_type})` : ''}`,
        `Nombre: ${i.name}`, `Email: dominio ${domain} (${i.emailKind})`,
        ...Object.entries(i.fields).filter(([k]) => k !== 'event_type').map(([k, v]) => `${k}: ${v}`),
        i.cta ? `Botón: ${i.cta}` : '', i.page ? `Página: ${i.page}` : '',
        `Mensaje: <mensaje>${(i.message ?? '').slice(0, 2000)}</mensaje>`,
      ].filter(Boolean).join('\n') }],
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const v = call?.input as { category?: string; confidence?: number; reason?: string } | undefined;
    if (!v || !CATEGORIES.includes(v.category as Category)) return null;
    return { category: v.category as Category, confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0)), reason: String(v.reason ?? '').slice(0, 200) };
  };
}

/** Pruebas sin clave (AI_RESEARCH_FIXTURE=1): «marca/patrocinio» → partner; si no, lo esperado con 0.9. */
export const fixtureClassifier: Classifier = async (i) => {
  const sig = signals(i).find((c) => RISKY.includes(c));
  const exp = expectedCategory(i.type, i.fields);
  return sig ? { category: sig, confidence: 0.9, reason: `(prueba) parece ${sig}` } : { category: exp ?? 'other', confidence: exp ? 0.9 : 0.3, reason: '(prueba) encaja con el formulario' };
};
