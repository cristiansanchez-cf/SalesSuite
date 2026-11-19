/**
 * Capturas de pantalla al asistente (docs/ASSISTANT.md §Capturas): la captura de una conversación con un cliente
 * (WhatsApp, Instagram, email…) → la conversación literal, quién dijo qué, y el nombre que sale arriba. Se apunta como
 * los reenviados: interacción con las frases tal cual, para ir guardando CÓMO le hablamos y ver después qué funciona
 * (criterio de Cristian). Claude lee la imagen; no se guarda la imagen, solo el texto.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NOTES_MODEL } from '../crm/notes';
import { meterClaude } from '../usage/meter';

export interface ShotLine { from: 'us' | 'them'; text: string; time: string }
export interface Shot { isChat: boolean; contact: string; channel: 'whatsapp' | 'instagram' | 'email' | 'other'; lines: ShotLine[] }
export type ScreenshotReader = (img: { bytes: Uint8Array; type: string }) => Promise<Shot | null>;

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['isChat', 'contact', 'channel', 'lines'],
  properties: {
    isChat: { type: 'boolean', description: 'true si la imagen es una conversación (chat, DMs, emails). false si es otra cosa.' },
    contact: { type: 'string', description: 'El nombre de la otra persona o empresa, como sale arriba del chat. "" si no se ve.' },
    channel: { type: 'string', enum: ['whatsapp', 'instagram', 'email', 'other'] },
    lines: {
      type: 'array', description: 'Los mensajes en orden, tal cual (sin resumir ni corregir).',
      items: {
        type: 'object', additionalProperties: false, required: ['from', 'text', 'time'],
        properties: {
          from: { type: 'string', enum: ['us', 'them'], description: 'us: los mensajes de quien hizo la captura (en WhatsApp, a la derecha y en verde); them: los de la otra persona.' },
          text: { type: 'string' },
          time: { type: 'string', description: 'La hora o fecha que se vea junto al mensaje, o "".' },
        },
      },
    },
  },
} as const;

const PROMPT = `Es una captura de pantalla de una conversación de un comercial con un cliente. Transcribe los mensajes tal cual, en orden, diciendo quién escribe cada uno. No resumas, no corrijas y no inventes: si un mensaje está cortado, transcribe lo que se ve. Ignora la interfaz (barras, botones, «escribiendo…»). Para audios, fotos o stickers pon entre corchetes qué es ([audio 0:32], [foto]).`;

export function claudeScreenshotReader(apiKey: string, fetchImpl?: typeof fetch): ScreenshotReader {
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (img) => {
    const type = img.type.split(';')[0]!.trim().toLowerCase();
    if (!TYPES.has(type) || img.bytes.byteLength > MAX_BYTES) return null;
    const res = await client.messages.create({
      model: NOTES_MODEL, max_tokens: 4096,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: type as 'image/png', data: Buffer.from(img.bytes).toString('base64') } },
        { type: 'text', text: PROMPT },
      ] }],
    } as Parameters<typeof client.messages.create>[0]) as Anthropic.Message;
    await meterClaude('assistant.screenshot', res.model || NOTES_MODEL, res.usage);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    const raw = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try { return cleanShot(JSON.parse(raw)); } catch { return null; }
  };
}

/** Lo que vuelve, con límites (no fiarse de la forma). */
export function cleanShot(x: unknown): Shot | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 80).flatMap((l) => {
    const r = (l ?? {}) as Record<string, unknown>;
    const text = String(r.text ?? '').trim().slice(0, 1000);
    return text ? [{ from: r.from === 'us' ? 'us' as const : 'them' as const, text, time: String(r.time ?? '').trim().slice(0, 40) }] : [];
  });
  const channel = (['whatsapp', 'instagram', 'email'] as const).find((c) => c === o.channel) ?? 'other';
  return { isChat: o.isChat === true && lines.length > 0, contact: String(o.contact ?? '').trim().slice(0, 120), channel, lines };
}

/** La conversación como se guarda en la interacción: una línea por mensaje, con quién lo dijo. */
export function shotText(s: Shot, labels: { us: string; them: string }): string[] {
  const them = s.contact ? `${labels.them} (${s.contact})` : labels.them;
  return s.lines.map((l) => `${l.from === 'us' ? labels.us : them}${l.time ? ` · ${l.time}` : ''}: ${l.text}`);
}

/** Demo y pruebas (AI_RESEARCH_FIXTURE=1): una conversación fija. */
export const fixtureScreenshotReader: ScreenshotReader = async () => ({
  isChat: true, contact: 'Sala Marina', channel: 'whatsapp',
  lines: [
    { from: 'us', text: 'Hola Marta, soy Cristian de Enjoy. ¿Os paso la propuesta para las pantallas de los sábados?', time: '10:02' },
    { from: 'them', text: 'Sí, pásamela y lo vemos con el dueño el lunes', time: '10:15' },
  ],
});
