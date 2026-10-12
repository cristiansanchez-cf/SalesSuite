/**
 * CRM, fase 2 (docs/CRM_DINAMICO.md): empresas con grupo, personas con su papel en cada empresa, alta rápida, listas e
 * importación con deshacer. Las reglas de acceso las aplica Postgres (RLS); aquí se valida, se traduce y se orquesta.
 */
import { z } from 'zod';
import type { AdminDb } from '../admin/db';
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import type { AdminSession, MemberRecord } from '../admin/types';
import type { AccountsDb } from '../accounts/db';
import { alertsOf, daysSince, STAGES, stageOf, stageSince, type PipelineInput, type Stage } from './pipeline';
import { CYCLE_DAYS, CYCLE_DAYS_BIG, BASE_KIND, PROFILES, DISCARD_REASONS, normalizeKinds, profileOf, type Account, type AccountFact, type AccountRef, type KindDef, type Zone } from '../accounts/types';
import type { CrmDb } from './db';
import { parseValue, parseValues, type CrmField, type FieldValues } from './fields';
import { buildPlan, norm, profileColumns, readCsv, suggestMapping, MAX_ROWS, type ImportPlan, type PlanContext } from './import';
import { env } from '../env';
import { fixturePlaces, googlePlaces, PHOTO_NAME, type PlaceResult, type PlacesApi } from './places';
import { cleanTaxId, fixtureWebsite, realWebsite, type Socials, type WebsiteApi } from './website';
import { areaQuery, markCandidates, nameKey, slimPlace, RADIUS, type Candidate } from './prospect';
import { claudeNotes, fixtureNotes, matchAccounts, nameScore, sanitizePeople, NOTE_CONTACT_KEYS, type NoteItem, type NotesApi } from './notes';
import { claudeCleanup, fixtureCleanup, sanitizeCleanup, type CleanupApi, type CleanupContext, type CleanupInput, type CleanupSuggestion } from './cleanup';
import { googleRoutes, planRoute, todayHours, type Point, type RoutesApi } from './route';
import { buildZonePlan, isUnordered, claudeZoneFixes, claudeZoneNames, fixtureZoneFixes, fixtureZoneNames, sanitizeFixes, sanitizePlaces, withNote, zoneForPlace, zoneRows, REVIEW_TAG, type ZoneFix, type ZoneFixesApi, type ZoneNamesApi } from './zones-normalize';
import type { AccountMove } from '../accounts/types';
import { claudeResearch, fixtureResearch, readResearch, sanitizeResearch, type AiResearch, type ResearchApi, type ResearchInput } from './research';
import { CRITERIA, MULTI_QUAL, QUAL_VALUES, coolingDays, formatsOf, setQual, type Format, normalizeWeights, type Qualification, type Weights } from './priority';
import { CHANNELS, OUTCOMES, dueBucket, suggestNext, type Activity, type Channel, type DueBucket, type NextStep } from './followup';
import { slugKey } from './fields';
import { chargeRef, paymentUrl } from '../admin/payment';
import { chargeable } from './charge';
import { LINK_DAYS, type LinkWhen } from './types';
import type { Contact, ContactLink, ContactPatch, CrmImport, ImportMapping, ImportStats, ImportUndo, PaymentRequest } from './types';

const uuid = z.string().uuid();
const opt = (n: number) => z.string().trim().max(n).transform((v) => v || null).nullable().optional();
const urlOpt = (n: number, kind: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'web') => z.string().trim().max(n).transform((v) => socialUrl(v, kind)).nullable().optional();
export const tagSchema = z.string().trim().toLowerCase().transform((v) => v.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48));
export const personSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
  email: z.string().trim().toLowerCase().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email no válido').transform((v) => v || null).nullable().optional(),
  phone: opt(40), instagram: urlOpt(300, 'instagram'), linkedin: urlOpt(300, 'linkedin'), city: opt(80), notes: opt(4000),
});
/** Alta rápida: la persona y «¿dónde?» (una empresa que ya existe o una nueva, por su nombre). */
export const quickAddSchema = personSchema.extend({
  accountId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
  company: opt(160),
  role: opt(80),
  tag: z.string().max(48).optional().transform((v) => (v ? tagSchema.parse(v) || null : null)),
});

