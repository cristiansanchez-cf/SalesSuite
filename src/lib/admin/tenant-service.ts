/**
 * Gestión del tenant desde la consola: equipo, catálogo de módulos y marca/tema. Solo admins.
 * Igual que service.ts: reglas aquí, datos vía AdminDb (RLS en Supabase como segunda barrera).
 */
import { REGISTRY, isBlockType } from '../../modules/registry';
import type { PublicDossier } from '../types';
import type { AdminDb, AssetStore, Identity } from './db';
import { draftSchema, inviteSchema, moduleCreateSchema, moduleUpdateSchema, partnerAccountSchema, partnerInviteSchema, partnerProfileSchema, roleSchema, settingsSchema } from './ops';
import { AdminError } from './service';
import type { AdminSession, CatalogModuleView, DossierRecord, MemberRecord, PartnerView, Role, TenantSettings } from './types';
import { partnerPrice, priceModeFor } from '../partner/scope';
import { can } from './permissions';

const ROLE_ORDER: Record<Role, number> = { admin: 0, lead: 1, rep: 2, partner: 3 };
import type { z } from 'zod';

const MAX_PROPS_BYTES = 50_000;
export const ASSET_KINDS = ['logo', 'logo-dark', 'favicon', 'og', 'font', 'image'] as const;
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;

/** Traduce errores de BD conocidos a errores de negocio legibles. */
function mapDbError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/duplicate key|unique/i.test(msg)) throw new AdminError(409, 'Ya existe un elemento con esa clave');
  if (/al menos un admin/i.test(msg)) throw new AdminError(409, 'El equipo debe conservar al menos un admin');
  if (/ya no es draft/i.test(msg)) throw new AdminError(409, 'Esa versión ya está publicada: crea una versión nueva');
  if (msg === 'DEMO_NO_STORAGE') throw new AdminError(501, 'La subida de archivos requiere Supabase (en demo, pega una URL)');
  if (msg === 'TIPO_NO_PERMITIDO') throw new AdminError(422, 'Tipo de archivo no permitido (PNG, JPG, WEBP, SVG, ICO, WOFF/WOFF2)');
  throw e;
}

