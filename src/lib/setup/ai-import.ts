/**
 * Configuración con IA (docs/SETUP_WIZARD.md §Con IA). Por bloques: el admin copia un prompt en su ChatGPT/Claude,
 * el asistente le entrevista (también por audio) y devuelve UN bloque JSON con nuestro formato; lo pega aquí,
 * ve qué se va a crear y lo importa. Como el punto de partida: solo AÑADE lo que falta, nunca borra ni pisa.
 */
import { z } from 'zod';
import { AdminError } from '../admin/service';
import { slug } from '../evidence/schema';
import { PERSONA_ROLES, type PersonaRole } from '../playbook/market';
import { PLAY_KINDS, type PlayKind } from '../playbook/types';

export const AI_BLOCKS = ['empresa', 'mercado', 'situaciones', 'jugadas', 'precios'] as const;
export type AiBlock = (typeof AI_BLOCKS)[number];

const s = (max: number) => z.preprocess((v) => (v == null ? '' : String(v)), z.string().trim().max(max));
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.preprocess((v) => (Array.isArray(v) ? v.slice(0, max) : []), z.array(item));

/** Formatos que pedimos al asistente (lo que devuelve el JSON). Tolerantes: lo que sobre se recorta, lo que falte queda vacío. */
const SCHEMAS = {
  empresa: z.object({
    empresa: z.object({
      nombre: s(80), que_vendemos: s(2000), para_quien: s(1000), por_que_nos_compran: s(2000),
      pruebas: list(s(300), 10), no_somos: s(1000),
    }),
  }),
  mercado: z.object({
    sectores: list(z.object({
      nombre: s(80), descripcion: s(1000), cliente_ideal: s(2000), descartar_si: s(1000), como_compran: s(2000), ticket: s(200), ciclo: s(200),
      actores: list(z.object({
        nombre: s(80), papel: s(30), que_quiere: s(2000), que_le_duele: s(2000), puede_frenar: s(1000), puede_ayudar: s(1000), como_entrarle: s(2000),
      }), 12),
    }), 12),
  }),
  situaciones: z.object({
    situaciones: list(z.object({ nombre: s(60), pregunta: s(200), de: s(20), varias: z.preprocess((v) => v === true || v === 'true' || v === 'sí', z.boolean()), opciones: list(s(60), 20) }), 10),
  }),
  jugadas: z.object({
    jugadas: list(z.object({ tipo: s(30), titulo: s(200), texto: s(8000), sectores: list(s(80), 10), cuando: s(1000), por_que: s(2000) }), 60),
  }),
  precios: z.object({
    tarifas: list(z.object({
      tipo: s(60), nombre: s(80), importe: z.preprocess((v) => Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')), z.number().finite().min(0)),
      cobro: s(20), sector: s(80), tipica: z.preprocess((v) => v === true || v === 'true' || v === 'sí', z.boolean()),
    }), 40),
    descuentos: list(z.object({ codigo: s(32), nombre: s(80), porcentaje: z.preprocess((v) => Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')), z.number().min(0).max(100)), a_cambio_de: s(300) }), 12),
  }),
} satisfies Record<AiBlock, z.ZodTypeAny>;

export type AiData<B extends AiBlock> = z.infer<(typeof SCHEMAS)[B]>;

/** Saca el JSON de lo que pegue (con o sin ```json, con texto alrededor). */
export function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const raw = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!raw.trim()) throw new AdminError(422, 'No encuentro el bloque JSON. Pega la respuesta completa del asistente (el bloque que empieza por { ).');
  try { return JSON.parse(raw); } catch { throw new AdminError(422, 'El JSON está cortado o tiene un error. Pídele al asistente: «Repite solo el bloque JSON, completo».'); }
}

export function parseBlock<B extends AiBlock>(block: B, text: string): AiData<B> {
  const r = SCHEMAS[block].safeParse(extractJson(text));
  if (!r.success) throw new AdminError(422, `No tiene el formato de este paso (${r.error.issues[0]?.path.join('.') || 'raíz'}). ¿Lo has pegado en el paso correcto?`);
  return r.data as AiData<B>;
}

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ROLE_ALIASES: Record<string, PersonaRole> = {
  decisor: 'decisor', decide: 'decisor', 'quien decide': 'decisor', pagador: 'pagador', paga: 'pagador', 'quien paga': 'pagador',
  influenciador: 'influenciador', influye: 'influenciador', influencer: 'influenciador', campeon: 'campeon', aliado: 'campeon', champion: 'campeon',
  usuario: 'usuario', usa: 'usuario', guardian: 'guardian', bloqueador: 'guardian', 'puede vetar': 'guardian', veto: 'guardian',
};
export const roleOf = (x: string): PersonaRole => ROLE_ALIASES[norm(x)] ?? (PERSONA_ROLES.includes(norm(x) as PersonaRole) ? norm(x) as PersonaRole : 'influenciador');
const KIND_ALIASES: Record<string, PlayKind> = {
  presentar: 'pitch', presentacion: 'pitch', pitch: 'pitch', 'para quien': 'fit', encaje: 'fit', fit: 'fit', preguntas: 'discovery', descubrimiento: 'discovery', discovery: 'discovery',
  objecion: 'objection', objeciones: 'objection', objection: 'objection', prueba: 'proof', pruebas: 'proof', proof: 'proof', precio: 'monetization', monetizacion: 'monetization',
  guion: 'script', script: 'script', consejo: 'tip', tip: 'tip', truco: 'tip',
};
export const kindOf = (x: string): PlayKind => KIND_ALIASES[norm(x)] ?? (PLAY_KINDS.includes(norm(x) as PlayKind) ? norm(x) as PlayKind : 'tip');
const PERIODS: Record<string, 'once' | 'event' | 'month' | 'year'> = { unico: 'once', 'pago unico': 'once', evento: 'event', 'por evento': 'event', mes: 'month', mensual: 'month', 'al mes': 'month', ano: 'year', anual: 'year', 'al ano': 'year' };
export const periodOf = (x: string) => PERIODS[norm(x)] ?? 'once';
const keyOf = (x: string, fallback: string) => slug(x).slice(0, 60) || fallback;

// ------------------------------------------------------------------- prompts

const FORMATS: Record<AiBlock, string> = {
  empresa: `{"empresa": {"nombre": "", "que_vendemos": "", "para_quien": "", "por_que_nos_compran": "", "pruebas": [""], "no_somos": ""}}`,
  mercado: `{"sectores": [{"nombre": "", "descripcion": "", "cliente_ideal": "", "descartar_si": "", "como_compran": "", "ticket": "", "ciclo": "",
  "actores": [{"nombre": "", "papel": "decisor | pagador | influenciador | campeon | usuario | guardian", "que_quiere": "", "que_le_duele": "", "puede_frenar": "", "puede_ayudar": "", "como_entrarle": ""}]}]}`,
  situaciones: `{"situaciones": [{"nombre": "", "pregunta": "", "de": "cuenta | persona", "varias": false, "opciones": [""]}]}`,
  jugadas: `{"jugadas": [{"tipo": "presentar | para quien | preguntas | objecion | prueba | precio | guion | consejo", "titulo": "", "texto": "", "sectores": [""], "cuando": "", "por_que": ""}]}`,
  precios: `{"tarifas": [{"tipo": "", "nombre": "", "importe": 0, "cobro": "unico | evento | mes | año", "sector": "", "tipica": false}],
 "descuentos": [{"codigo": "", "nombre": "", "porcentaje": 0, "a_cambio_de": ""}]}`,
};

const GOALS: Record<AiBlock, { goal: string; first: string; cover: string[]; rules: string[] }> = {
  empresa: {
    goal: 'entender qué vende su empresa, a quién y por qué le compran',
    first: '«Cuéntame con tus palabras qué hace tu empresa, como se lo contarías a alguien en un bar.»',
    cover: ['Qué vende exactamente (producto o servicio) y qué problema resuelve.', 'Para quién es (y para quién no).', 'Por qué le compran a ellos y no a otro.', 'Pruebas: clientes, cifras, casos que pueda enseñar.', 'Lo que NO son (para que nadie lo venda mal).'],
    rules: ['Frases cortas y concretas, en su vocabulario.', '"pruebas": una por elemento.'],
  },
  mercado: {
    goal: 'sacar sus sectores (tipos de cliente) y, en cada uno, las personas que intervienen en la compra',
    first: '«¿A qué tipos de cliente vendéis? Dime los dos o tres que más os compran.»',
    cover: ['Por sector: cómo es el cliente ideal, cuándo NO merece la pena, cómo compran (quién, cuántos pasos), ticket típico y cuánto tardan en decidir.', 'Por sector, los actores: quién decide, quién paga, quién influye, quién lo usa y quién puede tumbar la venta (y por qué).', 'De cada actor: qué quiere, qué le duele, qué puede frenar, en qué puede ayudar y cómo entrarle.'],
    rules: ['Ordena los sectores por prioridad (el primero, el que más vende).', '"papel" solo puede ser: decisor, pagador, influenciador, campeon, usuario o guardian (el que puede vetar).'],
  },
  situaciones: {
    goal: 'sacar las preguntas que cambian cómo se vende (las «situaciones»): la región, el tamaño, la temporada, el tipo de persona…',
    first: '«Cuando un comercial prepara una visita, ¿qué tiene que saber del cliente para no meter la pata?»',
    cover: ['Rasgos de la cuenta que cambian la venta (región, tamaño, temporada, si ya tiene algo parecido…).', 'Rasgos de la persona con la que habla (tipo de personalidad, cargo…).', 'Para cada una, las opciones posibles (pocas y claras).'],
    rules: ['Una situación = una sola cosa (no mezcles región con temporada).', '"de": "cuenta" o "persona".', 'Entre 2 y 8 opciones por situación.'],
  },
  jugadas: {
    goal: 'sacar cómo vende su mejor comercial: cómo lo presenta, qué pregunta, qué objeciones salen y cómo las responde, cómo cierra',
    first: '«Imagina a tu mejor comercial en una primera llamada. ¿Cómo empieza?»',
    cover: ['Cómo se presenta el producto (en 30 segundos).', 'Las preguntas que hay que hacer para saber si encaja.', 'Las 5 objeciones más típicas y qué se responde (con las palabras exactas).', 'Pruebas que funcionan (casos, cifras).', 'Cómo se habla del precio y cómo se cierra.', 'Errores que NO hay que cometer.'],
    rules: ['Una jugada = una idea. "texto": lo que dice o hace el comercial, con ejemplos literales.', '"sectores": los nombres de sus sectores donde aplica (vacío si aplica a todos).'],
  },
  precios: {
    goal: 'sacar sus tarifas y descuentos tal y como los vende',
    first: '«¿Cuánto cuesta lo que vendéis? Empieza por lo que más se vende.»',
    cover: ['Cada tarifa: a qué tipo de cliente (tipo), nombre, importe sin IVA y cómo se cobra (pago único, por evento, al mes o al año).', 'Cuál es la más típica de cada tipo.', 'Descuentos que se pueden dar y qué se pide a cambio.'],
    rules: ['"tipo" agrupa tarifas parecidas (p. ej. «Local», «Festival»).', '"tipica": true solo en una por tipo.', '"importe": número, sin símbolo.', '"codigo" del descuento: MAYÚSCULAS sin espacios.'],
  },
};

/** El prompt que el admin copia en su ChatGPT/Claude. */
export function promptFor(block: AiBlock, who: { person: string; company: string }): string {
  const g = GOALS[block];
  return [
    `Eres el asistente de ${who.person}, de ${who.company}. Vamos a preparar su herramienta de ventas.`,
    `Tu objetivo en esta conversación: ${g.goal}.`,
    '',
    'Cómo hacerlo:',
    '- Pregunta de una en una, corto y en lenguaje normal. Puede contestarte por escrito o con audios largos: extrae tú lo importante.',
    '- Si ya sabes algo de su empresa por el contexto, úsalo y pídele solo que lo confirme.',
    '- No inventes. Si no lo sabe, sigue con lo siguiente.',
    `- Empieza así: ${g.first}`,
    '',
    'Tienes que cubrir:',
    ...g.cover.map((x) => `- ${x}`),
    '',
    'Cuando lo tengas (o te diga «ya»), responde SOLO con un bloque ```json con este formato exacto, sin texto antes ni después:',
    '```json',
    FORMATS[block],
    '```',
    'Reglas del JSON:',
    ...g.rules.map((x) => `- ${x}`),
    '- En español, con sus palabras. Campos que no sepas: cadena vacía.',
  ].join('\n');
}

// ------------------------------------------------------------------- vista previa e importación

export interface Preview { add: string[]; skip: string[] }

interface Deps {
  playbook: {
    market(): Promise<Array<{ id: string; key: string; name: string; personas: Array<{ key: string; name: string }> }>>;
    saveSegment(i: unknown): Promise<string>;
    savePersona(i: unknown): Promise<string>;
    listAll(): Promise<{ plays: Array<{ key: string | null; title: string }> }>;
    createPlay(i: unknown, note?: string): Promise<string>;
  };
  evidence: { facets(o: { all: boolean }): Promise<Array<{ key: string }>>; saveFacet(i: unknown): Promise<unknown> };
  prices: { list(): Promise<Array<{ label: string }>>; save(i: Record<string, unknown>): Promise<string> };
  coupons: { list(): Promise<Array<{ code: string }>>; save(i: { code: string; label: string; kind: string; value: string; note?: string }): Promise<unknown> };
}

/** Qué haría la importación (sin escribir). */
export async function preview(block: AiBlock, data: unknown, d: Deps): Promise<Preview> {
  return run(block, data, d, true);
}
export async function importBlock(block: AiBlock, data: unknown, d: Deps): Promise<Preview> {
  return run(block, data, d, false);
}

async function run(block: AiBlock, raw: unknown, d: Deps, dry: boolean): Promise<Preview> {
  const out: Preview = { add: [], skip: [] };
  const note = 'Importado con IA (configuración guiada)';
  if (block === 'empresa') {
    const e = (raw as AiData<'empresa'>).empresa;
    const have = new Set((await d.playbook.listAll()).plays.map((p) => p.key));
    const plays = [
      { key: 'ia-que-vendemos', kind: 'pitch', title: `Qué vendemos${e.nombre ? ` en ${e.nombre}` : ''}`, body: [e.que_vendemos, e.para_quien && `**Para quién:** ${e.para_quien}`].filter(Boolean).join('\n\n'), whyItWorks: e.por_que_nos_compran || null },
      { key: 'ia-pruebas', kind: 'proof', title: 'Pruebas que puedes enseñar', body: e.pruebas.filter(Boolean).map((x) => `- ${x}`).join('\n') },
      { key: 'ia-no-somos', kind: 'tip', title: 'Lo que NO somos (no lo vendas así)', body: e.no_somos },
    ].filter((p) => p.body.trim());
    for (const p of plays) {
      if (have.has(p.key)) { out.skip.push(p.title); continue; }
      out.add.push(p.title);
      if (!dry) await d.playbook.createPlay({ moduleId: null, ...p, segments: [], personas: [], status: 'official' }, note);
    }
    return out;
  }
  if (block === 'mercado') {
    const market = await d.playbook.market();
    const segs = new Map(market.map((x) => [x.key, x.id]));
    const pers = new Set(market.flatMap((x) => x.personas.map((p) => p.key)));
    // Mismo actor = misma clave o mismo nombre dentro del mismo sector («Dueño» en Locales ya existe aunque su clave sea otra).
    const names = new Set(market.flatMap((x) => x.personas.map((p) => `${x.key}|${norm(p.name)}`)));
    for (const sg of (raw as AiData<'mercado'>).sectores.filter((x) => x.nombre)) {
      const key = keyOf(sg.nombre, 'sector');
      let id = segs.get(key);
      if (id) out.skip.push(`Sector ${sg.nombre}`);
      else {
        out.add.push(`Sector ${sg.nombre}`);
        if (!dry) {
          id = await d.playbook.saveSegment({
            key, name: sg.nombre, description: sg.descripcion, icp: sg.cliente_ideal, disqualifiers: sg.descartar_si,
            buyingProcess: sg.como_compran, dealSize: sg.ticket, salesCycle: sg.ciclo, status: 'official',
          });
          segs.set(key, id);
        }
      }
      for (const a of sg.actores.filter((x) => x.nombre)) {
        const pk = keyOf(`${a.nombre}-${key}`, 'actor');
        if (pers.has(pk) || names.has(`${key}|${norm(a.nombre)}`)) { out.skip.push(`${a.nombre} (${sg.nombre})`); continue; }
        out.add.push(`${a.nombre} (${sg.nombre}) · ${roleOf(a.papel)}`);
        pers.add(pk);
        if (!dry && id) {
          await d.playbook.savePersona({
            segmentId: id, key: pk, name: a.nombre, role: roleOf(a.papel), goals: a.que_quiere, pains: a.que_le_duele,
            canBlock: a.puede_frenar, canHelp: a.puede_ayudar, howToApproach: a.como_entrarle,
          });
        }
      }
    }
    return out;
  }
  if (block === 'situaciones') {
    const have = new Set((await d.evidence.facets({ all: true })).map((f) => f.key));
    for (const f of (raw as AiData<'situaciones'>).situaciones.filter((x) => x.nombre && x.opciones.filter(Boolean).length)) {
      const key = keyOf(f.nombre, 'situacion');
      if (have.has(key)) { out.skip.push(f.nombre); continue; }
      const options = [...new Set(f.opciones.filter(Boolean))].map((label) => ({ label, key: keyOf(label, 'opcion') }));
      out.add.push(`${f.nombre}: ${options.map((o) => o.label).join(', ')}`);
      if (!dry) await d.evidence.saveFacet({ key, label: f.nombre, question: f.pregunta, scope: /persona|contact/.test(norm(f.de)) ? 'contact' : 'account', multi: f.varias, weight: 1, options, status: 'official' });
    }
    return out;
  }
  if (block === 'jugadas') {
    const market = await d.playbook.market();
    const segKey = (name: string) => market.find((x) => norm(x.name) === norm(name) || x.key === keyOf(name, ''))?.key;
    const have = new Set((await d.playbook.listAll()).plays.map((p) => p.key));
    for (const p of (raw as AiData<'jugadas'>).jugadas.filter((x) => x.titulo)) {
      const key = `ia-${keyOf(p.titulo, 'jugada')}`.slice(0, 62);
      if (have.has(key)) { out.skip.push(p.titulo); continue; }
      have.add(key);
      out.add.push(`${p.titulo} · ${kindOf(p.tipo)}`);
      if (!dry) {
        await d.playbook.createPlay({
          moduleId: null, key, kind: kindOf(p.tipo), title: p.titulo, body: p.texto, whenToUse: p.cuando, whyItWorks: p.por_que,
          segments: p.sectores.map(segKey).filter((x): x is string => !!x), personas: [], status: 'official',
        }, note);
      }
    }
    return out;
  }
  // precios
  const market = await d.playbook.market();
  const segId = (name: string) => market.find((x) => norm(x.name) === norm(name) || x.key === keyOf(name, ''))?.id ?? '';
  const pr = raw as AiData<'precios'>;
  const labels = new Set((await d.prices.list()).map((o) => norm(o.label)));
  for (const t of pr.tarifas.filter((x) => x.nombre)) {
    if (labels.has(norm(t.nombre))) { out.skip.push(t.nombre); continue; }
    labels.add(norm(t.nombre));
    out.add.push(`${t.tipo ? `${t.tipo} · ` : ''}${t.nombre} · ${t.importe} €${{ once: '', event: ' / evento', month: ' / mes', year: ' / año' }[periodOf(t.cobro)]}${t.tipica ? ' (típica)' : ''}`);
    if (!dry) await d.prices.save({ label: t.nombre, amount: t.importe, period: periodOf(t.cobro), segmentId: segId(t.sector), kind: t.tipo || null, isDefault: t.tipica });
  }
  const codes = new Set((await d.coupons.list()).map((c) => c.code.toUpperCase()));
  for (const c of pr.descuentos.filter((x) => x.codigo && x.porcentaje > 0)) {
    const code = c.codigo.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
    if (codes.has(code)) { out.skip.push(`Descuento ${code}`); continue; }
    out.add.push(`Descuento ${code} · ${c.porcentaje} %${c.a_cambio_de ? ` (a cambio de: ${c.a_cambio_de})` : ''}`);
    if (!dry) await d.coupons.save({ code, label: (c.nombre || `${c.porcentaje} %`).slice(0, 80), kind: 'percent', value: String(c.porcentaje), note: c.a_cambio_de });
  }
  return out;
}
