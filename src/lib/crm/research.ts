/**
 * Investigación con IA (docs/CRM_DINAMICO.md §13): un primer repaso de la empresa en la web para que, al abrir la ficha,
 * ya haya algo. Claude busca y lee lo público (web, Google, prensa, redes que se puedan leer) y PROPONE: cualificación,
 * contacto y personas, cada cosa con su prueba y su fuente. Nada se guarda sin que el comercial lo acepte con un clic, y
 * lo que no tiene fuente se descarta. Lo que solo ve un humano (stories, ambiente, quién manda) va en «Para mirar tú».
 *
 * La lógica de qué se acepta es pura y probada (`sanitizeResearch`); la llamada a Claude está aparte (`claudeResearch`).
 */
import Anthropic from '@anthropic-ai/sdk';
import { QUAL_VALUES } from './priority';

/** Criterios que la IA puede proponer (lo que se ve desde fuera). «Decide quien te atiende», la cobertura y «no pueden
 *  validar» solo los sabe el comercial en persona; «validate» además solo si lo dicen ellos. */
export const AI_QUAL_KEYS = ['kind', 'nights', 'events', 'recurring', 'screens', 'dynamics', 'scale', 'debt'] as const;
export const AI_CONTACT_KEYS = ['phone', 'email', 'instagram', 'linkedin', 'website'] as const;
export type AiContactKey = (typeof AI_CONTACT_KEYS)[number];

export type SuggestionStatus = 'open' | 'accepted' | 'dismissed';
export type Suggestion =
  | { id: string; kind: 'qual'; key: string; value: string; evidence: string; source: string; status: SuggestionStatus }
  | { id: string; kind: 'contact'; key: AiContactKey; value: string; evidence: string; source: string; status: SuggestionStatus }
  | { id: string; kind: 'person'; name: string; role: string | null; instagram: string | null; linkedin: string | null; evidence: string; source: string; status: SuggestionStatus };

export interface AiResearch {
  at: string;
  /** En dos líneas: qué es y por qué podría encajar (o no). */
  summary: string;
  /** Lo que la IA no puede ver y conviene mirar a mano. */
  look: string[];
  suggestions: Suggestion[];
  sources: Array<{ title: string; url: string }>;
}

export interface ResearchInput {
  name: string; city: string | null; address: string | null; website: string | null; instagram: string | null;
  sector: { name: string; icp: string | null; personas: string[] } | null;
  seller: string;
  /** Lo que ya está marcado (para no proponerlo otra vez). */
  known: Record<string, unknown>;
}
export interface ResearchApi { research(input: ResearchInput): Promise<unknown> }

// ---------------------------------------------------------------- la herramienta que rellena Claude (esquema estricto)

const str = { type: 'string' } as const;
const strOrNull = { type: ['string', 'null'] } as const;
export const SAVE_TOOL = {
  name: 'save_research',
  description: 'Guarda lo que has encontrado de la empresa. Llámala una sola vez, al final, con todo. Cada propuesta lleva la frase que la prueba y la URL donde la has leído.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false,
    required: ['summary', 'look', 'qualification', 'contact', 'people', 'sources'],
    properties: {
      summary: { ...str, description: 'Dos frases: qué es la empresa y por qué podría encajar o no. Sin inventar.' },
      look: { type: 'array', items: str, description: 'Lo que no se puede saber desde fuera y el comercial debería mirar (máximo 4).' },
      qualification: {
        type: 'array', description: 'Criterios que has podido comprobar. Solo los que tengan prueba.',
        items: {
          type: 'object', additionalProperties: false, required: ['key', 'value', 'evidence', 'source'],
          properties: {
            key: { type: 'string', enum: [...AI_QUAL_KEYS] },
            value: { type: 'string', description: 'Uno de los valores permitidos para esa clave.' },
            evidence: str, source: str,
          },
        },
      },
      contact: {
        type: 'array', description: 'Datos de contacto públicos DE LA EMPRESA (no personales).',
        items: {
          type: 'object', additionalProperties: false, required: ['key', 'value', 'evidence', 'source'],
          properties: { key: { type: 'string', enum: [...AI_CONTACT_KEYS] }, value: str, evidence: str, source: str },
        },
      },
      people: {
        type: 'array', description: 'Personas con un papel público en la empresa (dueño, gerente, programador, DJ residente…).',
        items: {
          type: 'object', additionalProperties: false, required: ['name', 'role', 'instagram', 'linkedin', 'evidence', 'source'],
          properties: { name: str, role: strOrNull, instagram: strOrNull, linkedin: strOrNull, evidence: str, source: str },
        },
      },
      sources: {
        type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'url'], properties: { title: str, url: str } },
      },
    },
  },
} as const;

const VALUE_HELP = Object.entries(QUAL_VALUES).filter(([k]) => (AI_QUAL_KEYS as readonly string[]).includes(k))
  .map(([k, v]) => `- ${k}: ${v.join(' | ')}`).join('\n');

