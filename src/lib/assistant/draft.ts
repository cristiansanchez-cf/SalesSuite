/**
 * La propuesta de mensaje de cada recordatorio (docs/ASSISTANT.md §Recordatorios): un WhatsApp corto de seguimiento,
 * con la voz de quien vende, a partir de lo que sabe el CRM de esa empresa (lo último que pasó, lo que sabemos, el
 * próximo paso). El Cerebro de Ventas no tiene API todavía: cuando la tenga, se le pide a él y se cita su ficha.
 * Haiku (como «Apuntar»: textos cortos, mucho más barato) con esfuerzo bajo.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NOTES_MODEL } from '../crm/notes';
import type { ReminderItem } from './flow';
import { meterClaude } from '../usage/meter';

export type Drafter = (item: ReminderItem, ctx: { seller: string; signer: string; locale: string }) => Promise<string | null>;

const LANG: Record<string, string> = { es: 'español de España', en: 'inglés', pt: 'portugués de Portugal', ko: 'coreano' };
const OUTCOME: Record<string, string> = { no_reply: 'no contestó', replied: 'contestó', interested: 'mostró interés', not_interested: 'dijo que no le interesa', meeting: 'quedamos en una reunión', note: 'nota interna' };

export function draftPrompt(item: ReminderItem, ctx: { seller: string; signer: string; locale: string }): string {
  return [
    `Quién vende: ${ctx.signer}${ctx.seller ? ` (${ctx.seller})` : ''}.`,
    `Cliente: ${item.name}${item.contactName ? `, hablando con ${item.contactName}` : ''}.`,
    item.last ? `Lo último (${item.last.at.slice(0, 10)}): ${OUTCOME[item.last.outcome] ?? item.last.outcome}${item.last.note ? `. «${item.last.note}»` : ''}` : 'Aún no hay conversación con ellos.',
    item.bucket === 'cooling' ? `Contestó hace ${item.cooling ?? 3} días laborables y no le hemos vuelto a escribir.` : item.bucket === 'overdue' ? 'El seguimiento está vencido.' : 'Hoy toca el seguimiento.',
    item.step ? `Próximo paso acordado: ${item.step}.` : '',
    item.facts.length ? `Lo que sabemos: ${item.facts.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

const SYSTEM = (locale: string) => `Escribes el siguiente mensaje de WhatsApp de un comercial a un cliente para retomar la conversación.
- En ${LANG[locale] ?? LANG.es}, de tú salvo que el contexto pida otra cosa, breve (2-4 frases, menos de 450 caracteres), natural, sin emojis de más.
- Retoma lo último que pasó y propone un siguiente paso concreto y fácil (una llamada corta, una visita, mandar la propuesta…). Nada de presión ni de frases de vendedor.
- Solo con lo que te dan: no inventes datos, precios ni fechas. Sin saludo genérico tipo «Espero que estés bien».
- Devuelve solo el mensaje, sin comillas ni explicaciones.`;

export function claudeDrafter(apiKey: string, fetchImpl?: typeof fetch): Drafter {
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return async (item, ctx) => {
    const res = await client.messages.create({
      model: NOTES_MODEL, max_tokens: 1024,
      output_config: { effort: 'low' },
      system: SYSTEM(ctx.locale),
      messages: [{ role: 'user', content: draftPrompt(item, ctx) }],
    });
    await meterClaude('assistant.draft', res.model || NOTES_MODEL, res.usage);
    // Si se niega (o se corta), no hay propuesta: el recordatorio sale igual, sin ella.
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    return text ? text.slice(0, 900) : null;
  };
}

/** Demo y pruebas (AI_RESEARCH_FIXTURE=1): un borrador fijo con su nombre. */
export const fixtureDrafter: Drafter = async (item) =>
  `Hola${item.contactName ? ` ${item.contactName.split(' ')[0]}` : ''}, ¿cómo lo veis en ${item.name}? Si te va bien, te llamo 10 minutos esta semana y lo cerramos.`;
