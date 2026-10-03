import { describe, expect, it } from 'vitest';
import { sectorRank } from './market';
import { serverTiming } from '../timing';

describe('sectorRank', () => {
  it('ordena por el primer sector que usa el módulo; el sector despriorizado y los sueltos, al final', () => {
    const rank = sectorRank([{ modules: ['exp', 'precio'] }, { modules: [{ moduleId: 'sala' }] }, { modules: ['portada-bodas', 'exp'] }]);
    const sorted = ['portada-bodas', 'suelto', 'sala', 'precio', 'exp'].sort((a, b) => rank(a) - rank(b));
    expect(sorted).toEqual(['precio', 'exp', 'sala', 'portada-bodas', 'suelto']);
  });
});

describe('serverTiming', () => {
  it('mide cada tramo desde el anterior y el total', () => {
    let t = 0;
    const st = serverTiming(() => t);
    t = 5; st.mark('tenant');
    t = 25; st.mark('auth');
    expect(st.header()).toBe('tenant;dur=5, auth;dur=20, total;dur=25');
    expect(st.total()).toBe(25);
  });
});
