/**
 * Rellenar un deck de una vez (docs/DECKS.md): una lista de bloques en orden, cada uno con la clave de su módulo del
 * catálogo y, si se quiere, sus textos. Lo usan «Pegar contenido» del editor y la herramienta MCP `deck_rellenar`.
 *  · El deck queda con esos bloques y en ese orden: los que no están en la lista se quitan.
 *  · Un bloque sin `props` va como en el catálogo (p. ej. la pantalla en vivo de las propuestas, tal cual).
 *  · Con `props`, es el bloque entero: lo del catálogo que no venga, fuera. Con `parcial: true`, solo cambian esos campos.
 *  · Antes de tocar nada se valida todo; si algo no vale, no cambia nada y se dice qué y dónde.
 */
import { z } from 'zod';
import type { AdminContext } from '../admin/auth';
import { AdminError, fitsKind } from '../admin/service';
import { REGISTRY } from '../../modules/registry';
import { deepMerge } from '../../modules/resolve';

export const fillSchema = z.array(z.object({
  clave: z.string().min(1).max(80),
  props: z.record(z.unknown()).optional(),
  /** Solo cambia esos campos y deja el resto como en el catálogo (p. ej. el título de la pantalla en vivo). */
  parcial: z.boolean().optional(),
  visible: z.boolean().optional(),
})).min(1).max(30);
export type DeckFill = z.infer<typeof fillSchema>;

/** «editar» manda el bloque entero: lo que traía el catálogo y no viene, fuera (null lo quita, resolve.ts). */
export const wholeProps = (defaults: Record<string, unknown>, props: Record<string, unknown>) =>
  ({ ...Object.fromEntries(Object.keys(defaults).filter((k) => !(k in props)).map((k) => [k, null])), ...props });

/** Acepta el JSON tal cual o envuelto ({ bloques: [...] }). */
export function parseFill(raw: unknown): DeckFill {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).bloques ?? (raw as Record<string, unknown>).blocks : raw;
  const r = fillSchema.safeParse(v);
  if (!r.success) throw new AdminError(422, 'Contenido inválido para este bloque', r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'lista'}: ${i.message}`));
  return r.data;
}

export async function fillDeck(admin: AdminContext, deckId: string, list: DeckFill) {
  const svc = admin.service;
  let st = await svc.getState(deckId);
  if (st.dossier.kind !== 'deck') throw new AdminError(404, 'Ese id no es de un deck');
  // 1. Validar todo antes de cambiar nada.
  const problems: string[] = [];
  const cat = new Map(st.catalog.map((c) => [c.moduleKey, c]));
  list.forEach((b, i) => {
    const c = cat.get(b.clave);
    if (!c || !fitsKind(c.blockType, 'deck')) { problems.push(`${i + 1} · ${b.clave}: no es un bloque del catálogo que valga para un deck`); return; }
    if (!b.props) return;
    const schema = (REGISTRY as unknown as Record<string, { schema: z.ZodTypeAny }>)[c.blockType]?.schema;
    const r = b.parcial ? null : schema?.safeParse(b.props);
    if (r && !r.success) problems.push(...r.error.issues.slice(0, 4).map((x) => `${i + 1} · ${b.clave} · ${x.path.join('.') || 'props'}: ${x.message}`));
  });
  if (problems.length) throw new AdminError(422, 'Contenido inválido para este bloque', problems.slice(0, 12));
  // 2. Quitar lo que no está; luego, bloque a bloque, reutilizar el que ya hay (por clave) o añadirlo, y ponerlo en su sitio.
  const want = new Map<string, number>();
  for (const b of list) want.set(b.clave, (want.get(b.clave) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const it of [...st.items].sort((a, b) => a.position - b.position)) {
    const n = (seen.get(it.moduleKey) ?? 0) + 1;
    seen.set(it.moduleKey, n);
    if (n > (want.get(it.moduleKey) ?? 0)) st = await svc.apply(deckId, { op: 'removeItem', itemId: it.id });
  }
  const used = new Set<string>();
  for (const [i, b] of list.entries()) {
    const ordered = [...st.items].sort((x, y) => x.position - y.position);
    let it = ordered.find((x) => x.moduleKey === b.clave && !used.has(x.id));
    if (!it) {
      const before = new Set(st.items.map((x) => x.id));
      st = await svc.apply(deckId, { op: 'addItem', moduleVersionId: cat.get(b.clave)!.versionId, index: i });
      it = st.items.find((x) => !before.has(x.id))!;
    }
    used.add(it.id);
    const overrides = !b.props ? {} : b.parcial ? b.props : wholeProps(it.defaultProps, b.props);
    if (JSON.stringify(overrides) !== JSON.stringify(it.propOverrides)) st = await svc.apply(deckId, { op: 'setProps', itemId: it.id, propOverrides: overrides });
    const visible = b.visible ?? true;
    if (it.visible !== visible) st = await svc.apply(deckId, { op: 'setVisible', itemId: it.id, visible });
    const pos = [...st.items].sort((x, y) => x.position - y.position).findIndex((x) => x.id === it!.id);
    if (pos !== i) st = await svc.apply(deckId, { op: 'move', itemId: it.id, toIndex: i });
  }
  // Para que se vea como quedó (las props resultantes, con lo del catálogo).
  return { state: st, blocks: [...st.items].sort((a, b) => a.position - b.position).map((x) => ({ clave: x.moduleKey, tipo: x.blockType, props: deepMerge(x.defaultProps, x.propOverrides, x.blockType.startsWith('deck-')) })) };
}
