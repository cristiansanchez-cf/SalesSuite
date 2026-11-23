import { describe, expect, test } from 'vitest';
import { cloudWhatsApp } from './whatsapp';

describe('WhatsApp: plantillas', () => {
  const fake = (okCode: string) => {
    const sent: string[] = [];
    const f = (async (_url: string, init: { body: string }) => {
      const code = JSON.parse(init.body).template.language.code as string;
      sent.push(code);
      return code === okCode
        ? new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'Template name does not exist in the translation', code: 132001 } }), { status: 404 });
    }) as unknown as typeof fetch;
    return { sent, wa: cloudWhatsApp('t', f) };
  };
  test('dada de alta como «Español» (es): prueba es_ES y luego es', async () => {
    const { sent, wa } = fake('es');
    expect((await wa.sendTemplate('1', '+34600000000', 'equipo_recordatorio_es', 'es', ['Marta'])).id).toBe('wamid.1');
    expect(sent).toEqual(['es_ES', 'es']);
  });
  test('si no existe en ninguno, el error de Meta', async () => {
    const { sent, wa } = fake('xx');
    await expect(wa.sendTemplate('1', '+34600000000', 'equipo_recordatorio_es', 'es', ['Marta'])).rejects.toThrow(/132001/);
    expect(sent).toEqual(['es_ES', 'es']);
  });
  test('en es_ES a la primera: una sola llamada', async () => {
    const { sent, wa } = fake('es_ES');
    await wa.sendTemplate('1', '+34600000000', 'equipo_recordatorio_es', 'es', ['Marta']);
    expect(sent).toEqual(['es_ES']);
  });
});
