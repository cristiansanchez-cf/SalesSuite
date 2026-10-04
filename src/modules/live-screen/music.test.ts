import { describe, expect, test } from 'vitest';
import { pickOriginal } from './music';

const t = (artistName: string, trackName: string, collectionName = '') => ({ artistName, trackName, collectionName, artworkUrl100: `https://x/${artistName}-${trackName}` });

describe('carátula de la canción original', () => {
  test('se salta el cover de otro artista aunque salga primero', () => {
    const r = [t('Coro Infantil', 'Superestrella'), t('Aitana', 'SUPERESTRELLA', 'Superestrella - Single')];
    expect(pickOriginal(r, 'Aitana', 'Superestrella')?.artistName).toBe('Aitana');
  });
  test('ni karaokes ni tributos del mismo título', () => {
    const r = [t('Aitana', 'Superestrella (Karaoke Version)'), t('Hits Karaoke', 'Superestrella (Made Famous by Aitana)')];
    expect(pickOriginal(r, 'Aitana', 'Superestrella')).toBeNull();
  });
  test('con colaboraciones y acentos', () => {
    expect(pickOriginal([t('Fito y Fitipaldis', 'Soldadito marinero')], 'Fito y Fitipaldis', 'Soldadito Marinero')).not.toBeNull();
    expect(pickOriginal([t('Bad Bunny', 'DtMF')], 'Bad Bunny', 'DtMF')).not.toBeNull();
    expect(pickOriginal([t('Rels B', 'cómo dormiste?')], 'Rels B', 'cómo dormiste?')).not.toBeNull();
  });
});
