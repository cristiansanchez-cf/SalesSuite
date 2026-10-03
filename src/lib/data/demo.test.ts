import { describe, expect, test } from 'vitest';
import { demoRepository } from './demo';
import { clearTenantCache, normalizeHost, resolveTenant } from '../tenant';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';

describe('repositorio DEMO (mismos gates que el RPC)', () => {
  const repo = demoRepository();

  test('dossier publicado: orden por position, oculto fuera', async () => {
    const d = (await repo.getPublicDossier('demo-sala-x-7Qm2', ENJOY))!;
    expect(d.items.map((i) => i.blockType)).toEqual(['hero-pitch', 'tabs-showcase', 'tabs-showcase', 'pricing-card']);
    expect(d.items.map((i) => i.moduleKey)).not.toContain(undefined);
  });

  test.each(['demo-draft-Kp9wQ1', 'demo-revoked-Zt4c', 'demo-expired-Bn3r', 'no-existe-123456'])('%s → null', async (tok) => {
    expect(await repo.getPublicDossier(tok, ENJOY)).toBeNull();
  });

  test('token válido bajo otro tenant → null', async () => {
    expect(await repo.getPublicDossier('demo-sala-x-7Qm2', ALT)).toBeNull();
  });
});

describe('resolución de tenant', () => {
  const repo = demoRepository();

  test('normaliza host', () => {
    expect(normalizeHost('Pitch.EnjoyTheClub.es:443')).toBe('pitch.enjoytheclub.es');
  });

  test('host mapeado', async () => {
    clearTenantCache();
    expect((await resolveTenant(repo, 'pitch.enjoytheclub.es'))?.slug).toBe('enjoy');
    expect((await resolveTenant(repo, 'retheme.localhost:4321'))?.slug).toBe('retheme-test');
  });

  test('fallback DEV solo para hosts locales', async () => {
    clearTenantCache();
    expect((await resolveTenant(repo, 'localhost:4321', { devTenantSlug: 'enjoy' }))?.slug).toBe('enjoy');
    expect(await resolveTenant(repo, 'evil.example.com', { devTenantSlug: 'enjoy' })).toBeNull();
  });

  test('demo pública (DEMO_MODE=1): cualquier host sirve el espacio de demo', async () => {
    clearTenantCache();
    expect((await resolveTenant(repo, 'demo-ventas.cofundo.io', { devTenantSlug: 'enjoy', demoAnyHost: true }))?.slug).toBe('enjoy');
  });
});
