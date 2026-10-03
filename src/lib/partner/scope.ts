/**
 * Colaboradores (docs/PARTNERS.md): lo que un partner puede ver y hacer, aplicado sobre AdminDb/PlaybookDb.
 *
 * Es la MISMA regla que la RLS y los triggers de supabase/migrations/20261007000100_partner.sql:
 *  - en demo (sin RLS) es la única barrera;
 *  - en Supabase es redundante (defensa en profundidad) y mantiene el comportamiento idéntico en ambos modos,
 *    que es lo que verifican los tests de contrato.
 */
import type { AdminDb, ItemPatch, NewDossier, NewItem } from '../admin/db';
import { AdminError } from '../admin/service';
import type { AdminSession, ItemRecord, PartnerAccount, PricePolicy } from '../admin/types';
import type { PlaybookDb } from '../playbook/db';
import type { Play } from '../playbook/types';
import type { EvidenceDb } from '../evidence/db';

export { PRICE_POLICY_LABEL } from './labels';

/** Precio que verá el cliente de una cuenta de colaborador (mismo cálculo que public.partner_price). */
export function partnerPrice(policy: PricePolicy | null | undefined, pct: number | null | undefined, listPrice: number | null): number | null {
  if (policy === 'list') return listPrice;
  if (policy === 'adjusted' && listPrice != null) return Math.round(listPrice * (1 + (pct ?? 0) / 100) * 100) / 100;
  return null;
}

export const priceModeFor = (policy: PricePolicy | null | undefined) => (policy && policy !== 'hidden' ? 'per_module' as const : 'none' as const);

/** ¿Puede un partner ver esta jugada? (= política play_partner_select) */
export function partnerSeesPlay(p: Pick<Play, 'status' | 'audience' | 'kind' | 'moduleId'>, moduleIds: string[]): boolean {
  return p.status === 'official' && p.audience !== 'team' && p.kind !== 'monetization' && (p.moduleId === null || moduleIds.includes(p.moduleId));
}

export class PartnerDenied extends AdminError {
  constructor(message: string) { super(403, message); }
}

const stripPrice = <T extends { defaultPrice: number | null }>(x: T): T => ({ ...x, defaultPrice: null });

type Partner = NonNullable<AdminSession['partner']>;

