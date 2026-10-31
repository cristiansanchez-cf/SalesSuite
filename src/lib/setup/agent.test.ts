import { describe, expect, test } from 'vitest';
import { agentPrompt, agentSystem, countOf, fixtureSetupAgent, languageOf, readDraft } from './agent';

const base = { company: 'Ocean Dive Lab', person: 'Ana', locale: 'en-GB', website: 'https://oceandive.test', notes: '', files: [] };

describe('agente de alta', () => {
  test('lee el borrador: bloques con su formato, con o sin envoltorio; lo que no encaja, fuera', async () => {
    const raw = await fixtureSetupAgent().draft(base);
    const d = readDraft(raw)!;
    expect(d.blocks.empresa?.empresa.nombre).toBe('Ocean Dive Lab');
    expect(d.blocks.mercado?.sectores[0].actores[0].papel).toBe('decisor');
    expect(d.questions).toEqual([{ block: 'precios', question: '¿Qué precio tiene el bautismo para un grupo de empresa?' }]);
    expect(countOf(d, 'precios')).toBe(0);
    // Empresa sin su envoltorio, un bloque roto y preguntas de un bloque que no existe.
    const d2 = readDraft({ empresa: { nombre: 'X', que_vendemos: 'Y' }, jugadas: 'roto', questions: [{ block: 'otro', question: ' ¿Y? ' }, { question: '' }], sources: [{ url: 'javascript:alert(1)' }, { title: 'Web', url: 'https://x.test' }] })!;
    expect(d2.blocks.empresa?.empresa.que_vendemos).toBe('Y');
    expect(d2.blocks.jugadas).toBeUndefined();
    expect(d2.questions).toEqual([{ block: 'empresa', question: '¿Y?' }]);
    expect(d2.sources).toEqual([{ title: 'Web', url: 'https://x.test' }]);
    expect(readDraft(null)).toBeNull();
    expect(readDraft({ summary: 'nada' })).toBeNull();
  });
  test('el borrador vuelve tal cual del formulario (para afinar e importar)', async () => {
    const d = readDraft(await fixtureSetupAgent().draft(base))!;
    expect(readDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  test('al afinar, las respuestas llegan y el borrador anterior va en el mensaje', async () => {
    const first = readDraft(await fixtureSetupAgent().draft(base))!;
    const answers = [{ question: first.questions[0].question, answer: '450 € por grupo' }];
    const p = agentPrompt({ ...base, previous: first, answers });
    expect(p).toContain('450 € por grupo');
    expect(p).toContain('borrador anterior');
    const second = readDraft(await fixtureSetupAgent().draft({ ...base, previous: first, answers }))!;
    expect(second.blocks.precios?.tarifas[0].importe).toBe(450);
    expect(second.questions).toEqual([]);
  });
  test('escribe en el idioma del espacio y no inventa', () => {
    expect(languageOf('en-GB')).toBe('inglés');
    expect(languageOf('xx')).toBe('español');
    const s = agentSystem(base);
    expect(s).toContain('inglés');
    expect(s).toMatch(/NO inventes/);
  });
});
