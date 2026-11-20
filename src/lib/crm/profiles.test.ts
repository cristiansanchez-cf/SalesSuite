import { describe, expect, test } from 'vitest';
import { cleanStyle, customStyles, djPriority, isCustomStyle, offStyle, promoterFit, promoterPriority } from './profiles';
import { priorityFor } from './score';
import { setQual, validQual } from './priority';

describe('fichas de promotora y DJ (§24)', () => {
  test('promotora de dinámicas e internacional: nota alta, le encajan peticiones, pantalla y álbum; sin fidelización', () => {
    const p = promoterPriority({ pdyn: 'yes', pstyle: ['international', 'latin'], pevents: '4+', pcontent: 'yes', pagent: 'maybe' });
    expect(p).toMatchObject({ score: 95, qualified: true, out: false, kind: 'promoter' });
    expect(p.fit).toEqual({ screen: 'yes', requests: 'yes', photos: 'yes', loyalty: null });
  });
  test('techno o «cartel de DJs» solo: el estilo no puntúa y avisa (se suelen descartar)', () => {
    expect(offStyle({ pstyle: ['techno', 'lineup'] }, 'pstyle')).toBe(true);
    expect(offStyle({ pstyle: ['techno', 'latin'] }, 'pstyle')).toBe(false);
    expect(promoterFit({ pstyle: ['techno'] }).requests).toBe('no');
    expect(promoterPriority({ pstyle: ['techno'] }).parts.find((x) => x.key === 'pstyle')!.points).toBe(0);
  });
  test('DJ: residente que quiere darse a conocer y con pocos miles de seguidores es el bueno; el grande no', () => {
    expect(djPriority({ dres: 'yes', dfollow: '1-10k', dgrow: 'yes', dstyle: ['commercial'] })).toMatchObject({ score: 100, qualified: true });
    expect(djPriority({ dres: 'no', dfollow: '50k+', dgrow: 'no' }).score).toBe(18);
  });
  test('la nota depende de la ficha del tipo', () => {
    expect(priorityFor({ pdyn: 'yes' }, 'promoter', null).score).toBe(35);
    expect(priorityFor({ nights: '4+' }, 'venue', 'ocio-nocturno').parts[0].key).toBe('recurrence');
    expect(priorityFor({ debt: true, pdyn: 'yes' }, 'promoter', null)).toMatchObject({ out: true, score: 0 });
  });
  test('estilo de varios: se marca y desmarca de uno en uno', () => {
    const q: Record<string, unknown> = {};
    setQual(q, 'pstyle', 'latin', true); setQual(q, 'pstyle', 'erasmus', true); expect(q.pstyle).toEqual(['latin', 'erasmus']);
    setQual(q, 'pstyle', 'latin', true); expect(q.pstyle).toEqual(['erasmus']);
  });
});

describe('estilos propios («añadir más»)', () => {
  test('se limpian; si es uno de la lista, su clave', () => {
    expect(cleanStyle('  Flamenco  ')).toBe('Flamenco');
    expect(cleanStyle('Rock: 80s <b>')).toBe('Rock 80s b');
    expect(cleanStyle('Techno')).toBe('techno');
    expect(isCustomStyle('Flamenco')).toBe(true);
    expect(isCustomStyle('techno')).toBe(false);
    expect(isCustomStyle('a')).toBe(false);
    expect(isCustomStyle('x:y')).toBe(false);
  });
  test('se guardan en la lista de estilos y cuentan como que encaja', () => {
    const q: Record<string, unknown> = { pstyle: ['techno'] };
    expect(offStyle(q, 'pstyle')).toBe(true);
    setQual(q, 'pstyle', 'Flamenco');
    expect(q.pstyle).toEqual(['techno', 'Flamenco']);
    expect(customStyles(q, 'pstyle')).toEqual(['Flamenco']);
    expect(offStyle(q, 'pstyle')).toBe(false);
    expect(validQual('pstyle', 'Flamenco')).toBe(true);
    expect(validQual('pdyn', 'Flamenco')).toBe(false);
    setQual(q, 'pstyle', 'Flamenco', true);
    expect(q.pstyle).toEqual(['techno']);
  });
});
