/**
 * Reglas de negocio de la consola (una sola implementación para demo y Supabase).
 * Permisos: rep → sus dossiers; admin → todos los del tenant. En Supabase la RLS los
 * vuelve a aplicar (defensa en profundidad); aquí además se exige que el dossier sea
 * del tenant del Host aunque el usuario pertenezca a varios.
 */
import { resolveItemPrice, resolveTotal } from '../pricing';
import { needsRebalance, rankBetween, rankForMove, rebalance } from '../rank';
import type { PublicDossier, RenderItem } from '../types';
import { resolveItem } from '../../modules/resolve';
import type { AdminDb } from './db';
import type { BuilderOp, CreateDossierInput } from './ops';
import type { AdminSession, BuilderItem, BuilderState, CatalogVersion, DossierRecord, DossierSummary, ItemRecord } from './types';

export class AdminError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 422 | 501 | 503, message: string, public details?: string[]) {
    super(message);
  }
}

const MAX_OVERRIDES_BYTES = 20_000;

/** Rank nuevo o NaN si no hay hueco (vecinos con la misma position) → hay que rebalancear. */
function tryRank(fn: () => number): number {
  try { return fn(); } catch { return NaN; }
}
const mustRebalance = (positions: number[], next: number) => Number.isNaN(next) || needsRebalance([...positions, next]);

export const toRenderItem = (i: ItemRecord): RenderItem => ({
  id: i.id,
  position: i.position,
  blockType: i.blockType,
  moduleKey: i.moduleKey,
  defaultProps: i.defaultProps,
  propOverrides: i.propOverrides,
  defaultPrice: i.defaultPrice,
  priceOverride: i.priceOverride,
  currency: i.currency,
});

export function toPublicDossier(d: DossierRecord, items: ItemRecord[]): PublicDossier {
  return {
    id: d.id,
    tenantId: d.tenantId,
    title: d.title,
    prospectName: d.prospectName,
    prospectCompany: d.prospectCompany,
    locale: d.locale,
    priceMode: d.priceMode,
    totalPrice: d.totalPrice,
    currency: d.currency,
    themeOverride: null,
    items: items.filter((i) => i.visible).sort((a, b) => a.position - b.position).map(toRenderItem),
  };
}

export function latestByModule(catalog: CatalogVersion[]): Map<string, CatalogVersion> {
  const m = new Map<string, CatalogVersion>();
  for (const v of catalog) {
    const cur = m.get(v.moduleId);
    if (!cur || v.version > cur.version) m.set(v.moduleId, v);
  }
  return m;
}

