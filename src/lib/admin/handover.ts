/**
 * Traspasar lo de alguien (docs/ORG.md §Traspasar): cuando un comercial se va (o se le quita del equipo), sus propuestas
 * abiertas y sus empresas reservadas pasan a quien diga el admin: todo a él mismo, todo a otra persona o repartido
 * (criterio de Cristian: «un a mí y el desplegable con el resto del equipo… o mitad y mitad»). Las propuestas cerradas
 * se quedan con quien las hizo (cuentan en sus comisiones).
 */
import { can } from './permissions';
import type { DossierSummary } from './types';
import type { AccountView } from '../accounts/service';

type Admin = NonNullable<App.Locals['admin']>;
export interface HandoverPerson { userId: string; name: string; member: boolean; dossiers: number; accounts: number }
export interface Handover { person: HandoverPerson; dossiers: DossierSummary[]; accounts: AccountView[]; targets: Array<{ userId: string; name: string }> }
export interface HandoverMove { kind: 'dossier' | 'account'; id: string; to: string }

const openOf = (ds: DossierSummary[], userId?: string) =>
  ds.filter((d) => !!d.authorId && d.outcome === 'open' && d.status !== 'archived' && (!userId || d.authorId === userId));

/** Quién tiene algo a su nombre (equipo y antiguos), con cuánto. Solo admin; si no, vacío. */
export async function handoverPeople(admin: Admin): Promise<HandoverPerson[]> {
  if (!can(admin.session.role).manageTenant) return [];
  const [ds, owners, members] = await Promise.all([
    admin.service.listDossiers({ kind: 'all' }), admin.accounts.ownerCounts().catch(() => new Map<string, number>()), admin.tenantAdmin.listMembers(),
  ]);
  const byAuthor = new Map<string, number>();
  for (const d of openOf(ds)) byAuthor.set(d.authorId!, (byAuthor.get(d.authorId!) ?? 0) + 1);
  const ids = [...new Set([...byAuthor.keys(), ...owners.keys()])];
  const team = new Map(members.map((m) => [m.userId, m.displayName || m.email]));
  const names = await admin.service.userNames(ids.filter((id) => !team.has(id))).catch(() => new Map<string, string>());
  return ids.map((userId) => ({
    userId, member: team.has(userId), name: team.get(userId) ?? names.get(userId) ?? '—',
    dossiers: byAuthor.get(userId) ?? 0, accounts: owners.get(userId) ?? 0,
  })).sort((a, b) => Number(a.member) - Number(b.member) || a.name.localeCompare(b.name, 'es'));
}

export async function handoverOf(admin: Admin, userId: string): Promise<Handover | null> {
  if (!can(admin.session.role).manageTenant) return null;
  const [ds, accounts, members] = await Promise.all([admin.service.listDossiers({ kind: 'all' }), admin.accounts.ownedBy(userId), admin.tenantAdmin.listMembers()]);
  const dossiers = openOf(ds, userId);
  const member = members.find((m) => m.userId === userId);
  const name = member ? member.displayName || member.email : (await admin.service.userNames([userId]).catch(() => new Map<string, string>())).get(userId) ?? dossiers[0]?.authorName ?? '—';
  const me = admin.session.userId;
  const targets = members.filter((m) => m.userId !== userId && m.role !== 'partner')
    .map((m) => ({ userId: m.userId, name: m.displayName || m.email }))
    .sort((a, b) => Number(b.userId === me) - Number(a.userId === me) || a.name.localeCompare(b.name, 'es'));
  return { person: { userId, name, member: !!member, dossiers: dossiers.length, accounts: accounts.length }, dossiers, accounts, targets };
}

/** Hace el traspaso: cada cosa a quien diga; lo que no tiene destino se queda como está. */
export async function handoverApply(admin: Admin, from: string, moves: HandoverMove[]): Promise<{ dossiers: number; accounts: number }> {
  const pick = (k: HandoverMove['kind']) => moves.filter((m) => m.kind === k && m.to).map(({ id, to }) => ({ id, to }));
  const dossiers = pick('dossier').length ? await admin.service.handOverDossiers(from, pick('dossier')) : 0;
  const accounts = pick('account').length ? await admin.accounts.handOver(from, pick('account')) : 0;
  return { dossiers, accounts };
}

/** Lo que llega del formulario: «d:<id>» y «a:<id>» con el id de destino (vacío = sin cambiar). */
export function movesFromForm(f: FormData): HandoverMove[] {
  const out: HandoverMove[] = [];
  for (const [k, v] of f.entries()) {
    const m = /^([da]):([0-9a-f-]{36})$/i.exec(k);
    const to = String(v).trim();
    if (m && /^[0-9a-f-]{36}$/i.test(to)) out.push({ kind: m[1] === 'd' ? 'dossier' : 'account', id: m[2]!, to });
  }
  return out;
}
