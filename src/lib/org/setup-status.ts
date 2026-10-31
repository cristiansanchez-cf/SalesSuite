/**
 * Estado del alta de un espacio (Plataforma, docs/ORG.md §Alta de una empresa): los pasos para dejar una empresa lista y
 * si ya están, con el sitio de su espacio donde se hacen. Puro.
 */
import type { PlatformSetup } from './types';

export const SETUP_STEPS = ['admin', 'empresa', 'mercado', 'situaciones', 'jugadas', 'precios', 'marca', 'crm', 'propuesta'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const PATH: Record<SetupStep, string> = {
  admin: '/admin/team', empresa: '/admin/setup/agente', mercado: '/admin/setup/ia?b=mercado', situaciones: '/admin/setup/ia?b=situaciones',
  jugadas: '/admin/setup/ia?b=jugadas', precios: '/admin/prices', marca: '/admin/brand', crm: '/admin/accounts', propuesta: '/admin',
};

export function setupSteps(s: PlatformSetup, published: number): Array<{ key: SetupStep; done: boolean; path: string }> {
  const done: Record<SetupStep, boolean> = {
    admin: s.admins > 0, empresa: s.pitch > 0, mercado: s.segments > 0 && s.personas > 0, situaciones: s.facets > 0,
    jugadas: s.plays >= 5, precios: s.prices > 0, marca: s.logo, crm: s.accounts > 0, propuesta: published > 0,
  };
  return SETUP_STEPS.map((key) => ({ key, done: done[key], path: PATH[key] }));
}
