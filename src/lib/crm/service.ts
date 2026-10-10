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
import type { Account } from '../accounts/types';
import type { CrmDb } from './db';
import { parseValues, type CrmField, type FieldValues } from './fields';
import { buildPlan, norm, profileColumns, readCsv, suggestMapping, MAX_ROWS, type ImportPlan, type PlanContext } from './import';
import { env } from '../env';
import { googlePlaces, type PlaceResult, type PlacesApi } from './places';
import { googleRoutes, planRoute, todayHours, type Point, type RoutesApi } from './route';
import { buildZonePlan, claudeZoneNames, fixtureZoneNames, sanitizePlaces, withNote, REVIEW_TAG, type ZoneNamesApi } from './zones-normalize';
import type { AccountMove } from '../accounts/types';
import { claudeResearch, fixtureResearch, readResearch, sanitizeResearch, type AiResearch, type ResearchApi, type ResearchInput } from './research';
import { CRITERIA, QUAL_VALUES, coolingDays, normalizeWeights, type Qualification, type Weights } from './priority';
import { CHANNELS, OUTCOMES, dueBucket, suggestNext, type Activity, type Channel, type DueBucket, type NextStep } from './followup';
import { slugKey } from './fields';
import type { Contact, ContactLink, ContactPatch, CrmImport, ImportMapping, ImportStats, ImportUndo } from './types';

const uuid = z.string().uuid();
const opt = (n: number) => z.string().trim().max(n).transform((v) => v || null).nullable().optional();
export const tagSchema = z.string().trim().toLowerCase().transform((v) => v.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48));
export const personSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
  email: z.string().trim().toLowerCase().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email no válido').transform((v) => v || null).nullable().optional(),
  phone: opt(40), instagram: opt(300), linkedin: opt(300), city: opt(80), notes: opt(4000),
});
/** Alta rápida: la persona y «¿dónde?» (una empresa que ya existe o una nueva, por su nombre). */
export const quickAddSchema = personSchema.extend({
  accountId: uuid.nullable().optional().or(z.literal('').transform(() => null)),
  company: opt(160),
  role: opt(80),
  tag: z.string().max(48).optional().transform((v) => (v ? tagSchema.parse(v) || null : null)),
});