export function createAdminService(db: AdminDb, s: AdminSession, opts: { defaultLocale?: string; now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date());
  const canEdit = (d: DossierRecord) => s.role === 'admin' || d.authorId === s.userId;

  async function load(id: string): Promise<DossierRecord> {
    const d = await db.getDossier(id);
    if (!d || d.tenantId !== s.tenantId) throw new AdminError(404, 'Dossier no encontrado');
    return d;
  }

  async function loadEditable(id: string): Promise<DossierRecord> {
    const d = await load(id);
    if (!canEdit(d)) throw new AdminError(403, 'Solo el autor o un admin puede editar este dossier');
    return d;
  }

  const sorted = (items: ItemRecord[]) => [...items].sort((a, b) => a.position - b.position);

  async function items(dossierId: string) {
    return sorted(await db.listItems([dossierId]));
  }

  function itemOf(list: ItemRecord[], itemId: string): ItemRecord {
    const it = list.find((i) => i.id === itemId);
    if (!it) throw new AdminError(404, 'Módulo no encontrado en este dossier');
    return it;
  }

  async function assertWrote(ok: boolean | unknown) {
    if (!ok) throw new AdminError(403, 'Sin permiso para esta operación');
  }

  async function getState(id: string): Promise<BuilderState> {
    const d = await load(id);
    const [list, catalog, links] = await Promise.all([items(id), db.listCatalog(s.tenantId), db.listLinks([id])]);
    const latest = latestByModule(catalog);
    const pub = toPublicDossier(d, list);
    const total = resolveTotal(pub);

    const built: BuilderItem[] = list.map((i) => {
      const l = latest.get(i.moduleId);
      const r = resolveItem(toRenderItem(i), pub, total);
      return {
        ...i,
        upgradeTo: l && l.version > i.version ? { versionId: l.versionId, version: l.version } : null,
        price: resolveItemPrice(i, d.priceMode, d.currency, d.locale),
        error: r.ok ? null : r.reason,
      };
    });

    const t = now().getTime();
    const blockers: string[] = [];
    if (!built.some((i) => i.visible)) blockers.push('Añade al menos un módulo visible');
    if (d.priceMode === 'total' && d.totalPrice == null) blockers.push('Indica el precio total (o cambia el modo de precio)');
    for (const i of built) if (i.visible && i.error) blockers.push(`«${i.moduleName}» tiene contenido inválido: ${i.error}`);

    return {
      dossier: d,
      items: built,
      catalog: [...latest.values()].sort((a, b) => a.moduleName.localeCompare(b.moduleName)),
      links: links
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .map((l) => ({
          ...l,
          state: !l.isActive ? 'revoked' : l.expiresAt && new Date(l.expiresAt).getTime() <= t ? 'expired' : 'active',
        })),
      total,
      canEdit: canEdit(d),
      publishBlockers: blockers,
    };
  }

  async function listDossiers(): Promise<DossierSummary[]> {
    const ds = await db.listDossiers(s.tenantId);
    const ids = ds.map((d) => d.id);
    const [its, links, names] = await Promise.all([
      ids.length ? db.listItems(ids) : Promise.resolve([]),
      ids.length ? db.listLinks(ids) : Promise.resolve([]),
      db.userNames([...new Set(ds.map((d) => d.authorId).filter((x): x is string => !!x))]),
    ]);
    const t = now().getTime();
    return ds
      .map((d) => ({
        ...d,
        authorName: d.authorId ? names.get(d.authorId) ?? null : null,
        itemCount: its.filter((i) => i.dossierId === d.id && i.visible).length,
        activeLinks: links.filter((l) => l.dossierId === d.id && l.isActive && (!l.expiresAt || new Date(l.expiresAt).getTime() > t)).length,
      }))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }

  async function createDossier(input: CreateDossierInput): Promise<string> {
    const tpl = input.fromDossierId ? await load(input.fromDossierId) : null;
    const d = await db.insertDossier({
      tenantId: s.tenantId,
      authorId: s.userId,
      title: input.title,
      prospectName: input.prospectName ?? null,
      prospectCompany: input.prospectCompany ?? null,
      locale: tpl?.locale ?? opts.defaultLocale ?? 'es-ES',
      priceMode: tpl?.priceMode ?? 'none',
      totalPrice: tpl?.totalPrice ?? null,
      currency: tpl?.currency ?? 'EUR',
    });
    if (tpl) {
      const src = await items(tpl.id);
      const pos = rebalance(src.length);
      for (const [k, i] of src.entries()) {
        await db.insertItem({
          dossierId: d.id, moduleVersionId: i.moduleVersionId, position: pos[k],
          visible: i.visible, priceOverride: i.priceOverride, propOverrides: i.propOverrides,
        });
      }
    }
    return d.id;
  }

  async function deleteDossier(id: string): Promise<void> {
    const d = await loadEditable(id);
    if (d.status === 'published') throw new AdminError(409, 'Despublica o archiva el dossier antes de borrarlo');
    await assertWrote(await db.deleteDossier(id));
  }

  async function apply(id: string, op: BuilderOp): Promise<BuilderState> {
    const d = await loadEditable(id);

    switch (op.op) {
      case 'update': {
        await assertWrote(await db.updateDossier(id, op.patch));
        break;
      }
      case 'addItem': {
        const catalog = await db.listCatalog(s.tenantId);
        if (!catalog.some((v) => v.versionId === op.moduleVersionId)) throw new AdminError(422, 'Ese módulo no está publicado en el catálogo');
        const list = await items(id);
        const idx = Math.min(op.index ?? list.length, list.length);
        let position = tryRank(() => rankBetween(list[idx - 1]?.position ?? null, list[idx]?.position ?? null));
        if (mustRebalance(list.map((i) => i.position), position)) {
          const pos = rebalance(list.length + 1);
          await db.updateItemPositions(list.map((it, k) => ({ id: it.id, position: pos[k < idx ? k : k + 1] })));
          position = pos[idx];
        }
        await db.insertItem({ dossierId: id, moduleVersionId: op.moduleVersionId, position });
        break;
      }
      case 'move': {
        const list = await items(id);
        const from = list.findIndex((i) => i.id === op.itemId);
        if (from < 0) throw new AdminError(404, 'Módulo no encontrado en este dossier');
        const to = Math.min(op.toIndex, list.length - 1);
        if (from === to) break;
        const position = tryRank(() => rankForMove(list.map((i) => i.position), from, to));
        const others = list.filter((i) => i.id !== op.itemId).map((i) => i.position);
        if (mustRebalance(others, position)) {
          const order = list.filter((i) => i.id !== op.itemId);
          order.splice(to, 0, list[from]);
          const pos = rebalance(order.length);
          await db.updateItemPositions(order.map((it, k) => ({ id: it.id, position: pos[k] })));
        } else {
          await assertWrote(await db.updateItem(op.itemId, { position }));
        }
        break;
      }
      case 'setVisible': {
        itemOf(await items(id), op.itemId);
        await assertWrote(await db.updateItem(op.itemId, { visible: op.visible }));
        break;
      }
      case 'setPrice': {
        itemOf(await items(id), op.itemId);
        await assertWrote(await db.updateItem(op.itemId, { priceOverride: op.priceOverride }));
        break;
      }
      case 'setProps': {
        const it = itemOf(await items(id), op.itemId);
        if (JSON.stringify(op.propOverrides).length > MAX_OVERRIDES_BYTES) throw new AdminError(422, 'Personalización demasiado grande');
        const r = resolveItem(toRenderItem({ ...it, propOverrides: op.propOverrides }), toPublicDossier(d, []), null);
        if (!r.ok) throw new AdminError(422, 'Contenido inválido para este módulo', [r.reason]);
        await assertWrote(await db.updateItem(op.itemId, { propOverrides: op.propOverrides }));
        break;
      }
      case 'removeItem': {
        itemOf(await items(id), op.itemId);
        await assertWrote(await db.deleteItem(op.itemId));
        break;
      }
      case 'upgradeItem': {
        const it = itemOf(await items(id), op.itemId);
        const latest = latestByModule(await db.listCatalog(s.tenantId)).get(it.moduleId);
        if (!latest || latest.version <= it.version) throw new AdminError(409, 'Ya está en la última versión');
        await assertWrote(await db.updateItem(op.itemId, { moduleVersionId: latest.versionId }));
        break;
      }
      case 'setStatus': {
        if (op.status === d.status) break;
        if (op.status === 'published') {
          const st = await getState(id);
          if (st.publishBlockers.length) throw new AdminError(409, 'No se puede publicar todavía', st.publishBlockers);
        }
        await assertWrote(await db.updateDossier(id, {
          status: op.status,
          ...(op.status === 'published' ? { publishedAt: now().toISOString() } : {}),
        }));
        break;
      }
      case 'createLink': {
        const exp = op.expiresAt ?? null;
        if (exp && new Date(exp).getTime() <= now().getTime()) throw new AdminError(422, 'La caducidad debe ser futura');
        await db.insertLink(id, exp);
        break;
      }
      case 'revokeLink': {
        const links = await db.listLinks([id]);
        if (!links.some((l) => l.id === op.linkId)) throw new AdminError(404, 'Enlace no encontrado');
        await assertWrote(await db.revokeLink(op.linkId));
        break;
      }
    }
    return getState(id);
  }

  async function previewDossier(id: string): Promise<PublicDossier> {
    const d = await load(id);
    return toPublicDossier(d, await items(id));
  }

  return { getState, listDossiers, createDossier, deleteDossier, apply, previewDossier, canEdit };
}

export type AdminService = ReturnType<typeof createAdminService>;