export const SYSTEM = `Eres el investigador de un equipo comercial. Preparas la ficha de una empresa antes de que el comercial la contacte.
Busca en la web lo público de la empresa (su web, Google, prensa local, agendas de eventos, redes que se puedan leer) y guarda lo que encuentres con la herramienta save_research.

Reglas:
- Nada sin fuente. Cada dato lleva la URL donde lo has leído y la frase que lo prueba. Si no lo has leído, no lo pongas.
- Es otra empresa con el mismo nombre si la ciudad o la actividad no cuadran: entonces no la uses.
- Solo datos de contacto de la empresa (teléfono, email genérico, perfiles de la empresa). De las personas, solo nombre, papel y perfil profesional o público si lo publican ellas.
- Los criterios de cualificación y sus valores:
${VALUE_HELP}
  kind: venue = local o sala; promoter = promotora de eventos; concert = programa conciertos.
  nights = noches que abre a la semana (si es un local). events = eventos al año (si es promotora). recurring = si programa de forma recurrente (conciertos).
  screens = si tiene pantallas en sala (yes) o no. dynamics = si hace dinámicas con el público o cuida sus redes (yes / partly / no).
  scale = un local (single), 2–3 locales (few), grupo o varias salas (group). debt = true solo si hay noticia de cierre, concurso o deudas.
- No repitas lo que ya está marcado en la ficha.
- Escribe en español, corto y claro. Si no encuentras nada útil, dilo en summary y deja las listas vacías.`;

export function userPrompt(i: ResearchInput): string {
  const lines = [
    `Empresa: ${i.name}`,
    i.city && `Ciudad o zona: ${i.city}`, i.address && `Dirección: ${i.address}`,
    i.website && `Web: ${i.website}`, i.instagram && `Instagram: ${i.instagram}`,
    i.sector && `Sector en el que la tenemos: ${i.sector.name}`,
    i.sector?.icp && `A quién vendemos en este sector: ${i.sector.icp}`,
    i.sector?.personas.length && `Con quién solemos hablar: ${i.sector.personas.join(', ')}`,
    `Qué vende el equipo: ${i.seller}`,
    Object.keys(i.known).length ? `Ya marcado en la ficha (no lo repitas): ${JSON.stringify(i.known)}` : null,
  ].filter(Boolean);
  return `${lines.join('\n')}\n\nInvestiga y llama a save_research con lo que encuentres.`;
}

// ---------------------------------------------------------------- qué se acepta de lo que devuelve (puro)