function issues(e: z.ZodError): string[] {
  return e.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`);
}

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', issues(r.error));
  return r.data;
}

export function validateProps(blockType: string, props: unknown): string[] {
  if (!isBlockType(blockType)) return [`block_type desconocido: ${blockType}`];
  if (JSON.stringify(props ?? {}).length > MAX_PROPS_BYTES) return ['Contenido demasiado grande'];
  const r = REGISTRY[blockType].schema.safeParse(props);
  return r.success ? [] : issues(r.error);
}

export function createTenantAdminService(
  db: AdminDb,
  s: AdminSession,
  deps: { identity: Identity | null; assets: AssetStore },
) {
  const perms = can(s.role);
  function requireAdmin() {
    if (!perms.manageTenant) throw new AdminError(403, 'Solo los admins pueden gestionar el tenant');
  }
  function requireTeam() {
    if (!perms.manageTeam) throw new AdminError(403, 'Solo un admin o un jefe/a de ventas gestiona el equipo');
  }
  const wrote = (ok: boolean) => { if (!ok) throw new AdminError(403, 'Sin permiso para esta operación'); };

  // ------------------------------------------------------------ equipo
  async function listMembers(): Promise<MemberRecord[]> {
    requireTeam();
    // Equipo interno; los colaboradores se gestionan aparte (listPartners).
    const list = (await db.listMembers(s.tenantId)).filter((m) => m.role !== 'partner');
    return list.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : ROLE_ORDER[a.role] - ROLE_ORDER[b.role]));
  }

  async function invite(input: unknown, redirectTo: string): Promise<{ invited: boolean }> {
    requireTeam();
    const { email, role } = parse(inviteSchema, input);
    if (role !== 'rep' && !perms.manageTenant) throw new AdminError(403, 'Un jefe/a de ventas invita comerciales y colaboradores; los admins y jefes los da de alta un admin');
    if (!deps.identity) throw new AdminError(503, 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para poder invitar (ver docs/SETUP.md)');
    const members = await db.listMembers(s.tenantId);
    if (members.some((m) => m.email.toLowerCase() === email)) throw new AdminError(409, 'Esa persona ya está en el equipo');
    const { userId, invited } = await deps.identity.findOrInvite(email, { redirectTo });
    try { wrote(await db.addMember(s.tenantId, userId, role, s.userId)); } catch (e) { mapDbError(e); }
    return { invited };
  }

  async function assertNotLastAdmin(userId: string, nextRole: Role | null) {
    const members = await db.listMembers(s.tenantId);
    const target = members.find((m) => m.userId === userId);
    if (!target) throw new AdminError(404, 'Miembro no encontrado');
    if (target.role === 'partner' && nextRole !== null) {
      throw new AdminError(409, 'Un colaborador no cambia de rol: quítale el acceso e invítalo al equipo');
    }
    if (target.role === 'admin' && nextRole !== 'admin' && !members.some((m) => m.role === 'admin' && m.userId !== userId)) {
      throw new AdminError(409, 'El equipo debe conservar al menos un admin');
    }
  }

  async function setRole(userId: string, role: unknown) {
    requireAdmin();
    const r = parse(roleSchema, role);
    await assertNotLastAdmin(userId, r);
    try { wrote(await db.setMemberRole(s.tenantId, userId, r)); } catch (e) { mapDbError(e); }
  }

  async function removeMember(userId: string) {
    requireTeam();
    const target = (await db.listMembers(s.tenantId)).find((m) => m.userId === userId);
    if (!perms.manageTenant && target && !['rep', 'partner'].includes(target.role)) throw new AdminError(403, 'Solo un admin quita a otros admins o jefes de ventas');
    await assertNotLastAdmin(userId, null);
    try { wrote(await db.removeMember(s.tenantId, userId)); } catch (e) { mapDbError(e); }
  }

  // ------------------------------------------------------------ catálogo
  async function listCatalog(): Promise<CatalogModuleView[]> {
    requireAdmin();
    const [modules, versions, usage] = await Promise.all([
      db.listModules(s.tenantId), db.listModuleVersions(s.tenantId), db.versionUsage(s.tenantId),
    ]);
    return modules
      .map((m) => ({
        ...m,
        blockLabel: isBlockType(m.blockType) ? REGISTRY[m.blockType].label : m.blockType,
        versions: versions
          .filter((v) => v.moduleId === m.id)
          .sort((a, b) => b.version - a.version)
          .map((v) => ({ ...v, usage: usage.get(v.id) ?? 0, error: validateProps(m.blockType, v.defaultProps)[0] ?? null })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadVersion(versionId: string) {
    const [modules, versions] = await Promise.all([db.listModules(s.tenantId), db.listModuleVersions(s.tenantId)]);
    const v = versions.find((x) => x.id === versionId);
    const m = v && modules.find((x) => x.id === v.moduleId);
    if (!v || !m) throw new AdminError(404, 'Versión no encontrada');
    return { v, m, versions: versions.filter((x) => x.moduleId === m.id) };
  }

  async function createModule(input: unknown): Promise<{ moduleId: string; versionId: string }> {
    requireAdmin();
    const d = parse(moduleCreateSchema, input);
    try {
      const moduleId = await db.insertModule({
        tenantId: s.tenantId, key: d.key, blockType: d.blockType, name: d.name, description: d.description ?? null, isCatalog: true,
      });
      const versionId = await db.insertModuleVersion({
        moduleId, version: 1, status: 'draft', defaultProps: structuredClone(REGISTRY[d.blockType].example), defaultPrice: null, currency: 'EUR',
      });
      return { moduleId, versionId };
    } catch (e) { mapDbError(e); }
  }

  async function updateModule(moduleId: string, input: unknown) {
    requireAdmin();
    const p = parse(moduleUpdateSchema, input);
    const m = (await db.listModules(s.tenantId)).find((x) => x.id === moduleId);
    if (!m) throw new AdminError(404, 'Módulo no encontrado');
    wrote(await db.updateModule(moduleId, p));
  }

  /** Nueva versión borrador (copia de `fromVersionId` o de la última). Reutiliza el borrador si ya existe. */
  async function newDraft(moduleId: string, fromVersionId?: string): Promise<string> {
    requireAdmin();
    const versions = (await db.listModuleVersions(s.tenantId)).filter((v) => v.moduleId === moduleId);
    if (!versions.length) throw new AdminError(404, 'Módulo no encontrado');
    const existing = versions.find((v) => v.status === 'draft');
    if (existing) return existing.id;
    const base = (fromVersionId && versions.find((v) => v.id === fromVersionId)) || versions.sort((a, b) => b.version - a.version)[0];
    try {
      return await db.insertModuleVersion({
        moduleId, version: Math.max(...versions.map((v) => v.version)) + 1, status: 'draft',
        defaultProps: structuredClone(base.defaultProps), defaultPrice: base.defaultPrice, currency: base.currency,
      });
    } catch (e) { mapDbError(e); }
  }

  async function saveDraft(versionId: string, input: unknown) {
    requireAdmin();
    const d = parse(draftSchema, input);
    const { v, m } = await loadVersion(versionId);
    if (v.status !== 'draft') throw new AdminError(409, 'Esa versión ya está publicada: crea una versión nueva');
    const errs = validateProps(m.blockType, d.defaultProps);
    if (errs.length) throw new AdminError(422, 'Contenido inválido para este módulo', errs);
    try { wrote(await db.updateModuleVersion(versionId, d)); } catch (e) { mapDbError(e); }
  }

  async function publish(versionId: string) {
    requireAdmin();
    const { v, m } = await loadVersion(versionId);
    if (v.status === 'published') return;
    if (v.status === 'archived') throw new AdminError(409, 'Una versión archivada no se vuelve a publicar: crea una nueva');
    const errs = validateProps(m.blockType, v.defaultProps);
    if (errs.length) throw new AdminError(422, 'No se puede publicar: contenido inválido', errs);
    try { wrote(await db.updateModuleVersion(versionId, { status: 'published' })); } catch (e) { mapDbError(e); }
  }

  /** Archivar = sale del catálogo. Los dossiers que la fijan siguen funcionando (versión inmutable). */
  async function archive(versionId: string) {
    requireAdmin();
    const { v } = await loadVersion(versionId);
    if (v.status === 'archived') return;
    try { wrote(await db.updateModuleVersion(versionId, { status: 'archived' })); } catch (e) { mapDbError(e); }
  }

  /** Dossier sintético de un solo módulo para previsualizar una versión (cualquier estado). */
  async function previewVersion(versionId: string, locale: string): Promise<PublicDossier> {
    requireAdmin();
    const { v, m } = await loadVersion(versionId);
    return {
      id: `preview-${v.id}`, tenantId: s.tenantId, title: `${m.name} · v${v.version}`,
      prospectName: 'Laura', prospectCompany: 'Empresa Ejemplo', locale,
      priceMode: v.defaultPrice != null ? 'per_module' : 'none', totalPrice: null, currency: v.currency, themeOverride: null,
      items: [{ id: v.id, position: 1, blockType: m.blockType, moduleKey: m.key, defaultProps: v.defaultProps, propOverrides: {}, defaultPrice: v.defaultPrice, priceOverride: null, currency: v.currency }],
    };
  }

  /** Dossier de muestra con la última versión publicada de cada módulo visible (preview de marca). */
  async function previewSample(locale: string): Promise<PublicDossier> {
    requireAdmin();
    const cat = await listCatalog();
    const items = cat
      .filter((m) => m.isCatalog)
      .map((m) => ({ m, v: m.versions.find((v) => v.status === 'published') }))
      .filter((x): x is { m: typeof x.m; v: NonNullable<typeof x.v> } => !!x.v)
      .slice(0, 6)
      .map(({ m, v }, i) => ({
        id: v.id, position: i + 1, blockType: m.blockType, moduleKey: m.key, defaultProps: v.defaultProps,
        propOverrides: {}, defaultPrice: v.defaultPrice, priceOverride: null, currency: v.currency,
      }));
    return {
      id: 'preview-brand', tenantId: s.tenantId, title: 'Muestra de marca', prospectName: 'Laura', prospectCompany: 'Empresa Ejemplo',
      locale, priceMode: items.some((i) => i.defaultPrice != null) ? 'per_module' : 'none', totalPrice: null,
      currency: items[0]?.currency ?? 'EUR', themeOverride: null, items,
    };
  }

  // ------------------------------------------------------------ marca y tema
  async function getSettings(): Promise<TenantSettings> {
    requireAdmin();
    const t = await db.getTenant(s.tenantId);
    if (!t) throw new AdminError(404, 'Tenant no encontrado');
    return t;
  }

  async function saveSettings(input: unknown) {
    requireAdmin();
    const d = parse(settingsSchema, input);
    try { wrote(await db.updateTenant(s.tenantId, d)); } catch (e) { mapDbError(e); }
  }

  async function uploadAsset(file: { name: string; type: string; bytes: Uint8Array }, kind: string): Promise<string> {
    requireAdmin();
    if (!(ASSET_KINDS as readonly string[]).includes(kind)) throw new AdminError(422, 'Tipo de recurso no válido');
    if (file.bytes.byteLength === 0) throw new AdminError(422, 'Archivo vacío');
    if (file.bytes.byteLength > ASSET_MAX_BYTES) throw new AdminError(422, 'Máximo 5 MB por archivo');
    try { return (await deps.assets.upload(s.tenantId, file, kind)).url; } catch (e) { mapDbError(e); }
  }

  // ------------------------------------------------------------ colaboradores (docs/PARTNERS.md)
  async function listPartners(): Promise<PartnerView[]> {
    requireTeam();
    const [members, profiles, accounts, dossiers] = await Promise.all([
      db.listMembers(s.tenantId), db.listPartnerProfiles(s.tenantId), db.listPartnerAccounts(s.tenantId), db.listDossiers(s.tenantId),
    ]);
    const t = Date.now();
    return members.filter((m) => m.role === 'partner').map((m) => {
      const profile = profiles.find((p) => p.userId === m.userId) ?? null;
      return {
        ...m, profile,
        accounts: accounts.filter((a) => a.userId === m.userId).sort((a, b) => a.position - b.position),
        dossierCount: dossiers.filter((d) => d.authorId === m.userId).length,
        expired: !!profile?.expiresAt && new Date(profile.expiresAt).getTime() <= t,
      };
    }).sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
  }

  async function partner(userId: string): Promise<PartnerView & { dossiers: DossierRecord[] }> {
    const p = (await listPartners()).find((x) => x.userId === userId);
    if (!p) throw new AdminError(404, 'Colaborador no encontrado');
    const dossiers = (await db.listDossiers(s.tenantId)).filter((d) => d.authorId === userId)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    return { ...p, dossiers };
  }

  async function assertModules(ids: string[]) {
    const known = new Set((await db.listModules(s.tenantId)).map((m) => m.id));
    if (ids.some((x) => !known.has(x))) throw new AdminError(404, 'Módulo no encontrado');
  }

  /** Invita a un colaborador: entra con su email (código o enlace), sin contraseña, y solo ve lo permitido. */
  async function invitePartner(input: unknown, redirectTo: string): Promise<{ userId: string; invited: boolean }> {
    requireTeam();
    const v = parse(partnerInviteSchema, input);
    if (!deps.identity) throw new AdminError(503, 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para poder invitar (ver docs/SETUP.md)');
    await assertModules(v.moduleIds);
    const members = await db.listMembers(s.tenantId);
    if (members.some((m) => m.email.toLowerCase() === v.email)) throw new AdminError(409, 'Esa persona ya tiene acceso a este espacio');
    const { userId, invited } = await deps.identity.findOrInvite(v.email, { redirectTo });
    try {
      wrote(await db.addMember(s.tenantId, userId, 'partner', s.userId));
      wrote(await db.upsertPartnerProfile({
        tenantId: s.tenantId, userId, moduleIds: v.moduleIds, seeTeamTips: v.seeTeamTips, welcomeNote: v.welcomeNote, expiresAt: v.expiresAt, canInvite: v.canInvite,
      }));
    } catch (e) { mapDbError(e); }
    return { userId, invited };
  }

  async function updatePartner(userId: string, input: unknown) {
    requireTeam();
    const v = parse(partnerProfileSchema, input);
    await partner(userId);
    await assertModules(v.moduleIds);
    try { wrote(await db.upsertPartnerProfile({ tenantId: s.tenantId, userId, ...v })); } catch (e) { mapDbError(e); }
  }

  /**
   * Crea o edita una cuenta del colaborador. Si cambia la política de precio, se aplica a sus borradores;
   * a las propuestas ya enviadas solo con applyToSent (el cliente ya tiene ese precio en la mano).
   */
  async function savePartnerAccount(userId: string, input: unknown, accountId?: string, opts: { applyToSent?: boolean } = {}): Promise<string> {
    requireTeam();
    const parsed = parse(partnerAccountSchema, input);
    const p = await partner(userId);
    const cur = accountId ? p.accounts.find((a) => a.id === accountId) : undefined;
    if (accountId && !cur) throw new AdminError(404, 'Cuenta no encontrada');
    // El precio lo decide el admin: un jefe/a de ventas asigna cuentas, pero no toca su precio (= trigger partner_account_price_guard).
    const v = perms.setPrices ? parsed : { ...parsed, pricePolicy: cur?.pricePolicy ?? 'hidden' as const, priceAdjustPct: cur?.priceAdjustPct ?? 0 };
    if (v.segmentId && !(await db.segmentExists(s.tenantId, v.segmentId))) throw new AdminError(404, 'Sector no encontrado');
    const priceAdjustPct = v.pricePolicy === 'adjusted' ? v.priceAdjustPct : 0;
    let id: string;
    try {
      id = await db.savePartnerAccount({
        id: accountId, tenantId: s.tenantId, userId, name: v.name, segmentId: v.segmentId, pricePolicy: v.pricePolicy, priceAdjustPct, notes: v.notes,
        position: cur?.position ?? Math.max(0, ...p.accounts.map((a) => a.position)) + 1024,
      });
    } catch (e) { mapDbError(e); }
    if (cur && (cur.pricePolicy !== v.pricePolicy || cur.priceAdjustPct !== priceAdjustPct)) {
      // Borradores: en Supabase lo hace también el trigger partner_account_reprice; aquí cubre la demo (mismo cálculo).
      // Enviadas: solo si el admin lo pide (con permiso de precios, que es lo único que llega hasta aquí con cambios).
      const ds = p.dossiers.filter((d) => d.partnerAccountId === id && (d.status === 'draft' || opts.applyToSent));
      const items = ds.length ? await db.listItems(ds.map((d) => d.id)) : [];
      for (const d of ds) await db.updateDossier(d.id, { priceMode: priceModeFor(v.pricePolicy), totalPrice: null });
      for (const i of items) await db.updateItem(i.id, { priceOverride: partnerPrice(v.pricePolicy, priceAdjustPct, i.defaultPrice) });
    }
    return id;
  }

  async function deletePartnerAccount(userId: string, accountId: string) {
    requireTeam();
    const p = await partner(userId);
    if (!p.accounts.some((a) => a.id === accountId)) throw new AdminError(404, 'Cuenta no encontrada');
    wrote(await db.deletePartnerAccount(accountId));
  }

  // ------------------------------------------------------------ red de colaboradores (un colaborador invita a otro)
  /** El colaborador invita a un colega: hereda sus módulos y su caducidad. El equipo ve quién invitó a quién. */
  async function partnerInvite(input: unknown, redirectTo: string): Promise<{ userId: string; invited: boolean }> {
    if (s.role !== 'partner' || !s.partner?.canInvite) throw new AdminError(403, 'Tu acceso no permite invitar a otros colaboradores');
    const { email } = parse(inviteSchema.pick({ email: true }), input);
    if (!deps.identity) throw new AdminError(503, 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para poder invitar (ver docs/SETUP.md)');
    const { userId, invited } = await deps.identity.findOrInvite(email, { redirectTo });
    try { await db.partnerInvitePartner(s.tenantId, s.userId, userId); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/ya tiene acceso|duplicate|unique/i.test(msg)) throw new AdminError(409, 'Esa persona ya tiene acceso a este espacio');
      if (/permiso/i.test(msg)) throw new AdminError(403, 'Tu acceso no permite invitar a otros colaboradores');
      throw e;
    }
    return { userId, invited };
  }

  /** A quién ha invitado este colaborador (solo los suyos). */
  async function myInvitees(): Promise<MemberRecord[]> {
    return (await db.listMembers(s.tenantId)).filter((m) => m.invitedBy === s.userId && m.role === 'partner');
  }

  // ---------------------------------------------------------------- tarifas (docs/COMMISSIONS.md §Tarifas)
  const PERIODS = ['once', 'event', 'month', 'year'] as const;
  async function listPriceOptions() { requireAdmin(); return db.listPriceOptions(s.tenantId); }
  async function savePriceOption(input: { label: unknown; amount: unknown; currency?: unknown; period: unknown; paymentLink?: unknown; segmentId?: unknown; kind?: unknown; isDefault?: unknown }, id?: string) {
    requireAdmin();
    const label = String(input.label ?? '').trim();
    if (!label || label.length > 80) throw new AdminError(422, 'Ponle un nombre corto (p. ej. «Local mediano»)');
    const amount = Math.round(Number(String(input.amount ?? '').replace(/\s/g, '').replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) throw new AdminError(422, 'Importe no válido');
    const period = String(input.period ?? 'once') as (typeof PERIODS)[number];
    if (!PERIODS.includes(period)) throw new AdminError(422, 'Periodo no válido');
    const currency = String(input.currency || 'EUR').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new AdminError(422, 'Moneda no válida');
    const link = String(input.paymentLink ?? '').trim();
    if (link && (!/^https:\/\/[^\s"'<>]+$/.test(link) || link.length > 500)) throw new AdminError(422, 'El enlace de pago tiene que empezar por https:// (el Payment Link de Stripe)');
    const segmentId = String(input.segmentId ?? '') || null;
    const all = await db.listPriceOptions(s.tenantId);
    const cur = id ? all.find((o) => o.id === id) : undefined;
    if (id && !cur) throw new AdminError(404, 'Tarifa no encontrada');
    return db.savePriceOption(s.tenantId, {
      label, amount, currency, period, paymentLink: link || null, segmentId,
      ...(input.kind !== undefined ? { kind: String(input.kind ?? '').trim().slice(0, 60) || null } : {}),
      ...(input.isDefault !== undefined ? { isDefault: !!input.isDefault } : {}),
      position: cur?.position ?? Math.max(0, ...all.map((o) => o.position)) + 1, active: cur?.active ?? true,
    }, id);
  }
  async function setPriceOptionActive(id: string, active: boolean) {
    requireAdmin();
    const cur = (await db.listPriceOptions(s.tenantId)).find((o) => o.id === id);
    if (!cur) throw new AdminError(404, 'Tarifa no encontrada');
    const { id: _id, ...rest } = cur;
    await db.savePriceOption(s.tenantId, { ...rest, active }, id);
  }

  return {
    listPriceOptions, savePriceOption, setPriceOptionActive,
    partnerInvite, myInvitees,
    listPartners, partner, invitePartner, updatePartner, savePartnerAccount, deletePartnerAccount,
    listMembers, invite, setRole, removeMember,
    listCatalog, createModule, updateModule, newDraft, saveDraft, publish, archive, previewVersion, previewSample,
    getSettings, saveSettings, uploadAsset,
  };
}

export type TenantAdminService = ReturnType<typeof createTenantAdminService>;
