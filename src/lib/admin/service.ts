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
import { can } from './permissions';
import { paymentUrl } from './payment';
import { builderOpSchema, type BuilderOpInput, type CreateDossierInput } from './ops';
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
    discount: d.discount,
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
  const canEdit = (d: DossierRecord) => can(s.role).editAllDossiers || d.authorId === s.userId;
  const isPartner = s.role === 'partner';
  /** Comercial y jefe/a de ventas: el precio sale de una tarifa (docs/COMMISSIONS.md §Tarifas). */
  const pricesFromOptions = s.role === 'rep' || s.role === 'lead';
  const PRICE_FROM_OPTIONS = 'El precio lo fija tu empresa: elige una tarifa';
  const PRICES_LOCKED = 'Los precios de tus cuentas los gestiona la empresa';

  /** Cuenta de colaborador del dossier (el admin ve la política; el colaborador, la suya). */
  async function partnerAccountOf(d: DossierRecord): Promise<BuilderState['partnerAccount']> {
    if (!d.partnerAccountId) return null;
    const list = isPartner ? s.partner?.accounts ?? [] : can(s.role).manageTeam ? await db.listPartnerAccounts(s.tenantId) : [];
    const a = list.find((x) => x.id === d.partnerAccountId);
    return a ? { id: a.id, name: a.name, pricePolicy: a.pricePolicy, priceAdjustPct: isPartner ? null : a.priceAdjustPct, notes: a.notes } : null;
  }

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
    const [list, catalog, links, contacts, partnerAccount, options] = await Promise.all([
      items(id), db.listCatalog(s.tenantId), db.listLinks([id]), db.listContacts([id]), partnerAccountOf(d),
      isPartner ? Promise.resolve([]) : db.listPriceOptions(s.tenantId).catch(() => []),
    ]);
    // Las del sector de la propuesta, primero.
    const priceOptions = options.filter((o) => o.active || o.id === d.priceOptionId)
      .sort((a, b) => Number(b.segmentId === d.segmentId && !!d.segmentId) - Number(a.segmentId === d.segmentId && !!d.segmentId) || a.position - b.position);
    const chosen = d.priceOptionId ? options.find((o) => o.id === d.priceOptionId) : undefined;
    const payUrl = chosen?.paymentLink ? paymentUrl(chosen.paymentLink, { dossierId: d.id, couponCode: d.discount?.code ?? null }) : null;
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
      contacts: contacts.sort((a, b) => a.position - b.position),
      publishBlockers: blockers,
      partnerAccount,
      pricesLocked: isPartner,
      priceOptions,
      payment: payUrl && chosen ? { url: payUrl, label: chosen.label } : null,
      customPrices: !isPartner && !pricesFromOptions,
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
      // Orden determinista: sin empates (el id desempata).
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id));
  }

  async function createDossier(input: CreateDossierInput): Promise<string> {
    const tpl = input.fromDossierId ? await load(input.fromDossierId) : null;
    const account = isPartner ? s.partner?.accounts.find((a) => a.id === input.partnerAccountId) ?? null : null;
    if (isPartner && !account) throw new AdminError(422, 'Elige para qué cuenta es la propuesta');
    if (!isPartner && input.partnerAccountId) throw new AdminError(422, 'Solo los colaboradores crean propuestas de sus cuentas');
    if (isPartner && input.accountId) throw new AdminError(422, 'Los colaboradores venden en sus cuentas asignadas');
    if (account && tpl && tpl.partnerAccountId !== account.id) throw new AdminError(422, 'Solo puedes duplicar propuestas de la misma cuenta');
    const d = await db.insertDossier({
      tenantId: s.tenantId,
      authorId: s.userId,
      title: input.title,
      prospectName: input.prospectName ?? null,
      prospectCompany: input.prospectCompany ?? null,
      locale: tpl?.locale ?? opts.defaultLocale ?? 'es-ES',
      priceMode: tpl && !(pricesFromOptions && tpl.priceMode === 'total' && !tpl.priceOptionId) ? tpl.priceMode : 'none',
      totalPrice: tpl && !(pricesFromOptions && !tpl.priceOptionId) ? tpl.totalPrice : null,
      currency: tpl?.currency ?? 'EUR',
      partnerAccountId: account?.id ?? null,
      accountId: input.accountId ?? null,
    });
    const segmentId = account?.segmentId ?? tpl?.segmentId;
    if (segmentId) await db.updateDossier(d.id, { segmentId });
    if (tpl?.priceOptionId) await db.updateDossier(d.id, { priceOptionId: tpl.priceOptionId });
    if (tpl) {
      const src = await items(tpl.id);
      const pos = rebalance(src.length);
      for (const [k, i] of src.entries()) {
        await db.insertItem({
          dossierId: d.id, moduleVersionId: i.moduleVersionId, position: pos[k],
          visible: i.visible, priceOverride: pricesFromOptions ? null : i.priceOverride, propOverrides: i.propOverrides,
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

  async function apply(id: string, input: BuilderOpInput): Promise<BuilderState> {
    const parsed = builderOpSchema.safeParse(input);
    if (!parsed.success) throw new AdminError(422, 'Datos no válidos', parsed.error.issues.map((i) => `${i.path.join('.') || 'op'}: ${i.message}`));
    const op = parsed.data;
    const d = await loadEditable(id);

    if (isPartner && (op.op === 'setPrice' || op.op === 'setPriceOption' || (op.op === 'update' && ['priceMode', 'totalPrice', 'currency'].some((k) => k in op.patch)))) {
      throw new AdminError(403, PRICES_LOCKED);
    }
    if (pricesFromOptions && (op.op === 'setPrice' || (op.op === 'update' && ('totalPrice' in op.patch || 'currency' in op.patch || op.patch.priceMode === 'total')))) {
      throw new AdminError(403, PRICE_FROM_OPTIONS);
    }

    switch (op.op) {
      case 'update': {
        // Un precio a medida (admin) deja de ser la tarifa.
        const custom = 'totalPrice' in op.patch || 'priceMode' in op.patch;
        await assertWrote(await db.updateDossier(id, custom && d.priceOptionId ? { ...op.patch, priceOptionId: null } : op.patch));
        break;
      }
      case 'setPriceOption': {
        if (!op.priceOptionId) {
          await assertWrote(await db.updateDossier(id, { priceOptionId: null, priceMode: 'none', totalPrice: null }));
          break;
        }
        const o = (await db.listPriceOptions(s.tenantId)).find((x) => x.id === op.priceOptionId && x.active);
        if (!o) throw new AdminError(404, 'Tarifa no disponible');
        await assertWrote(await db.updateDossier(id, { priceOptionId: o.id, priceMode: 'total', totalPrice: o.amount, currency: o.currency }));
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
      case 'setOutcome': {
        await assertWrote(await db.updateDossier(id, {
          outcome: op.outcome, outcomeNote: op.note ?? null, outcomeAt: op.outcome === 'open' ? null : now().toISOString(),
        }));
        break;
      }
      case 'setSegment': {
        if (op.segmentId && !(await db.segmentExists(s.tenantId, op.segmentId))) throw new AdminError(404, 'Sector no encontrado');
        await assertWrote(await db.updateDossier(id, { segmentId: op.segmentId }));
        break;
      }
      case 'setNextStep': {
        if (op.at && !op.text) throw new AdminError(422, 'Describe el próximo paso (p. ej. «Llamar para cerrar fecha»)');
        await assertWrote(await db.updateDossier(id, { nextStep: op.text ?? null, nextStepAt: op.at }));
        break;
      }
      case 'addContact': {
        const c = op.contact;
        if (c.personaId && !(await db.personaExists(s.tenantId, c.personaId))) throw new AdminError(404, 'Actor no encontrado');
        const existing = await db.listContacts([id]);
        if (existing.length >= 30) throw new AdminError(422, 'Máximo 30 contactos por cuenta');
        await db.insertContact(id, { ...c, position: Math.max(0, ...existing.map((x) => x.position)) + 1024 });
        break;
      }
      case 'updateContact': {
        if (!(await db.listContacts([id])).some((x) => x.id === op.contactId)) throw new AdminError(404, 'Contacto no encontrado');
        if (op.contact.personaId && !(await db.personaExists(s.tenantId, op.contact.personaId))) throw new AdminError(404, 'Actor no encontrado');
        await assertWrote(await db.updateContact(op.contactId, op.contact));
        break;
      }
      case 'removeContact': {
        if (!(await db.listContacts([id])).some((x) => x.id === op.contactId)) throw new AdminError(404, 'Contacto no encontrado');
        await assertWrote(await db.deleteContact(op.contactId));
        break;
      }
      case 'setAccount': {
        if (isPartner) throw new AdminError(422, 'Los colaboradores venden en sus cuentas asignadas');
        try { await assertWrote(await db.updateDossier(id, { accountId: op.accountId })); } catch (e) {
          if (e instanceof AdminError) throw e;
          if (/foreign key|violates/i.test(String(e))) throw new AdminError(404, 'Cuenta no encontrada');
          throw e;
        }
        break;
      }
      case 'setCoupon': {
        if (isPartner) throw new AdminError(403, 'Los cupones los aplica el equipo interno');
        try { await assertWrote(await db.updateDossier(id, { couponId: op.couponId })); } catch (e) {
          if (e instanceof AdminError) throw e;
          const m = String(e);
          if (/caducado|usos|no disponible/i.test(m)) throw new AdminError(409, m.match(/El cupón[^.(]*|Cupón no disponible/)?.[0]?.trim() ?? 'Cupón no disponible');
          if (/foreign key/i.test(m)) throw new AdminError(404, 'Cupón no encontrado');
          throw e;
        }
        break;
      }
      case 'setSituation': {
        // Se guardan solo las facetas con valor (las vacías = «no lo sé»).
        const clean = Object.fromEntries(Object.entries(op.situation).filter(([, v]) => v.length));
        await assertWrote(await db.updateDossier(id, { situation: clean }));
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

  /** Lo que se vende: la última versión publicada de cada módulo (al colaborador, solo los suyos y sin tarifa). */
  async function catalog(): Promise<CatalogVersion[]> {
    return [...latestByModule(await db.listCatalog(s.tenantId)).values()].sort((a, b) => a.moduleName.localeCompare(b.moduleName, 'es'));
  }

  return { getState, listDossiers, createDossier, deleteDossier, apply, previewDossier, canEdit, catalog };
}

export type AdminService = ReturnType<typeof createAdminService>;
