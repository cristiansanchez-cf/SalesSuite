/**
 * Catálogo con tu IA (docs/CATALOG_AI.md): el responsable del espacio monta y cambia sus presentaciones sin pasar por
 * nosotros. Copia un prompt (qué tipos de diapositiva hay, cómo es cada una y qué tiene ya su catálogo), se lo pega a su
 * ChatGPT o Claude junto con su presentación de ahora (PDF, web…), y pega aquí lo que le devuelva. Se revisa y se crean
 * BORRADORES: nada se publica solo; se ven en la vista previa y se publican desde el catálogo.
 *
 * Puro y probado: el prompt, la lectura de la respuesta y el plan. La escritura va con el servicio del catálogo.
 */
import { z } from 'zod';
import { REGISTRY, isBlockType, type BlockType } from '../../modules/registry';
import { validateProps } from '../admin/tenant-service';

/** Para qué sirve cada tipo, dicho para quien prepara la presentación. `special`: hecho para un producto concreto. */
export const TYPE_GUIDE: Record<BlockType, { use: string; special?: boolean }> = {
  'hero-pitch': { use: 'Portada: titular grande, subtítulo y, si se quiere, palabras que rotan, botones y cifras.' },
  'tabs-showcase': { use: 'Varias cosas que enseñar (servicios, funciones, momentos) en pestañas, cada una con su texto, ventajas y una imagen o maqueta que cambia al pulsar. Mejor UNA diapositiva con pestañas que varias capturas sueltas.' },
  'pricing-card': { use: 'La inversión: título, lo que incluye y una nota final. El precio sale de la tarifa que elija el comercial.' },
  'problem-solution': { use: '«Lo que te pasa hoy»: de 1 a 4 tarjetas «hoy → con nosotros», y una nota.' },
  'case-study': { use: 'Un caso real con nombre (solo con permiso por escrito del cliente), su cita y una foto.' },
  'cost-math': { use: '«Lo que ya te cuesta»: el comercial mete las cifras del cliente y la diapositiva hace la cuenta.' },
  'media-strip': { use: 'Fotos o vídeos reales en tira (eventos, clientes usándolo).' },
  'live-screen': { use: 'Pantalla en vivo interactiva del producto.', special: true },
  'phone-tour': { use: 'Recorrido interactivo por el móvil del usuario final, paso a paso.', special: true },
  'app-steps': { use: 'Pasos con la app: el móvil enseña la pantalla real de cada paso.', special: true },
  'center-console': { use: 'Consola de escritorio interactiva del producto.', special: true },
  'seal-showcase': { use: 'El sello en la página del cliente, con sus reglas de uso.', special: true },
  'site-verify': { use: 'La web del cliente con el sello encima: el cursor lo pulsa y se abre la página del sello.', special: true },
};

export interface KitModule { key: string; blockType: string; name: string; description: string | null; props: unknown }
export interface KitInput { company: string; person: string; locale: string; catalog: KitModule[] }

export const MAX_KIT_MODULES = 20;
const MAX_PROPS_IN_PROMPT = 5000;
const LANG: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', ko: 'coreano', ca: 'catalán', fr: 'francés' };

/** Los tipos que se ofrecen: los generales y los especiales que el espacio ya usa (están hechos para su producto). */
export function kitTypes(catalog: KitModule[]): BlockType[] {
  const used = new Set(catalog.map((m) => m.blockType));
  return (Object.keys(REGISTRY) as BlockType[]).filter((t) => !TYPE_GUIDE[t].special || used.has(t));
}

const clip = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > MAX_PROPS_IN_PROMPT ? `${s.slice(0, MAX_PROPS_IN_PROMPT)}…(recortado)` : s;
};

