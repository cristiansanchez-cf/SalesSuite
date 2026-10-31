/**
 * Agente de alta (docs/SETUP_WIZARD.md §Agente de alta): en vez de copiar cinco prompts a otro chat, se le da a la IA la web
 * de la empresa, sus documentos (PDF o texto) y lo que se quiera contar; lee todo y devuelve un BORRADOR de los cinco
 * bloques de la configuración guiada (empresa, clientes y actores, situaciones, cómo se vende, precios) más las preguntas
 * que no ha podido contestar. Se contestan en la misma pantalla y lo afina; luego se revisa e importa con el mismo
 * importador de los bloques (solo añade, nunca borra ni pisa). Nada sin fuente: lo que no sabe lo deja vacío y lo pregunta.
 *
 * Lo puro (`readDraft`, `agentPrompt`) va probado; la llamada a Claude está aparte (`claudeSetupAgent`).
 */
import Anthropic from '@anthropic-ai/sdk';
import { AI_BLOCKS, FORMATS, GOALS, parseData, type AiBlock, type AiData } from './ai-import';

export interface AgentFile { name: string; mediaType: 'application/pdf' | 'text/plain'; data: string /* base64 (PDF) o texto */ }
export interface AgentInput {
  company: string;
  person: string;
  /** Idioma del espacio (es-ES, en-GB…): en él se escribe el contenido. */
  locale: string;
  website: string | null;
  notes: string;
  files: AgentFile[];
  /** Para afinar: el borrador anterior y lo que han contestado. */
  previous?: Draft | null;
  answers?: Array<{ question: string; answer: string }>;
}
export interface AgentApi { draft(input: AgentInput): Promise<unknown> }

export interface Draft {
  summary: string;
  blocks: { [B in AiBlock]?: AiData<B> };
  questions: Array<{ block: AiBlock; question: string }>;
  sources: Array<{ title: string; url: string }>;
}

export const AGENT_MODEL = 'claude-sonnet-5-5';
export const MAX_FILES = 4;
/** Lo que cabe en una petición (Vercel corta en ~4,5 MB) con margen. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 60_000;

const LANG: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', ko: 'coreano', ca: 'catalán', fr: 'francés' };
export const languageOf = (locale: string) => LANG[locale.slice(0, 2).toLowerCase()] ?? 'español';

// ---------------------------------------------------------------- la herramienta que rellena Claude

const BLOCK_DESC = Object.fromEntries(AI_BLOCKS.map((b) => [b, `Bloque «${b}» con este formato: ${FORMATS[b].replace(/\s+/g, ' ')}`]));
export const SAVE_TOOL = {
  name: 'save_setup',
  description: 'Guarda el borrador de la configuración. Llámala una sola vez, al final, con todo lo que tengas.',
  input_schema: {
    type: 'object',
    required: ['summary', 'empresa', 'mercado', 'situaciones', 'jugadas', 'precios', 'questions', 'sources'],
    properties: {
      summary: { type: 'string', description: 'Dos o tres frases: qué es la empresa y qué has podido sacar (y qué no).' },
      ...Object.fromEntries(AI_BLOCKS.map((b) => [b, { type: 'object', description: BLOCK_DESC[b] }])),
      questions: {
        type: 'array', description: 'Lo que no has podido saber y hace falta para completar el borrador. Como mucho 12, de la más importante a la menos.',
        items: { type: 'object', required: ['block', 'question'], properties: { block: { type: 'string', enum: [...AI_BLOCKS] }, question: { type: 'string' } } },
      },
      sources: { type: 'array', items: { type: 'object', required: ['title', 'url'], properties: { title: { type: 'string' }, url: { type: 'string' } } } },
    },
  },
} as const;

export function agentSystem(i: Pick<AgentInput, 'company' | 'locale'>): string {
  return [
    `Preparas la herramienta de ventas de ${i.company}: lo que sus comerciales aprenden y usan para vender.`,
    'Lees su web y sus documentos y rellenas cinco bloques. Para cada bloque, lo que hay que cubrir:',
    ...AI_BLOCKS.flatMap((b) => [`«${b}» (${GOALS[b].goal}):`, ...GOALS[b].cover.map((x) => `  - ${x}`), ...GOALS[b].rules.map((x) => `  - Regla: ${x}`)]),
    '',
    'Reglas:',
    '- NO inventes. Solo lo que esté en su web, sus documentos o lo que te cuenten. Lo que no sepas, cadena vacía o lista vacía, y pregúntalo en "questions".',
    '- Precios: solo los que aparezcan escritos. Si no hay, "tarifas" vacía y pregunta por ellos.',
    '- Jugadas: frases que un comercial pueda decir tal cual; si una objeción no tiene respuesta en las fuentes, pregúntala.',
    `- Escribe el contenido en ${languageOf(i.locale)}, con el vocabulario de la empresa. Las claves del JSON, tal cual.`,
    '- Preguntas cortas, de una en una, que su responsable pueda contestar en una línea.',
    '- Al terminar, llama a save_setup una sola vez.',
  ].join('\n');
}

/** El mensaje del usuario: qué hay que leer y, al afinar, el borrador anterior con sus respuestas. */
export function agentPrompt(i: AgentInput): string {
  const lines = [`Empresa: ${i.company}. Te atiende ${i.person}.`];
  if (i.website) lines.push(`Su web: ${i.website} (léela: la portada y las páginas de servicios, precios, clientes o casos).`);
  if (i.files.length) lines.push(`Te adjunto ${i.files.length === 1 ? 'un documento' : `${i.files.length} documentos`}: ${i.files.map((f) => f.name).join(', ')}.`);
  if (i.notes.trim()) lines.push('', 'Lo que te cuenta:', i.notes.trim().slice(0, MAX_TEXT));
  if (i.previous) {
    lines.push('', 'Este es tu borrador anterior. Mantén lo que estaba y complétalo con sus respuestas (no quites nada que siga siendo cierto):', JSON.stringify(i.previous));
    const a = (i.answers ?? []).filter((x) => x.answer.trim());
    if (a.length) lines.push('', 'Sus respuestas:', ...a.map((x) => `- ${x.question}\n  → ${x.answer.trim().slice(0, 4000)}`));
  }
  return lines.join('\n');
}

