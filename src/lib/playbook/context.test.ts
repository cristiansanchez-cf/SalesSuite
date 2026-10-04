import { describe, expect, test } from 'vitest';
import { buildContext, pickPlays, type ContextData } from './context';
import type { PersonaView, Segment } from './market';
import type { PlayView } from './types';

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

describe('jugadas para el mensaje (pickPlays)', () => {
  const pv = (key: string, o: Partial<PlayView> = {}): PlayView => ({
    id: key, tenantId: 't', moduleId: null, key, kind: 'tip', stage: null, objection: null, segments: [], personas: [], audience: 'all',
    title: key, body: '', whenToUse: null, whyItWorks: null, techniqueRefs: [], position: 0, status: 'official', version: 1,
    authorId: null, updatedBy: null, createdAt: null, updatedAt: null, score: { worked: 0, didnt: 0, mine: null }, evidence: { used: 0, won: 0, lost: 0 }, ...o,
  });
  const seg = (key: string) => ({ key }) as Segment;
  const persona = { key: 'dueno' } as PersonaView;

  test('el sector filtra, no puntúa: una jugada de bodas con el actor exacto no entra en una discoteca', () => {
    const plays = [
      pv('bodas-dueno', { segments: ['bodas'], personas: ['dueno'] }),
      pv('noche-general', { segments: ['ocio-nocturno'], stage: 'seguimiento' }),
    ];
    const r = pickPlays(plays, { segment: seg('ocio-nocturno'), persona, messageType: 'seguimiento', objection: null });
    expect(r.map((p) => p.key)).toEqual(['noche-general']);
  });

  test('las piezas de «Por qué existimos» no entran en un mensaje', () => {
    const r = pickPlays([pv('vision', { about: true, stage: 'seguimiento' }), pv('seg', { stage: 'seguimiento' })], { segment: null, persona: null, messageType: 'seguimiento', objection: null });
    expect(r.map((p) => p.key)).toEqual(['seg']);
  });
});
