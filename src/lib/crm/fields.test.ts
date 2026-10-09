import { describe, expect, test } from 'vitest';
import { fieldInputSchema, fieldsFor, formatValue, matches, parseValue, parseValues, slugKey, type CrmField } from './fields';

const F = (p: Partial<CrmField>): CrmField => ({
  id: p.key ?? 'x', tenantId: 't', key: 'x', label: 'X', type: 'text', options: [], group: null, position: 0, help: null,
  required: false, inList: false, filterable: false, segments: [], archivedAt: null, target: 'account', tags: [], isStage: false, ...p,
});
const pantalla = F({ key: 'tiene-pantalla', label: '¿Tiene pantalla?', type: 'checkbox' });
const aforo = F({ key: 'aforo', label: 'Aforo', type: 'number' });
const noches = F({ key: 'noches', label: 'Noches', type: 'multi_select', options: [{ key: 'jueves', label: 'Jueves' }, { key: 'viernes', label: 'Viernes' }, { key: 'sabado', label: 'Sábado' }] });
const cert = F({ key: 'certificadora', label: 'Certificadora', type: 'select', options: [{ key: 'padi', label: 'PADI' }, { key: 'ssi', label: 'SSI' }], required: true });

describe('campos del CRM', () => {
  test('clave estable a partir de la etiqueta', () => {
    expect(slugKey('Nº de instructores')).toBe('n-de-instructores');
    expect(slugKey('¿Tiene pantalla?')).toBe('tiene-pantalla');
  });

  test('definir un campo: opciones una por línea, sin repetir claves', () => {
    const v = fieldInputSchema.parse({ label: 'Noches', type: 'multi_select', options: 'Jueves\nViernes\n\nSábado\nSábado' });
    expect(v.options.map((o) => o.key)).toEqual(['jueves', 'viernes', 'sabado', 'sabado-2']);
    expect(fieldInputSchema.safeParse({ label: 'Tipo', type: 'select', options: '' }).success).toBe(false);
  });

  test('valores: lo que llega de un formulario o de un CSV', () => {
    expect(parseValue(pantalla, 'on')).toEqual({ ok: true, value: true });
    expect(parseValue(aforo, '1.200')).toEqual({ ok: true, value: 1200 });
    expect(parseValue(aforo, 'unos 300')).toEqual({ ok: false, error: 'Aforo: tiene que ser un número' });
    expect(parseValue(noches, 'viernes, Sábado')).toEqual({ ok: true, value: ['viernes', 'sabado'] });
    expect(parseValue(cert, 'padi')).toEqual({ ok: true, value: 'padi' });
    expect(parseValue(cert, 'CMAS').ok).toBe(false);
    expect(parseValue(F({ type: 'url', label: 'Web' }), 'instagram.com/club')).toEqual({ ok: true, value: 'https://instagram.com/club' });
  });

  test('guardar: vacíos se borran, obligatorios se exigen, errores juntos', () => {
    const r = parseValues([pantalla, aforo, noches, cert], { 'tiene-pantalla': '', aforo: 'abc', noches: [] }, { requireAll: true });
    expect(r.errors).toEqual(['Aforo: tiene que ser un número', 'Certificadora: es obligatorio']);
    expect(r.cleared).toEqual(['tiene-pantalla', 'noches']);
  });

  test('se enseñan legibles y se filtran', () => {
    expect(formatValue(noches, ['viernes', 'sabado'])).toBe('Viernes, Sábado');
    expect(formatValue(cert, 'padi')).toBe('PADI');
    expect(formatValue(pantalla, true)).toBe('✓');
    expect(matches(noches, ['viernes'], 'viernes')).toBe(true);
    expect(matches(pantalla, undefined, 'no')).toBe(true);
    expect(matches(pantalla, true, 'no')).toBe(false);
  });

  test('por sector y sin archivados', () => {
    const solo = F({ key: 'aforo-sala', segments: ['conciertos'], position: 1 });
    const viejo = F({ key: 'viejo', archivedAt: '2026-01-01' });
    expect(fieldsFor([solo, viejo, aforo], 'ocio-nocturno').map((f) => f.key)).toEqual(['aforo']);
    expect(fieldsFor([solo, viejo, aforo], 'conciertos').map((f) => f.key)).toEqual(['aforo', 'aforo-sala']);
  });

  test('por lista y por destino (empresa o persona)', () => {
    const bodas = F({ key: 'bodas-net', tags: ['proveedores-bodas'] });
    const icp = F({ key: 'icp', target: 'contact', tags: ['fbd'] });
    expect(fieldsFor([bodas, aforo, icp], null).map((f) => f.key)).toEqual(['aforo']);
    expect(fieldsFor([bodas, aforo, icp], null, { tags: ['proveedores-bodas'] }).map((f) => f.key)).toEqual(['aforo', 'bodas-net']);
    expect(fieldsFor([bodas, aforo, icp], null, { target: 'contact', tags: ['fbd'] }).map((f) => f.key)).toEqual(['icp']);
  });
});