/** El prompt para pegar en su ChatGPT o Claude. */
export function kitPrompt(i: KitInput): string {
  const types = kitTypes(i.catalog);
  const lang = LANG[i.locale.slice(0, 2).toLowerCase()] ?? 'español';
  return [
    `Hola. Soy ${i.person}, de ${i.company}. Te pido ayuda para preparar las diapositivas de nuestras propuestas comerciales.`,
    '',
    'Cómo funcionan: cada propuesta es una página web con diapositivas que el cliente abre desde un enlace. Cada diapositiva es un «módulo» de un tipo fijo (abajo) con sus textos e imágenes. Los comerciales eligen qué módulos van en cada propuesta y en qué orden; nosotros preparamos el catálogo de módulos.',
    '',
    'Si te adjunto nuestra presentación de ahora (PDF, PowerPoint, web o capturas), úsala como base: pasa cada parte al tipo de módulo que mejor le encaje, con nuestro tono y nuestras palabras. Si no te adjunto nada, pregúntame lo que necesites antes de escribir.',
    '',
    '## Reglas',
    `- Escribe los textos en ${lang}, cortos y para el cliente que lo lee solo (sin el comercial delante).`,
    '- No inventes cifras, clientes, precios ni testimonios. Lo que no sepas, pregúntamelo.',
    '- {company} se cambia por el nombre del cliente y {prospect} por el de la persona: úsalos donde quede natural.',
    '- Imágenes: solo direcciones https que ya existan (nuestra web, por ejemplo). Si no hay, deja la del ejemplo.',
    '- Mejor interactivo que capturas sueltas: si algo se enseñaba con varias imágenes seguidas, usa un módulo de pestañas (o uno interactivo de la lista) en vez de varias diapositivas.',
    '- Lo que no encaje en ningún tipo (una animación nueva, una pantalla de vuestro producto que no está) no lo fuerces: apúntalo en "peticiones" y lo construye el equipo de la plataforma.',
    `- Como mucho ${MAX_KIT_MODULES} módulos. Para cambiar uno que ya tenemos, usa su misma "key"; para uno nuevo, una key nueva (minúsculas, números y guiones).`,
    '- Respeta el formato de cada tipo tal cual (los nombres de los campos no se traducen).',
    '',
    '## Tipos de módulo (con un ejemplo de su formato)',
    ...types.flatMap((t) => [`### ${t} · ${REGISTRY[t].label}`, TYPE_GUIDE[t].use, '```json', JSON.stringify(REGISTRY[t].example), '```']),
    '',
    '## Lo que ya tenemos en el catálogo',
    ...(i.catalog.length
      ? i.catalog.map((m) => `- key "${m.key}" · ${m.blockType} · «${m.name}»${m.description ? ` (${m.description})` : ''}: ${clip(m.props)}`)
      : ['(Nada todavía: empezamos de cero.)']),
    '',
    '## Cómo me lo devuelves',
    'Cuando lo tengamos claro, devuélvemelo en UN solo bloque de código JSON con esta forma (solo los módulos nuevos o que cambian):',
    '```json',
    JSON.stringify({ modules: [{ key: 'portada', block_type: 'hero-pitch', name: 'Portada', description: 'Para qué sirve este módulo, en una línea', props: { '...': 'el contenido, con el formato de su tipo' } }], peticiones: ['Lo que no encaja en ningún tipo, explicado en una frase'] }, null, 2),
    '```',
  ].join('\n');
}

// ---------------------------------------------------------------- leer lo que devuelve su IA

const keyRe = /^[a-z0-9][a-z0-9-]{1,62}$/;
const kitSchema = z.object({
  modules: z.array(z.object({
    key: z.string().trim().toLowerCase().regex(keyRe, 'key: minúsculas, números y guiones'),
    block_type: z.string().trim(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).nullish(),
    props: z.record(z.unknown()),
  }).passthrough()).min(1).max(MAX_KIT_MODULES),
  peticiones: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
}).passthrough();
export type Kit = z.infer<typeof kitSchema>;

/** Saca el JSON de lo que pegue (con o sin ```json, con texto alrededor). */
export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = [...fenced, text];
  for (const c of candidates) {
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch { /* el siguiente */ }
  }
  return null;
}

