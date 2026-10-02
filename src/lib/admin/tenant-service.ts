/**
 * Gestión del tenant desde la consola: equipo, catálogo de módulos y marca/tema. Solo admins.
 * Igual que service.ts: reglas aquí, datos vía AdminDb (RLS en Supabase como segunda barrera).
 */
import { REGISTRY, isBlockType } from '../../modules/registry';
import type { PublicDossier } from '../types';
import type { AdminDb, AssetStore, Identity } from './db';
import { draftSchema, inviteSchema, moduleCreateSchema, moduleUpdateSchema, roleSchema, settingsSchema } from './ops';
import { AdminError } from './service';
import type { AdminSession, CatalogModuleView, MemberRecord, Role, TenantSettings } from './types';
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
  function requireAdmin() {
    if (s.role !== 'admin') throw new AdminError(403, 'Solo los admins pueden gestionar el tenant');
  }
  const wrote = (ok: boolean) => { if (!ok) throw new AdminError(403, 'Sin permiso para esta operación'); };

  // ------------------------------------------------------------ equipo
  async function listMembers(): Promise<MemberRecord[]> {
    requireAdmin();
    const list = await db.listMembers(s.tenantId);
    return list.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'admin' ? -1 : 1));
  }

  async function invite(input: unknown, redirectTo: string): Promise<{ invited: boolean }> {
    requireAdmin();
    const { email, role } = parse(inviteSchema, input);
    if (!deps.identity) throw new AdminError(503, 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para poder invitar (ver docs/SETUP.md)');
    const members = await db.listMembers(s.tenantId);
    if (members.some((m) => m.email.toLowerCase() === email)) throw new AdminError(409, 'Esa persona ya está en el equipo');
    const { userId, invited } = await deps.identity.findOrInvite(email, { redirectTo });
    try { wrote(await db.addMember(s.tenantId, userId, role)); } catch (e) { mapDbError(e); }
    return { invited };
  }

  async function assertNotLastAdmin(userId: string, nextRole: Role | null) {
    const members = await db.listMembers(s.tenantId);
    const target = members.find((m) => m.userId === userId);
    if (!target) throw new AdminError(404, 'Miembro no encontrado');
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
    requireAdmin();
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

  return {
    listMembers, invite, setRole, removeMember,
    listCatalog, createModule, updateModule, newDraft, saveDraft, publish, archive, previewVersion, previewSample,
    getSettings, saveSettings, uploadAsset,
  };
}

export type TenantAdminService = ReturnType<typeof createTenantAdminService>;