const MAX = { evidence: 300, value: 300, summary: 600, look: 4, sugg: 20, sources: 12 } as const;
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
/** Solo URLs http(s) con dominio: lo demás no es una fuente. */
export function sourceUrl(v: unknown): string | null {
  const s = clip(v, 500);
  try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function contactValue(key: AiContactKey, v: string): string | null {
  if (!v) return null;
  if (key === 'email') return EMAIL.test(v) ? v.toLowerCase() : null;
  if (key === 'phone') return /^[+\d][\d\s().-]{5,}$/.test(v) ? v : null;
  if (key === 'instagram') return /^@?[\w.]{2,30}$/.test(v) ? `https://www.instagram.com/${v.replace(/^@/, '')}/` : sourceUrl(v) && /instagram\.com\//i.test(v) ? v : null;
  if (key === 'linkedin') return sourceUrl(v) && /linkedin\.com\//i.test(v) ? v : null;
  return sourceUrl(/^https?:\/\//i.test(v) ? v : `https://${v}`);
}

/**
 * Lo que devuelve la IA → lo que se enseña. Descarta lo que no tiene fuente, valores fuera de lo permitido, lo que ya
 * está marcado o ya está en la ficha, y duplicados.
 */
export function sanitizeResearch(raw: unknown, ctx: { known: Record<string, unknown>; contact: Partial<Record<AiContactKey, string | null>>; people: string[]; now: Date }): AiResearch {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const out: Suggestion[] = [];
  let n = 0;
  const id = () => `s${++n}`;
  const seen = new Set<string>();
  for (const q of list(r.qualification)) {
    const key = clip(q?.key, 20); const value = clip(q?.value, 20); const source = sourceUrl(q?.source); const evidence = clip(q?.evidence, MAX.evidence);
    if (!(AI_QUAL_KEYS as readonly string[]).includes(key) || !QUAL_VALUES[key]?.includes(value) || !source || !evidence) continue;
    if (ctx.known[key] !== undefined || seen.has(`q:${key}`)) continue;
    seen.add(`q:${key}`);
    out.push({ id: id(), kind: 'qual', key, value, evidence, source, status: 'open' });
  }
  for (const c of list(r.contact)) {
    const key = clip(c?.key, 20) as AiContactKey; const source = sourceUrl(c?.source); const evidence = clip(c?.evidence, MAX.evidence);
    if (!(AI_CONTACT_KEYS as readonly string[]).includes(key) || !source || !evidence) continue;
    const value = contactValue(key, clip(c?.value, MAX.value));
    if (!value || ctx.contact[key] || seen.has(`c:${key}`)) continue;
    seen.add(`c:${key}`);
    out.push({ id: id(), kind: 'contact', key, value, evidence, source, status: 'open' });
  }
  const known = new Set(ctx.people.map((x) => x.trim().toLowerCase()));
  for (const p of list(r.people)) {
    const name = clip(p?.name, 160); const source = sourceUrl(p?.source); const evidence = clip(p?.evidence, MAX.evidence);
    if (!name || !source || !evidence || known.has(name.toLowerCase()) || seen.has(`p:${name.toLowerCase()}`)) continue;
    seen.add(`p:${name.toLowerCase()}`);
    const ig = clip(p?.instagram, 300); const li = clip(p?.linkedin, 300);
    out.push({ id: id(), kind: 'person', name, role: clip(p?.role, 80) || null,
      instagram: ig ? contactValue('instagram', ig) : null, linkedin: li ? contactValue('linkedin', li) : null, evidence, source, status: 'open' });
  }
  const sources = list(r.sources).map((x) => ({ title: clip(x?.title, 200), url: sourceUrl(x?.url) }))
    .filter((x): x is { title: string; url: string } => !!x.url);
  // Las fuentes de las propuestas también cuentan (aunque no las haya listado).
  for (const sg of out) if (!sources.some((x) => x.url === sg.source)) sources.push({ title: new URL(sg.source).hostname, url: sg.source });
  return {
    at: ctx.now.toISOString(),
    summary: clip(r.summary, MAX.summary),
    look: list(r.look).map((x) => clip(x, 200)).filter(Boolean).slice(0, MAX.look),
    suggestions: out.slice(0, MAX.sugg),
    sources: sources.slice(0, MAX.sources),
  };
}

/** Lo guardado (jsonb) → AiResearch, o null si no hay o está roto. */
export function readResearch(v: unknown): AiResearch | null {
  const r = v as AiResearch | null;
  return r && typeof r === 'object' && typeof r.at === 'string' && Array.isArray(r.suggestions) ? r : null;
}

// ---------------------------------------------------------------- Claude (web search + web fetch)

export const RESEARCH_MODEL = 'claude-opus-5-5';

/**
 * Claude con búsqueda y lectura web (herramientas de servidor) y la herramienta save_research. Devuelve lo que puso en
 * save_research (sin validar: eso lo hace `sanitizeResearch`), o null si no la llamó.
 */
export function claudeResearch(apiKey: string, fetchImpl?: typeof fetch): ResearchApi {
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return {
    async research(input) {
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userPrompt(input) }];
      for (let turn = 0; turn < 4; turn++) {
        const res = await client.beta.messages.create({
          model: RESEARCH_MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: SYSTEM,
          tools: [
            { type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'ES', ...(input.city ? { city: input.city.slice(0, 60) } : {}) } },
            { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 },
            SAVE_TOOL as unknown as Anthropic.Beta.BetaTool,
          ],
          messages,
        });
        if (res.stop_reason === 'refusal') return null;
        const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === SAVE_TOOL.name);
        if (call) return call.input;
        // Búsqueda larga en pausa: se devuelve el turno tal cual y sigue.
        if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
        // Terminó sin guardar: se le pide una vez que guarde lo que tenga.
        messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: 'Llama ahora a save_research con lo que tengas (listas vacías si no hay nada).' });
      }
      return null;
    },
  };
}

/**
 * Respuesta fija para las pruebas automáticas (solo con AI_RESEARCH_FIXTURE=1 y sin clave): no llama a nadie y lo dice
 * en el resumen. Las fuentes son de example.com.
 */
export const fixtureResearch = (): ResearchApi => ({
  async research(i) {
    const src = `https://example.com/${encodeURIComponent(i.name.toLowerCase().replace(/\s+/g, '-'))}`;
    return {
      summary: `Ejemplo de prueba (sin IA): ${i.name} es un local de ocio nocturno.`,
      look: ['Mira sus stories para ver si hace dinámicas con el público.'],
      qualification: [
        { key: 'nights', value: '3', evidence: 'Abre jueves, viernes y sábado.', source: `${src}/horario` },
        { key: 'screens', value: 'yes', evidence: 'En las fotos de la sala se ven dos pantallas.', source: `${src}/fotos` },
        { key: 'decider', value: 'onsite', evidence: 'No se puede saber desde fuera.', source: src },
        { key: 'scale', value: 'single', evidence: '', source: src },
      ],
      contact: [
        { key: 'email', value: 'hola@ejemplo.test', evidence: 'Email en el pie de su web.', source: src },
        { key: 'website', value: 'ejemplo.test', evidence: 'Sin fuente.', source: 'no-es-una-url' },
      ],
      people: [{ name: 'Laura Gil', role: 'Gerente', instagram: null, linkedin: null, evidence: 'La entrevistan como gerente.', source: `${src}/prensa` }],
      sources: [{ title: 'Web del local', url: src }],
    };
  },
});
