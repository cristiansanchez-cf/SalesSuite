import { describe, expect, test } from 'vitest';
import { cleanRow, crmRef, csvOf, mergeRows, refOf, summary, type RowCtx } from './ai-import';

const ctx: RowCtx = {
  kinds: [{ key: 'company', label: 'Centro u operador', plural: 'Centros y operadores' }, { key: 'instructor', label: 'Instructor', plural: 'Instructores' }],
  validQual: (k, v) => (k === 'dv_segment' && ['prem', 'centro'].includes(v)) || (k === 'dv_specialty' && ['technical', 'cave'].includes(v)),
  today: '2026-11-23',
};

describe('Importar con tu IA: cada empresa', () => {
  test('lo bueno pasa tal cual; el tipo por su nombre', () => {
    const { row } = cleanRow({ ref: 'notion-12', nombre: 'Buceo Azul', tipo: 'Instructores', ciudad: 'Alicante', email: 'HOLA@buceoazul.es', telefono: '+34 600 111 222',
      personas: [{ nombre: 'Marta', papel: 'Dueña' }], interacciones: [{ fecha: '2026-11-10', canal: 'phone', nota: 'Le interesa la red' }],
      proximo_paso: { que: 'Mandar propuesta', fecha: '2026-12-01' }, cualificacion: { dv_segment: 'centro' }, texto_origen: 'Buceo Azul (Alicante): llamé a Marta…' }, ctx);
    expect(row).toMatchObject({ ref: 'notion-12', name: 'Buceo Azul', kind: 'instructor', city: 'Alicante', email: 'hola@buceoazul.es', next: { what: 'Mandar propuesta', date: '2026-12-01' }, qualification: { dv_segment: 'centro' }, problems: [] });
    expect(row!.interactions).toEqual([{ date: '2026-11-10', channel: 'phone', note: 'Le interesa la red' }]);
  });
  test('sin nombre no entra', () => {
    expect(cleanRow({ ciudad: 'Málaga' }, ctx)).toEqual({ row: null, error: 'Falta el nombre de la empresa' });
  });
  test('fechas: sin fecha o futura no se inventa la conversación (va como dato y se avisa)', () => {
    const { row } = cleanRow({ nombre: 'Havana', texto_origen: 'x', interacciones: [{ nota: 'Hablamos con Mireia' }, { fecha: '2026-11-24', nota: 'Demo con Mireia' }, { fecha: '2026-02-30', nota: 'Otra' }] }, ctx);
    expect(row!.interactions).toEqual([]);
    expect(row!.facts).toEqual(['Sin fecha: Hablamos con Mireia', '(2026-11-24) Demo con Mireia', 'Sin fecha: Otra']);
    expect(row!.problems.some((p) => /futura/.test(p))).toBe(true);
  });
  test('lo que no existe en el CRM se dice y no se guarda', () => {
    const { row } = cleanRow({ nombre: 'Club Sub', tipo: 'Federación', email: 'no-es-email', cualificacion: { dv_segment: 'discoteca', dv_specialty: 'technical,volar', screens: 'yes' } }, ctx);
    expect(row!.kind).toBeNull();
    expect(row!.email).toBeNull();
    expect(row!.qualification).toEqual({ dv_specialty: 'technical' });
    expect(row!.problems.join(' | ')).toMatch(/Tipo «Federación» no existe.*Email.*dv_segment: discoteca.*volar.*screens: yes.*Sin texto de origen/);
  });
  test('referencia: la suya o nombre + ciudad (reenviar no duplica)', () => {
    expect(refOf('', 'Buceo Azul', 'Alicante')).toBe('buceo azul alicante');
    const a = cleanRow({ nombre: 'Buceo Azul', ciudad: 'Alicante', texto_origen: 'v1' }, ctx).row!;
    const b = cleanRow({ nombre: 'BUCEO  azul', ciudad: 'alicante', texto_origen: 'v2' }, ctx).row!;
    const m = mergeRows([a], [b, cleanRow({ nombre: 'Otro', texto_origen: 'x' }, ctx).row!]);
    expect([m.rows.length, m.added, m.updated, m.rows[0]!.source]).toEqual([2, 1, 1, 'v2']);
  });
  test('CSV de la importación de siempre, con su referencia y las notas', () => {
    const r = cleanRow({ ref: 'n1', nombre: 'Sub, "La Mar"', ciudad: 'Vigo', datos: ['Tienen barco', 'Abren en abril'], texto_origen: 'x' }, ctx).row!;
    const csv = csvOf([r]);
    expect(csv.split('\n')[0]).toBe('Empresa,Referencia,Ciudad,Dirección,Teléfono,Email,Web,Instagram,LinkedIn,Notas');
    expect(csv).toContain(`"Sub, ""La Mar""",${crmRef('n1')},Vigo`);
    expect(csv).toContain('"Tienen barco\nAbren en abril"');
  });
  test('resumen', () => {
    const rows = [cleanRow({ nombre: 'Ab', texto_origen: 'x' }, ctx).row!, cleanRow({ nombre: 'Bc', personas: ['Ana'] }, ctx).row!];
    expect(summary(rows, new Set([rows[0]!.ref]))).toEqual({ total: 2, duplicates: 1, withProblems: 1, interactions: 0, people: 1 });
  });
});