/** «@club_sol» o «instagram.com/club_sol» → enlace completo. */
export function socialUrl(v: string | null | undefined, kind: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'web'): string | null {
  const x = (v ?? '').trim();
  if (!x) return null;
  if (kind === 'instagram' && /^@?[\w.]{2,30}$/.test(x)) return `https://www.instagram.com/${x.replace(/^@/, '')}/`;
  if (kind === 'tiktok' && /^@?[\w.]{2,30}$/.test(x)) return `https://www.tiktok.com/@${x.replace(/^@/, '')}`;
  if (kind === 'facebook' && /^@?[\w.-]{2,80}$/.test(x) && !/\.[a-z]{2,6}$/i.test(x)) return `https://www.facebook.com/${x.replace(/^@/, '')}`;
  return /^https?:\/\//i.test(x) ? x : `https://${x.replace(/^\/+/, '')}`;
}
export const companyContactSchema = z.object({
  phone: opt(40), email: z.string().trim().toLowerCase().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email no válido').transform((v) => v || null).nullable().optional(),
  instagram: urlOpt(300, 'instagram'), facebook: urlOpt(300, 'facebook'), linkedin: urlOpt(300, 'linkedin'), website: urlOpt(300, 'web'), mapsUrl: urlOpt(500, 'web'),
  tiktok: urlOpt(300, 'tiktok'), musicUrl: urlOpt(300, 'web'),
  // Titular (§25): la sociedad y su CIF. El DNI/NIE de una persona (un autónomo) no: es un dato personal.
  legalName: opt(200),
  taxId: z.string().max(20).transform((v) => cleanTaxId(v) || null)
    .refine((v) => !v || (/^[A-Z0-9]{8,14}$/.test(v) && !PERSONAL_ID.test(v)), 'solo el CIF de una sociedad').nullable().optional(),
});
/** DNI o NIE de una persona: no se guarda como titular. */
export const PERSONAL_ID = /^([0-9]{8}|[XYZKLM][0-9]{7})[A-Z]$/;
/** «Ocio Cosmic Group 2010, S.L.» → «ocio cosmic group 2010» (para ver si dos son la misma sociedad). */
export const legalKey = (v: string | null | undefined) => (v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/\b(s\.?\s?l\.?\s?[up]?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?coop\.?|sociedad limitada( unipersonal)?|sociedad anonima|lda\.?|unipessoal)\s*$/i, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
export const classifySchema = z.object({
  kind: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).nullable().optional().or(z.literal('').transform(() => null)),
  reason: z.enum(DISCARD_REASONS).nullable().optional().or(z.literal('').transform(() => null)),
  note: z.string().trim().max(500).nullable().optional(),
});
export const activitySchema = z.object({
  contactId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
  channel: z.enum(CHANNELS),
  outcome: z.enum(OUTCOMES),
  note: opt(4000),
  happenedAt: z.string().max(40).optional().transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined)),
});
export const nextStepSchema = z.object({
  at: z.string().max(40).optional().transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v.length <= 10 ? `${v}T10:00:00` : v).toISOString() : null)),
  channel: z.enum(CHANNELS).nullable().optional().or(z.literal('').transform(() => null)),
  contactId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
  step: opt(300),
});

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`));
  return r.data;
}
/** Motivo corto de un fallo de la IA para el aviso (estado HTTP y mensaje, sin claves). */
const aiReason = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/sk-ant-[\w-]+/g, '…').slice(0, 300);

function mapError(e: unknown): never {
  if (e instanceof AdminError) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/su propio grupo/i.test(msg)) throw new AdminError(422, 'Una empresa no puede ser su propio grupo');
  if (/ya está dentro de otro grupo/i.test(msg)) throw new AdminError(422, 'Ese grupo ya está dentro de otro grupo');
  if (/ya es grupo de otras/i.test(msg)) throw new AdminError(422, 'Esta empresa ya es grupo de otras');
  if (/Campo desconocido/i.test(msg)) throw new AdminError(422, 'Ese campo no existe en este espacio');
  if (/permission denied|insufficient|row-level/i.test(msg)) throw new AdminError(403, 'Sin permiso para esta operación');
  if (/foreign key/i.test(msg)) throw new AdminError(404, 'Cuenta no encontrada');
  throw e;
}

export interface PersonView extends Contact {
  companies: Array<{ accountId: string; name: string; role: string | null; groupName: string | null; qualification: Qualification; segmentId: string | null }>;
  ownerName: string | null;
}

/** Para comparar un contacto escrito de varias formas («@marco_sabbia», «https://www.instagram.com/marco_sabbia/»). */
const socialKey = (v: string) => v.toLowerCase().replace(/^https?:\/\/(www\.)?(instagram\.com|linkedin\.com\/in)\//, '').replace(/^@/, '').replace(/[\/\s]+$/g, '').replace(/[\s()-]/g, '');

export function createCrmService(db: CrmDb, accounts: AccountsDb, admin: AdminDb, s: AdminSession, opts: { places?: PlacesApi | null; routes?: RoutesApi | null; research?: ResearchApi | null; zoneNames?: ZoneNamesApi | null; zoneFixes?: ZoneFixesApi | null; website?: WebsiteApi; cleanup?: CleanupApi | null; notes?: NotesApi | null } = {}) {
  // Sin clave de Google y con AI_RESEARCH_FIXTURE=1 (pruebas): Google y la web, de mentira.
  const fixtureGoogle = !env('GOOGLE_MAPS_API_KEY') && env('AI_RESEARCH_FIXTURE') === '1';
  const places = opts.places !== undefined ? opts.places : env('GOOGLE_MAPS_API_KEY') ? googlePlaces(env('GOOGLE_MAPS_API_KEY')!) : fixtureGoogle ? fixturePlaces() : null;
  const site = opts.website ?? (opts.places === undefined && fixtureGoogle ? fixtureWebsite() : realWebsite());
  const routes = opts.routes !== undefined ? opts.routes : env('GOOGLE_MAPS_API_KEY') ? googleRoutes(env('GOOGLE_MAPS_API_KEY')!) : null;
  const ai = opts.research !== undefined ? opts.research
    : env('ANTHROPIC_API_KEY') ? claudeResearch(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureResearch() : null;
  const zoneAi = opts.zoneNames !== undefined ? opts.zoneNames
    : env('ANTHROPIC_API_KEY') ? claudeZoneNames(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureZoneNames() : null;
  const zoneFixAi = opts.zoneFixes !== undefined ? opts.zoneFixes
    : env('ANTHROPIC_API_KEY') ? claudeZoneFixes(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureZoneFixes() : null;
  const cleanupAi = opts.cleanup !== undefined ? opts.cleanup
    : env('ANTHROPIC_API_KEY') ? claudeCleanup(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureCleanup() : null;
  const notesAi = opts.notes !== undefined ? opts.notes
    : env('ANTHROPIC_API_KEY') ? claudeNotes(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureNotes() : null;
  const perms = can(s.role);
  const requireUse = () => { if (!perms.useAccounts) throw new AdminError(403, 'Las cuentas del CRM son del equipo interno'); };
  const requireManager = () => { if (!perms.manageAccounts) throw new AdminError(403, 'Solo un/a admin o gerente'); };
  // Importar y ordenar los datos del CRM: solo admin (docs/CRM_DINAMICO.md §14).
  const requireImporter = () => { if (!perms.importCrm) throw new AdminError(403, 'Solo un admin importa y ordena los datos del CRM'); };
  const t = s.tenantId;
  /** Tipos de cliente del espacio (§21). */
  const kinds = async (): Promise<KindDef[]> => normalizeKinds(await accounts.getKinds(t).catch(() => null));

  async function members(): Promise<Map<string, MemberRecord>> { return new Map((await admin.listMembers(t)).map((m) => [m.userId, m])); }
  const label = (m: MemberRecord | undefined) => (m ? m.displayName || m.email : null);
  async function allAccounts(): Promise<Account[]> { return accounts.listAccounts(t, { limit: 20000 }); }
  /** Todas, con pocas columnas: para buscar, agrupar o ver duplicados (mucho más ligero que allAccounts). */
  async function accountIndex(): Promise<AccountRef[]> { return accounts.listAccountIndex(t, 20000); }
  async function fields(): Promise<CrmField[]> { return (await accounts.listFields(t)).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label, 'es')); }

  function views(cs: Contact[], links: ContactLink[], accs: Map<string, AccountRef>, ms: Map<string, MemberRecord>): PersonView[] {
    return cs.map((c) => ({
      ...c,
      ownerName: label(ms.get(c.ownerId ?? '')),
      companies: links.filter((l) => l.contactId === c.id && accs.has(l.accountId)).map((l) => {
        const a = accs.get(l.accountId)!;
        return { accountId: a.id, name: a.name, role: l.role, groupName: a.parentId ? accs.get(a.parentId)?.name ?? null : null, qualification: a.qualification, segmentId: a.segmentId };
      }),
    }));
  }

  // ---------------------------------------------------------------- personas

  /** Directorio de personas. `company: 'none'` = la bandeja de personas sin empresa. */
  async function people(f: { q?: string; tag?: string; company?: 'none'; limit?: number } = {}) {
    requireUse();
    const [cs, accs, ms, links] = await Promise.all([
      db.listContacts(t, { q: f.q, tag: f.tag || undefined, limit: Math.min(f.limit ?? 5000, 20000) }), accountIndex(), members(), db.listLinks(t, {}),
    ]);
    const byId = new Map(accs.map((a) => [a.id, a]));
    let items = views(cs, links, byId, ms);
    const tray = items.filter((p) => !p.companies.length).length;
    if (f.company === 'none') items = items.filter((p) => !p.companies.length);
    return { items, tray };
  }
  async function person(id: string) {
    requireUse();
    const c = await db.getContact(id);
    if (!c || c.tenantId !== t) throw new AdminError(404, 'Persona no encontrada');
    const [accs, ms, links, fs] = await Promise.all([accountIndex(), members(), db.listLinks(t, { contactIds: [id] }), fields()]);
    const view = views([c], links, new Map(accs.map((a) => [a.id, a])), ms)[0];
    return {
      person: view,
      crmFields: fs.filter((f) => !f.archivedAt),
      canEdit: perms.manageAccounts || c.ownerId === s.userId || c.createdBy === s.userId || !c.ownerId,
      canDelete: perms.manageAccounts,
      companies: accs.map((a) => ({ id: a.id, name: a.name })),
      similar: (await similar(c.name, c.email)).filter((x) => x.id !== c.id),
    };
  }
  /** Posibles duplicados: mismo email o mismo nombre. */
  async function similar(name: string, email?: string | null) {
    requireUse();
    const cs = await db.listContacts(t, { q: name.trim().split(/\s+/)[0] ?? name, limit: 200 });
    return cs.filter((c) => (email && c.email && norm(c.email) === norm(email)) || norm(c.name) === norm(name)).map((c) => ({ id: c.id, name: c.name, email: c.email }));
  }

  /** Los locales de un grupo con su cualificación (§37): cada uno se cualifica en su ficha; el grupo los resume. */
  async function groupLocales(groupId: string) {
    requireUse();
    return (await accounts.listAccounts(t, { parentId: groupId, limit: 200 })).filter((x) => x.tenantId === t);
  }

  /** Empresa por id o, si no existe, nueva con ese nombre (alta al vuelo). Devuelve su id. */
  async function companyFor(accountId: string | null | undefined, name: string | null | undefined, tag: string | null, zoneId: string | null = null): Promise<string | null> {
    if (accountId) {
      const a = await accounts.getAccount(accountId);
      if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
      return a.id;
    }
    if (!name) return null;
    const same = (await accounts.listAccounts(t, { q: name, limit: 50 })).find((a) => norm(a.name) === norm(name));
    if (same) return same.id;
    try {
      return await accounts.insertAccount(t, { name, zoneId, segmentId: null, address: null, externalRef: null, notes: null, tags: tag ? [tag] : [] });
    } catch (e) { mapError(e); }
  }

  async function quickAdd(input: unknown): Promise<{ id: string; accountId: string | null }> {
    requireUse();
    const v = parse(quickAddSchema, input);
    const accountId = await companyFor(v.accountId, v.company, v.tag);
    let id: string;
    try {
      [id] = await db.insertContacts(t, [{ name: v.name, email: v.email ?? null, phone: v.phone ?? null, instagram: v.instagram ?? null, linkedin: v.linkedin ?? null,
        city: v.city ?? null, notes: v.notes ?? null, fields: {}, tags: v.tag ? [v.tag] : [], ownerId: s.userId, importId: null }]);
      if (accountId) await db.saveLinks(t, [{ contactId: id, accountId, role: v.role ?? null }]);
    } catch (e) { mapError(e); }
    return { id, accountId };
  }
  async function updatePerson(id: string, input: unknown) {
    requireUse();
    const v = parse(personSchema.partial({ name: true }), input);
    const patch: ContactPatch = {};
    for (const k of ['name', 'email', 'phone', 'instagram', 'linkedin', 'city', 'notes'] as const) if (v[k] !== undefined) (patch as Record<string, unknown>)[k] = v[k];
    let ok: boolean;
    try { ok = await db.updateContact(id, patch); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Sin permiso para esta operación');
  }
  async function setPersonFields(id: string, input: Record<string, unknown>) {
    requireUse();
    const c = await db.getContact(id);
    if (!c || c.tenantId !== t) throw new AdminError(404, 'Persona no encontrada');
    const r = parseValues((await fields()).filter((f) => f.target === 'contact'), input);
    if (r.errors.length) throw new AdminError(422, 'Datos no válidos', r.errors);
    const next: FieldValues = { ...c.fields, ...r.values };
    for (const k of r.cleared) delete next[k];
    let ok: boolean;
    try { ok = await db.updateContact(id, { fields: next }); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Sin permiso para esta operación');
  }
  async function deletePerson(id: string) {
    requireManager();
    if (!(await db.deleteContact(id))) throw new AdminError(404, 'Persona no encontrada');
  }
  async function setOwner(id: string, ownerId: string | null) {
    requireManager();
    if (ownerId && !(await members()).has(ownerId)) throw new AdminError(404, 'Miembro no encontrado');
    if (!(await db.updateContact(id, { ownerId }))) throw new AdminError(404, 'Persona no encontrada');
  }

  // ---------------------------------------------------------------- vínculos persona ↔ empresa

  async function link(contactId: string, input: { accountId?: string | null; company?: string | null; role?: string | null }) {
    requireUse();
    const accountId = await companyFor(input.accountId || null, input.company?.trim() || null, null);
    if (!accountId) throw new AdminError(422, 'Elige una empresa o escribe su nombre');
    try { await db.saveLinks(t, [{ contactId, accountId, role: input.role?.trim().slice(0, 80) || null }]); } catch (e) { mapError(e); }
    return accountId;
  }
  async function unlink(contactId: string, accountId: string) {
    requireUse();
    if (!(await db.removeLink(contactId, accountId))) throw new AdminError(404, 'Persona no encontrada');
  }

  // ---------------------------------------------------------------- empresas: personas, grupo y locales

  /** Lo que la ficha de una empresa añade: su gente, su grupo y sus locales. */
  async function company(accountId: string) {
    requireUse();
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    const [links, accs, zones] = await Promise.all([db.listLinks(t, { accountIds: [accountId] }), accountIndex(), accounts.listZones(t)]);
    const cs = links.length ? await db.listContacts(t, { ids: links.map((l) => l.contactId), limit: 500 }) : [];
    return {
      people: cs.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, role: links.find((l) => l.contactId === c.id)?.role ?? null })),
      group: a.parentId ? accs.find((x) => x.id === a.parentId) ?? null : null,
      locales: accs.filter((x) => x.parentId === a.id),
      /** Las que comparten titular (§25): mismo CIF o misma razón social. Para proponer juntarlas en un grupo. */
      ...sameOwner(a, accs),
      /** Grupos con locales en su misma ciudad (§26): «¿es de alguno?». */
      ...nearbyGroups(a, accs, zones),
    };
  }
  /**
   * Grupos de su ciudad (§26): los que tienen algún local (o están ellos) en la misma ciudad que esta empresa, con más
   * locales allí primero. Un grupo es una empresa con locales dentro, o una que se llama «Grupo …» (recién dada de alta).
   */
  function nearbyGroups(a: AccountRef, accs: AccountRef[], zones: Zone[]) {
    const none = { nearby: [] as Array<{ id: string; name: string; locales: number }>, nearbyZone: null as string | null };
    if (a.parentId || !a.zoneId) return none;
    const byId = new Map(zones.map((z) => [z.id, z]));
    // La ciudad de una zona: ella misma o la primera de arriba que sea ciudad (un barrio cuenta como su ciudad).
    const cityOf = (id: string | null) => {
      for (let z = id ? byId.get(id) : undefined, guard = 0; z && guard < 20; z = z.parentId ? byId.get(z.parentId) : undefined, guard++) if (z.kind === 'city') return z.id;
      return id;
    };
    const city = cityOf(a.zoneId);
    const kids = new Map<string, AccountRef[]>();
    for (const x of accs) if (x.parentId && !x.discardedAt) kids.set(x.parentId, [...(kids.get(x.parentId) ?? []), x]);
    if (kids.has(a.id)) return none;   // ya es un grupo
    const nearby = accs.filter((g) => g.id !== a.id && !g.parentId && !g.discardedAt && (kids.has(g.id) || /^grupo\b/i.test(g.name)))
      .map((g) => ({ g, here: (kids.get(g.id) ?? []).filter((l) => cityOf(l.zoneId) === city).length + (cityOf(g.zoneId) === city ? 1 : 0) }))
      .filter((x) => x.here > 0).sort((x, y) => y.here - x.here || x.g.name.localeCompare(y.g.name, 'es')).slice(0, 6)
      .map(({ g }) => ({ id: g.id, name: g.name, locales: kids.get(g.id)?.length ?? 0 }));
    return { nearby, nearbyZone: city ? byId.get(city)?.name ?? null : null };
  }
  /**
   * «Comparten titular» (§25): otras empresas con el mismo CIF o la misma razón social, y el grupo que se propone: el
   * que ya tenga alguna de ellas (o esta, si es grupo); si no, uno nuevo con el nombre de la sociedad. Solo se propone:
   * un grupo puede tener varias sociedades y una sociedad, locales que no se tratan juntos.
   */
  function sameOwner(a: AccountRef, accs: AccountRef[]) {
    const key = legalKey(a.legalName);
    const same = !a.taxId && key.length < 4 ? [] : accs.filter((x) => x.id !== a.id && !x.discardedAt
      && ((a.taxId && x.taxId === a.taxId) || (key.length >= 4 && legalKey(x.legalName) === key && !(a.taxId && x.taxId && a.taxId !== x.taxId))));
    if (!same.length) return { sameOwner: [], ownerGroup: null };
    const isGroup = (x: AccountRef) => accs.some((y) => y.parentId === x.id);
    const parentIds = [a, ...same].map((x) => x.parentId).filter((x): x is string => !!x);
    const target = isGroup(a) ? a : same.find(isGroup) ?? accs.find((x) => x.id === parentIds[0]) ?? null;
    // Las que se moverían: las que no están ya en ese grupo, no son grupo ellas mismas ni están en otro.
    const move = [a, ...same].filter((x) => x.id !== target?.id && !isGroup(x) && !x.parentId).map((x) => x.id);
    const name = (a.legalName ?? same.find((x) => x.legalName)?.legalName ?? '').replace(/,?\s*(S\.?\s?L\.?\s?[UP]?\.?|S\.?\s?A\.?\s?U?\.?|S\.?\s?Coop\.?)\s*$/i, '').trim();
    return {
      sameOwner: same.map((x) => ({ id: x.id, name: x.name, groupId: x.parentId })),
      ownerGroup: move.length && (target || name) ? { groupId: target?.id ?? null, name: target?.name ?? name, move } : null,
    };
  }
  // ---------------------------------------------------------------- «Trabaja con» (§22)

  /** Las empresas con las que trabaja una (promotoras, DJs, locales), con la nota del enlace. */
  async function workLinks(accountId: string): Promise<Array<LinkWhen & { id: string; note: string | null; account: { id: string; name: string; kind: string } }>> {
    requireUse();
    const links = await db.listAccountLinks(t, accountId);
    if (!links.length) return [];
    const others = links.map((l) => (l.aId === accountId ? l.bId : l.aId));
    const accs = await accounts.listAccounts(t, { ids: others, limit: others.length });
    return links.flatMap((l) => {
      const o = accs.find((a) => a.id === (l.aId === accountId ? l.bId : l.aId));
      return o ? [{ id: l.id, note: l.note, days: l.days, freq: l.freq, role: l.role, account: { id: o.id, name: o.name, kind: o.kind } }] : [];
    }).sort((x, y) => x.account.kind.localeCompare(y.account.kind) || x.account.name.localeCompare(y.account.name, 'es'));
  }
  const workLinkSchema = z.object({
    otherId: uuid.optional().or(z.literal('').transform(() => undefined)),
    name: z.string().trim().max(160).optional(),
    kind: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional().or(z.literal('').transform(() => undefined)),
    // Sin nota: se queda la que hubiera (enlazar otra vez desde el otro lado no la borra); vacía a propósito: se quita.
    note: z.string().trim().max(200).optional().transform((v) => (v === undefined ? undefined : v || null)),
    days: z.array(z.enum(LINK_DAYS)).max(7).optional(),
    freq: z.enum(['regular', 'sporadic', 'once']).nullable().optional().or(z.literal('').transform(() => null)),
    role: z.enum(['resident', 'guest']).nullable().optional().or(z.literal('').transform(() => null)),
  });
  /**
   * Enlazar con otra empresa: la elegida, o por su nombre (si existe una que se llame igual, esa; si no, se crea del
   * tipo que se diga, p. ej. una promotora nueva). Enlazar no cambia nada de ninguna de las dos.
   */
  async function workLinkAdd(accountId: string, input: unknown): Promise<{ linkId: string; otherId: string; created: boolean }> {
    requireUse();
    const v = parse(workLinkSchema, input);
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    let otherId = v.otherId ?? null;
    let created = false;
    if (otherId) {
      const o = await accounts.getAccount(otherId);
      if (!o || o.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    } else {
      const name = v.name?.replace(/\s+/g, ' ').trim();
      if (!name) throw new AdminError(422, 'Datos no válidos');
      // La que ya se llame igual (y, si se dice el tipo, de ese tipo: una promotora no se enlaza con un local homónimo).
      const same = (await accounts.listAccounts(t, { q: name, limit: 50 })).find((x) => norm(x.name) === norm(name) && (!v.kind || x.kind === v.kind));
      if (same) otherId = same.id;
      else {
        const kind = v.kind && (await kinds()).some((k) => k.key === v.kind) ? v.kind : undefined;
        try { otherId = await accounts.insertAccount(t, { name, zoneId: a.zoneId, segmentId: null, address: null, externalRef: null, notes: null, kind }); } catch (e) { mapError(e); }
        created = true;
      }
    }
    if (otherId === accountId) throw new AdminError(422, 'Datos no válidos');
    let linkId: string;
    const when: Partial<LinkWhen> = { ...(v.days ? { days: [...new Set(v.days)] } : {}), ...('freq' in v ? { freq: v.freq ?? null } : {}), ...('role' in v ? { role: v.role ?? null } : {}) };
    try { linkId = await db.saveAccountLink(t, accountId, otherId!, v.note, when); } catch (e) { mapError(e); }
    return { linkId: linkId!, otherId: otherId!, created };
  }
  async function workLinkRemove(linkId: string) {
    requireUse();
    let ok = false;
    try { ok = await db.removeAccountLink(String(linkId)); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(404, 'Enlace no encontrado');
  }

  /** Mete una o varias empresas en un grupo (que ya existe o nuevo por su nombre), o las saca (null). */
  async function moveToGroup(accountIds: string[], target: { groupId?: string | null; groupName?: string | null }) {
    requireUse();
    // Un grupo nuevo se queda en la ciudad de su (primer) local: así sale como «grupo de la zona» para los demás.
    const firstZone = !target.groupId && target.groupName?.trim() && accountIds[0] ? (await accounts.getAccount(accountIds[0]))?.zoneId ?? null : null;
    const groupId = target.groupId || target.groupName?.trim() ? await companyFor(target.groupId || null, target.groupName?.trim() || null, null, firstZone) : null;
    let moved = 0;
    for (const id of accountIds) {
      if (id === groupId) continue;
      let ok: boolean;
      try { ok = await accounts.updateAccount(id, { parentId: groupId }); } catch (e) { mapError(e); }
      if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
      moved++;
    }
    return { groupId, moved };
  }
  async function setTags(kind: 'account' | 'contact', id: string, tags: string[]) {
    requireUse();
    const clean = [...new Set(tags.map((x) => tagSchema.parse(x)).filter(Boolean))].slice(0, 20);
    const ok = kind === 'account' ? await accounts.updateAccount(id, { tags: clean }).catch(mapError) : await db.updateContact(id, { tags: clean }).catch(mapError);
    if (!ok) throw new AdminError(403, 'Sin permiso para esta operación');
  }
  /** Nombres de unas empresas (p. ej. los grupos de una lista). */
  async function names(ids: string[]): Promise<Map<string, string>> {
    requireUse();
    const want = [...new Set(ids.filter(Boolean))];
    if (!want.length) return new Map();
    const rows = want.length <= 100 ? await accounts.listAccounts(t, { ids: want, limit: want.length }) : await accountIndex();
    return new Map(rows.filter((a) => want.includes(a.id)).map((a) => [a.id, a.name]));
  }
  /** Listas que existen en el espacio (para elegir vista o al importar). */
  async function lists(o: { people?: boolean } = {}): Promise<Array<{ tag: string; accounts: number; people: number }>> {
    requireUse();
    // La lista de empresas solo cuenta empresas: sin cargar todas las personas.
    const [accs, cs] = await Promise.all([accountIndex(), o.people === false ? Promise.resolve([]) : db.listContacts(t, { limit: 20000 })]);
    const m = new Map<string, { tag: string; accounts: number; people: number }>();
    for (const a of accs) for (const g of a.tags) { const x = m.get(g) ?? { tag: g, accounts: 0, people: 0 }; x.accounts++; m.set(g, x); }
    for (const c of cs) for (const g of c.tags) { const x = m.get(g) ?? { tag: g, accounts: 0, people: 0 }; x.people++; m.set(g, x); }
    return [...m.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  }

  // ---------------------------------------------------------------- importar

  async function imports() { requireImporter(); return db.listImports(t, 20); }
  async function importStart(fileName: string, text: string, target: 'account' | 'contact'): Promise<string> {
    requireImporter();
    const { headers, rows } = readCsv(text);
    if (!headers.length || !rows.length) throw new AdminError(422, 'El archivo está vacío');
    // readCsv deja pasar una fila de más: así se distingue «justo 5000» (vale) de «más de 5000» (no).
    if (rows.length > MAX_ROWS) throw new AdminError(422, 'Máximo 5000 filas por importación');
    const fs = await fields();
    const mapping = suggestMapping(profileColumns(headers, rows, target, fs), fs);
    try {
      return await db.createImport(t, { fileName: fileName.slice(0, 200) || 'importacion.csv', target, headers, rows, mapping });
    } catch (e) { mapError(e); }
  }
  async function loadImport(id: string): Promise<CrmImport> {
    requireImporter();
    const imp = await db.getImport(id);
    if (!imp || imp.tenantId !== t) throw new AdminError(404, 'Importación no encontrada');
    return imp;
  }
  async function context(target: 'account' | 'contact'): Promise<PlanContext & { zones: Awaited<ReturnType<AccountsDb['listZones']>> }> {
    const [fs, accs, zones, ms] = await Promise.all([fields(), allAccounts(), accounts.listZones(t), members()]);
    const zoneName = new Map(zones.map((z) => [z.id, z.name]));
    let contacts: PlanContext['contacts'] = [];
    if (target === 'contact') {
      const [cs, links] = await Promise.all([db.listContacts(t, { limit: 20000 }), db.listLinks(t, {})]);
      const accName = new Map(accs.map((a) => [a.id, a.name]));
      contacts = cs.map((c) => ({ id: c.id, name: c.name, email: c.email, linkedin: c.linkedin,
        companies: links.filter((l) => l.contactId === c.id).map((l) => accName.get(l.accountId) ?? '').filter(Boolean) }));
    }
    return {
      target, fields: fs, zones, contacts,
      accounts: accs.map((a) => ({ id: a.id, name: a.name, city: a.zoneId ? zoneName.get(a.zoneId) ?? null : null, parentId: a.parentId, notes: a.notes, fields: a.fields, tags: a.tags })),
      members: [...ms.values()].map((m) => ({ userId: m.userId, name: m.displayName ?? '', email: m.email })),
    };
  }
  /** Lo que la pantalla de mapeo necesita: columnas con sus valores, el mapeo guardado y los campos que hay. */
  async function importDraft(id: string) {
    const imp = await loadImport(id);
    const fs = await fields();
    return { imp: { ...imp, rows: [] as string[][] }, rowCount: imp.rows.length, profiles: profileColumns(imp.headers, imp.rows, imp.target, fs), fields: fs.filter((f) => !f.archivedAt && f.target === imp.target) };
  }
  async function importPreview(id: string, mapping?: ImportMapping): Promise<{ plan: ImportPlan; mapping: ImportMapping }> {
    const imp = await loadImport(id);
    if (imp.status !== 'draft') throw new AdminError(409, 'Esta importación ya se hizo');
    const m = mapping ?? imp.mapping;
    if (mapping) await db.updateImport(id, { mapping });
    const ctx = await context(imp.target);
    return { plan: buildPlan(imp.headers, imp.rows, m, ctx), mapping: m };
  }

  async function importRun(id: string): Promise<ImportStats> {
    const imp = await loadImport(id);
    if (imp.status !== 'draft') throw new AdminError(409, 'Esta importación ya se hizo');
    const ctx = await context(imp.target);
    const m = imp.mapping;
    const plan = buildPlan(imp.headers, imp.rows, m, ctx);
    if ((plan.newFields.length || plan.fieldOptions.length) && !perms.manageTenant) throw new AdminError(403, 'Solo un admin puede crear campos nuevos');
    if (!plan.accounts.length && !plan.contacts.length) throw new AdminError(422, 'No hay filas que importar');
    const tag = m.tag ? tagSchema.parse(m.tag) || null : null;
    const undo: ImportUndo = { fieldIds: [], zoneIds: [], accounts: [], contacts: [], links: [] };
    const stats: ImportStats = { ...plan.stats, undo };
    try {
      // 1. Campos nuevos (de su lista si la hay) y opciones nuevas en los que ya existían.
      let pos = ctx.fields.reduce((n, f) => Math.max(n, f.position), -1);
      for (const nf of plan.newFields) {
        const isOpt = nf.type === 'select' || nf.type === 'multi_select';
        undo.fieldIds.push(await accounts.saveField(t, {
          key: nf.key, label: nf.label, type: nf.type, options: nf.options, group: null, help: null, required: false,
          inList: nf.isStage, filterable: isOpt, segments: [], position: ++pos, target: imp.target, tags: tag ? [tag] : [], isStage: nf.isStage,
        }));
      }
      for (const fo of plan.fieldOptions) {
        const f = ctx.fields.find((x) => x.id === fo.id)!;
        await accounts.saveField(t, { ...f, options: fo.options }, f.id);
      }

      // 2. Ciudades → zonas (las que faltan, dentro del país si solo hay uno).
      const zoneId = new Map(ctx.zones.map((z) => [norm(z.name), z.id]));
      const missing = plan.cities.filter((c) => !zoneId.has(norm(c)));
      const uniqueMissing = [...new Map(missing.map((c) => [norm(c), c])).values()];
      if (uniqueMissing.length) {
        const countries = ctx.zones.filter((z) => z.kind === 'country' && !z.parentId);
        const parentId = countries.length === 1 ? countries[0].id : null;
        const ids = await accounts.insertZones(t, uniqueMissing.map((name, i) => ({ parentId, name: name.slice(0, 80), kind: 'city' as const, position: 1000 + i })));
        uniqueMissing.forEach((c, i) => zoneId.set(norm(c), ids[i]));
        undo.zoneIds.push(...ids);
        stats.zonesCreated = ids.length;
      }
      const zoneOf = (city: string | null) => (city ? zoneId.get(norm(city)) ?? null : null);

      // 3. Empresas: primero los grupos nuevos, luego el resto con su grupo.
      const accId = new Map<string, string>();
      for (const a of plan.accounts) if (a.existingId) accId.set(a.ref, a.existingId);
      const fresh = plan.accounts.filter((a) => !a.existingId);
      const insertBatch = async (batch: typeof fresh) => {
        const ids = await accounts.insertAccounts(t, batch.map((a) => ({
          name: a.name, zoneId: zoneOf(a.city), segmentId: m.segmentId ?? null, address: a.address, externalRef: a.externalRef, notes: a.notes?.slice(0, 2000) ?? null,
          ownerId: a.ownerId, fields: a.fields, parentId: a.group ? accId.get(a.group) ?? null : null, tags: tag ? [tag] : [], importId: id,
          contact: a.contact,
        })));
        batch.forEach((a, i) => accId.set(a.ref, ids[i]));
      };
      await insertBatch(fresh.filter((a) => a.isGroup));
      await insertBatch(fresh.filter((a) => !a.isGroup));
      const existing = new Map(ctx.accounts.map((a) => [a.id, a]));
      const accsNow = new Map((plan.accounts.some((a) => a.existingId) ? await allAccounts() : []).map((a) => [a.id, a]));
      for (const a of plan.accounts.filter((x) => x.existingId)) {
        const cur = accsNow.get(a.existingId!);
        if (!cur || !existing.has(cur.id)) continue;
        const fieldsNext = { ...a.fields, ...cur.fields };
        const tagsNext = tag && !cur.tags.includes(tag) ? [...cur.tags, tag] : cur.tags;
        const notesNext = a.notes && !(cur.notes ?? '').includes(a.notes) ? `${cur.notes ? `${cur.notes}\n` : ''}${a.notes}`.slice(0, 2000) : cur.notes;
        const zoneNext = cur.zoneId ?? zoneOf(a.city);
        const parentNext = cur.parentId ?? (a.group ? accId.get(a.group) ?? null : null);
        // Contacto: solo se rellenan huecos.
        const contactNext = Object.fromEntries(Object.entries(a.contact ?? {}).filter(([k, v]) => v && !cur[k as keyof Account]));
        if (!Object.keys(contactNext).length && JSON.stringify([fieldsNext, tagsNext, notesNext, zoneNext, parentNext]) === JSON.stringify([cur.fields, cur.tags, cur.notes, cur.zoneId, cur.parentId])) continue;
        undo.accounts.push({ id: cur.id, before: { fields: cur.fields, tags: cur.tags, notes: cur.notes, zoneId: cur.zoneId, parentId: cur.parentId,
          contact: Object.fromEntries(Object.keys(contactNext).map((k) => [k, null])) } });
        await accounts.updateAccount(cur.id, { fields: fieldsNext, tags: tagsNext, notes: notesNext, zoneId: zoneNext, parentId: parentNext, contact: contactNext });
      }

      // 4. Personas nuevas y fusionadas.
      const conId = new Map<string, string>();
      const newCons = plan.contacts.filter((c) => !c.existingId);
      const ids = await db.insertContacts(t, newCons.map((c) => ({ name: c.name, email: c.email, phone: c.phone, instagram: c.instagram, linkedin: c.linkedin,
        city: c.city, notes: c.notes, fields: c.fields, tags: tag ? [tag] : [], ownerId: c.ownerId, importId: id })));
      newCons.forEach((c, i) => conId.set(c.ref, ids[i]));
      const merging = plan.contacts.filter((c) => c.existingId);
      const before = new Map((merging.length ? await db.listContacts(t, { limit: 20000 }) : []).map((c) => [c.id, c]));
      for (const c of merging) {
        conId.set(c.ref, c.existingId!);
        const cur = before.get(c.existingId!);
        if (!cur) continue;
        const patch: ContactPatch = {
          email: cur.email ?? c.email, phone: cur.phone ?? c.phone, instagram: cur.instagram ?? c.instagram, linkedin: cur.linkedin ?? c.linkedin, city: cur.city ?? c.city,
          notes: c.notes && !(cur.notes ?? '').includes(c.notes) ? `${cur.notes ? `${cur.notes}\n` : ''}${c.notes}`.slice(0, 4000) : cur.notes,
          fields: { ...c.fields, ...cur.fields }, tags: tag && !cur.tags.includes(tag) ? [...cur.tags, tag] : cur.tags,
        };
        undo.contacts.push({ id: cur.id, before: { email: cur.email, phone: cur.phone, instagram: cur.instagram, linkedin: cur.linkedin, city: cur.city, notes: cur.notes, fields: cur.fields, tags: cur.tags } });
        await db.updateContact(cur.id, patch);
      }

      // 5. Persona ↔ empresa, con su papel.
      const oldLinks = new Set((await db.listLinks(t, { contactIds: merging.map((c) => c.existingId!) })).map((l) => `${l.contactId}|${l.accountId}`));
      const links: ContactLink[] = [];
      for (const c of plan.contacts) for (const co of c.companies) {
        const contactId = conId.get(c.ref); const accountId = accId.get(co.ref);
        if (!contactId || !accountId) continue;
        links.push({ contactId, accountId, role: co.role });
        if (c.existingId && existing.has(accountId) && !oldLinks.has(`${contactId}|${accountId}`)) undo.links.push({ contactId, accountId });
      }
      await db.saveLinks(t, links.filter((l) => !oldLinks.has(`${l.contactId}|${l.accountId}`)));
    } catch (e) {
      // Todo o nada: lo que se llegó a crear se deshace y la importación vuelve a estar lista para reintentar.
      const why = e instanceof Error ? e.message.replace(/^\[supabase\]\s*/, '') : String(e);
      console.warn('[import] falló, se deshace lo creado:', why);
      await rollback(id, undo).catch((err) => console.warn('[import] no se pudo deshacer del todo:', err instanceof Error ? err.message : err));
      await db.updateImport(id, { status: 'draft', stats: {} }).catch(() => {});
      throw new AdminError(422, 'No se pudo importar: no se ha guardado nada', [why]);
    }
    await db.updateImport(id, { status: 'done', stats, doneAt: new Date().toISOString() });
    return stats;
  }

  /** Deshacer: borra lo creado, devuelve lo fusionado a como estaba y archiva los campos nuevos. */
  /** Borra lo creado por una importación y devuelve lo fusionado a como estaba. */
  async function rollback(id: string, u: ImportUndo) {
    for (const l of u.links) await db.removeLink(l.contactId, l.accountId);
    const people = await db.deleteContactsByImport(id);
    const companies = await accounts.deleteAccountsByImport(id);
    for (const a of u.accounts) await accounts.updateAccount(a.id, a.before);
    for (const c of u.contacts) await db.updateContact(c.id, c.before);
    // Los campos que creó la importación se quitan (sus valores se fueron con lo importado): reimportar los recrea igual.
    for (const f of u.fieldIds) await accounts.deleteField(f);
    if (u.zoneIds.length) {
      const used = new Set((await allAccounts()).map((a) => a.zoneId));
      for (const z of u.zoneIds) if (!used.has(z)) await accounts.deleteZone(z);
    }
    return { people, companies };
  }
  /** Deshacer: borra lo creado, devuelve lo fusionado a como estaba y quita los campos y ciudades nuevos. */
  async function importUndo(id: string) {
    const imp = await loadImport(id);
    if (imp.status !== 'done') throw new AdminError(409, 'Esta importación no se puede deshacer');
    try {
      const r = await rollback(id, imp.stats.undo ?? { fieldIds: [], zoneIds: [], accounts: [], contacts: [], links: [] });
      await db.updateImport(id, { status: 'undone' });
      return r;
    } catch (e) { mapError(e); }
  }


  // ---------------------------------------------------------------- contacto de la empresa, interacciones, próximo paso (fase 3)

  /**
   * Titular leído de su web (§25): solo rellena lo que falta (lo escrito a mano manda) y nunca un DNI. Si quien mira la
   * web no puede editar la empresa, no pasa nada.
   */
  async function fillLegal(accountId: string, socials: Socials | null) {
    if (!socials?.legalName && !socials?.taxId) return;
    const a = await accounts.getAccount(accountId);
    if (!a) return;
    const taxId = socials.taxId && !PERSONAL_ID.test(socials.taxId) ? socials.taxId : null;
    const contact = { ...(!a.legalName && socials.legalName ? { legalName: socials.legalName.slice(0, 200) } : {}), ...(!a.taxId && taxId ? { taxId } : {}) };
    if (Object.keys(contact).length) await accounts.updateAccount(accountId, { contact }).catch((e) => console.warn('[legal]', e instanceof Error ? e.message : e));
  }
  async function setCompanyContact(accountId: string, input: unknown) {
    requireUse();
    const v = parse(companyContactSchema, input);
    let ok: boolean;
    try { ok = await accounts.updateAccount(accountId, { contact: v }); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
  }

  /** Personas de la empresa en orden (la primera es la principal) con sus vías. */
  async function actorsOf(accountId: string) {
    const links = await db.listLinks(t, { accountIds: [accountId] });
    const cs = links.length ? await db.listContacts(t, { ids: links.map((l) => l.contactId), limit: 200 }) : [];
    return links.map((l) => cs.find((c) => c.id === l.contactId)).filter((c): c is Contact => !!c)
      .map((c) => ({ id: c.id, name: c.name, instagram: c.instagram, linkedin: c.linkedin, phone: c.phone, email: c.email, role: links.find((l) => l.contactId === c.id)?.role ?? null }));
  }
  const reachOf = (a: Account) => ({ instagram: a.instagram, linkedin: a.linkedin, phone: a.phone, email: a.email });

  /** Historial de una empresa y lo que propone la app como siguiente paso. */
  async function timeline(accountId: string) {
    requireUse();
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    const [acts, actors, ms] = await Promise.all([db.listActivities(t, [accountId], 200), actorsOf(accountId), members()]);
    const suggestion = suggestNext({ activities: acts, actors, company: reachOf(a), now: new Date() });
    return {
      items: acts.map((x) => ({ ...x, userName: label(ms.get(x.userId ?? '')), contactName: actors.find((c) => c.id === x.contactId)?.name ?? null })),
      actors, suggestion,
      next: a.nextStepAt || a.nextStep ? { step: a.nextStep, at: a.nextStepAt, contactId: a.nextContactId, channel: a.nextChannel as Channel | null,
        contactName: actors.find((c) => c.id === a.nextContactId)?.name ?? null, bucket: dueBucket(a.nextStepAt, new Date()) } : null,
    };
  }

  /**
   * Apunta lo que ha pasado y deja el próximo paso: el que diga el comercial o, si no dice nada, el de la regla
   * (docs/CRM_DINAMICO.md §10). Cuenta como contacto (renueva la reserva, como «Registrar contacto»).
   */
  async function logActivity(accountId: string, input: unknown, next?: unknown): Promise<NextStep | null> {
    requireUse();
    const v = parse(activitySchema, input);
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    try {
      await db.insertActivity(t, { accountId, contactId: v.contactId ?? null, channel: v.channel, outcome: v.outcome, note: v.note ?? null, happenedAt: v.happenedAt });
    } catch (e) { mapError(e); }
    if (v.outcome !== 'note' && s.role !== 'partner') await accounts.touch(accountId, 'contact', v.note?.slice(0, 500) ?? null).catch(() => null);
    const chosen = next ? parse(nextStepSchema, next) : null;
    if (chosen && (chosen.at || chosen.step)) {
      await accounts.updateAccount(accountId, { next: { step: chosen.step ?? null, at: chosen.at, contactId: chosen.contactId ?? null, channel: chosen.channel ?? null } }).catch(() => false);
      return null;
    }
    if (v.outcome === 'note') return null;
    const [acts, actors, fresh] = await Promise.all([db.listActivities(t, [accountId], 200), actorsOf(accountId), accounts.getAccount(accountId)]);
    const sug = suggestNext({ activities: acts, actors, company: reachOf(fresh ?? a), now: new Date() });
    await accounts.updateAccount(accountId, { next: { step: null, at: sug.at?.toISOString() ?? null, contactId: sug.contactId, channel: sug.channel } }).catch(() => false);
    return sug;
  }
  async function setNextStep(accountId: string, input: unknown | null) {
    requireUse();
    const v = input ? parse(nextStepSchema, input) : null;
    let ok: boolean;
    try {
      ok = await accounts.updateAccount(accountId, { next: v ? { step: v.step ?? null, at: v.at, contactId: v.contactId ?? null, channel: v.channel ?? null } : { step: null, at: null, contactId: null, channel: null } });
    } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
  }
  async function deleteActivity(id: string) {
    requireUse();
    if (!(await db.deleteActivity(id))) throw new AdminError(403, 'Sin permiso para esta operación');
  }

  /** «Hoy»: lo que toca (vencido → hoy → mañana) en las empresas que llevo, con el contexto en una línea. */
  type TodayItem = Account & { bucket: DueBucket | 'cooling'; cooling: number | null; last: Activity | null; contactName: string | null; contactPhone: string | null; contactInstagram: string | null; contactEmail: string | null };
  async function today(opts: { all?: boolean } = {}) {
    requireUse();
    const now = new Date();
    const all = await accounts.listAccounts(t, { ownerId: opts.all && perms.manageAccounts ? undefined : s.userId, limit: 5000 });
    // Lo que se enfría (contestó y llevamos 3 días laborables sin hacer nada) va primero, aunque no tenga próximo paso.
    const cool = await cooling(all.map((a) => a.id));
    const mine = all.map((a) => ({ a, cooling: cool.get(a.id) ?? null, bucket: dueBucket(a.nextStepAt, now) }))
      .filter((x) => x.cooling !== null || (x.bucket && ['overdue', 'today', 'tomorrow'].includes(x.bucket)));
    const counts = { cooling: 0, overdue: 0, today: 0, tomorrow: 0 };
    if (!mine.length) return { items: [] as TodayItem[], counts };
    // El contexto («lo último que pasó») solo de las que salen hoy, no de todas las que llevo.
    const acts = await db.listActivities(t, mine.map((x) => x.a.id), 5000);
    const byAcc = new Map<string, Activity[]>();
    for (const x of acts) byAcc.set(x.accountId, [...(byAcc.get(x.accountId) ?? []), x]);
    const contactIds = [...new Set(mine.map((x) => x.a.nextContactId).filter(Boolean) as string[])];
    const cs = contactIds.length ? await db.listContacts(t, { ids: contactIds, limit: contactIds.length }) : [];
    const ORDER: Record<string, number> = { cooling: 0, overdue: 1, today: 2, tomorrow: 3 };
    const items: TodayItem[] = mine.map(({ a, cooling, bucket }) => {
      const c = cs.find((x) => x.id === a.nextContactId) ?? null;
      return { ...a, bucket: (cooling !== null ? 'cooling' : bucket!) as TodayItem['bucket'], cooling, last: byAcc.get(a.id)?.[0] ?? null,
        contactName: c?.name ?? null, contactPhone: c?.phone ?? a.phone, contactInstagram: c?.instagram ?? a.instagram, contactEmail: c?.email ?? a.email };
    }).sort((x, y) => ORDER[x.bucket] - ORDER[y.bucket] || (y.cooling ?? 0) - (x.cooling ?? 0) || String(x.nextStepAt).localeCompare(String(y.nextStepAt)));
    for (const i of items) counts[i.bucket as keyof typeof counts]++;
    return { items, counts };
  }

  // ---------------------------------------------------------------- tablero de ventas (docs/CRM_DINAMICO.md §34)

  /**
   * El tablero: las empresas con dueño, en su columna (la decide el historial, `stageOf`) y con sus avisos. Un comercial
   * ve solo las suyas; quien gestiona ve todas o las de un comercial (`owner`).
   */
  async function board(opts: { owner?: string | null } = {}) {
    requireUse();
    const owner = perms.manageAccounts ? (opts.owner || undefined) : s.userId;
    const [accs, ks, ms, dossiers] = await Promise.all([
      accounts.listAccounts(t, { ownerId: owner, limit: 5000 }), kinds(), members(), admin.listDossiers(t).catch(() => []),
    ]);
    const mine = accs.filter((a) => !!a.ownerId);
    const ids = mine.map((a) => a.id);
    const [summaries, pays] = await Promise.all([db.activitySummary(t, ids), db.listPaymentRequests(t, ids).catch(() => [])]);
    const sums = new Map(summaries.map((x) => [x.accountId, x]));
    // Cierre: lo primero entre la propuesta publicada para esa empresa y el enlace de pago enviado (§35), sin anular.
    const closing = new Map<string, string>();
    const closeAt = (id: string, at: string) => { if (at && (!closing.has(id) || at < closing.get(id)!)) closing.set(id, at); };
    for (const d of dossiers) if (d.accountId && d.status === 'published') closeAt(d.accountId, d.publishedAt ?? d.updatedAt ?? '');
    for (const p of pays) if (p.status !== 'cancelled') closeAt(p.accountId, p.createdAt);
    const isGroup = new Set(mine.map((a) => a.parentId).filter(Boolean) as string[]);
    const now = new Date();
    const cards = mine.map((a) => {
      const input: PipelineInput = {
        wonAt: a.wonAt, discardedAt: a.discardedAt, researched: Object.keys(a.qualification ?? {}).length > 0 || !!a.aiResearchAt,
        summary: sums.get(a.id) ?? null, closingAt: closing.get(a.id) ?? null,
      };
      const stage = stageOf(input);
      const kd = ks.find((k) => k.key === a.kind) ?? ks[0];
      // Grande: en un grupo, es un grupo o su tamaño es grande o masivo (más plazo para cerrar).
      const big = !!a.parentId || isGroup.has(a.id) || ['large', 'huge'].includes(String(a.qualification?.size ?? ''));
      const limit = big ? kd.cycleDaysBig ?? CYCLE_DAYS_BIG : kd.cycleDays ?? CYCLE_DAYS;
      const sum = input.summary;
      return {
        id: a.id, name: a.name, kind: a.kind, ownerId: a.ownerId!, ownerName: label(ms.get(a.ownerId!)) ?? '', stage,
        since: daysSince(stageSince(stage, input), now), real: sum?.real ?? 0, lastAt: sum?.lastAt ?? null, lastOutcome: sum?.lastOutcome ?? null,
        nextStep: a.nextStep, nextStepAt: a.nextStepAt, big, limit, ...alertsOf(stage, input, limit, now),
      };
    });
    const order = (x: (typeof cards)[number]) => (x.overdue ?? 0) + (x.manyTouches ?? 0);
    const columns = Object.fromEntries(STAGES.map((st) => [st, cards.filter((c) => c.stage === st).sort((x, y) => order(y) - order(x) || (y.since ?? 0) - (x.since ?? 0) || x.name.localeCompare(y.name, 'es'))])) as Record<Stage, typeof cards>;
    // Para el filtro (quien gestiona): cada comercial con sus empresas en el tablero.
    const owners = perms.manageAccounts
      ? [...new Map((opts.owner ? (await accounts.listAccounts(t, { limit: 5000 })).filter((a) => !!a.ownerId) : mine).map((a) => [a.ownerId!, 0])).keys()]
        .map((id) => ({ id, name: label(ms.get(id)) ?? '' })).filter((o) => o.name).sort((a, b) => a.name.localeCompare(b.name, 'es'))
      : [];
    return { columns, owner: owner ?? null, owners, total: cards.length, stuck: cards.filter((c) => c.overdue || c.manyTouches).length };
  }

  // ---------------------------------------------------------------- generar pago (docs/CRM_DINAMICO.md §35)

  const chargeSchema = z.object({
    priceOptionId: z.preprocess((v) => v || null, z.string().uuid().nullable()),
    couponId: z.preprocess((v) => v || null, z.string().uuid().nullable()),
    // Precio a medida (solo admin): con su propio enlace de Stripe.
    custom: z.object({
      label: z.string().trim().min(1).max(80), amount: z.coerce.number().min(0).max(10_000_000),
      period: z.enum(['once', 'event', 'month', 'year']).default('once'), paymentLink: z.string().trim().url().max(500).regex(/^https:\/\//),
    }).nullable().optional(),
  });
  const withUrl = (r: PaymentRequest) => ({ ...r, url: paymentUrl(r.paymentLink, { ref: chargeRef(r.id), couponCode: r.couponCode }) });
  /** Tarifas que se cobran con un enlace (activas, no a medida, con enlace de Stripe), en el orden del admin. */
  async function chargeOptions() { requireUse(); return chargeable(await admin.listPriceOptions(t).catch(() => [])); }
  /** Los enlaces de pago de una empresa, lo último primero, con su enlace listo para copiar. */
  async function charges(accountId: string) {
    requireUse();
    return (await db.listPaymentRequests(t, [accountId])).map(withUrl);
  }
  /**
   * Generar el enlace de pago: tarifa (la de su tamaño o una superior) y, si toca, cupón. El importe lo copia la base de
   * datos de la tarifa; a medida, solo un admin. Con el enlace, la empresa pasa a «Cierre» en el tablero.
   */
  async function charge(accountId: string, input: unknown) {
    requireUse();
    const v = parse(chargeSchema, input);
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    if (!perms.manageAccounts && a.ownerId && a.ownerId !== s.userId) throw new AdminError(403, 'Esta empresa la lleva otro comercial');
    if (v.custom && !perms.manageTenant) throw new AdminError(403, 'El precio lo fija tu empresa: elige una tarifa');
    if (!v.priceOptionId && !v.custom) throw new AdminError(422, 'Elige una tarifa');
    try {
      return withUrl(await db.insertPaymentRequest(t, { accountId, priceOptionId: v.custom ? null : v.priceOptionId, couponId: v.couponId, ...(v.custom ?? {}) }));
    } catch (e) { mapError(e); }
  }
  /** Pagado por otra vía (transferencia…): gerente o admin. La empresa pasa a «Cerrada» y avisa (§36). */
  async function chargeMarkPaid(id: string) {
    requireUse();
    if (!perms.manageAccounts) throw new AdminError(403, 'Solo un gerente o admin lo marca pagado');
    try { if ((await db.markPaymentPaid(t, id)) === 'missing') throw new AdminError(404, 'Enlace no encontrado o ya no se puede anular'); } catch (e) { if (e instanceof AdminError) throw e; mapError(e); }
  }
  /** Ganada sin enlace de pago (espacios sin Stripe): gerente o admin. */
  async function markWon(accountId: string) {
    requireUse();
    if (!perms.manageAccounts) throw new AdminError(403, 'Solo un gerente o admin la da por ganada');
    try { await db.markWon(t, accountId); } catch (e) { mapError(e); }
  }
  async function chargeCancel(id: string) {
    requireUse();
    if (!(await db.cancelPaymentRequest(t, id))) throw new AdminError(404, 'Enlace no encontrado o ya no se puede anular');
  }

  // ---------------------------------------------------------------- prioridad (docs/CRM_DINAMICO.md §11)

  async function weights(): Promise<Weights> { return normalizeWeights(await accounts.getPriorityWeights(t).catch(() => null)); }
  async function saveWeights(input: Record<string, unknown>) {
    if (!perms.manageTenant) throw new AdminError(403, 'Solo un admin del espacio');
    const w = Object.fromEntries(CRITERIA.map((k) => [k, Math.round(Number(input[k]))])) as Weights;
    if (CRITERIA.some((k) => !Number.isFinite(w[k]) || w[k] < 0 || w[k] > 100)) throw new AdminError(422, 'Los pesos deben sumar 100');
    if (CRITERIA.reduce((n, k) => n + w[k], 0) !== 100) throw new AdminError(422, 'Los pesos deben sumar 100');
    try { await accounts.savePriorityWeights(t, w); } catch (e) { mapError(e); }
  }
  /** Un clic: «clave:valor» lo marca; pulsar lo ya marcado lo desmarca (vuelve a «no se sabe»). */
  async function qualify(accountId: string, set: string) {
    requireUse();
    const [key, value] = set.split(':');
    if (!key || !QUAL_VALUES[key] || !QUAL_VALUES[key].includes(value)) throw new AdminError(422, 'Datos no válidos');
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    const q: Record<string, unknown> = { ...a.qualification };
    const v: unknown = value === 'true' ? true : value;
    setQual(q, key, v, true);
    if (key === 'format') delete q.kind;   // el formato sustituye al antiguo «Qué es»
    try { await accounts.qualify(accountId, q as Qualification); } catch (e) { mapError(e); }
  }
  /** Días que lleva enfriándose cada empresa (solo las que se enfrían). */
  async function cooling(accountIds: string[]): Promise<Map<string, number>> {
    requireUse();
    // Solo la última interacción de verdad de cada una (una fila por empresa), no todas.
    const last = accountIds.length ? await db.lastActivities(t, accountIds) : [];
    const now = new Date();
    const out = new Map<string, number>();
    for (const x of last) { const d = coolingDays([x], now); if (d !== null) out.set(x.accountId, d); }
    return out;
  }

  /**
   * Arreglo del FBD: el Instagram que se guardó en la persona y en realidad es del local («hohle_club» en «Hohle Club»)
   * pasa a la empresa. Solo si la empresa no tiene ya uno y el usuario se parece al nombre del local.
   */
  async function instagramToCompanies(apply: boolean) {
    requireImporter();
    const [cs, links, accs] = await Promise.all([db.listContacts(t, { limit: 20000 }), db.listLinks(t, {}), allAccounts()]);
    const byId = new Map(accs.map((a) => [a.id, a]));
    const handle = (u: string) => (/instagram\.com\/([^/?#]+)/i.exec(u)?.[1] ?? u.replace(/^@/, '')).toLowerCase().replace(/[^a-z0-9]/g, '');
    const moves: Array<{ contactId: string; contactName: string; accountId: string; accountName: string; instagram: string }> = [];
    const seen = new Set<string>();
    for (const c of cs) {
      if (!c.instagram) continue;
      const mine = links.filter((l) => l.contactId === c.id).map((l) => byId.get(l.accountId)).filter((a): a is Account => !!a);
      const h = handle(c.instagram);
      const target = mine.find((a) => { const k = slugKey(a.name).replace(/-/g, ''); return !a.instagram && k.length >= 3 && (h.includes(k) || k.includes(h)); });
      if (!target || seen.has(target.id)) continue;
      seen.add(target.id);
      moves.push({ contactId: c.id, contactName: c.name, accountId: target.id, accountName: target.name, instagram: c.instagram });
    }
    if (apply) {
      for (const m of moves) {
        await accounts.updateAccount(m.accountId, { contact: { instagram: m.instagram } }).catch(() => false);
        // Todas las personas del local con ese mismo Instagram lo sueltan (era del local, no suyo).
        for (const c of cs) if (c.instagram === m.instagram) await db.updateContact(c.id, { instagram: null }).catch(() => false);
      }
    }
    return { count: moves.length, sample: moves.slice(0, 8) };
  }


  // ---------------------------------------------------------------- Google Places (completar contacto, horario y ubicación)

  // Topes por persona y día (docs/SECURITY_REVIEW.md): Google y la IA cuestan dinero. Las herramientas en bloque del
  // admin (ordenar, limpiar, situar ciudades) no cuentan: son pocas veces y las lanza quien paga.
  const LIMITS = { google: 300, ai: 40 } as const;
  async function quota(kind: keyof typeof LIMITS) {
    let ok = true;
    try { ok = await accounts.bumpUsage(t, kind, LIMITS[kind]); } catch (e) { console.warn('[quota]', e instanceof Error ? e.message : e); }
    if (!ok) throw new AdminError(409, 'Has llegado al tope de hoy; mañana puedes seguir');
  }
  const requirePlaces = () => { if (!places) throw new AdminError(503, 'Falta GOOGLE_MAPS_API_KEY en el servidor'); return places; };
  async function zoneNameOf(a: Account) { return a.zoneId ? (await accounts.listZones(t)).find((z) => z.id === a.zoneId)?.name ?? '' : ''; }
  const googleDown = (e: unknown): never => { console.warn('[places]', e instanceof Error ? e.message : e); throw new AdminError(503, 'Google no ha respondido; prueba en un momento'); };
  /** Lo que se busca por defecto: el nombre y su ciudad. */
  async function googleQuery(accountId: string) {
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    return `${a.name} ${await zoneNameOf(a)}`.trim();
  }
  /** Candidatos de Google para una empresa (nombre + ciudad, o lo que escriba quien busca). */
  async function googleCandidates(accountId: string, query?: string): Promise<PlaceResult[]> {
    requireUse();
    const api = requirePlaces();
    const q = (query ?? '').trim().slice(0, 200) || await googleQuery(accountId);
    await quota('google');
    try { return await api.search(q); } catch (e) { return googleDown(e); }
  }
  /**
   * «Es este» (docs/CRM_DINAMICO.md §15): guarda lo de Google (teléfono, web, dirección, Maps, horario, ubicación,
   * valoración y foto), pone la ciudad si no tiene (una zona que ya exista, por la dirección) y mira su web para apuntar
   * Instagram, Facebook, LinkedIn y email. Todo rellena huecos: nada escrito a mano se pisa. Devuelve qué se ha rellenado.
   */
  async function googleApply(accountId: string, placeId: string): Promise<{ filled: string[]; zone: string | null }> {
    requireUse();
    const api = requirePlaces();
    const before = await accounts.getAccount(accountId);
    if (!before || before.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    let p: PlaceResult | null = null;
    await quota('google');
    try { p = await api.details(placeId); } catch (e) { googleDown(e); }
    if (!p) throw new AdminError(404, 'Cuenta no encontrada');
    const zones = await accounts.listZones(t);
    // «Este no era»: si ya tenía otra ficha, lo que puso aquella se quita antes (lo de a mano se queda).
    const replace = !!before.placeId && before.placeId !== p.placeId;
    const keepsZone = before.zoneId && !(replace && before.placeFilled?.zone_id === before.zoneId);
    const zone = !keepsZone && p.place ? zoneForPlace(zones, p.place) : null;
    const web = p.website || (replace && before.placeFilled?.website === before.website ? null : before.website);
    const socials = web ? await site.scan(web).catch(() => null) : null;
    try {
      await accounts.research(accountId, { placeId: p.placeId, phone: p.phone, website: p.website, address: p.address, mapsUrl: p.mapsUrl, hours: p.hours, lat: p.lat, lng: p.lng,
        status: p.status, rating: p.rating ?? null, reviews: p.reviews ?? null, photo: p.photo ?? null, zoneId: zone?.id ?? null,
        email: socials?.email ?? null, instagram: socials?.instagram ?? null, facebook: socials?.facebook ?? null, linkedin: socials?.linkedin ?? null, replace });
    } catch (e) { mapError(e); }
    await fillLegal(accountId, socials);
    // Qué ha puesto esta ficha (lo apunta la base de datos).
    const f = (await accounts.getAccount(accountId))?.placeFilled ?? {};
    const COLS = { phone: 'phone', website: 'website', address: 'address', mapsUrl: 'maps_url', email: 'email', instagram: 'instagram', facebook: 'facebook', linkedin: 'linkedin' } as const;
    const filled = (Object.keys(COLS) as Array<keyof typeof COLS>).filter((k) => f[COLS[k]]);
    return { filled, zone: f.zone_id ? zones.find((z) => z.id === f.zone_id)?.name ?? null : null };
  }
  /** Quitar la ficha de Google elegida: se va lo que puso (si sigue igual); lo escrito a mano se queda. */
  async function googleClear(accountId: string) {
    requireUse();
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    try {
      await accounts.research(accountId, { placeId: '', phone: null, website: null, address: null, mapsUrl: null, hours: null, lat: null, lng: null, status: null, replace: true });
    } catch (e) { mapError(e); }
  }
  /** La foto de Google de una empresa (la dirección pública de la imagen; la clave no sale del servidor). */
  async function googlePhoto(name: string): Promise<string | null> {
    requireUse();
    if (!places?.photo || !PHOTO_NAME.test(name)) return null;
    return places.photo(name).catch(() => null);
  }

  // ---------------------------------------------------------------- Buscar clientes por zona (docs/CRM_DINAMICO.md §19)

  const sweepSchema = z.object({
    what: z.string().trim().min(2).max(80),
    zoneId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
    segmentId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
  });
  /** Ruta legible de una zona («Valencia, Comunidad Valenciana, España»). */
  const zonePathOf = (zone: Zone | null, zones: Zone[]) => (zone ? areaQuery('', zone, zones).replace(/^\s*en /, '') : '');
  /**
   * Buscar en Google Maps «qué» en «dónde» (hasta 60) y guardar la búsqueda con lo que salió. Cada página de Google
   * cuenta para el tope del día. Devuelve el id de la búsqueda para revisarla.
   */
  async function prospectSearch(input: unknown): Promise<string> {
    requireUse();
    const api = requirePlaces();
    if (!api.area) throw new AdminError(503, 'Falta GOOGLE_MAPS_API_KEY en el servidor');
    const v = parse(sweepSchema, input);
    const zones = await accounts.listZones(t);
    const zone = v.zoneId ? zones.find((z) => z.id === v.zoneId) ?? null : null;
    if (v.zoneId && !zone) throw new AdminError(404, 'Zona no encontrada');
    if (v.segmentId && !(await admin.segmentExists(t, v.segmentId).catch(() => false))) throw new AdminError(422, 'Datos no válidos');
    await quota('google');
    let r: { results: PlaceResult[]; pages: number } = { results: [], pages: 0 };
    const near = zone && zone.lat != null && zone.lng != null ? { lat: zone.lat, lng: zone.lng, radius: RADIUS[zone.kind] } : null;
    try { r = await api.area(areaQuery(v.what, zone, zones), { near }); } catch (e) { googleDown(e); }
    // Las páginas de más también cuentan (ya están pagadas: se enseñan igual).
    for (let i = 1; i < r.pages; i++) await accounts.bumpUsage(t, 'google', LIMITS.google).catch(() => true);
    try {
      return await accounts.saveSweep(t, { query: v.what, zoneId: zone?.id ?? null, zoneLabel: zonePathOf(zone, zones).slice(0, 300), segmentId: v.segmentId ?? null, results: r.results.map(slimPlace) });
    } catch (e) { mapError(e); }
  }
  /** Las búsquedas del espacio (las últimas primero): qué se ha barrido, dónde y cuántas se importaron. */
  async function prospectList() {
    requireUse();
    const [sweeps, ms] = await Promise.all([accounts.listSweeps(t, 40), members()]);
    return sweeps.map((w) => ({ ...w, importedCount: Object.keys(w.imported).length, byName: ms.get(w.createdBy ?? '')?.displayName || ms.get(w.createdBy ?? '')?.email || '' }));
  }
  async function loadSweep(id: string) {
    const w = /^[0-9a-f-]{36}$/i.test(id) ? await accounts.getSweep(id) : null;
    if (!w || w.tenantId !== t) throw new AdminError(404, 'Búsqueda no encontrada');
    return w;
  }
  /** Una búsqueda con cada resultado marcado: nueva, ya en el CRM, mismo nombre o cerrada. */
  async function prospectGet(id: string): Promise<{ sweep: Awaited<ReturnType<typeof loadSweep>>; candidates: Candidate[] }> {
    requireUse();
    const w = await loadSweep(id);
    return { sweep: w, candidates: markCandidates(w.results, await accountIndex(), w.imported) };
  }
  /** Importar de una vez (el navegador manda tandas para enseñar el progreso). */
  const PROSPECT_CHUNK = 6;
  /**
   * Importar lo marcado: cada sitio pasa a ser una empresa con su ficha de Google ya puesta (no hay que volver a buscarla),
   * su ciudad, el sector elegido, la lista de lo buscado («discotecas») y las redes y el email de su web. Lo que ya está
   * en el CRM no se duplica. `owner`: «me» (quien importa), «» (libre) o el id de alguien del equipo (solo admin o gerente).
   */
  async function prospectImport(id: string, placeIdsIn: unknown, owner: unknown = 'me', kindIn: unknown = null): Promise<{ created: number; have: number; failed: number; ids: Record<string, string> }> {
    requireUse();
    const w = await loadSweep(id);
    const want = new Set((Array.isArray(placeIdsIn) ? placeIdsIn : []).map(String).slice(0, PROSPECT_CHUNK));
    // De qué tipo de cliente son (§21): uno del espacio; si no, el principal.
    const kind = typeof kindIn === 'string' && (await kinds()).some((k) => k.key === kindIn) ? kindIn : BASE_KIND;
    let ownerId: string | null = s.userId;
    if (perms.manageAccounts && owner !== 'me') {
      if (owner === '' || owner == null) ownerId = null;
      else {
        const m = (await members()).get(String(owner));
        if (!m || m.role === 'partner') throw new AdminError(404, 'No es del equipo');
        ownerId = m.userId;
      }
    }
    const [all, zones] = await Promise.all([allAccounts(), accounts.listZones(t)]);
    const picked = markCandidates(w.results, all, w.imported).filter((c) => want.has(c.placeId));
    const tag = tagSchema.parse(w.query);
    const ids: Record<string, string> = {};
    let created = 0, have = 0, failed = 0;
    await Promise.all(picked.map(async (c) => {
      if (c.state === 'have' && c.accountId) { ids[c.placeId] = c.accountId; have++; return; }
      try {
        const zoneId = (c.place ? zoneForPlace(zones, c.place)?.id : null) ?? w.zoneId;
        const accId = await accounts.insertAccount(t, { name: c.name, zoneId, segmentId: w.segmentId, address: null, externalRef: null, notes: null, ownerId, tags: tag ? [tag] : [], kind });
        ids[c.placeId] = accId;
        // Ya está creada: si lo de Google o su web falla, se cuenta igual como creada (le faltarán esos datos).
        created++;
        try {
          const socials = c.website ? await site.scan(c.website).catch(() => null) : null;
          await accounts.research(accId, { placeId: c.placeId, phone: c.phone, website: c.website, address: c.address, mapsUrl: c.mapsUrl, hours: c.hours, lat: c.lat, lng: c.lng,
            status: c.status, rating: c.rating ?? null, reviews: c.reviews ?? null, photo: c.photo ?? null, zoneId: null,
            email: socials?.email ?? null, instagram: socials?.instagram ?? null, facebook: socials?.facebook ?? null, linkedin: socials?.linkedin ?? null, replace: false });
          await fillLegal(accId, socials);
        } catch (e) { console.warn('[prospect] datos de Google', e instanceof Error ? e.message : e); }
      } catch (e) { console.warn('[prospect]', e instanceof Error ? e.message : e); failed++; }
    }));
    if (Object.keys(ids).length) await accounts.markSwept(w.id, ids).catch((e) => console.warn('[prospect]', e instanceof Error ? e.message : e));
    return { created, have, failed, ids };
  }

  /**
   * «Es la misma» (§19): un sitio de Google que ya tienes con otro nombre o sin ficha. Se une a tu empresa como si le
   * hubieras elegido esa ficha de Google en la suya (teléfono, web, Maps, horario, ubicación, valoración, la ciudad si
   * no tiene, y las redes de su web). Lo escrito a mano no se pisa; si tenía otra ficha de Google, se cambia.
   */
  async function prospectLink(id: string, placeId: string, accountId: string): Promise<{ accountId: string }> {
    requireUse();
    const w = await loadSweep(id);
    const c = w.results.find((x) => x.placeId === placeId);
    const a = await accounts.getAccount(accountId);
    if (!c || !a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    const zones = await accounts.listZones(t);
    const replace = !!a.placeId && a.placeId !== c.placeId;
    const keepsZone = a.zoneId && !(replace && a.placeFilled?.zone_id === a.zoneId);
    const zone = !keepsZone && c.place ? zoneForPlace(zones, c.place) : null;
    // Igual que al elegir la ficha de Google: si se cambia de ficha, la web que puso la anterior no vale.
    const web = c.website || (replace && a.placeFilled?.website === a.website ? null : a.website);
    const socials = web ? await site.scan(web).catch(() => null) : null;
    try {
      await accounts.research(accountId, { placeId: c.placeId, phone: c.phone, website: c.website, address: c.address, mapsUrl: c.mapsUrl, hours: c.hours, lat: c.lat, lng: c.lng,
        status: c.status, rating: c.rating ?? null, reviews: c.reviews ?? null, photo: c.photo ?? null, zoneId: zone?.id ?? null,
        email: socials?.email ?? null, instagram: socials?.instagram ?? null, facebook: socials?.facebook ?? null, linkedin: socials?.linkedin ?? null, replace });
    } catch (e) { mapError(e); }
    await fillLegal(accountId, socials);
    await accounts.markSwept(w.id, { [c.placeId]: accountId }).catch((e) => console.warn('[prospect]', e instanceof Error ? e.message : e));
    return { accountId };
  }

  // ---------------------------------------------------------------- Apuntar con IA (docs/CRM_DINAMICO.md §20)

  /** Lo que se puede contar de una vez (un buen rato de dictado). */
  const NOTES_MAX = 12000;
  /**
   * La IA separa lo contado por sitio (nota, cualificación, próximo paso) y cada sitio se busca en el CRM por el nombre
   * (los más parecidos primero). No guarda nada: lo confirma la persona con notesApply.
   */
  type NoteCandidate = { id: string; name: string; zone: string; score: number; discarded: boolean; kind?: string };
  /** «Comunidad Valenciana › Valencia»: lo justo para reconocer el sitio. */
  const placeOf = (zones: Zone[], zoneId: string | null) => {
    const byId = new Map(zones.map((z) => [z.id, z]));
    const parts: string[] = [];
    for (let z = zoneId ? byId.get(zoneId) : undefined, i = 0; z && i < 8; z = z.parentId ? byId.get(z.parentId) : undefined, i++) parts.unshift(z.name);
    return parts.slice(-2).join(' › ');
  };
  /**
   * Buscar una empresa por el nombre para «¿De qué empresa vas a hablar?» (autocompletar): sin IA, tolera errores del
   * dictado. Las 8 que más se parecen, con su sitio.
   */
  async function accountSearch(q: string, kind?: string | null): Promise<NoteCandidate[]> {
    requireUse();
    const query = String(q ?? '').trim().slice(0, 80);
    if (query.length < 2) return [];
    const [index, zones] = await Promise.all([accountIndex(), accounts.listZones(t)]);
    // «Trabaja con» busca solo entre las de un tipo (promotoras o DJs, §29).
    const all = kind ? index.filter((a) => a.kind === kind) : index;
    const key = nameKey(query);
    const hits = all.map((a) => ({ a, score: nameKey(a.name).includes(key) ? Math.max(0.9, nameScore(query, a.name)) : nameScore(query, a.name) }))
      .filter((x) => x.score >= 0.6).sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name, 'es')).slice(0, 8);
    return hits.map(({ a, score }) => ({ id: a.id, name: a.name, zone: placeOf(zones, a.zoneId), score: Math.round(score * 100) / 100, discarded: !!a.discardedAt, kind: a.kind }));
  }
  /**
   * La IA separa lo contado por sitio (nota, cualificación, próximo paso) y cada sitio se busca en el CRM por el nombre
   * (los más parecidos primero; sin IA). Si quien cuenta ya ha elegido la empresa, todo va a esa (un solo sitio) y la IA
   * solo ordena. No guarda nada: lo confirma la persona con notesApply.
   */
  async function notesSplit(text: string, ctx: { seller: string }, accountId?: string | null): Promise<Array<NoteItem & { candidates: NoteCandidate[] }>> {
    requireUse();
    if (!notesAi) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const clean = String(text ?? '').trim().slice(0, NOTES_MAX);
    if (clean.length < 3) throw new AdminError(422, 'Datos no válidos');
    const chosen = accountId ? await accounts.getAccount(accountId) : null;
    if (accountId && (!chosen || chosen.tenantId !== t)) throw new AdminError(404, 'Cuenta no encontrada');
    await quota('ai');
    let items: NoteItem[] = [];
    // Los campos de la ficha del espacio (los de la empresa): la IA propone valores y aquí se validan con su tipo.
    const accFields = (await fields()).filter((f) => f.target === 'account' && !f.archivedAt);
    const forAi = accFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options.map((o) => o.label) }));
    try { items = await notesAi.split(clean, { today: new Date().toISOString().slice(0, 10), seller: ctx.seller, fields: forAi }); } catch (e) {
      console.warn('[notes]', aiReason(e));
      throw new AdminError(503, 'La IA no ha respondido; prueba en un momento', [aiReason(e)]);
    }
    // Solo campos que existen y con un valor que su tipo acepta (se enseña como se verá en la ficha).
    for (const it of items) {
      const ok: Record<string, string> = {};
      for (const [k, raw] of Object.entries(it.fields)) {
        const f = accFields.find((x) => x.key === k);
        const r = f ? parseValue(f, raw) : null;
        if (!f || !r || !r.ok || r.value === null || r.value === '') continue;
        ok[k] = f.type === 'checkbox' ? (r.value ? 'sí' : 'no') : f.type === 'select' ? f.options.find((o) => o.key === r.value)?.label ?? String(r.value) : String(raw);
      }
      // Lo que es de una persona (su Instagram, su teléfono…) va en la persona, no en la ficha del sitio (§38).
      const theirs = new Set(it.people.flatMap((p) => [p.instagram, p.linkedin, p.phone, p.email]).filter(Boolean).map((x) => socialKey(x!)));
      it.fields = Object.fromEntries(Object.entries(ok).filter(([, v]) => !theirs.has(socialKey(v))));
    }
    const [all, zones] = await Promise.all([accountIndex(), accounts.listZones(t)]);
    if (chosen) {
      // Todo a la empresa elegida: las notas juntas, lo marcado sumado, el primer próximo paso.
      const q: Record<string, string> = {};
      const fv: Record<string, string> = {};
      for (const it of items) { Object.assign(q, it.qualification); Object.assign(fv, it.fields); }
      const first = items.find((it) => it.nextStep || it.nextDays != null);
      const inter = items.map((it) => it.interaction).filter(Boolean).join('\n\n');
      const facts = items.flatMap((it) => it.facts);
      const keyFacts = items.flatMap((it) => it.keyFacts).slice(0, 3);
      const one: NoteItem = {
        venue: chosen.name, interaction: inter ? inter.slice(0, 4000) : facts.length || keyFacts.length ? null : clean.slice(0, 4000), keyFacts, facts,
        fit: items.map((it) => it.fit).filter(Boolean).join(' · ') || null, fields: fv,
        channel: items[0]?.channel ?? 'visit', outcome: items[0]?.outcome ?? 'note', day: items[0]?.day ?? null,
        qualification: q, nextStep: first?.nextStep ?? null, nextDays: first?.nextDays ?? null,
        discard: items.find((it) => it.discard)?.discard ?? null, discardWhy: items.find((it) => it.discard)?.discardWhy ?? null,
        entity: items.find((it) => it.entity)?.entity ?? null, worksAt: items.flatMap((it) => it.worksAt).slice(0, 12),
        people: sanitizePeople(items.flatMap((it) => it.people)),
        contact: Object.assign({}, ...items.map((it) => it.contact)),
      };
      return [{ ...one, candidates: [{ id: chosen.id, name: chosen.name, zone: placeOf(zones, chosen.zoneId), score: 1, discarded: !!chosen.discardedAt }] }];
    }
    return items.map((it) => ({
      ...it,
      candidates: matchAccounts(it.venue, all).map((a) => ({ id: a.id, name: a.name, zone: placeOf(zones, a.zoneId), score: Math.round(a.score * 100) / 100, discarded: !!a.discardedAt })),
    }));
  }
  const noteApplySchema = z.array(z.object({
    accountId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
    create: z.string().trim().max(160).nullable().optional().transform((v) => v || null),
    interaction: z.string().trim().max(4000).nullable().optional().transform((v) => v || null),
    keyFacts: z.array(z.string().trim().min(1).max(600)).max(5).default([]),
    facts: z.array(z.string().trim().min(1).max(600)).max(40).default([]),
    fit: z.string().trim().max(600).nullable().optional().transform((v) => v || null),
    fields: z.record(z.string(), z.string().max(500)).default({}),
    channel: z.enum(CHANNELS).default('visit'),
    outcome: z.enum(OUTCOMES).default('note'),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    qualification: z.record(z.string(), z.string()).default({}),
    nextStep: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
    nextDays: z.number().int().min(0).max(365).nullable().optional(),
    /** Descartar (si quien apunta dijo que sí a la propuesta de la IA, §23). */
    discard: z.enum(DISCARD_REASONS).nullable().optional(),
    /** Tipo de la empresa nueva (§24: promotora, DJ…) y dónde trabaja (enlaces con días y frecuencia). */
    kind: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional().or(z.literal('').transform(() => undefined)),
    worksAt: z.array(z.object({ place: z.string().trim().min(1).max(160), days: z.array(z.enum(LINK_DAYS)).max(7).default([]),
      freq: z.enum(['regular', 'sporadic', 'once']).nullable().optional(), role: z.enum(['resident', 'guest']).nullable().optional(),
      what: z.enum(PROFILES).nullable().optional() })).max(12).default([]),
    discardNote: z.string().trim().max(500).nullable().optional().transform((v) => v || null),
    /** Canales del propio sitio confirmados (§40): solo se rellenan los que la ficha no tiene. */
    contact: z.record(z.enum(NOTE_CONTACT_KEYS), z.string().max(300)).default({}),
    /** Personas confirmadas (§38): se enlazan a la empresa (la que ya esté, por nombre) o se crean. */
    people: z.array(z.object({ name: z.string().trim().min(1).max(120), role: z.string().trim().max(80).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(), email: z.string().trim().max(200).nullable().optional(),
      instagram: z.string().trim().max(200).nullable().optional(), linkedin: z.string().trim().max(300).nullable().optional(),
      note: z.string().trim().max(300).nullable().optional() })).max(12).default([]),
  })).max(40);
  /**
   * Personas de «Apuntar» (§38): la que ya está en la empresa (mismo nombre) se completa con lo que le falte; si no, la
   * que ya existe con ese nombre exacto se enlaza; si no, se crea. Su Instagram, teléfono… van en la persona.
   */
  async function notePeople(accountId: string, people: Array<{ name: string; role?: string | null; phone?: string | null; email?: string | null; instagram?: string | null; linkedin?: string | null; note?: string | null }>) {
    const links = await db.listLinks(t, { accountIds: [accountId] });
    const linked = links.length ? await db.listContacts(t, { ids: links.map((l) => l.contactId), limit: 500 }) : [];
    for (const p of people) {
      const key = nameKey(p.name);
      const info = { phone: p.phone ?? null, email: p.email ?? null, instagram: p.instagram ?? null, linkedin: p.linkedin ?? null };
      let c = linked.find((x) => nameKey(x.name) === key) ?? null;
      const isNew = !c;
      if (!c) c = (await db.listContacts(t, { q: p.name, limit: 20 })).find((x) => nameKey(x.name) === key) ?? null;
      try {
        if (c) {
          // Solo lo que le falta: no se pisa lo que ya tenía.
          const patch = Object.fromEntries(Object.entries(info).filter(([k, v]) => v && !c![k as keyof typeof info])) as ContactPatch;
          if (p.note && !c.notes) patch.notes = p.note;
          if (Object.keys(patch).length) await db.updateContact(c.id, patch).catch(() => false);
          if (isNew) await db.saveLinks(t, [{ contactId: c.id, accountId, role: p.role ?? null }]);
        } else {
          const [cid] = await db.insertContacts(t, [{ name: p.name, ...info, city: null, notes: p.note ?? null, fields: {}, tags: [], ownerId: s.userId, importId: null }]);
          await db.saveLinks(t, [{ contactId: cid, accountId, role: p.role ?? null }]);
        }
      } catch (e) { mapError(e); }
    }
  }
  /**
   * Guardar lo confirmado, en cada empresa (o en una nueva), cada cosa en su sitio: la interacción en el historial (con
   * el próximo paso), lo que sabemos y lo que le encaja en «Lo que sabemos», los campos de la ficha y lo marcado en la
   * cualificación (sin quitar lo que ya tenía). Cada sitio va por su cuenta: si uno falla, los demás se guardan.
   */
  async function notesApply(input: unknown): Promise<Array<{ accountId: string | null; name: string; ok: boolean; error?: string }>> {
    requireUse();
    const rows = parse(noteApplySchema, input);
    const out: Array<{ accountId: string | null; name: string; ok: boolean; error?: string }> = [];
    for (const r of rows) {
      let id = r.accountId ?? null;
      let name = r.create ?? '';
      try {
        const kindNew = r.kind && (await kinds()).some((k) => k.key === r.kind) ? r.kind : undefined;
        if (!id && r.create) id = await accounts.insertAccount(t, { name: r.create, zoneId: null, segmentId: null, address: null, externalRef: null, notes: null, kind: kindNew });
        if (!id) continue;
        const a = await accounts.getAccount(id);
        if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
        name = a.name;
        const at = r.nextDays != null ? new Date(Date.now() + r.nextDays * 86_400_000).toISOString().slice(0, 10) : undefined;
        const next = r.nextStep || at ? { step: r.nextStep ?? undefined, at } : undefined;
        if (r.interaction) await logActivity(id, { channel: r.channel, outcome: r.outcome, note: r.interaction, happenedAt: r.day ? `${r.day}T12:00:00` : undefined }, next);
        else if (next) await setNextStep(id, next);
        // Lo que sabemos (lo nuevo primero) y los campos de la ficha, en una sola escritura.
        const patch: { facts?: AccountFact[]; fields?: FieldValues } = {};
        const when = r.day ? `${r.day}T12:00:00.000Z` : new Date().toISOString();
        const added: AccountFact[] = [...r.keyFacts.map((text) => ({ id: crypto.randomUUID(), text, kind: 'fact' as const, at: when, by: s.userId, key: true })),
          ...(r.fit ? [{ id: crypto.randomUUID(), text: r.fit, kind: 'fit' as const, at: when, by: s.userId }] : []),
          ...r.facts.map((text) => ({ id: crypto.randomUUID(), text, kind: 'fact' as const, at: when, by: s.userId }))];
        if (added.length) patch.facts = [...added, ...a.facts].slice(0, 200);
        if (Object.keys(r.fields).length) {
          const accFields = (await fields()).filter((f) => f.target === 'account' && !f.archivedAt);
          const pv = parseValues(accFields, Object.fromEntries(Object.entries(r.fields).filter(([k]) => accFields.some((f) => f.key === k))));
          if (Object.keys(pv.values).length) patch.fields = { ...a.fields, ...pv.values };
        }
        if (patch.facts || patch.fields) {
          let ok = false;
          try { ok = await accounts.updateAccount(id, patch); } catch (e) { mapError(e); }
          if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
        }
        const q: Record<string, unknown> = { ...a.qualification };
        let changed = false;
        for (const [k, raw] of Object.entries(r.qualification)) {
          // Las de varios llegan juntas («club,hall»): se suman a lo que ya tenía.
          let set = false;
          for (const v of MULTI_QUAL.includes(k) ? raw.split(',').map((x) => x.trim()) : [raw]) {
            if (!QUAL_VALUES[k]?.includes(v)) continue;
            setQual(q, k, v === 'true' ? true : v); set = true;
          }
          // Solo si de verdad se ha puesto el formato (no porque cambiara otra pregunta antes).
          if (k === 'format' && set) delete q.kind;
          changed ||= set;
        }
        if (changed) { try { await accounts.qualify(id, q as Qualification); } catch (e) { mapError(e); } }
        if (r.discard) await classifyAccount(id, { reason: r.discard, note: r.discardNote });
        // Dónde trabaja (§24): cada sitio por su nombre (el que ya existe o uno nuevo), con sus días y frecuencia.
        if (r.worksAt.length) {
          // Si lo nuevo cuelga de un local, lo que falta es una promotora; si cuelga de una promotora o un DJ, una sala.
          const ks = await kinds();
          const mine = (await accounts.getAccount(id))?.kind ?? BASE_KIND;
          const otherKind = profileOf(ks, mine) === 'venue' ? ks.find((k) => k.profile === 'promoter')?.key ?? BASE_KIND : BASE_KIND;
          // Si la IA dice qué es (promotora, DJ o local), de ese tipo; si no, lo que suele ser.
          const kindOf = (w: (typeof r.worksAt)[number]) => (w.what === 'venue' ? BASE_KIND : w.what ? ks.find((k) => k.profile === w.what)?.key ?? otherKind : otherKind);
          for (const w of r.worksAt) await workLinkAdd(id, { name: w.place, kind: kindOf(w), days: w.days, ...(w.freq ? { freq: w.freq } : {}), ...(w.role ? { role: w.role } : {}) });
        }
        // Su web, su Instagram, su música… (§40): solo lo que le falta, sin pisar lo que ya tiene.
        const fresh = await accounts.getAccount(id);
        const missing = Object.fromEntries(Object.entries(r.contact).filter(([k, v]) => v && fresh && !fresh[k as keyof Account]));
        if (Object.keys(missing).length) await setCompanyContact(id, missing).catch(() => undefined);
        if (r.people.length) await notePeople(id, r.people);
        out.push({ accountId: id, name, ok: true });
      } catch (e) {
        out.push({ accountId: id, name: name || r.create || '', ok: false, error: e instanceof AdminError ? e.message : 'No se ha podido' });
      }
    }
    return out;
  }

  /** «Lo que sabemos» a mano, desde la ficha: añadir un dato (o lo que le encaja) y quitarlo. */
  async function factAdd(accountId: string, text: string, kind: 'fact' | 'fit' | 'key' = 'fact') {
    requireUse();
    const v = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!v) throw new AdminError(422, 'Datos no válidos');
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    let ok = false;
    try { ok = await accounts.updateAccount(accountId, { facts: [{ id: crypto.randomUUID(), text: v, kind: (kind === 'fit' ? 'fit' : 'fact') as AccountFact['kind'], at: new Date().toISOString(), by: s.userId, ...(kind === 'key' ? { key: true } : {}) }, ...a.facts].slice(0, 200) }); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
  }
  /** Marcar o desmarcar un punto como de lo más importante (sale arriba, en grande). */
  async function factStar(accountId: string, factId: string) {
    requireUse();
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    if (!a.facts.some((f) => f.id === factId)) throw new AdminError(422, 'Datos no válidos');
    let ok = false;
    try { ok = await accounts.updateAccount(accountId, { facts: a.facts.map((f) => (f.id === factId ? { ...f, key: !f.key } : f)) }); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
  }
  async function factRemove(accountId: string, factId: string) {
    requireUse();
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    let ok = false;
    try { ok = await accounts.updateAccount(accountId, { facts: a.facts.filter((f) => f.id !== factId) }); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
  }

  // ---------------------------------------------------------------- investigación con IA (docs/CRM_DINAMICO.md §13)

  /** Entre dos investigaciones de la misma empresa (evita el doble clic y gastar dos veces). */
  const AI_COOLDOWN_MS = 2 * 60_000;
  async function aiResearch(accountId: string): Promise<AiResearch | null> {
    requireUse();
    return readResearch(await accounts.getAiResearch(accountId).catch(() => null));
  }
  /** Investiga con IA y guarda las propuestas (pendientes). `ctx`: el sector y lo que vende el equipo (del playbook). */
  async function aiRun(accountId: string, ctx: { sector: ResearchInput['sector']; seller: string }) {
    requireUse();
    if (!ai) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    // Antes de gastar: solo la libre, la mía o, si soy gerente, cualquiera (lo mismo que comprueba la RPC al guardar).
    if (a.ownerId && a.ownerId !== s.userId && !perms.manageAccounts) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
    // La espera antes que el cupo: un doble clic no gasta.
    if (a.aiResearchAt && Date.now() - Date.parse(a.aiResearchAt) < AI_COOLDOWN_MS) throw new AdminError(409, 'Se acaba de investigar; espera un par de minutos');
    await quota('ai');
    const people = (await actorsOf(accountId)).map((c) => c.name);
    const known = Object.fromEntries(Object.entries(a.qualification ?? {}).filter(([, v]) => v !== undefined));
    let raw: unknown;
    try {
      raw = await ai.research({ name: a.name, city: (await zoneNameOf(a)) || null, address: a.address, website: a.website, instagram: a.instagram,
        sector: ctx.sector, seller: ctx.seller, known });
    } catch (e) { console.warn('[ai-research]', e instanceof Error ? e.message : e); throw new AdminError(503, 'La IA no ha respondido; prueba en un momento', [aiReason(e)]); }
    if (!raw) throw new AdminError(503, 'La IA no ha respondido; prueba en un momento');
    const r = sanitizeResearch(raw, { known, contact: { phone: a.phone, email: a.email, instagram: a.instagram, linkedin: a.linkedin, website: a.website }, people, now: new Date() });
    try { await accounts.saveAiResearch(accountId, r); } catch (e) { mapError(e); }
    return r;
  }
  /** Aceptar (se guarda en la ficha) o descartar una propuesta. Aceptar nunca pisa lo que ya hay. */
  async function aiDecide(accountId: string, suggestionId: string, accept: boolean) {
    requireUse();
    const r = await aiResearch(accountId);
    const sg = r?.suggestions.find((x) => x.id === suggestionId);
    if (!r || !sg || sg.status !== 'open') throw new AdminError(404, 'Sugerencia no encontrada');
    let fill: Record<string, string> | undefined;
    if (accept) {
      const a = await accounts.getAccount(accountId);
      if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
      if (sg.kind === 'qual') {
        const q: Record<string, unknown> = { ...a.qualification };
        if (q[sg.key] === undefined || (MULTI_QUAL.includes(sg.key) && !formatsOf(q as Qualification).includes(sg.value as Format))) {
          setQual(q, sg.key, sg.value === 'true' ? true : sg.value);
          try { await accounts.qualify(accountId, q as Qualification); } catch (e) { mapError(e); }
        }
      } else if (sg.kind === 'contact') {
        fill = { [sg.key]: sg.value };
      } else {
        await quickAdd({ name: sg.name, role: sg.role ?? '', instagram: sg.instagram ?? '', linkedin: sg.linkedin ?? '', accountId,
          notes: `Propuesta por la IA: ${sg.evidence} (${sg.source})` });
      }
    }
    sg.status = accept ? 'accepted' : 'dismissed';
    try { await accounts.saveAiResearch(accountId, r, fill); } catch (e) { mapError(e); }
  }

  // ---------------------------------------------------------------- ordenar ciudades (docs/CRM_DINAMICO.md §14)

  /** Textos por llamada a la IA (unos 60 caben de sobra en una respuesta y tardan menos del límite del servidor). */
  const ZONES_CHUNK = 60;
  /** Ciudades que se sitúan en el mapa por cada clic del navegador (cada una es una búsqueda en Google). */
  const ZONES_LOCATE_CHUNK = 15;
  async function zoneState() {
    const [zones, accs, assigns] = await Promise.all([accounts.listZones(t), allAccounts(), accounts.listAssignments(t)]);
    const counts = new Map<string, number>();
    for (const a of accs) if (a.zoneId) counts.set(a.zoneId, (counts.get(a.zoneId) ?? 0) + 1);
    // Vacías: ni empresas ni nadie asignado en ella ni en lo que cuelga de ella.
    const kids = new Map<string, string[]>();
    for (const z of zones) if (z.parentId) kids.set(z.parentId, [...(kids.get(z.parentId) ?? []), z.id]);
    const assigned = new Set(assigns.map((x) => x.zoneId));
    const used = (id: string): boolean => (counts.get(id) ?? 0) > 0 || assigned.has(id) || (kids.get(id) ?? []).some(used);
    const empty = zones.filter((z) => !used(z.id));
    return { zones, accs, counts, empty };
  }
  /** Lo que hay: textos a clasificar (zonas con empresas), zonas vacías y el último arreglo (para deshacer). */
  async function zonesOverview() {
    requireImporter();
    const [{ zones, counts, empty }, fixes] = await Promise.all([zoneState(), accounts.listFixes(t, 'zones').catch(() => [])]);
    const parents = new Set(zones.map((z) => z.parentId).filter(Boolean));
    const byId = new Map(zones.map((z) => [z.id, z]));
    // Solo lo que está sin ordenar (lo ya ordenado no se vuelve a mandar a la IA).
    const raws = [...new Map(zones.filter((z) => (counts.get(z.id) ?? 0) > 0 && !parents.has(z.id) && isUnordered(z, byId)).map((z) => [norm(z.name), z.name])).values()];
    const accs = await allAccounts();
    return { raws, zones: zones.length, empty: empty.length, last: fixes.find((f) => !f.undoneAt) ?? null, hasAi: !!zoneAi, chunk: ZONES_CHUNK,
      review: accs.filter((a) => a.tags.includes(REVIEW_TAG)).length, noCity: accs.filter((a) => !a.zoneId).length };
  }
  /** Clasificar con IA un trozo de textos (lo pide el navegador, trozo a trozo). */
  async function zonesClassify(raws: unknown) {
    requireImporter();
    if (!zoneAi) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const list = Array.isArray(raws) ? raws.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.slice(0, 200)).slice(0, ZONES_CHUNK) : [];
    if (!list.length) throw new AdminError(422, 'Datos no válidos');
    try { return await zoneAi.classify(list); } catch (e) { console.warn('[zones-ai]', e instanceof Error ? e.message : e); throw new AdminError(503, 'La IA no ha respondido; prueba en un momento', [aiReason(e)]); }
  }
  /** El plan con lo que dijo la IA (para la vista previa; no toca nada). */
  async function zonesPlan(classes: unknown) {
    requireImporter();
    const { zones, counts } = await zoneState();
    return buildZonePlan(zones, counts, sanitizePlaces({ places: classes }, zones.map((z) => z.name)));
  }
  /**
   * Aplicar: crea las zonas que faltan (Comunidad › Provincia › Pueblo), mueve las empresas, pasa la nota del Notion a
   * sus notas y marca «revisar-ciudad» las dudosas y las que no son un sitio. `skip`: zonas que el admin ha desmarcado.
   */
  async function zonesApply(classes: unknown, skip: string[] = []) {
    requireImporter();
    const { zones, accs, counts } = await zoneState();
    const plan = buildZonePlan(zones, counts, sanitizePlaces({ places: classes }, zones.map((z) => z.name)));
    const skipped = new Set(skip);
    const created: string[] = [];
    const made = new Map<string, string>();
    const target = new Map<string, { zoneId: string | null; note: boolean; review: boolean; raw: string }>();
    for (const g of plan.groups) {
      const src = g.sources.filter((x) => !skipped.has(x.zoneId));
      if (!src.length) continue;
      let parent: string | null = null;
      let prefix = '';
      for (const step of g.path) {
        prefix += `/${norm(step.name)}`;
        let id = step.existingId ?? made.get(prefix) ?? null;
        if (!id) {
          try { id = await accounts.saveZone(t, { parentId: parent, name: step.name.slice(0, 80), kind: step.kind, position: 0 }); } catch (e) { mapError(e); }
          made.set(prefix, id!); created.push(id!);
        }
        parent = id;
      }
      for (const x of src) target.set(x.zoneId, { zoneId: parent, note: !!x.note || x.review, review: x.review, raw: x.raw });
    }
    for (const j of plan.junk) if (!skipped.has(j.zoneId)) target.set(j.zoneId, { zoneId: null, note: true, review: true, raw: j.raw });
    const moves: AccountMove[] = [];
    const before: AccountMove[] = [];
    for (const a of accs) {
      const to = a.zoneId ? target.get(a.zoneId) : undefined;
      if (!to) continue;
      before.push({ id: a.id, zoneId: a.zoneId, notes: a.notes, tags: a.tags });
      moves.push({ id: a.id, zoneId: to.zoneId, notes: to.note ? withNote(a.notes, to.raw) : a.notes,
        tags: to.review && !a.tags.includes(REVIEW_TAG) ? [...a.tags, REVIEW_TAG] : a.tags });
    }
    let moved = 0;
    try { for (let i = 0; i < moves.length; i += 1000) moved += await accounts.moveAccounts(t, moves.slice(i, i + 1000)); } catch (e) { mapError(e); }
    const summary = { moved, created: created.length, review: moves.filter((m) => m.tags.includes(REVIEW_TAG)).length, groups: plan.groups.length };
    try { await accounts.saveFix(t, { kind: 'zones', summary, undo: { moves: before, zoneIds: created } }); } catch (e) { mapError(e); }
    return summary;
  }
  /** Deshacer el último arreglo: cada empresa vuelve a su zona, notas y listas; las zonas creadas se borran si quedan vacías. */
  async function zonesUndo(fixId: string) {
    requireImporter();
    const f = (await accounts.listFixes(t, 'zones')).find((x) => x.id === fixId && !x.undoneAt);
    if (!f) throw new AdminError(404, 'Ese arreglo ya no se puede deshacer');
    const moves = f.undo.moves ?? [];
    const alive = new Set((await accounts.listZones(t)).map((z) => z.id));
    let back = 0;
    try { for (let i = 0; i < moves.length; i += 1000) back += await accounts.moveAccounts(t, moves.slice(i, i + 1000).map((m) => ({ ...m, zoneId: m.zoneId && alive.has(m.zoneId) ? m.zoneId : null }))); } catch (e) { mapError(e); }
    const { empty } = await zoneState();
    const gone = new Set(empty.map((z) => z.id));
    for (const id of [...(f.undo.zoneIds ?? [])].reverse()) if (gone.has(id)) await accounts.deleteZone(id).catch(() => false);
    await accounts.markFixUndone(f.id);
    return { back };
  }
  // ---------------------------------------------------------------- limpiar: empresas, DJs y descartadas (§17)

  /** Tipo de una empresa (empresa / DJ) y descartarla con motivo o recuperarla (reason null). */
  async function classifyAccount(accountId: string, input: unknown) {
    requireUse();
    const v = parse(classifySchema, input);
    if (v.kind && !(await kinds()).some((k) => k.key === v.kind)) throw new AdminError(422, 'Datos no válidos');
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    // Cambiar solo el tipo no recupera una descartada: lo que no viene, se queda como está.
    const has = (k: string) => !!input && typeof input === 'object' && k in input;
    const reason = has('reason') ? v.reason ?? null : a.discardReason;
    const note = has('reason') ? v.note ?? null : a.discardNote;
    try { await accounts.classify(accountId, v.kind ?? null, reason, note); } catch (e) { mapError(e); }
  }
  /** Empresas por tanda que la IA revisa cada vez (cada tanda es una petición corta desde el navegador). */
  const CLEANUP_CHUNK = 40;
  async function cleanupOverview() {
    requireImporter();
    const [accs, fixes] = await Promise.all([allAccounts(), accounts.listFixes(t, 'classify').catch(() => [])]);
    const active = accs.filter((a) => !a.discardedAt);
    const defs = await kinds();
    const kindOf = (k: string) => (defs.some((d) => d.key === k) ? k : BASE_KIND);
    return {
      ids: active.map((a) => a.id), kinds: defs.map((d) => ({ ...d, count: active.filter((a) => kindOf(a.kind) === d.key).length })),
      discarded: accs.length - active.length, last: fixes.find((f) => !f.undoneAt) ?? null, hasAi: !!cleanupAi, chunk: CLEANUP_CHUNK,
    };
  }
  /** La IA revisa una tanda (ids) y propone tipo y si descartar, con su porqué. No cambia nada. */
  async function cleanupClassify(ids: unknown, ctx: CleanupContext & { sectors?: Record<string, string> }): Promise<CleanupSuggestion[]> {
    requireImporter();
    if (!cleanupAi) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const want = new Set(z.array(uuid).max(CLEANUP_CHUNK).parse(Array.isArray(ids) ? ids : []));
    if (!want.size) return [];
    const [accs, zones] = await Promise.all([allAccounts(), accounts.listZones(t)]);
    const zoneName = new Map(zones.map((x) => [x.id, x.name]));
    const items: CleanupInput[] = accs.filter((a) => want.has(a.id)).map((a) => ({
      id: a.id, name: a.name, city: a.zoneId ? zoneName.get(a.zoneId) ?? null : null, notes: a.notes ? a.notes.slice(0, 300) : null,
      website: a.website, instagram: a.instagram, email: a.email ? a.email.replace(/^[^@]*/, '…') : null, tags: a.tags.slice(0, 8),
      sector: a.segmentId ? ctx.sectors?.[a.segmentId] ?? null : null,
    }));
    try { return await cleanupAi.classify(items, { seller: ctx.seller, clients: ctx.clients, kinds: await kinds() }); } catch (e) {
      console.warn('[cleanup-ai]', e instanceof Error ? e.message : e);
      throw new AdminError(503, 'La IA no ha respondido; prueba en un momento', [aiReason(e)]);
    }
  }
  /** Aplicar lo que la IA propuso y sigue marcado: solo lo que cambia. Se guarda lo de antes para deshacer. */
  async function cleanupApply(input: unknown) {
    requireImporter();
    const accs = await allAccounts();
    const byId = new Map(accs.map((a) => [a.id, a]));
    const asked = sanitizeCleanup({ items: Array.isArray(input) ? input : [] }, accs.map((a) => ({ id: a.id }) as CleanupInput), (await kinds()).map((k) => k.key));
    const rows = asked.filter((x) => { const a = byId.get(x.id)!; return a.kind !== x.kind || (x.discard && !a.discardedAt); })
      .map((x) => ({ id: x.id, kind: x.kind, reason: x.discard ?? byId.get(x.id)!.discardReason, note: x.discard ? x.why : byId.get(x.id)!.discardNote }));
    if (!rows.length) return { changed: 0, retyped: 0, discarded: 0 };
    const undo = rows.map((x) => { const a = byId.get(x.id)!; return { id: a.id, kind: a.kind, reason: a.discardReason, note: a.discardNote }; });
    let changed = 0;
    try { for (let i = 0; i < rows.length; i += 1000) changed += await accounts.classifyMany(t, rows.slice(i, i + 1000)); } catch (e) { mapError(e); }
    const summary = { changed, retyped: rows.filter((x) => x.kind !== byId.get(x.id)!.kind).length, discarded: rows.filter((x) => x.reason && !byId.get(x.id)!.discardedAt).length };
    try { await accounts.saveFix(t, { kind: 'classify', summary, undo: { kinds: undo } }); } catch (e) { mapError(e); }
    return summary;
  }
  async function cleanupUndo(fixId: string) {
    requireImporter();
    const f = (await accounts.listFixes(t, 'classify')).find((x) => x.id === fixId && !x.undoneAt);
    if (!f) throw new AdminError(404, 'Ese arreglo ya no se puede deshacer');
    const rows = f.undo.kinds ?? [];
    try { for (let i = 0; i < rows.length; i += 1000) await accounts.classifyMany(t, rows.slice(i, i + 1000)); } catch (e) { mapError(e); }
    await accounts.markFixUndone(f.id);
    return { back: rows.length };
  }

  /** El árbol de zonas con sus empresas (para terminar a mano lo que quede). */
  async function zonesTree() {
    requireImporter();
    const { zones, counts } = await zoneState();
    return zoneRows(zones, counts);
  }
  /** La IA revisa el árbol que ya hay y propone arreglos (juntar, renombrar, tipo, mover). No toca nada. */
  async function zonesReview(): Promise<ZoneFix[]> {
    requireImporter();
    if (!zoneFixAi) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const { zones, counts } = await zoneState();
    const lines = zoneRows(zones, counts).map((r) => `${r.id} | ${r.path} | ${r.kind} | ${r.direct}`);
    let raw: unknown;
    try { raw = await zoneFixAi.review(lines); } catch (e) { console.warn('[zones-fix-ai]', e instanceof Error ? e.message : e); throw new AdminError(503, 'La IA no ha respondido; prueba en un momento', [aiReason(e)]); }
    return sanitizeFixes(raw, zones);
  }
  /**
   * Aplicar arreglos (de la IA o a mano). Juntar A con B: las empresas, los pueblos (si B ya tiene uno igual, también se
   * juntan) y quien tenía A asignada pasan a B, y A se borra. Mover o renombrar encima de otra igual = juntarlas.
   */
  async function zonesFix(input: unknown): Promise<{ applied: number }> {
    requireImporter();
    let applied = 0;
    const fixes = Array.isArray(input) ? input : [input];
    for (const one of fixes) {
      const zones = await accounts.listZones(t);
      const [f] = sanitizeFixes({ fixes: [one] }, zones);
      if (!f) continue;
      const z = zones.find((x) => x.id === f.id)!;
      const twin = (parentId: string | null, name: string) => zones.find((x) => x.id !== z.id && x.parentId === parentId && norm(x.name) === norm(name)) ?? null;
      try {
        if (f.op === 'merge') await mergeZone(z.id, f.target);
        else if (f.op === 'kind') await accounts.saveZone(t, { parentId: z.parentId, name: z.name, kind: f.kind, position: z.position }, z.id);
        else if (f.op === 'rename') {
          const other = twin(z.parentId, f.name);
          if (other) await mergeZone(z.id, other.id);
          else await accounts.saveZone(t, { parentId: z.parentId, name: f.name, kind: z.kind, position: z.position }, z.id);
        } else {
          const other = twin(f.target, z.name);
          if (other) await mergeZone(z.id, other.id);
          else await accounts.saveZone(t, { parentId: f.target, name: z.name, kind: z.kind, position: z.position }, z.id);
        }
      } catch (e) { mapError(e); }
      applied++;
    }
    return { applied };
  }
  async function mergeZone(fromId: string, intoId: string): Promise<void> {
    const [zones, accs, assigns] = await Promise.all([accounts.listZones(t), allAccounts(), accounts.listAssignments(t)]);
    const moves = accs.filter((a) => a.zoneId === fromId).map((a) => ({ id: a.id, zoneId: intoId, notes: a.notes, tags: a.tags }));
    for (let i = 0; i < moves.length; i += 1000) await accounts.moveAccounts(t, moves.slice(i, i + 1000));
    for (const child of zones.filter((z) => z.parentId === fromId)) {
      const same = zones.find((z) => z.parentId === intoId && norm(z.name) === norm(child.name));
      if (same) await mergeZone(child.id, same.id);
      else await accounts.saveZone(t, { parentId: intoId, name: child.name, kind: child.kind, position: child.position }, child.id);
    }
    for (const userId of new Set(assigns.filter((x) => x.zoneId === fromId).map((x) => x.userId))) {
      const mine = assigns.filter((x) => x.userId === userId).map((x) => x.zoneId).filter((id) => id !== fromId);
      await accounts.setAssignments(t, userId, [...new Set([...mine, intoId])]);
    }
    await accounts.deleteZone(fromId);
  }

  /** Borrar las ciudades que se han quedado vacías (sin empresas ni nadie asignado). */
  /**
   * Situar las ciudades en el mapa (§16): busca en Google cada zona sin punto («Requena, Valencia, Comunidad Valenciana,
   * España») y guarda dónde está. Por tandas (el navegador repite hasta acabar); primero las de arriba, y si Google no
   * encuentra una, se queda en el punto de la que la contiene.
   */
  async function zonesLocate(skipIn: unknown = []): Promise<{ located: number; left: number; failed: string[] }> {
    requireImporter();
    const api = requirePlaces();
    const zones = await accounts.listZones(t);
    const byId = new Map(zones.map((z) => [z.id, z]));
    const ups = (z: Zone) => { const out: Zone[] = []; for (let u = z.parentId ? byId.get(z.parentId) : undefined, i = 0; u && i < 8; u = u.parentId ? byId.get(u.parentId) : undefined, i++) out.push(u); return out; };
    // Las que Google ya no encontró en esta tanda se apartan (si no, taparían a las demás en cada vuelta).
    const skip = new Set(Array.isArray(skipIn) ? skipIn.map(String).slice(0, 2000) : []);
    const todo = zones.filter((z) => (z.lat == null || z.lng == null) && !skip.has(z.id)).sort((a, b) => ups(a).length - ups(b).length || a.name.localeCompare(b.name, 'es'));
    const batch = todo.slice(0, ZONES_LOCATE_CHUNK);
    let located = 0;
    const failed: string[] = [];
    for (const z of batch) {
      let at: { lat: number; lng: number } | null = null;
      try {
        const r = (await api.search([z.name, ...ups(z).map((u) => u.name)].join(', ')))[0];
        if (r?.lat != null && r.lng != null) at = { lat: r.lat, lng: r.lng };
      } catch (e) { console.warn('[places]', e instanceof Error ? e.message : e); }
      const parent = ups(z).find((u) => u.lat != null && u.lng != null);
      at ??= parent ? { lat: parent.lat!, lng: parent.lng! } : null;
      if (at && await accounts.setZoneLocation(z.id, at.lat, at.lng).catch(() => false)) { located++; Object.assign(z, at); } else failed.push(z.id);
    }
    return { located, left: todo.length - located - failed.length, failed };
  }

  /** Deshacer «Situar ciudades» (§28): las ciudades vuelven a no tener punto. Las empresas no se tocan. */
  async function zonesUnlocate(): Promise<number> {
    requireImporter();
    try { return await accounts.clearZoneLocations(t); } catch (e) { mapError(e); }
  }
  async function zonesCleanup() {
    requireImporter();
    const { empty } = await zoneState();
    const ids = new Set(empty.map((z) => z.id));
    // Basta con borrar las de arriba: lo que cuelga se va con ellas.
    const tops = empty.filter((z) => !z.parentId || !ids.has(z.parentId));
    for (const z of tops) await accounts.deleteZone(z.id).catch(() => false);
    return empty.length;
  }

  // ---------------------------------------------------------------- ruta del día (docs/CRM_DINAMICO.md §12)

  /** Máximo de paradas por ruta (Google optimiza hasta 25 puntos; un día de visitas no da para más). */
  const ROUTE_MAX = 20;
  /**
   * Las visitas que tocan (mis empresas con «visita» vencida o para hoy) o las que se elijan en la lista, en el orden
   * más corto desde donde estoy. Las que no tienen ubicación salen aparte para buscarlas en Google.
   */
  async function routePlan(input: { ids?: string[]; from?: Point | null; at?: Date } = {}) {
    requireUse();
    const now = input.at ?? new Date();
    const pool = input.ids?.length
      ? (await allAccounts()).filter((a) => input.ids!.includes(a.id))
      : (await accounts.listAccounts(t, { ownerId: s.userId, limit: 5000 }))
        .filter((a) => a.nextChannel === 'visit' && ['overdue', 'today'].includes(dueBucket(a.nextStepAt, now) ?? ''));
    const located = pool.filter((a) => a.lat !== null && a.lng !== null && a.placeStatus !== 'CLOSED_PERMANENTLY');
    const take = located.slice(0, ROUTE_MAX);
    const plan = await planRoute(take.map((a) => ({ id: a.id, name: a.name, lat: a.lat!, lng: a.lng!, account: a })),
      { start: input.from ?? null, at: now, routes });
    return {
      ...plan,
      stops: plan.stops.map((p) => ({ ...p, account: p.stop.account, hours: todayHours(p.stop.account.hours, p.arrival) })),
      missing: pool.filter((a) => a.lat === null || a.lng === null),
      closedForGood: pool.filter((a) => a.lat !== null && a.placeStatus === 'CLOSED_PERMANENTLY'),
      left: located.length - take.length,
    };
  }

  return {
    aiResearch, aiRun, aiDecide, hasAi: () => !!ai,
    board, groupLocales, chargeOptions, charges, charge, chargeCancel, chargeMarkPaid, markWon, zonesOverview, zonesClassify, zonesPlan, zonesApply, zonesUndo, zonesCleanup, zonesTree, zonesReview, zonesFix, zonesLocate, zonesUnlocate, classifyAccount, cleanupOverview, cleanupClassify, cleanupApply, cleanupUndo, hasZoneFixAi: () => !!zoneFixAi,
    routePlan, googleCandidates, googleQuery, googleApply, googleClear, googlePhoto, hasGoogle: () => !!places,
    prospectSearch, prospectList, prospectGet, prospectImport, prospectLink, notesSplit, notesApply, accountSearch, factAdd, factStar, factRemove, workLinks, workLinkAdd, workLinkRemove, hasNotes: () => !!notesAi, hasProspect: () => !!places?.area,
    weights, saveWeights, qualify, cooling,
    setCompanyContact, timeline, logActivity, setNextStep, deleteActivity, today, instagramToCompanies,
    people, person, similar, quickAdd, updatePerson, setPersonFields, deletePerson, setOwner, link, unlink,
    company, moveToGroup, setTags, lists, names,
    imports, importStart, importDraft, importPreview, importRun, importUndo,
  };
}
export type CrmService = ReturnType<typeof createCrmService>;

export const emptyCrmDb: CrmDb = {
  async listPaymentRequests() { return []; }, async insertPaymentRequest() { throw new Error('sin CRM'); }, async cancelPaymentRequest() { return false; }, async markPaymentPaid() { return 'missing' as const; }, async markWon() {},
  async listContacts() { return []; }, async getContact() { return null; }, async insertContacts() { throw new Error('sin CRM'); },
  async updateContact() { return false; }, async deleteContact() { return false; }, async listLinks() { return []; }, async saveLinks() {}, async listAccountLinks() { return []; }, async saveAccountLink() { throw new Error('sin CRM'); }, async removeAccountLink() { return false; },
  async removeLink() { return false; }, async createImport() { throw new Error('sin CRM'); }, async getImport() { return null; },
  async listImports() { return []; }, async updateImport() { return false; }, async deleteContactsByImport() { return 0; },
  async listActivities() { return []; }, async lastActivities() { return []; }, async activitySummary() { return []; }, async insertActivity() { throw new Error('sin CRM'); }, async deleteActivity() { return false; },
};
