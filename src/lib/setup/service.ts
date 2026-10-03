/**
 * Asistente de configuración (docs/SETUP_WIZARD.md): el CEO o líder prepara el mercado y las situaciones de su empresa.
 * Solo AÑADE lo que falta (por clave): aplicar un punto de partida nunca borra ni cambia lo que ya existe.
 */
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import type { AdminSession } from '../admin/types';
import type { EvidenceService } from '../evidence/service';
import type { PlaybookService } from '../playbook/service';
import { slug } from '../evidence/schema';
import { PRESETS } from './presets';

export function createSetupService(s: AdminSession, deps: { playbook: PlaybookService; evidence: EvidenceService }) {
  const requireAdmin = () => { if (!can(s.role).managePlaybook) throw new AdminError(403, 'Solo un admin o el jefe/a de ventas configura la empresa'); };

  async function status() {
    requireAdmin();
    const [market, facets, all] = await Promise.all([deps.playbook.market(), deps.evidence.facets({ all: true }), deps.playbook.listAll()]);
    const personas = market.flatMap((x) => x.personas);
    return {
      segments: market,
      personas,
      facets,
      checks: {
        segments: market.length > 0,
        personas: personas.length > 0,
        blockers: personas.some((p) => p.role === 'guardian' || !!p.canBlock),
        facets: facets.some((f) => f.status === 'official'),
        plays: all.plays.some((p) => p.status === 'official'),
      },
    };
  }

  async function applyPreset(key: string) {
    requireAdmin();
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) throw new AdminError(404, 'Punto de partida no encontrado');
    const st = await status();
    const created = { segments: 0, personas: 0, facets: 0 };
    const segKeys = new Map(st.segments.map((x) => [x.key, x.id]));
    const perKeys = new Set(st.personas.map((x) => x.key));
    for (const sg of preset.segments) {
      let id = segKeys.get(sg.key);
      if (!id) {
        id = await deps.playbook.saveSegment({ key: sg.key, name: sg.name, description: sg.description, icon: sg.icon, status: 'official' });
        segKeys.set(sg.key, id);
        created.segments++;
      }
      for (const p of sg.personas) {
        if (perKeys.has(p.key)) continue;
        await deps.playbook.savePersona({ segmentId: id, key: p.key, name: p.name, role: p.role, canBlock: p.canBlock ?? null, canHelp: p.canHelp ?? null, goals: p.goals ?? null });
        perKeys.add(p.key);
        created.personas++;
      }
    }
    const facetKeys = new Set(st.facets.map((f) => f.key));
    for (const f of preset.facets) {
      if (facetKeys.has(f.key)) continue;
      await deps.evidence.saveFacet({ ...f, options: f.options.map((o) => ({ ...o, key: slug(o.label) })) });
      created.facets++;
    }
    return created;
  }

  return { status, applyPreset };
}

export type SetupService = ReturnType<typeof createSetupService>;
