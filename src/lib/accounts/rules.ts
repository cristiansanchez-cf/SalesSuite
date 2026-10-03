/**
 * Reglas de cuentas, en un solo sitio para la demo y los tests. Postgres aplica exactamente las mismas
 * (supabase/migrations/20261012000000_accounts.sql → account_eligibility_for); el contrato lo comprueba.
 */
import type { Account, AccountRules, AccountState, Eligibility, Zone, ZoneAssignment } from './types';
import { defineMessages } from '../i18n/core';

/** ¿`zoneId` es `target` o uno de sus antepasados? */
export function zoneCovers(zones: Zone[], zoneId: string, target: string): boolean {
  const byId = new Map(zones.map((z) => [z.id, z]));
  for (let z = byId.get(target), guard = 0; z && guard < 50; z = z.parentId ? byId.get(z.parentId) : undefined, guard++) {
    if (z.id === zoneId) return true;
  }
  return false;
}

export function eligibility(
  a: Account | null, userId: string, rules: AccountRules, ctx: { zones: Zone[]; assignments: ZoneAssignment[]; now: Date },
): Eligibility {
  if (!a) return rules.requireAccount ? 'no_account' : 'eligible';
  if (a.status === 'blocked') return 'blocked';
  if (a.status === 'customer' && a.wonBy !== userId) return 'claimed_by_other';
  if (a.ownerId && a.ownerId !== userId && a.claimedUntil && Date.parse(a.claimedUntil) > ctx.now.getTime()) return 'claimed_by_other';
  if (rules.strictZones && a.zoneId) {
    const mine = ctx.assignments.filter((x) => x.userId === userId);
    if (mine.length && !mine.some((x) => zoneCovers(ctx.zones, x.zoneId, a.zoneId!))) return 'out_of_zone';
  }
  return 'eligible';
}

export function stateFor(a: Account, userId: string, now: Date): AccountState {
  if (a.status === 'blocked') return 'blocked';
  if (a.status === 'customer') return a.wonBy === userId ? 'my_customer' : 'customer';
  const held = !!a.ownerId && !!a.claimedUntil && Date.parse(a.claimedUntil) > now.getTime();
  if (!held) return 'free';
  return a.ownerId === userId ? 'mine' : 'taken';
}

/** Etiquetas de elegibilidad en los cuatro idiomas de la consola. */
export const ELIGIBILITY_LABELS = defineMessages<Record<Eligibility, string>>({
  es: { eligible: 'Genera comisión', claimed_by_other: 'La trabaja otra persona', blocked: 'Cuenta bloqueada', out_of_zone: 'Fuera de tu zona', no_account: 'Sin cuenta del CRM' },
  en: { eligible: 'Earns commission', claimed_by_other: 'Someone else is working it', blocked: 'Account blocked', out_of_zone: 'Outside your zone', no_account: 'No CRM account' },
  pt: { eligible: 'Gera comissão', claimed_by_other: 'Outra pessoa está trabalhando nela', blocked: 'Conta bloqueada', out_of_zone: 'Fora da sua região', no_account: 'Sem conta do CRM' },
  ko: { eligible: '커미션 발생', claimed_by_other: '다른 사람이 담당 중', blocked: '차단된 계정', out_of_zone: '내 담당 지역 밖', no_account: 'CRM 계정 없음' },
});
/** Español (compatibilidad con quien aún importa las etiquetas sin idioma). */
export const ELIGIBILITY_LABEL: Record<Eligibility, string> = ELIGIBILITY_LABELS.es;

/** Las zonas y sus descendientes (para filtrar «mi zona»). */
export function withDescendants(zones: Zone[], ids: string[]): Set<string> {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const z of zones) if (z.parentId && out.has(z.parentId) && !out.has(z.id)) { out.add(z.id); grew = true; }
  }
  return out;
}

/** «España › Comunidad Valenciana › Valencia». */
export function zonePath(zones: Zone[], id: string | null): string {
  if (!id) return '';
  const byId = new Map(zones.map((z) => [z.id, z]));
  const parts: string[] = [];
  for (let z = byId.get(id), guard = 0; z && guard < 50; z = z.parentId ? byId.get(z.parentId) : undefined, guard++) parts.unshift(z.name);
  return parts.join(' › ');
}