export function scopeAdminDb(inner: AdminDb, s: AdminSession & { partner: Partner }): AdminDb {
  const me = s.userId;
  const allowed = new Set(s.partner.moduleIds);
  const accounts = (): PartnerAccount[] => s.partner.accounts;
  const account = (id: string | null | undefined) => accounts().find((a) => a.id === id) ?? null;
  const myDossierIds = async () => new Set((await inner.listDossiers(s.tenantId)).filter((d) => d.authorId === me).map((d) => d.id));
  const mine = async (ids: string[]) => { const m = await myDossierIds(); return ids.filter((x) => m.has(x)); };

  async function versionInfo(versionId: string) {
    const v = (await inner.listModuleVersions(s.tenantId)).find((x) => x.id === versionId);
    if (!v || v.status !== 'published' || !allowed.has(v.moduleId)) throw new PartnerDenied('Ese módulo no está disponible para ti');
    return v;
  }
  async function priceFor(dossierId: string, versionId: string) {
    const v = await versionInfo(versionId);
    const d = await inner.getDossier(dossierId);
    const a = account(d?.partnerAccountId);
    return partnerPrice(a?.pricePolicy, a?.priceAdjustPct, v.defaultPrice);
  }

  const getDossier = async (id: string) => { const d = await inner.getDossier(id); return d && d.authorId === me ? d : null; };
  const myItems = async () => inner.listItems([...(await myDossierIds())]);

  return {
    ...inner,
    async userNames(ids) { return inner.userNames(ids.filter((x) => x === me)); },

    async listDossiers(t) { return (await inner.listDossiers(t)).filter((d) => d.authorId === me); },
    getDossier,
    async insertDossier(n: NewDossier) {
      const a = account(n.partnerAccountId);
      if (!a || n.authorId !== me) throw new PartnerDenied('Elige una de tus cuentas');
      return inner.insertDossier({ ...n, priceMode: priceModeFor(a.pricePolicy), totalPrice: null });
    },
    async updateDossier(id, p) {
      if (!(await getDossier(id))) return null;
      const { priceMode: _pm, totalPrice: _tp, currency: _c, ...rest } = p;
      return inner.updateDossier(id, rest);
    },
    async deleteDossier(id) {
      const d = await getDossier(id);
      return d && d.status !== 'published' ? inner.deleteDossier(id) : false;
    },

    async listItems(ids) { return (await inner.listItems(await mine(ids))).map((i: ItemRecord) => stripPrice(i)); },
    async insertItem(n: NewItem) {
      if (!(await getDossier(n.dossierId))) throw new PartnerDenied('Dossier no encontrado');
      return inner.insertItem({ ...n, priceOverride: await priceFor(n.dossierId, n.moduleVersionId) });
    },
    async updateItem(id, p: ItemPatch) {
      const it = (await myItems()).find((x) => x.id === id);
      if (!it) return false;
      const { priceOverride: _po, ...rest } = p;
      const patch: ItemPatch = rest;
      if (p.moduleVersionId && p.moduleVersionId !== it.moduleVersionId) patch.priceOverride = await priceFor(it.dossierId, p.moduleVersionId);
      return inner.updateItem(id, patch);
    },
    async updateItemPositions(updates) {
      const ids = new Set((await myItems()).map((i) => i.id));
      return inner.updateItemPositions(updates.filter((u) => ids.has(u.id)));
    },
    async deleteItem(id) {
      const ids = new Set((await myItems()).map((i) => i.id));
      return ids.has(id) ? inner.deleteItem(id) : false;
    },

    async listCatalog(t) { return (await inner.listCatalog(t)).filter((v) => allowed.has(v.moduleId)).map(stripPrice); },
    async listModules(t) { return (await inner.listModules(t)).filter((m) => allowed.has(m.id)); },
    async listModuleVersions(t) {
      return (await inner.listModuleVersions(t)).filter((v) => allowed.has(v.moduleId) && v.status === 'published').map(stripPrice);
    },
    async versionUsage() { return new Map(); },

    async listLinks(ids) { return inner.listLinks(await mine(ids)); },
    async insertLink(dossierId, exp) {
      if (!(await getDossier(dossierId))) throw new PartnerDenied('Dossier no encontrado');
      return inner.insertLink(dossierId, exp);
    },
    async listContacts(ids) { return inner.listContacts(await mine(ids)); },
    async segmentExists(t, id) { return accounts().some((a) => a.segmentId === id) && inner.segmentExists(t, id); },

    // Gestión del tenant y de colaboradores: nunca.
    // Solo a quién ha invitado él (= membership_partner_invited).
    async listMembers(t) { return (await inner.listMembers(t)).filter((m) => m.invitedBy === me && m.role === 'partner'); },
    async addMember() { return false; },
    async setMemberRole() { return false; },
    async removeMember() { return false; },
    async updateTenant() { return false; },
    async insertModule() { throw new PartnerDenied('Sin permiso'); },
    async updateModule() { return false; },
    async insertModuleVersion() { throw new PartnerDenied('Sin permiso'); },
    async updateModuleVersion() { return false; },
    async getPartnerProfile(t, u) { return u === me ? inner.getPartnerProfile(t, u) : null; },
    async listPartnerProfiles() { return []; },
    async upsertPartnerProfile() { return false; },
    async listPartnerAccounts(t) { return (await inner.listPartnerAccounts(t, me)).filter((a) => a.userId === me); },
    async savePartnerAccount() { throw new PartnerDenied('Sin permiso'); },
    async deletePartnerAccount() { return false; },
  };
}

