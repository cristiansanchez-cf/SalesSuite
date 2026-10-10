/**
 * Ordenar ciudades (docs/CRM_DINAMICO.md §14). La importación del Notion creó una zona por cada texto del campo
 * «Ciudad»: notas («Barcelona, creo que están en Valencia»), varias ciudades («Madrid / Marbella»), códigos postales y
 * columnas descolocadas. La IA clasifica cada texto (comunidad, provincia, pueblo, nota, ¿dudosa?, ¿basura?) y esto lo
 * convierte en un plan: Comunidad › Provincia › Pueblo, con lo que ya hay reutilizado. Criterio de Cristian (10-oct-2026):
 *  - Agrupar por Comunidad › Provincia › Pueblo (el pueblo que es la capital va en su provincia).
 *  - Si la nota dice que es otra ciudad, va donde dice la nota, marcada «revisar». La nota pasa a la empresa.
 * La lógica es pura y probada; la llamada a Claude está aparte (`claudePlaces`).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Zone, ZoneKind } from '../accounts/types';
import { norm } from './import';

/** Lo que la IA dice de un texto del campo «Ciudad». */
export interface PlaceClass {
  raw: string;
  /** null = no es un sitio (basura: un cargo, un estilo de música, una letra suelta). */
  country: string | null;
  region: string | null;
  province: string | null;
  town: string | null;
  /** Lo que sobra del texto (notas, otras ciudades), para las notas de la empresa. */
  note: string | null;
  /** La nota pone en duda la ciudad, o no está claro: marcar «revisar». */
  review: boolean;
}

/** Etiqueta (lista) que llevan las empresas a revisar. */
export const REVIEW_TAG = 'revisar-ciudad';
export const HOME_COUNTRY = 'España';

/** Ruta de zonas para un sitio: España › Comunidad › Provincia › Pueblo (sin repetir la capital); fuera, País › Ciudad. */
export function pathFor(c: PlaceClass): Array<{ name: string; kind: ZoneKind }> {
  if (!c.country) return [];
  const out: Array<{ name: string; kind: ZoneKind }> = [{ name: c.country, kind: 'country' }];
  const push = (name: string | null, kind: ZoneKind) => {
    if (!name || out.some((x) => norm(x.name) === norm(name))) return;
    out.push({ name, kind });
  };
  if (norm(c.country) === norm(HOME_COUNTRY)) { push(c.region, 'region'); push(c.province, 'province'); push(c.town, 'city'); }
  else { push(c.region, 'region'); push(c.town ?? c.province, 'city'); }
  return out;
}

export interface PlanStep { name: string; kind: ZoneKind; existingId: string | null }
export interface PlanGroup {
  /** «España › Comunidad Valenciana › Valencia › Requena». */
  label: string;
  path: PlanStep[];
  sources: Array<{ zoneId: string; raw: string; accounts: number; note: string | null; review: boolean }>;
}
export interface ZonePlan {
  groups: PlanGroup[];
  /** Textos que no son un sitio: las empresas se quedan sin zona y el texto va a su nota. */
  junk: Array<{ zoneId: string; raw: string; accounts: number }>;
  /** Zonas que ya están en su sitio (mismo nombre y ruta): no se tocan. */
  same: number;
}

/**
 * Plan: agrupa las zonas actuales (con sus empresas) por su destino. Reutiliza las zonas que ya existen en la ruta
 * (mismo nombre bajo el mismo padre, sin mirar mayúsculas ni acentos). `classes` llega por texto (raw); cada zona se
 * busca por su nombre.
 */