/** Lo que devolvió la IA, ya con el formato de cada bloque (lo que no encaja se descarta). */
export function readDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Lo que devuelve la IA trae los bloques arriba; un borrador ya leído (el que viaja en el formulario), en «blocks».
  const src = (r.blocks && typeof r.blocks === 'object' ? r.blocks : r) as Record<string, unknown>;
  const blocks: Draft['blocks'] = {};
  for (const b of AI_BLOCKS) {
    // Acepta el bloque con o sin su envoltorio ({"empresa": {...}} o directamente {...}).
    const v = src[b] && typeof src[b] === 'object' ? src[b] as Record<string, unknown> : null;
    if (!v) continue;
    const wrapped = b === 'empresa' ? (v.empresa ? v : { empresa: v }) : v;
    const d = parseData(b, wrapped);
    if (d) (blocks as Record<string, unknown>)[b] = d;
  }
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q) => q as { block?: unknown; question?: unknown })
    .filter((q) => typeof q.question === 'string' && q.question.trim())
    .map((q) => ({ block: (AI_BLOCKS.includes(q.block as AiBlock) ? q.block : 'empresa') as AiBlock, question: String(q.question).trim().slice(0, 300) }))
    .slice(0, 12);
  const sources = (Array.isArray(r.sources) ? r.sources : [])
    .map((x) => x as { title?: unknown; url?: unknown })
    .filter((x) => typeof x.url === 'string' && /^https?:\/\//.test(x.url))
    .map((x) => ({ title: String(x.title ?? x.url).slice(0, 120), url: String(x.url).slice(0, 500) }))
    .slice(0, 20);
  if (!Object.keys(blocks).length && !questions.length) return null;
  return { summary: typeof r.summary === 'string' ? r.summary.slice(0, 1000) : '', blocks, questions, sources };
}

/** Cuántas cosas trae cada bloque (para la pantalla). */
export function countOf(d: Draft, b: AiBlock): number {
  const x = d.blocks[b] as Record<string, unknown> | undefined;
  if (!x) return 0;
  if (b === 'empresa') { const e = (x as AiData<'empresa'>).empresa; return [e.que_vendemos, e.para_quien, e.por_que_nos_compran, e.no_somos].filter(Boolean).length + e.pruebas.filter(Boolean).length; }
  if (b === 'mercado') return (x as AiData<'mercado'>).sectores.reduce((n, s) => n + 1 + s.actores.length, 0);
  if (b === 'situaciones') return (x as AiData<'situaciones'>).situaciones.length;
  if (b === 'jugadas') return (x as AiData<'jugadas'>).jugadas.length;
  const p = x as AiData<'precios'>;
  return p.tarifas.length + p.descuentos.length;
}

// ---------------------------------------------------------------- Claude (lee la web y los documentos)

