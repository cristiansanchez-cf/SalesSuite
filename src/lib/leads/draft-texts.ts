/**
 * Proponer con IA los textos de una empresa (docs/LEADS.md §Mensajes): parte de los de por defecto, de qué vende y a
 * quién, y de quién firma. No guarda nada: los enseña en el editor para que la persona los revise y los guarde.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_TEXTS } from './templates';
import type { LeadTemplates } from './types';

export const DRAFT_MODEL = 'claude-sonnet-5-5';
export interface DraftInput { brand: string; signer: string; seller: string; clients: string[] }
export type Drafter = (i: DraftInput) => Promise<LeadTemplates | null>;

const loc = {
  type: 'object', additionalProperties: false, required: ['subject', 'body', 'wa1', 'wa2', 'questions'],
  properties: {
    subject: { type: 'string' }, body: { type: 'string' }, wa1: { type: 'string' }, wa2: { type: 'string' },
    questions: { type: 'object', additionalProperties: false, required: ['venue', 'dj', 'festival', 'wedding', 'general'],
      properties: { venue: { type: 'string' }, dj: { type: 'string' }, festival: { type: 'string' }, wedding: { type: 'string' }, general: { type: 'string' } } },
  },
};
const TOOL = {
  name: 'save_texts', description: 'Los textos propuestos en español, inglés y francés.', strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['es', 'en', 'fr'], properties: { es: loc, en: loc, fr: loc } },
} as const;

const RULES = `Reglas:
- Son mensajes de servicio: confirman lo que pidió, dicen qué pasará y dan un siguiente paso fácil. Nada de promoción, ofertas, cifras, promesas de resultados ni superlativos.
- Con la voz de quien firma, en primera persona, cercana y breve. Tuteo en español y francés salvo que el sector pida otra cosa.
- Conserva EXACTAMENTE los marcadores. Email: {nombre}, {asunto}, {sobre}, {siguiente_paso}, {reserva}, {firma_email} (la firma completa, al final, tras la despedida), y si quieres {firma} y {marca} (puedes cambiar su orden y el texto de alrededor; {sobre} y {reserva} pueden quedar vacíos, escribe de modo que se lea bien igual). WhatsApp: {{1}} nombre, {{2}} lo que pidió, {{3}} la pregunta (wa1) o el enlace (wa2), y {firma}, {marca}. Cada WhatsApp lleva {{1}}, {{2}} y {{3}} una sola vez y no empieza ni acaba con una variable.
- Los WhatsApp se aprueban en Meta como «Utilidad» (Utility): tienen que referirse a la solicitud que la persona envió desde la web y servir para responderla. Sin descuentos, ofertas, precios, novedades, vídeos, invitaciones a comprar ni lenguaje comercial; el WhatsApp 2 solo ofrece elegir hora para hablar de su solicitud.
- Los WhatsApp, de menos de 600 caracteres; el email, de menos de 900.
- Las preguntas: una por tipo de cliente, corta, fácil de contestar, que sirva para entender su caso. Si un tipo no aplica a esta empresa, una pregunta general que valga para cualquiera.`;

export function claudeDrafter(apiKey: string, fetchImpl?: typeof fetch): Drafter {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (i) => {
    const res = await client.messages.create({
      model: DRAFT_MODEL, max_tokens: 8000,
      system: `Escribes los mensajes automáticos que recibe quien deja sus datos en la web de ${i.brand}, firmados por ${i.signer}.\n${RULES}`,
      tools: [TOOL as unknown as Anthropic.Tool], tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `Qué vende ${i.brand}: ${i.seller || '(sin descripción)'}\nA quién: ${i.clients.join('; ') || '(sin sectores)'}\n\nTextos de partida (adáptalos a esta empresa, no los copies si no encajan):\n${JSON.stringify(DEFAULT_TEXTS, null, 1)}` }],
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    return (call?.input as LeadTemplates | undefined) ?? null;
  };
}

/** Pruebas (AI_RESEARCH_FIXTURE=1): los de por defecto con la pregunta de locales cambiada. */
export const fixtureDrafter: Drafter = async (i) => ({
  es: { ...DEFAULT_TEXTS.es, questions: { ...DEFAULT_TEXTS.es.questions, venue: `(propuesta para ${i.brand}) ¿Qué noches abrís?` } },
  en: DEFAULT_TEXTS.en, fr: DEFAULT_TEXTS.fr,
});