export function buildZonePlan(zones: Zone[], counts: Map<string, number>, classes: PlaceClass[]): ZonePlan {
  const byRaw = new Map(classes.map((c) => [norm(c.raw), c]));
  const find = (parentId: string | null, name: string) => zones.find((z) => z.parentId === parentId && norm(z.name) === norm(name)) ?? null;
  const groups = new Map<string, PlanGroup>();
  const junk: ZonePlan['junk'] = [];
  let same = 0;
  // Solo las zonas con empresas (las vacías se borran al final); las que tienen hijos son estructura, no se mueven.
  const parents = new Set(zones.map((z) => z.parentId).filter(Boolean));
  for (const z of zones) {
    const n = counts.get(z.id) ?? 0;
    if (!n || parents.has(z.id)) continue;
    const c = byRaw.get(norm(z.name));
    if (!c) continue;
    if (!c.country) { junk.push({ zoneId: z.id, raw: z.name, accounts: n }); continue; }
    const want = pathFor(c);
    // Se baja por la ruta mientras exista; a partir del primer tramo que falta, todo es nuevo.
    let parent: string | null = null;
    let missing = false;
    const path: PlanStep[] = want.map((w) => {
      const ex = missing ? null : find(parent, w.name);
      if (ex) parent = ex.id; else missing = true;
      return { ...w, existingId: ex?.id ?? null };
    });
    const target = path[path.length - 1];
    if (target.existingId === z.id && !c.note && !c.review) { same++; continue; }
    const label = path.map((p) => p.name).join(' › ');
    const g = groups.get(norm(label)) ?? { label, path, sources: [] };
    g.sources.push({ zoneId: z.id, raw: z.name, accounts: n, note: c.note, review: c.review });
    groups.set(norm(label), g);
  }
  return { groups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'es')), junk: junk.sort((a, b) => b.accounts - a.accounts), same };
}

/** Nota que se añade a la empresa (lo que traía el campo, para no perder nada). */
export const noteLine = (raw: string) => `Ciudad en el Notion: ${raw}`;
export function withNote(notes: string | null, raw: string): string {
  const line = noteLine(raw);
  if ((notes ?? '').includes(line)) return notes ?? '';
  return [notes?.trim(), line].filter(Boolean).join('\n').slice(0, 2000);
}

// ---------------------------------------------------------------- la IA (sin web: conocimiento de geografía)

const S = { type: 'string' } as const;
const SN = { type: ['string', 'null'] } as const;
export const PLACES_TOOL = {
  name: 'save_places',
  description: 'Guarda la clasificación de todos los textos, uno por texto, en el mismo orden.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['places'],
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['raw', 'country', 'region', 'province', 'town', 'note', 'review'],
          properties: { raw: S, country: SN, region: SN, province: SN, town: SN, note: SN, review: { type: 'boolean' } },
        },
      },
    },
  },
} as const;

export const PLACES_SYSTEM = `Normalizas el campo «Ciudad» de un CRM importado de Notion. Cada texto puede traer una ciudad, una provincia, una región, varias ciudades, notas de quien lo rellenó, un código postal o basura (una columna descolocada).
Para cada texto devuelve:
- country: el país en español («España», «Portugal», «Países Bajos»…). null si el texto no es un sitio (un cargo, un estilo de música, una marca, una letra suelta).
- region: en España, la comunidad autónoma con su nombre oficial corto en español («Comunidad Valenciana», «Andalucía», «Cataluña», «Comunidad de Madrid», «Islas Baleares», «Canarias»). Fuera de España, null.
- province: en España, la provincia («Valencia», «Alicante», «Castellón», «Barcelona», «Islas Baleares» → usa «Baleares»; «Las Palmas», «Santa Cruz de Tenerife»). Si el texto es solo una comunidad o una isla sin más, la provincia si es única; si no, null.
- town: el municipio si el texto lo da y no es la capital de la provincia; si es la capital, el mismo nombre que la provincia. null si solo hay provincia o región.
- note: lo que sobra del texto, tal cual (notas, otras ciudades, «Expo Zone»). null si no sobra nada.
- review: true si la nota pone en duda la ciudad o no está claro dónde está.
Reglas:
- Nombres en español, con mayúsculas y tildes correctas («Castellón», «Dénia», «Palma de Mallorca», «San Sebastián», «Londres»).
- Varias ciudades («Madrid / Marbella», «Huelva / Sevilla / Madrid»): la primera; el resto va en note.
- Si la nota dice que en realidad está en otro sitio («Barcelona, creo que están en Valencia»; «Castellón, no consta aquí sino en Tarragona»), usa el sitio que dice la nota y review = true.
- Un código postal español es un sitio (28039 → Madrid).
- Una dirección completa: el municipio.
- No inventes: si no sabes dónde está, country y lo demás null, review = true y el texto en note.
- Devuelve exactamente un elemento por texto, con raw idéntico al texto recibido.`;

