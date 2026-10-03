import { describe, expect, it } from 'vitest';
import { partsFor } from './steps';

describe('phone-tour en diapositivas', () => {
  it('todo activado: 1–3, 4–6 y álbum + canciones', () => {
    const p = partsFor({});
    expect(p.map((x) => x.keys)).toEqual([['scan', 'home', 'sheet'], ['form', 'pending', 'live'], ['album', 'songs']]);
    expect(p.every((x) => x.of === 3)).toBe(true);
  });
  it('sin canciones ni álbum: el último grupo desaparece', () => {
    const p = partsFor({ features: { songs: false, album: false } });
    expect(p).toHaveLength(2);
    expect(p.flatMap((x) => x.keys)).not.toContain('songs');
  });
  it('solo canciones: no hay «sale en pantalla»', () => {
    const p = partsFor({ features: { photos: false, messages: false, album: false } });
    expect(p.map((x) => x.keys)).toEqual([['scan', 'home'], ['songs']]);
  });
});
