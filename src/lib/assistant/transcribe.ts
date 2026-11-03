/**
 * Audios del asistente (docs/ASSISTANT.md): Whisper de OpenAI (OPENAI_API_KEY). Los audios de WhatsApp son OGG/Opus,
 * que Whisper acepta tal cual. Sin clave, el asistente pide que se lo escriban.
 */
import { meterUnits } from '../usage/meter';
export type Transcriber = (audio: { bytes: Uint8Array; type: string }, language?: string) => Promise<string>;

export const WHISPER_MODEL = 'whisper-1';
export function whisper(apiKey: string, fetchImpl: typeof fetch = fetch): Transcriber {
  return async (audio, language) => {
    const ext = /mpeg|mp3/.test(audio.type) ? 'mp3' : /mp4|m4a|aac/.test(audio.type) ? 'm4a' : /wav/.test(audio.type) ? 'wav' : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([audio.bytes as BlobPart], { type: audio.type.split(';')[0] || 'audio/ogg' }), `audio.${ext}`);
    form.append('model', WHISPER_MODEL);
    // Con la duración: Whisper se cobra por minuto de audio.
    form.append('response_format', 'verbose_json');
    if (language) form.append('language', language.slice(0, 2));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60_000);
    try {
      const r = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: ctl.signal });
      const body = (await r.json().catch(() => null)) as { text?: string; duration?: number; error?: { message?: string } } | null;
      if (!r.ok) throw new Error(`Whisper ${r.status}: ${body?.error?.message ?? ''}`.slice(0, 300));
      await meterUnits('assistant.audio', 'openai', Number(body?.duration) || 0, { model: WHISPER_MODEL });
      return String(body?.text ?? '').trim();
    } finally { clearTimeout(timer); }
  };
}
/** Demo y pruebas: un texto fijo. */
export const fixtureTranscriber: Transcriber = async () => 'He estado en Club Sol con Marta, les interesa la pantalla para los viernes. Quedamos en llamarla el jueves.';
