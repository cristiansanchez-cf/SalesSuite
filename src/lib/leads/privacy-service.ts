/**
 * Derechos y borrado en la consola (docs/LEADS.md §Privacidad), solo para un/a admin del espacio. Lee y borra con
 * service role (la base de datos no deja a nadie con sesión borrar leads); el permiso se comprueba aquí y cada
 * exportación o supresión queda registrada con quién y cuándo.
 */
import { z } from 'zod';
import type { AdminContext } from '../admin/auth';
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import { eraseSubject, exportOf, purgeTenant, retentionOf, subjectData, subjectHash } from './privacy';
import { leadsRuntime } from './server';

export const PRIVACY_ERRORS = { badEmail: 'Escribe un email válido', confirm: 'Para suprimir, escribe el email otra vez tal cual' } as const;
const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function privacyFor(admin: AdminContext) {
  if (!can(admin.session.role).manageTenant) throw new AdminError(403, 'Sin permiso para esta operación');
  const rt = await leadsRuntime();
  if ('error' in rt) throw new AdminError(503, rt.error);
  const t = admin.session.tenantId;
  const p = rt.privacy;
  const email = (v: string) => { const r = emailSchema.safeParse(v); if (!r.success) throw new AdminError(422, PRIVACY_ERRORS.badEmail); return r.data; };
  const settings = async () => { const s = await rt.db.settings(t); if (!s) throw new AdminError(404, 'Leads sin configurar en este espacio'); return s; };

  return {
    /** Qué hay de esa persona (sin registrar: buscar no es una petición). */
    async search(v: string) { return subjectData(p, t, email(v), rt.secret); },
    /** Todo en JSON para entregárselo; queda registrado. */
    async exportData(v: string, space: string) {
      const d = await subjectData(p, t, email(v), rt.secret);
      const out = exportOf(d, space, new Date());
      await p.logRequest({ tenantId: t, kind: 'export', subjectHash: d.subject, byUser: admin.session.userId,
        summary: { leads: d.leads.length, contacts: d.crm.contacts.length, activities: d.crm.activities.length, emails: d.crm.inbound.length } });
      return out;
    },
    /** Suprimir: hay que escribir el email dos veces. */
    async erase(v: string, confirm: string, suppress: boolean) {
      const e = email(v);
      if (confirm.trim().toLowerCase() !== e) throw new AdminError(422, PRIVACY_ERRORS.confirm);
      const s = await settings();
      const d = await subjectData(p, t, e, rt.secret);
      return eraseSubject(p, rt.db, d, { tenantId: t, byUser: admin.session.userId, suppress, now: new Date(), proofYears: retentionOf(s).proofYears, secret: rt.secret });
    },
    /** El borrado de los plazos, ahora (además del diario). */
    async purgeNow() { return purgeTenant(p, await settings(), new Date(), rt.secret); },
    timezone: async () => (await rt.db.settings(t))?.timezone ?? 'Europe/Madrid',
    purges: (n = 10) => p.purges(t, n),
    requests: (n = 20) => p.requests(t, n),
    subjectOf: (v: string) => subjectHash(email(v), rt.secret),
  };
}
export type PrivacyService = Awaited<ReturnType<typeof privacyFor>>;
