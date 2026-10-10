/** Lo que la investigación con IA necesita saber de nuestro lado: el sector de la empresa y qué vende el equipo. */
import type { AdminContext } from '../admin/auth';
import type { ResearchInput } from './research';

export async function researchContext(admin: AdminContext, segmentId: string | null): Promise<{ sector: ResearchInput['sector']; seller: string }> {
  const [segs, seller] = await Promise.all([admin.playbook.market(), admin.playbook.sellerLine()]);
  const sg = segs.find((x) => x.id === segmentId);
  return { seller, sector: sg ? { name: sg.name, icp: sg.icp, personas: (sg.personas ?? []).map((p) => p.name) } : null };
}