export function claudeSetupAgent(apiKey: string, fetchImpl?: typeof fetch): AgentApi {
  const client = new Anthropic({ apiKey, timeout: 270_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return {
    async draft(input) {
      const docs: Anthropic.Beta.BetaContentBlockParam[] = input.files.map((f) => f.mediaType === 'application/pdf'
        ? { type: 'document', title: f.name, source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
        : { type: 'document', title: f.name, source: { type: 'text', media_type: 'text/plain', data: f.data.slice(0, MAX_TEXT) } });
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: [...docs, { type: 'text', text: agentPrompt(input) }] }];
      // Al afinar no hace falta volver a leer la web.
      const web = input.website && !input.previous;
      for (let turn = 0; turn < 4; turn++) {
        const res = await client.beta.messages.create({
          model: AGENT_MODEL,
          max_tokens: 32000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system: agentSystem(input),
          tools: [
            ...(web ? [
              { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 } as const,
              { type: 'web_search_20260209', name: 'web_search', max_uses: 3 } as const,
            ] : []),
            SAVE_TOOL as unknown as Anthropic.Beta.BetaTool,
          ],
          messages,
        });
        if (res.stop_reason === 'refusal') return null;
        const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === SAVE_TOOL.name);
        if (call) return call.input;
        if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
        messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: 'Llama ahora a save_setup con lo que tengas (vacío lo que no sepas).' });
      }
      return null;
    },
  };
}

/**
 * Respuesta fija para las pruebas automáticas (AI_RESEARCH_FIXTURE=1 y sin clave): no llama a nadie y lo dice. Al afinar,
 * añade la tarifa que le hayan contestado (para comprobar que las respuestas llegan).
 */
export const fixtureSetupAgent = (): AgentApi => ({
  async draft(i) {
    const price = (i.answers ?? []).find((a) => /precio|price/i.test(a.question))?.answer.match(/\d+/)?.[0];
    return {
      summary: `Ejemplo de prueba (sin IA): ${i.company}${i.website ? `, leída de ${i.website}` : ''}${i.files.length ? ` y ${i.files.length} documento(s)` : ''}.`,
      empresa: { empresa: { nombre: i.company, que_vendemos: 'Bautismos y cursos de buceo en grupo pequeño.', para_quien: 'Turistas y empresas que buscan una actividad distinta.', por_que_nos_compran: 'Instructores con 15 años de experiencia.', pruebas: ['4,9 en Google con 300 reseñas'], no_somos: 'No vendemos material.' } },
      mercado: { sectores: [{ nombre: 'Empresas', descripcion: 'Actividades de equipo.', cliente_ideal: 'Equipos de 10 a 40 personas.', descartar_si: '', como_compran: 'RR. HH. propone y dirección aprueba.', ticket: '', ciclo: '',
        actores: [{ nombre: 'Responsable de RR. HH.', papel: 'decisor', que_quiere: 'Una actividad que guste a todos.', que_le_duele: 'Organizarlo todo.', puede_frenar: '', puede_ayudar: '', como_entrarle: 'Propuesta cerrada con fecha.' }] }] },
      situaciones: { situaciones: [{ nombre: 'Temporada', pregunta: '¿Cuándo quieren hacerlo?', de: 'cuenta', varias: false, opciones: ['Verano', 'Resto del año'] }] },
      jugadas: { jugadas: [{ tipo: 'objecion', titulo: '«¿Y si alguien no sabe nadar?»', texto: 'El bautismo es en poca profundidad y con un instructor por cada dos personas.', sectores: ['Empresas'], cuando: '', por_que: '' }] },
      precios: { tarifas: price ? [{ tipo: 'Empresas', nombre: 'Bautismo de grupo', importe: Number(price), cobro: 'evento', sector: 'Empresas', tipica: true }] : [], descuentos: [] },
      questions: price ? [] : [{ block: 'precios', question: '¿Qué precio tiene el bautismo para un grupo de empresa?' }],
      sources: i.website ? [{ title: 'Su web', url: i.website }] : [],
    };
  },
});

/** El agente de este despliegue: Claude con clave; en las pruebas (AI_RESEARCH_FIXTURE=1, sin clave), el de mentira; si no, ninguno. */
export function setupAgent(read: (k: string) => string | undefined): AgentApi | null {
  const key = read('ANTHROPIC_API_KEY');
  return key ? claudeSetupAgent(key) : read('AI_RESEARCH_FIXTURE') === '1' ? fixtureSetupAgent() : null;
}