export function readKit(text: string): { kit: Kit | null; errors: string[] } {
  if (text.length > 400_000) return { kit: null, errors: ['Es demasiado largo: pídele menos módulos de una vez'] };
  const raw = extractJson(text);
  if (raw == null) return { kit: null, errors: ['No encuentro el JSON: pega el bloque de código que te ha devuelto'] };
  const r = kitSchema.safeParse(raw);
  if (!r.success) return { kit: null, errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'respuesta'}: ${i.message}`) };
  const seen = new Set<string>();
  const dup = r.data.modules.find((m) => (seen.has(m.key) ? true : (seen.add(m.key), false)));
  if (dup) return { kit: null, errors: [`La key «${dup.key}» sale dos veces`] };
  return { kit: r.data, errors: [] };
}

export type KitAction = 'new' | 'update' | 'same' | 'invalid';
export interface KitRow { key: string; blockType: string; name: string; action: KitAction; errors: string[] }

/** Qué va a pasar con cada módulo: nuevo, cambia (borrador nuevo), igual o no vale (y por qué). */
export function planKit(kit: Kit, catalog: KitModule[]): KitRow[] {
  const byKey = new Map(catalog.map((m) => [m.key, m]));
  return kit.modules.map((m) => {
    const cur = byKey.get(m.key);
    const row = { key: m.key, blockType: m.block_type, name: m.name };
    if (!isBlockType(m.block_type)) return { ...row, action: 'invalid', errors: [`Tipo «${m.block_type}» no existe`] };
    if (cur && cur.blockType !== m.block_type) return { ...row, action: 'invalid', errors: [`Ya hay un módulo «${m.key}» de tipo ${cur.blockType}: usa otra key`] };
    const errors = validateProps(m.block_type, m.props);
    if (errors.length) return { ...row, action: 'invalid', errors: errors.slice(0, 6) };
    if (!cur) return { ...row, action: 'new', errors: [] };
    const same = JSON.stringify(cur.props) === JSON.stringify(m.props) && cur.name === m.name;
    return { ...row, action: same ? 'same' : 'update', errors: [] };
  });
}

/** Lo que hace falta del servicio del catálogo (admin.tenantAdmin). */
export interface CatalogWriter {
  listCatalog(): Promise<Array<{ id: string; key: string; name: string; description: string | null; versions: Array<{ id: string; status: string; version: number; defaultPrice: number | null; currency: string }> }>>;
  createModule(input: unknown): Promise<{ moduleId: string; versionId: string }>;
  updateModule(moduleId: string, input: unknown): Promise<void>;
  newDraft(moduleId: string, fromVersionId?: string): Promise<string>;
  saveDraft(versionId: string, input: unknown): Promise<void>;
}

/** Crea los borradores (nunca publica). Devuelve cuántos y los borradores para revisar. */
export async function applyKit(kit: Kit, rows: KitRow[], t: CatalogWriter): Promise<Array<{ key: string; name: string; versionId: string; isNew: boolean }>> {
  const todo = new Set(rows.filter((r) => r.action === 'new' || r.action === 'update').map((r) => r.key));
  const cat = await t.listCatalog();
  const out: Array<{ key: string; name: string; versionId: string; isNew: boolean }> = [];
  for (const m of kit.modules) {
    if (!todo.has(m.key)) continue;
    const cur = cat.find((x) => x.key === m.key);
    let versionId: string;
    let price: { defaultPrice: number | null; currency: string } = { defaultPrice: null, currency: 'EUR' };
    if (cur) {
      const last = [...cur.versions].sort((a, b) => b.version - a.version)[0];
      if (last) price = { defaultPrice: last.defaultPrice, currency: last.currency };
      versionId = await t.newDraft(cur.id);
      if (cur.name !== m.name || (m.description ?? null) !== cur.description) await t.updateModule(cur.id, { name: m.name, description: m.description ?? '' });
    } else {
      versionId = (await t.createModule({ key: m.key, blockType: m.block_type, name: m.name, description: m.description ?? '' })).versionId;
    }
    await t.saveDraft(versionId, { defaultProps: m.props, ...price });
    out.push({ key: m.key, name: m.name, versionId, isNew: !cur });
  }
  return out;
}