export interface ZoneNamesApi { classify(raws: string[]): Promise<PlaceClass[]> }

const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
/** Lo que devuelve la IA → PlaceClass, solo para los textos pedidos (lo demás se descarta). */
export function sanitizePlaces(raw: unknown, asked: string[]): PlaceClass[] {
  const list = Array.isArray((raw as { places?: unknown })?.places) ? (raw as { places: unknown[] }).places : [];
  const want = new Map(asked.map((r) => [norm(r), r]));
  const out = new Map<string, PlaceClass>();
  for (const x of list as Array<Record<string, unknown>>) {
    const r = typeof x?.raw === 'string' ? want.get(norm(x.raw)) : undefined;
    if (!r || out.has(norm(r))) continue;
    const country = clip(x.country, 60);
    out.set(norm(r), {
      raw: r, country, region: country ? clip(x.region, 80) : null, province: country ? clip(x.province, 80) : null, town: country ? clip(x.town, 80) : null,
      note: clip(x.note, 600), review: x.review === true,
    });
  }
  return [...out.values()];
}

export const PLACES_MODEL = 'claude-opus-5-5';
export function claudeZoneNames(apiKey: string, fetchImpl?: typeof fetch): ZoneNamesApi {
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return {
    async classify(raws) {
      const stream = client.beta.messages.stream({
        model: PLACES_MODEL, max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'low' },
        system: PLACES_SYSTEM,
        tools: [PLACES_TOOL as unknown as Anthropic.Beta.BetaTool],
        messages: [{ role: 'user', content: `Textos (uno por línea, JSON):\n${JSON.stringify(raws)}\n\nLlama a save_places con todos.` }],
      });
      const res = await stream.finalMessage();
      if (res.stop_reason === 'refusal') return [];
      const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === PLACES_TOOL.name);
      return call ? sanitizePlaces(call.input, raws) : [];
    },
  };
}

/** Respuesta fija para las pruebas (AI_RESEARCH_FIXTURE=1, sin clave): reglas simples, sin llamar a nadie. */
export const fixtureZoneNames = (): ZoneNamesApi => ({
  async classify(raws) {
    const KNOWN: Record<string, [string, string, string | null]> = {
      valencia: ['Comunidad Valenciana', 'Valencia', null], requena: ['Comunidad Valenciana', 'Valencia', 'Requena'],
      castellon: ['Comunidad Valenciana', 'Castellón', null], alicante: ['Comunidad Valenciana', 'Alicante', null],
      barcelona: ['Cataluña', 'Barcelona', null], madrid: ['Comunidad de Madrid', 'Madrid', null],
    };
    return raws.map((raw) => {
      const words = norm(raw).split(/[^a-z]+/).filter(Boolean);
      const hit = words.find((w) => KNOWN[w]);
      const said = /creo que|esta en|estan en/.test(norm(raw)) ? [...words].reverse().find((w) => KNOWN[w]) : undefined;
      const key = said ?? hit;
      if (!key) return { raw, country: null, region: null, province: null, town: null, note: raw, review: false };
      const [region, province, town] = KNOWN[key];
      const rest = norm(raw) === key ? null : raw;
      return { raw, country: HOME_COUNTRY, region, province, town: town ?? province, note: rest, review: !!said && said !== hit };
    });
  },
});
