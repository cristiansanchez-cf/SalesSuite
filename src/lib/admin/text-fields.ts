/**
 * «Editar textos» de una diapositiva en una propuesta: los textos que lee el cliente (título, párrafos, puntos…), sacados
 * de lo que se ve (catálogo ⊕ cambios de esta propuesta) para editarlos en un formulario, sin JSON.
 *
 * Se guardan como cambios de la propuesta (prop_overrides). deepMerge sustituye las listas enteras, así que al cambiar un
 * texto dentro de una lista (una tarjeta, un punto) se guarda la clave de arriba entera, con el resto como estaba.
 * No se tocan las direcciones, las imágenes ni los ajustes (tamaños, posiciones, colores): solo el texto.
 */
export type TextPath = Array<string | number>;
export interface TextField { path: TextPath; value: string; long: boolean }

/** Claves que no son texto para leer (ajustes, enlaces, posiciones…). */
const SKIP_KEYS = new Set([
  'size', 'ground', 'icon', 'image', 'images', 'src', 'href', 'mock', 'url', 'path', 'variant', 'theme', 'layout', 'kind',
  'type', 'id', 'key', 'currency', 'color', 'colors', 'seals', 'scenes', 'video', 'poster', 'logo', 'photo', 'photos',
  'align', 'tone', 'style', 'format', 'locale', 'lang', 'anchor', 'target', 'embed', 'autoAdvanceMs', 'press',
]);
const NOT_TEXT = /^(https?:|\/|asset:|#|mailto:|tel:|data:)/i;

/** Los textos editables, en el orden en que salen. */
export function collectTextFields(props: unknown, path: TextPath = []): TextField[] {
  if (typeof props === 'string') {
    const v = props;
    if (!path.length || NOT_TEXT.test(v.trim())) return [];
    return [{ path, value: v, long: v.length > 70 || v.includes('\n') }];
  }
  if (Array.isArray(props)) return props.flatMap((x, i) => collectTextFields(x, [...path, i]));
  if (props && typeof props === 'object') {
    return Object.entries(props as Record<string, unknown>).flatMap(([k, v]) => (SKIP_KEYS.has(k) ? [] : collectTextFields(v, [...path, k])));
  }
  return [];
}

/** Copia de `obj` con `value` en `path`. */
export function setAt<T>(obj: T, path: TextPath, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const base: any = Array.isArray(obj) ? [...obj] : { ...(obj as object) };
  base[head as any] = setAt(base[head as any], rest, value);
  return base;
}

/**
 * Los cambios de la propuesta tras editar: los que ya tenía, más cada clave de arriba cuyo contenido cambió (entera).
 * Si una clave vuelve a ser igual que la del catálogo, se quita (vuelve al texto del catálogo).
 */
export function textOverrides(
  defaults: Record<string, unknown>,
  current: Record<string, unknown>,
  edited: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of Object.keys(edited)) {
    if (same(edited[k], current[k])) continue;
    if (same(edited[k], defaults[k])) delete out[k];
    else out[k] = edited[k];
  }
  return out;
}

const LABELS: Record<string, string> = {
  eyebrow: 'Antetítulo', title: 'Título', subtitle: 'Subtítulo', lede: 'Entradilla', body: 'Texto', text: 'Texto',
  description: 'Descripción', note: 'Nota al pie', label: 'Etiqueta', hint: 'Ayuda', caption: 'Pie', captions: 'Frases de la animación',
  problem: 'Problema', solution: 'Solución', beforeLabel: 'Rótulo «antes»', afterLabel: 'Rótulo «después»',
  cards: 'Tarjeta', tabs: 'Apartado', bullets: 'Punto', claims: 'Afirmación', sources: 'Fuente', items: 'Elemento', steps: 'Paso',
  ctas: 'Botón', cta: 'Botón', faqs: 'Pregunta', question: 'Pregunta', answer: 'Respuesta', features: 'Ventaja', plans: 'Plan',
  name: 'Nombre', quote: 'Cita', author: 'Autor', role: 'Cargo', evidence: 'Evidencia', ref: 'Referencia', status: 'Estado',
  reviewed: 'Revisado', validUntil: 'Vigente hasta', labels: 'Rótulos', page: 'Página del sello', simulation: 'Etiqueta de simulación',
  back: 'Botón volver', fallback: 'Página de ejemplo', address: 'Dirección', start: 'Al empezar', seal: 'Al salir el sello',
  click: 'Al pulsarlo', price: 'Precio', period: 'Periodo', includes: 'Incluye', excludes: 'No incluye', unit: 'Unidad',
};
const human = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** «Tarjeta 2 · Problema», «Apartado 1 · Punto 3», «Título». `labels`: los nombres en el idioma del editor (si no, castellano). */
export function fieldLabel(path: TextPath, labels: Record<string, string> = LABELS): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (typeof seg === 'number') continue;
    const name = labels[seg] ?? LABELS[seg] ?? human(seg);
    const next = path[i + 1];
    parts.push(typeof next === 'number' ? `${name} ${next + 1}` : name);
  }
  return parts.join(' · ') || '—';
}

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Lo que se ve: catálogo ⊕ cambios de la propuesta (igual que modules/resolve.ts deepMerge, sin cargar los módulos). */
export function mergeProps(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = plain(v) && plain(base[k]) ? mergeProps(base[k] as Record<string, unknown>, v) : v;
  }
  return out;
}
