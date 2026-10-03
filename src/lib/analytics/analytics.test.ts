import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { trackDemoView } from './db-demo';
import { overviewOf, sectionsOf, statsOf } from './stats';
import type { DossierVisit } from './types';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const ITEM = '00000000-0000-4000-8000-00000017e001';
const view = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = (n: number, over: Partial<Parameters<typeof trackDemoView>[2]> = {}) =>
  ({ viewId: view(n), visitor: 'visitor-abc123', device: 'mobile' as const, durationMs: 5000, scroll: 30, sections: { [ITEM]: 2000 }, ...over });

describe('registro de visitas (= public.track_dossier_view)', () => {
  beforeEach(() => { resetDemoDb(); demoDb().dossier_view = []; demoDb().notification = []; });

  test('enlace válido: crea la visita y la amplía sin bajar nunca', () => {
    expect(trackDemoView('demo-sala-x-7Qm2', ENJOY, input(1))).toBe(true);
    expect(trackDemoView('demo-sala-x-7Qm2', ENJOY, input(1, { durationMs: 3000, scroll: 80, sections: { [ITEM]: 500, 'no-es-un-item': 9 } }))).toBe(true);
    const [v] = demoDb().dossier_view;
    expect(v).toMatchObject({ duration_ms: 5000, max_scroll: 80, sections: { [ITEM]: 2000 } });
  });

  test('no cuenta enlaces revocados, borradores, de otra empresa ni visitas secuestradas', () => {
    expect(trackDemoView('demo-revoked-Zt4c', ENJOY, input(2))).toBe(false);
    expect(trackDemoView('demo-draft-Kp9wQ1', ENJOY, input(3))).toBe(false);
    expect(trackDemoView('demo-sala-x-7Qm2', ALT, input(4))).toBe(false);
    expect(trackDemoView('demo-sala-x-7Qm2', ENJOY, input(5))).toBe(true);
    expect(trackDemoView('demo-sala-x-7Qm2', ENJOY, input(5, { visitor: 'otro-visitante' }))).toBe(false);
  });

  test('freno al abuso: 20 visitas nuevas por navegador y hora', () => {
    for (let i = 0; i < 20; i++) expect(trackDemoView('demo-sala-x-7Qm2', ENJOY, input(100 + i))).toBe(true);
    expect(trackDemoView('demo-sala-x-7Qm2', ENJOY, input(200))).toBe(false);
  });

  test('avisa al autor una vez al día', () => {
    demoDb().dossier.find((d) => d.id === SALA_X)!.author_id = '11111111-1111-4111-8111-111111111111';
    trackDemoView('demo-sala-x-7Qm2', ENJOY, input(6));
    trackDemoView('demo-sala-x-7Qm2', ENJOY, input(7, { visitor: 'otro-navegador' }));
    expect(demoDb().notification.filter((n) => n.kind === 'dossier_opened')).toHaveLength(1);
  });
});

describe('cálculos', () => {
  const h = (hours: number) => new Date(Date.UTC(2026, 9, 3, 12) - hours * 3_600_000).toISOString();
  const now = new Date(Date.UTC(2026, 9, 3, 12));
  const v = (dossierId: string, visitor: string, at: number, ms: number, device: DossierVisit['device'] = 'desktop', sections = {}): DossierVisit =>
    ({ id: `${dossierId}-${at}`, dossierId, visitor, device, startedAt: h(at), lastSeenAt: h(at), durationMs: ms, maxScroll: 50, sections });

  test('estadísticas de un dossier', () => {
    const s = statsOf([v('a', 'x', 10, 60_000, 'mobile'), v('a', 'x', 2, 30_000), v('a', 'y', 5, 90_000)]);
    expect(s).toMatchObject({ opens: 3, visitors: 2, totalMs: 180_000, avgMs: 60_000, firstAt: h(10), lastAt: h(2) });
    expect(s.mobileShare).toBeCloseTo(1 / 3);
    expect(statsOf([])).toMatchObject({ opens: 0, visitors: 0, avgMs: 0, lastAt: null });
  });

  test('secciones: en el orden del dossier, con la más leída marcada', () => {
    const r = sectionsOf([v('a', 'x', 1, 0, 'desktop', { i1: 1000, i2: 3000 }), v('a', 'y', 1, 0, 'desktop', { i2: 1000 })],
      [{ id: 'i1', name: 'Portada' }, { id: 'i2', name: 'Precio' }, { id: 'i3', name: 'Galería' }]);
    expect(r.map((x) => [x.name, x.ms, x.top])).toEqual([['Portada', 1000, false], ['Precio', 4000, true], ['Galería', 0, false]]);
    expect(r[1].share).toBeCloseTo(0.8);
  });

  test('listas de seguimiento: escríbele hoy, abiertas hace poco, nadie la ha abierto', () => {
    const d = (id: string, publishedHoursAgo: number, nextStepAt: string | null = null, outcome: 'open' | 'won' | 'lost' = 'open') =>
      ({ id, status: 'published', outcome, publishedAt: h(publishedHoursAgo), nextStepAt });
    const dossiers = [d('abierta', 100), d('con-paso', 100, h(-24)), d('ganada', 100, null, 'won'), d('sin-abrir', 72), d('recien', 10), { ...d('borrador', 5), status: 'draft' }];
    const o = overviewOf(dossiers, [v('abierta', 'x', 3, 1000), v('con-paso', 'x', 60, 1000), v('ganada', 'x', 1, 1000)], now);
    expect(o.noFollowUp.map((r) => r.dossier.id)).toEqual(['abierta']);
    expect(o.hot.map((r) => r.dossier.id).sort()).toEqual(['abierta', 'ganada']);
    expect(o.neverOpened.map((r) => r.dossier.id)).toEqual(['sin-abrir']);
    expect(o.summary).toMatchObject({ published: 5, opened: 3 });
    expect(o.summary.openRate).toBeCloseTo(0.6);
  });
});
