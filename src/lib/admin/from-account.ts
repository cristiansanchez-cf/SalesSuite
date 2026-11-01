/**
 * Crear una propuesta desde una empresa del CRM (docs/PROPOSAL_PRESETS.md §Desde la ficha): nace con lo que ya sabe su
 * ficha (sector, receta con sus respuestas, estilo) y con quién hablar. La usan la ficha de la empresa («Crear
 * propuesta») y el modal «Nueva propuesta» al elegir una empresa del CRM.
 */
import { profileOf } from '../accounts/types';
import type { AdminContext } from './auth';

export async function dossierFromAccount(admin: AdminContext, accountId: string, o: { title?: string; prospectName?: string; fromDossierId?: string } = {}): Promise<string> {
  const [a, kinds, segs, people] = await Promise.all([
    admin.accounts.get(accountId).then((x) => x.account), admin.accounts.kinds(), admin.playbook.segmentList(),
    admin.crm.company(accountId).then((c) => c.people).catch(() => []),
  ]);
  return admin.service.createFromAccount({
    title: o.title?.trim() || a.name, prospectCompany: a.name, prospectName: o.prospectName?.trim().slice(0, 120) || people[0]?.name?.slice(0, 120) || undefined,
    ...(o.fromDossierId ? { fromDossierId: o.fromDossierId } : {}),
    accountId, segmentIds: segs.map((x) => x.id),
    facts: { segmentId: a.segmentId, profile: profileOf(kinds, a.kind), kind: a.kind, qualification: (a.qualification ?? {}) as Record<string, unknown> },
  });
}
