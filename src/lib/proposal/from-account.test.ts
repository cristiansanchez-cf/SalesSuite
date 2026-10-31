import { describe, expect, it } from 'vitest';
import { inheritedAnswers, inheritedStyle, pickSegment, type AccountFacts } from './from-account';
import { proposalSchema, type Proposal } from './preset';

const recipe = (fromAccount: unknown): Proposal => proposalSchema.parse({
  blocks: { a: { module: 'm' } }, modes: { full: ['a'] },
  choices: [{ key: 'tipo', label: 'Tipo', default: 'estandar', options: [{ key: 'estandar', label: 'E' }, { key: 'grupo', label: 'G' }] }],
  questions: [{ key: 'dj', label: 'DJ', rules: [{ remove: 'a' }] }, { key: 'sin-pantalla', label: 'Sin', rules: [{ remove: 'a' }] }],
  fromAccount,
});
const facts = (q: Record<string, unknown>, o: Partial<AccountFacts> = {}): AccountFacts => ({ segmentId: null, profile: 'venue', kind: 'local', qualification: q, ...o });

describe('propuesta desde la ficha', () => {
  const nightlife = recipe({
    match: { profile: ['venue'] },
    answers: [
      { answer: 'tipo:grupo', if: { scale: ['group'] } },
      { answer: 'sin-pantalla', if: { screens: ['no'] } },
      { answer: 'dj', if: { dj: ['resident', 'both'] } },
    ],
    musicStyle: { from: ['pstyle'], map: { latin: 'reggaeton' } },
  });

  it('marca lo que su ficha contesta, y nada más', () => {
    expect(inheritedAnswers(nightlife, facts({ scale: 'group', screens: 'no', dj: 'both' }))).toEqual(['tipo:grupo', 'sin-pantalla', 'dj']);
    expect(inheritedAnswers(nightlife, facts({ screens: 'yes', dj: 'guests' }))).toEqual([]);
    expect(inheritedAnswers(nightlife, facts({}))).toEqual([]);
  });

  it('su sector manda; si no tiene, el que más encaja', () => {
    const festival = recipe({ match: { profile: ['venue'], format: ['festival'] } });
    const promo = recipe({ match: { profile: ['promoter'] } });
    const rs = [{ id: 'noche', proposal: nightlife }, { id: 'fest', proposal: festival }, { id: 'promo', proposal: promo }, { id: 'sin', proposal: null }];
    expect(pickSegment(facts({}, { segmentId: 'suyo' }), rs)).toBe('suyo');
    expect(pickSegment(facts({ format: ['club'] }), rs)).toBe('noche');
    expect(pickSegment(facts({ format: ['festival'] }), rs)).toBe('fest');
    expect(pickSegment(facts({}, { profile: 'promoter' }), rs)).toBe('promo');
    expect(pickSegment(facts({}, { profile: 'company' }), rs)).toBeNull();
  });

  it('el estilo de sus canciones sale del primero que tenga equivalente', () => {
    expect(inheritedStyle(nightlife, facts({ pstyle: ['techno', 'latin'] }))).toBe('reggaeton');
    expect(inheritedStyle(nightlife, facts({ pstyle: ['techno'] }))).toBeNull();
    expect(inheritedStyle(recipe(undefined), facts({ pstyle: ['latin'] }))).toBeNull();
  });

  it('una respuesta que la receta no tiene se ignora (la receta sigue valiendo)', () => {
    const r = recipe({ answers: [{ answer: 'karaoke', if: { format: ['pub'] } }, { answer: 'tipo:caseta', if: { format: ['pub'] } }, { answer: 'dj', if: { format: ['pub'] } }] });
    expect(inheritedAnswers(r, facts({ format: ['pub'] }))).toEqual(['dj']);
  });
});
