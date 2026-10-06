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
  companies: Array<{ accountId: string; name: string; role: string | null; groupName: string | null }>;
  ownerName: string | null;
}

export function createCrmService(db: CrmDb, accounts: AccountsDb, admin: AdminDb, s: AdminSession) {
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
        return { accountId: a.id, name: a.name, role: l.role, groupName: a.parentId ? accs.get(a.parentId)?.name ?? null : null };
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
        if (JSON.stringify([fieldsNext, tagsNext, notesNext, zoneNext, parentNext]) === JSON.stringify([cur.fields, cur.tags, cur.notes, cur.zoneId, cur.parentId])) continue;
        undo.accounts.push({ id: cur.id, before: { fields: cur.fields, tags: cur.tags, notes: cur.notes, zoneId: cur.zoneId, parentId: cur.parentId } });
        await accounts.updateAccount(cur.id, { fields: fieldsNext, tags: tagsNext, notes: notesNext, zoneId: zoneNext, parentId: parentNext });
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

  return {
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
};
