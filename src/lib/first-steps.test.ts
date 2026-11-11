import { describe, expect, it } from 'vitest';
import { adminSteps, progressOf, repSteps } from './first-steps';

describe('primeros pasos', () => {
  it('admin: un espacio nuevo no tiene nada hecho', () => {
    const s = adminSteps({ segments: 0, hasLogo: false, members: 1, leadsReady: false, assistantOn: false });
    expect(s.map((x) => x.key)).toEqual(['company', 'brand', 'team', 'leads', 'assistant']);
    expect(progressOf(s)).toEqual({ done: 0, total: 5, finished: false });
  });

  it('admin: con todo hecho, desaparece', () => {
    expect(progressOf(adminSteps({ segments: 2, hasLogo: true, members: 3, leadsReady: true, assistantOn: true })).finished).toBe(true);
  });

  it('comercial: sin móvil, «escribe al asistente» lleva a Mi cuenta; con móvil, a WhatsApp', () => {
    const before = repSteps({ hasPhone: false, talkedToAssistant: false, assistantLink: 'https://wa.me/34600000000?text=Hola', proposals: 0 });
    expect(before[1]).toMatchObject({ key: 'assistant', href: '/admin/account#asistente', external: false });
    const after = repSteps({ hasPhone: true, talkedToAssistant: false, assistantLink: 'https://wa.me/34600000000?text=Hola', proposals: 1 });
    expect(after[1]).toMatchObject({ href: 'https://wa.me/34600000000?text=Hola', external: true });
    expect(progressOf(after)).toEqual({ done: 2, total: 3, finished: false });
  });

  it('comercial: sin asistente activo, no hay enlace a WhatsApp', () => {
    expect(repSteps({ hasPhone: true, talkedToAssistant: false, assistantLink: null, proposals: 0 })[1].href).toBe('/admin/account#asistente');
  });
});
