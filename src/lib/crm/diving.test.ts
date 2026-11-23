import { describe, expect, test } from 'vitest';
import { compareDive, diveScore, instructorScore, questionsFor, validDive, webStateOf } from './diving';

describe('Buceo: nota, nivel y etiquetas (documento de Oquea v1.0)', () => {
  test('sin segmento: solo lo común, sin nivel', () => {
    const s = diveScore({ dv_no_booking: 'yes', dv_owner_name: 'yes' });
    expect(s.blocks).toEqual({ a: 8, b: 0, c: 0, d: 5 });
    expect(s.level).toBeNull();
    expect(s.unknown[0]).toBe('dv_segment');
  });
  test('PREM completo y con todo a favor: 100 y nivel A', () => {
    const s = diveScore({
      dv_segment: 'prem', dv_web: 'priority', dv_no_booking: 'yes', dv_contact_basic: 'yes', dv_no_loyalty: 'yes',
      dv_ticket: 'high', dv_full_packages: 'yes', dv_intl_reviews: 'yes', dv_no_installments: 'yes',
      dv_reviews: 'many', dv_social_active: 'yes', dv_network_country: 'yes', dv_owner_name: 'yes', dv_direct_contact: 'yes',
      dv_future_market: 'no', dv_has_software: 'no',
    });
    expect(s.blocks).toEqual({ a: 25, b: 40, c: 25, d: 10 });
    expect(s.total).toBe(100);
    expect(s.level).toBe('a');
    expect(s.qualified).toBe(true);
  });
  test('centro con ajustes: mercado futuro y software restan y etiquetan', () => {
    const s = diveScore({ dv_segment: 'centro', dv_agency: 'yes', dv_courses_and_trips: 'yes', dv_touristic: 'yes', dv_boat_or_team: 'yes', dv_reviews: 'some', dv_owner_name: 'yes', dv_direct_contact: 'yes', dv_future_market: 'yes', dv_has_software: 'yes', dv_padi_adv: 'yes' });
    expect(s.blocks.b).toBe(40);
    expect(s.adjust).toBe(-25);
    expect(s.total).toBe(40 + 8 + 10 - 25);
    expect(s.tags).toEqual(['future_market', 'has_software', 'padi_adv']);
    expect(s.level).toBe('c');
  });
  test('lo que no se sabe no suma, pero cuenta en el máximo', () => {
    const s = diveScore({ dv_segment: 'centro', dv_agency: 'yes' });
    expect(s.total).toBe(10);
    expect(s.max).toBe(100);
    expect(s.unknown).toContain('dv_reviews');
    expect(s.unknown).not.toContain('dv_ticket');   // es de PREM
  });
  test('TOUR: las redes valen 10', () => {
    expect(diveScore({ dv_segment: 'tour', dv_social_active: 'yes' }).blocks.c).toBe(10);
    expect(diveScore({ dv_segment: 'centro', dv_social_active: 'yes' }).blocks.c).toBe(5);
  });
  test('ONG o club con ≥ 40: CANAL; club tiene B como mucho 15 y sin C', () => {
    const ong = diveScore({ dv_segment: 'ong', dv_periodic_activities: 'yes', dv_partner_centers: 'yes', dv_citizen_science: 'yes' });
    expect(ong.level).toBe('channel');
    const club = diveScore({ dv_segment: 'club', dv_members: 'yes', dv_regular_trips: 'yes', dv_no_booking: 'yes', dv_owner_name: 'yes' });
    expect(club.blocks.b).toBe(15);
    expect(club.level).toBe('c');
    expect(questionsFor('club').some((q) => q.block === 'c')).toBe(false);
  });
  test('OTRO o zombie: descartada', () => {
    expect(diveScore({ dv_segment: 'otro' }).level).toBe('out');
    const z = diveScore({ dv_segment: 'prem', dv_ticket: 'high', dv_zombie: 'yes' });
    expect([z.level, z.total, z.tags]).toEqual(['out', 0, ['zombie']]);
  });
  test('orden: A, B, CANAL, C, sin nivel, descartadas', () => {
    const a = diveScore({ dv_segment: 'prem', dv_web: 'priority', dv_no_booking: 'yes', dv_contact_basic: 'yes', dv_no_loyalty: 'yes', dv_ticket: 'high', dv_full_packages: 'yes', dv_intl_reviews: 'yes', dv_reviews: 'many', dv_owner_name: 'yes' });
    const none = diveScore({});
    const out = diveScore({ dv_segment: 'otro' });
    expect([out, none, a].sort(compareDive)).toEqual([a, none, out]);
  });
  test('estado de la web por número de problemas', () => {
    expect([webStateOf(3), webStateOf(4), webStateOf(7), webStateOf(0, false)]).toEqual(['ok', 'improvable', 'priority', 'none']);
  });
  test('instructor: su nota de «vendedor» y lo que falta', () => {
    const s = instructorScore({ dv_seller: 'yes', dv_reach: 'medium', dv_specialty: ['technical', 'cave'] });
    expect(s.total).toBe(55);
    expect(s.max).toBe(55 + 20 + 15);
    expect(s.unknown).toEqual(['dv_agencies', 'dv_level', 'dv_owns']);
  });
  test('validar valores', () => {
    expect(validDive('dv_segment', 'prem')).toBe(true);
    expect(validDive('dv_ticket', 'huge')).toBe(false);
    expect(validDive('dv_specialty', 'technical')).toBe(true);
  });
});
