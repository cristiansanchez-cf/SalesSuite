import { describe, expect, test } from 'vitest';
import { splitConvo } from './convo';

describe('conversación en burbujas', () => {
  test('copiar de WhatsApp: resumen aparte, quién es quién por el nombre de quien lo apuntó, líneas que siguen', () => {
    const c = splitConvo('José María quiere una demo.\n\nConversación:\n[23/9/26, 14:04:38] Cristian Alberto Sanchez: Buenas José María!\n[23/9/26, 14:07:37] Cristian Alberto Sanchez: Tengo dos noticias\n1. Ando por Valencia\n[25/9/26, 11:49:41] Jose Maria Havana: Buenas señor!', 'Cristian Sanchez');
    expect(c!.summary).toBe('José María quiere una demo.');
    expect(c!.bubbles.map((b) => [b.us, b.time])).toEqual([[true, '23/9/26 14:04'], [true, '23/9/26 14:07'], [false, '25/9/26 11:49']]);
    expect(c!.bubbles[1]!.text).toBe('Tengo dos noticias\n1. Ando por Valencia');
    // Sin saber quién lo apuntó: quien habla primero somos nosotros.
    expect(splitConvo('Conversación:\n[1/10/26, 10:00] Ana: hola\n[1/10/26, 10:01] Club: buenas')!.bubbles.map((b) => b.us)).toEqual([true, false]);
  });
  test('Android, capturas y reenviados', () => {
    expect(splitConvo('Conversation:\n23/9/26, 14:04 - Ana: hi\n23/9/26, 14:05 - Bob: hey', 'Ana')!.bubbles.map((b) => b.us)).toEqual([true, false]);
    const shot = splitConvo('Conversación:\nNosotros · 10:02: ¿Os paso la propuesta?\nCliente (Sala Marina) · 10:15: Sí, pásamela');
    expect(shot!.bubbles).toEqual([{ who: '', us: true, time: '10:02', text: '¿Os paso la propuesta?' }, { who: 'Sala Marina', us: false, time: '10:15', text: 'Sí, pásamela' }]);
    expect(splitConvo('Conversación:\nBuenas señor!\nencantado')!.bubbles.every((b) => !b.us)).toBe(true);
  });
  test('sin conversación o con un solo mensaje: como siempre', () => {
    expect(splitConvo('Hablé con Marta')).toBeNull();
    expect(splitConvo('Conversación:\n[1/10/26, 10:00] Ana: hola')).toBeNull();
    expect(splitConvo(null)).toBeNull();
  });
});