export function scopePlaybookDb(inner: PlaybookDb, s: AdminSession & { partner: Partner }): PlaybookDb {
  const me = s.userId;
  const mods = s.partner.moduleIds;
  const segs = new Set(s.partner.accounts.map((a) => a.segmentId).filter((x): x is string => !!x));
  const plays = async (t: string) => (await inner.listPlays(t)).filter((p) => partnerSeesPlay(p, mods));
  const listPersonas = async (t: string) => (await inner.listPersonas(t)).filter((x) => segs.has(x.segmentId));

  return {
    ...inner,
    listPlays: plays,
    async insertPlay() { throw new PartnerDenied('Sin permiso'); },
    async updatePlay() { return false; },
    async listRevisions(t, o) {
      const ids = new Set((await plays(t)).map((p) => p.id));
      return (await inner.listRevisions(t, o)).filter((r) => ids.has(r.playId));
    },
    async insertRevision() { throw new PartnerDenied('Sin permiso'); },
    async listContributions(t) {
      // Los suyos siempre; los del equipo, si el admin lo permite (= contribution_partner_select / _own).
      return (await inner.listContributions(t)).filter((c) => c.authorId === me || (s.partner.seeTeamTips && c.type === 'tip'
        && ['shared', 'accepted'].includes(c.status) && c.kind !== 'monetization' && (c.moduleId === null || mods.includes(c.moduleId))));
    },
    async insertContribution(t, row) {
      // Aporta, pero siempre pendiente de aprobación (= contribution_partner_insert).
      if (row.authorId !== me || row.status !== 'pending') throw new PartnerDenied('Tus aportes los revisa el equipo antes de publicarse');
      if (row.moduleId && !mods.includes(row.moduleId)) throw new PartnerDenied('Ese módulo no está disponible para ti');
      return inner.insertContribution(t, row);
    },
    async updateContribution() { return false; },
    async deleteContribution(id) {
      const c = (await inner.listContributions(s.tenantId)).find((x) => x.id === id);
      return c && c.authorId === me && c.status === 'pending' ? inner.deleteContribution(id) : false;
    },
    async listFeedback(t) { return (await inner.listFeedback(t)).filter((f) => f.userId === me); },
    async listProgress(t) { return (await inner.listProgress(t)).filter((p) => p.userId === me); },

    async listSegments(t) { return (await inner.listSegments(t)).filter((x) => x.status === 'official' && segs.has(x.id)); },
    listPersonas,
    async listSegmentModules(t) { return (await inner.listSegmentModules(t)).filter((x) => segs.has(x.segmentId) && mods.includes(x.moduleId)); },
    async listPersonaModules(t) {
      const ps = new Set((await listPersonas(t)).map((p) => p.id));
      return (await inner.listPersonaModules(t)).filter((x) => ps.has(x.personaId) && mods.includes(x.moduleId));
    },
    async saveSegment() { throw new PartnerDenied('Sin permiso'); },
    async savePersona() { throw new PartnerDenied('Sin permiso'); },
    async deletePersona() { return false; },
    async setSegmentModule() { throw new PartnerDenied('Sin permiso'); },
    async setPersonaModule() { throw new PartnerDenied('Sin permiso'); },
  };
}

/** Cierres: los suyos y, si el admin se lo permite, los compartidos del equipo (= story_select_partner). */
export function scopeEvidenceDb(inner: EvidenceDb, s: AdminSession & { partner: Partner }): EvidenceDb {
  const me = s.userId;
  return {
    ...inner,
    async listStories(t) {
      return (await inner.listStories(t)).filter((x) => x.authorId === me || (x.status === 'shared' && s.partner.seeTeamTips));
    },
    async saveStory(t, w) {
      if (w.authorId !== me) throw new PartnerDenied('Solo puedes documentar tus cierres');
      return inner.saveStory(t, w);
    },
    async saveFacet() { throw new PartnerDenied('Sin permiso'); },
    async setStoryStatus() { return false; },
  };
}