/** «@club_sol» o «instagram.com/club_sol» → enlace completo. */
export function socialUrl(v: string | null | undefined, kind: 'instagram' | 'linkedin' | 'web'): string | null {
  const x = (v ?? '').trim();
  if (!x) return null;
  if (kind === 'instagram' && /^@?[\w.]{2,30}$/.test(x)) return `https://www.instagram.com/${x.replace(/^@/, '')}/`;
  return /^https?:\/\//i.test(x) ? x : `https://${x.replace(/^\/+/, '')}`;
}
const urlOpt = (n: number, kind: 'instagram' | 'linkedin' | 'web') => z.string().trim().max(n).transform((v) => socialUrl(v, kind)).nullable().optional();
export const companyContactSchema = z.object({
  phone: opt(40), email: z.string().trim().toLowerCase().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email no válido').transform((v) => v || null).nullable().optional(),
  instagram: urlOpt(300, 'instagram'), linkedin: urlOpt(300, 'linkedin'), website: urlOpt(300, 'web'), mapsUrl: urlOpt(500, 'web'),
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

export function createCrmService(db: CrmDb, accounts: AccountsDb, admin: AdminDb, s: AdminSession, opts: { places?: PlacesApi | null; routes?: RoutesApi | null; research?: ResearchApi | null; zoneNames?: ZoneNamesApi | null } = {}) {
  const places = opts.places !== undefined ? opts.places : env('GOOGLE_MAPS_API_KEY') ? googlePlaces(env('GOOGLE_MAPS_API_KEY')!) : null;
  const routes = opts.routes !== undefined ? opts.routes : env('GOOGLE_MAPS_API_KEY') ? googleRoutes(env('GOOGLE_MAPS_API_KEY')!) : null;
  const ai = opts.research !== undefined ? opts.research
    : env('ANTHROPIC_API_KEY') ? claudeResearch(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureResearch() : null;
  const zoneAi = opts.zoneNames !== undefined ? opts.zoneNames
    : env('ANTHROPIC_API_KEY') ? claudeZoneNames(env('ANTHROPIC_API_KEY')!) : env('AI_RESEARCH_FIXTURE') === '1' ? fixtureZoneNames() : null;
  const perms = can(s.role);
  const requireUse = () => { if (!perms.useAccounts) throw new AdminError(403, 'Las cuentas del CRM son del equipo interno'); };
  const requireManager = () => { if (!perms.manageAccounts) throw new AdminError(403, 'Solo un/a admin o gerente'); };
  const t = s.tenantId;

  async function members(): Promise<Map<string, MemberRecord>> { return new Map((await admin.listMembers(t)).map((m) => [m.userId, m])); }
  const label = (m: MemberRecord | undefined) => (m ? m.displayName || m.email : null);
  async function allAccounts(): Promise<Account[]> { return accounts.listAccounts(t, { limit: 20000 }); }
  async function fields(): Promise<CrmField[]> { return (await accounts.listFields(t)).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label, 'es')); }

  function views(cs: Contact[], links: ContactLink[], accs: Map<string, Account>, ms: Map<string, MemberRecord>): PersonView[] {
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
      db.listContacts(t, { q: f.q, tag: f.tag || undefined, limit: Math.min(f.limit ?? 5000, 20000) }), allAccounts(), members(), db.listLinks(t, {}),
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
    const [accs, ms, links, fs] = await Promise.all([allAccounts(), members(), db.listLinks(t, { contactIds: [id] }), fields()]);
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

  /** Empresa por id o, si no existe, nueva con ese nombre (alta al vuelo). Devuelve su id. */
  async function companyFor(accountId: string | null | undefined, name: string | null | undefined, tag: string | null): Promise<string | null> {
    if (accountId) {
      const a = await accounts.getAccount(accountId);
      if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
      return a.id;
    }
    if (!name) return null;
    const same = (await accounts.listAccounts(t, { q: name, limit: 50 })).find((a) => norm(a.name) === norm(name));
    if (same) return same.id;
    try {
      return await accounts.insertAccount(t, { name, zoneId: null, segmentId: null, address: null, externalRef: null, notes: null, tags: tag ? [tag] : [] });
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
    const [links, accs] = await Promise.all([db.listLinks(t, { accountIds: [accountId] }), allAccounts()]);
    const cs = links.length ? await db.listContacts(t, { ids: links.map((l) => l.contactId), limit: 500 }) : [];
    return {
      people: cs.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, role: links.find((l) => l.contactId === c.id)?.role ?? null })),
      group: a.parentId ? accs.find((x) => x.id === a.parentId) ?? null : null,
      locales: accs.filter((x) => x.parentId === a.id),
      /** Candidatas a grupo: las que no están dentro de otro (un solo nivel). */
      groups: a.parentId || !accs.some((x) => x.parentId === a.id) ? accs.filter((x) => !x.parentId && x.id !== a.id).map((x) => ({ id: x.id, name: x.name })) : [],
    };
  }
  /** Mete una o varias empresas en un grupo (que ya existe o nuevo por su nombre), o las saca (null). */
  async function moveToGroup(accountIds: string[], target: { groupId?: string | null; groupName?: string | null }) {
    requireUse();
    const groupId = target.groupId || target.groupName?.trim() ? await companyFor(target.groupId || null, target.groupName?.trim() || null, null) : null;
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
    const rows = want.length <= 100 ? await accounts.listAccounts(t, { ids: want, limit: want.length }) : await allAccounts();
    return new Map(rows.filter((a) => want.includes(a.id)).map((a) => [a.id, a.name]));
  }
  /** Listas que existen en el espacio (para elegir vista o al importar). */
  async function lists(): Promise<Array<{ tag: string; accounts: number; people: number }>> {
    requireUse();
    const [accs, cs] = await Promise.all([allAccounts(), db.listContacts(t, { limit: 20000 })]);
    const m = new Map<string, { tag: string; accounts: number; people: number }>();
    for (const a of accs) for (const g of a.tags) { const x = m.get(g) ?? { tag: g, accounts: 0, people: 0 }; x.accounts++; m.set(g, x); }
    for (const c of cs) for (const g of c.tags) { const x = m.get(g) ?? { tag: g, accounts: 0, people: 0 }; x.people++; m.set(g, x); }
    return [...m.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  }

  // ---------------------------------------------------------------- importar

  async function imports() { requireManager(); return db.listImports(t, 20); }
  async function importStart(fileName: string, text: string, target: 'account' | 'contact'): Promise<string> {
    requireManager();
    const { headers, rows } = readCsv(text);
    if (!headers.length || !rows.length) throw new AdminError(422, 'El archivo está vacío');
    if (rows.length >= MAX_ROWS) throw new AdminError(422, 'Máximo 5000 filas por importación');
    const fs = await fields();
    const mapping = suggestMapping(profileColumns(headers, rows, target, fs), fs);
    try {
      return await db.createImport(t, { fileName: fileName.slice(0, 200) || 'importacion.csv', target, headers, rows, mapping });
    } catch (e) { mapError(e); }
  }
  async function loadImport(id: string): Promise<CrmImport> {
    requireManager();
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
    const acts = all.length ? await db.listActivities(t, all.map((a) => a.id), 20000) : [];
    const byAcc = new Map<string, Activity[]>();
    for (const x of acts) byAcc.set(x.accountId, [...(byAcc.get(x.accountId) ?? []), x]);
    const mine = all.map((a) => ({ a, cooling: coolingDays(byAcc.get(a.id) ?? [], now), bucket: dueBucket(a.nextStepAt, now) }))
      .filter((x) => x.cooling !== null || (x.bucket && ['overdue', 'today', 'tomorrow'].includes(x.bucket)));
    const counts = { cooling: 0, overdue: 0, today: 0, tomorrow: 0 };
    if (!mine.length) return { items: [] as TodayItem[], counts };
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
    if (q[key] === v) delete q[key]; else q[key] = v;
    try { await accounts.qualify(accountId, q as Qualification); } catch (e) { mapError(e); }
  }
  /** Días que lleva enfriándose cada empresa (solo las que se enfrían). */
  async function cooling(accountIds: string[]): Promise<Map<string, number>> {
    requireUse();
    const acts = accountIds.length ? await db.listActivities(t, accountIds, 20000) : [];
    const by = new Map<string, Activity[]>();
    for (const x of acts) by.set(x.accountId, [...(by.get(x.accountId) ?? []), x]);
    const now = new Date();
    const out = new Map<string, number>();
    for (const [id, list] of by) { const d = coolingDays(list, now); if (d !== null) out.set(id, d); }
    return out;
  }

  /**
   * Arreglo del FBD: el Instagram que se guardó en la persona y en realidad es del local («hohle_club» en «Hohle Club»)
   * pasa a la empresa. Solo si la empresa no tiene ya uno y el usuario se parece al nombre del local.
   */
  async function instagramToCompanies(apply: boolean) {
    requireManager();
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

  const requirePlaces = () => { if (!places) throw new AdminError(503, 'Falta GOOGLE_MAPS_API_KEY en el servidor'); return places; };
  async function zoneNameOf(a: Account) { return a.zoneId ? (await accounts.listZones(t)).find((z) => z.id === a.zoneId)?.name ?? '' : ''; }
  const toResearch = (p: PlaceResult) => ({ placeId: p.placeId, phone: p.phone, website: p.website, address: p.address, mapsUrl: p.mapsUrl, hours: p.hours, lat: p.lat, lng: p.lng, status: p.status });
  /** Candidatos de Google para una empresa (nombre + ciudad). */
  async function googleCandidates(accountId: string): Promise<PlaceResult[]> {
    requireUse();
    const api = requirePlaces();
    const a = await accounts.getAccount(accountId);
    if (!a || a.tenantId !== t) throw new AdminError(404, 'Cuenta no encontrada');
    try { return await api.search(`${a.name} ${await zoneNameOf(a)}`.trim()); } catch (e) { console.warn('[places]', e instanceof Error ? e.message : e); throw new AdminError(503, 'Google no ha respondido; prueba en un momento'); }
  }
  /** Usar este resultado: rellena huecos (teléfono, web, dirección, Maps) y guarda horario y ubicación. */
  async function googleApply(accountId: string, placeId: string) {
    requireUse();
    const api = requirePlaces();
    let p: PlaceResult | null;
    try { p = await api.details(placeId); } catch (e) { console.warn('[places]', e instanceof Error ? e.message : e); throw new AdminError(503, 'Google no ha respondido; prueba en un momento'); }
    if (!p) throw new AdminError(404, 'Cuenta no encontrada');
    try { await accounts.research(accountId, toResearch(p)); } catch (e) { mapError(e); }
  }
  /**
   * Completar en bloque (p. ej. «Valencia»): las que aún no se han buscado, hasta 20 por vez. Solo se usa el primer
   * resultado si su nombre se parece al de la empresa; si no, se queda para revisarla a mano.
   */
  async function googleFill(accountIds: string[]): Promise<{ filled: number; skipped: number; left: number }> {
    requireUse();
    const api = requirePlaces();
    const accs = (await allAccounts()).filter((a) => accountIds.includes(a.id) && !a.placeAt);
    const batch = accs.slice(0, 20);
    let filled = 0;
    let skipped = 0;
    const key = (x: string) => slugKey(x).replace(/-/g, '');
    for (const a of batch) {
      try {
        const r = (await api.search(`${a.name} ${await zoneNameOf(a)}`.trim()))[0];
        const k = key(a.name);
        if (r && k.length >= 3 && (key(r.name).includes(k) || k.includes(key(r.name)))) { await accounts.research(a.id, toResearch(r)); filled++; }
        else { await accounts.research(a.id, { placeId: '', phone: null, website: null, address: null, mapsUrl: null, hours: null, lat: null, lng: null, status: 'not_found' }); skipped++; }
      } catch (e) { console.warn('[places]', e instanceof Error ? e.message : e); skipped++; }
    }
    return { filled, skipped, left: accs.length - batch.length };
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
    if (a.aiResearchAt && Date.now() - Date.parse(a.aiResearchAt) < AI_COOLDOWN_MS) throw new AdminError(409, 'Se acaba de investigar; espera un par de minutos');
    const people = (await actorsOf(accountId)).map((c) => c.name);
    const known = Object.fromEntries(Object.entries(a.qualification ?? {}).filter(([, v]) => v !== undefined));
    let raw: unknown;
    try {
      raw = await ai.research({ name: a.name, city: (await zoneNameOf(a)) || null, address: a.address, website: a.website, instagram: a.instagram,
        sector: ctx.sector, seller: ctx.seller, known });
    } catch (e) { console.warn('[ai-research]', e instanceof Error ? e.message : e); throw new AdminError(503, 'La IA no ha respondido; prueba en un momento'); }
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
        if (q[sg.key] === undefined) {
          q[sg.key] = sg.value === 'true' ? true : sg.value;
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
    requireManager();
    const [{ zones, counts, empty }, fixes] = await Promise.all([zoneState(), accounts.listFixes(t, 'zones').catch(() => [])]);
    const parents = new Set(zones.map((z) => z.parentId).filter(Boolean));
    const raws = [...new Map(zones.filter((z) => (counts.get(z.id) ?? 0) > 0 && !parents.has(z.id)).map((z) => [norm(z.name), z.name])).values()];
    return { raws, zones: zones.length, empty: empty.length, last: fixes.find((f) => !f.undoneAt) ?? null, hasAi: !!zoneAi, chunk: ZONES_CHUNK };
  }
  /** Clasificar con IA un trozo de textos (lo pide el navegador, trozo a trozo). */
  async function zonesClassify(raws: unknown) {
    requireManager();
    if (!zoneAi) throw new AdminError(503, 'Falta ANTHROPIC_API_KEY en el servidor');
    const list = Array.isArray(raws) ? raws.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.slice(0, 200)).slice(0, ZONES_CHUNK) : [];
    if (!list.length) throw new AdminError(422, 'Datos no válidos');
    try { return await zoneAi.classify(list); } catch (e) { console.warn('[zones-ai]', e instanceof Error ? e.message : e); throw new AdminError(503, 'La IA no ha respondido; prueba en un momento'); }
  }
  /** El plan con lo que dijo la IA (para la vista previa; no toca nada). */
  async function zonesPlan(classes: unknown) {
    requireManager();
    const { zones, counts } = await zoneState();
    return buildZonePlan(zones, counts, sanitizePlaces({ places: classes }, zones.map((z) => z.name)));
  }
  /**
   * Aplicar: crea las zonas que faltan (Comunidad › Provincia › Pueblo), mueve las empresas, pasa la nota del Notion a
   * sus notas y marca «revisar-ciudad» las dudosas y las que no son un sitio. `skip`: zonas que el admin ha desmarcado.
   */
  async function zonesApply(classes: unknown, skip: string[] = []) {
    requireManager();
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
    requireManager();
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
  /** Borrar las ciudades que se han quedado vacías (sin empresas ni nadie asignado). */
  async function zonesCleanup() {
    requireManager();
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
    zonesOverview, zonesClassify, zonesPlan, zonesApply, zonesUndo, zonesCleanup,
    routePlan, googleCandidates, googleApply, googleFill, hasGoogle: () => !!places,
    weights, saveWeights, qualify, cooling,
    setCompanyContact, timeline, logActivity, setNextStep, deleteActivity, today, instagramToCompanies,
    people, person, similar, quickAdd, updatePerson, setPersonFields, deletePerson, setOwner, link, unlink,
    company, moveToGroup, setTags, lists, names,
    imports, importStart, importDraft, importPreview, importRun, importUndo,
  };
}
export type CrmService = ReturnType<typeof createCrmService>;

export const emptyCrmDb: CrmDb = {
  async listContacts() { return []; }, async getContact() { return null; }, async insertContacts() { throw new Error('sin CRM'); },
  async updateContact() { return false; }, async deleteContact() { return false; }, async listLinks() { return []; }, async saveLinks() {},
  async removeLink() { return false; }, async createImport() { throw new Error('sin CRM'); }, async getImport() { return null; },
  async listImports() { return []; }, async updateImport() { return false; }, async deleteContactsByImport() { return 0; },
  async listActivities() { return []; }, async insertActivity() { throw new Error('sin CRM'); }, async deleteActivity() { return false; },
};
