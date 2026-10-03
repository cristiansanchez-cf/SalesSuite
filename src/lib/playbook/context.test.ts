import { describe, expect, test } from 'vitest';
import { buildContext, type ContextData } from './context';

const base: ContextData = {
  tenantName: 'Enjoy', companyPitch: null, messageType: 'seguimiento', channel: 'whatsapp', objection: null, notes: null,
  segment: null, persona: null, contact: null, state: null, publicUrl: null, plays: [],
};

describe('contexto para el Cerebro', () => {
  test('sin actor ni sector: «el cliente», nunca un nombre', () => {
    const c = buildContext(base);
    expect(c.cerebro.situacion).toMatch(/el cliente$/);
    expect(c.cerebro.etapa).toBe('Seguimiento');
  });

  test('lo leído de la propuesta entra en la situación, sin nombres de secciones', () => {
    const c = buildContext({ ...base, reading: { opens: 3, visitors: 2, lastAt: null, topSection: 'Tarjeta de precio', priceFocus: true } });
    expect(c.cerebro.situacion).toContain('ha abierto la propuesta 3 veces y donde más se ha parado es en el precio');
    expect(c.cerebro.situacion).not.toContain('Tarjeta');
    const once = buildContext({ ...base, reading: { opens: 1, visitors: 1, lastAt: null, topSection: 'Galería', priceFocus: false } });
    expect(once.cerebro.situacion).toContain('ha abierto la propuesta una vez');
    expect(once.cerebro.situacion).not.toContain('precio');
  });
});
