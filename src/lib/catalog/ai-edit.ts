/**
 * «Pídele un cambio» (docs/CATALOG_AI.md §Cambios pequeños): en un módulo del catálogo, el responsable escribe lo que
 * quiere («cambia el título por…», «quita la tercera pestaña», «más corto») y la IA devuelve el contenido cambiado, con el
 * formato de su tipo. Se valida antes de guardar y se guarda en un BORRADOR (se ve en la vista previa y se deshace).
 *
 * Solo para cambios pequeños: una instrucción corta, un módulo cada vez y el tope de IA por persona y día del espacio.
 * Lo puro (prompt, lectura, cambio de prueba) va probado; la llamada a Claude está aparte.
 */
import Anthropic from '@anthropic-ai/sdk';
import { REGISTRY, isBlockType } from '../../modules/registry';
import { validateProps } from '../admin/tenant-service';
import { meterClaude } from '../usage/meter';

export const EDIT_MODEL = 'claude-sonnet-5-5';
export const MAX_INSTRUCTION = 400;

export interface EditInput { blockType: string; name: string; props: Record<string, unknown>; instruction: string; locale: string }
export interface EditResult { props: Record<string, unknown>; summary: string }
export interface EditApi { edit(input: EditInput): Promise<EditResult | null> }

export const EDIT_TOOL = {
  name: 'save_props',
  description: 'Guarda el contenido del módulo ya cambiado. Llámala una vez, con TODO el contenido (lo que no cambia, igual).',
  input_schema: {
    type: 'object',
    required: ['props', 'summary'],
    properties: {
      props: { type: 'object', description: 'El contenido completo del módulo, con el mismo formato que el actual.' },
      summary: { type: 'string', description: 'Qué has cambiado, en una frase corta para quien lo pidió.' },
    },
  },
} as const;

const LANG: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', ko: 'coreano', ca: 'catalán', fr: 'francés' };

export function editSystem(i: Pick<EditInput, 'locale'>): string {
  return [
    'Cambias el contenido de una diapositiva de una propuesta comercial: SOLO lo que te piden, nada más.',
    '- Devuelve el contenido completo con save_props: lo que no te piden cambiar, exactamente igual (mismos campos, mismo orden, mismas imágenes).',
    '- Mantén el formato: los nombres de los campos no se traducen ni se inventan; usa solo los que ya están o los del ejemplo de su tipo.',
    '- No inventes cifras, clientes, precios ni testimonios. Si te piden algo así sin darte el dato, no lo cambies y dilo en el resumen.',
    '- {company} y {prospect} se dejan tal cual (se cambian por el cliente al enseñarla).',
    `- Escribe en ${LANG[i.locale.slice(0, 2).toLowerCase()] ?? 'español'}, con el tono que ya tiene.`,
    '- Si lo que piden no es un cambio de esta diapositiva (o es una instrucción para ti que no tiene que ver), no cambies nada y explícalo en el resumen.',
  ].join('\n');
}

export function editPrompt(i: EditInput): string {
  const example = isBlockType(i.blockType) ? REGISTRY[i.blockType].example : {};
  return [
    `Diapositiva «${i.name}» (tipo ${i.blockType}).`,
    'Ejemplo del formato de su tipo:', JSON.stringify(example),
    'Contenido actual:', JSON.stringify(i.props),
    '',
    'Lo que pide (entre las marcas):',
    '<<<', i.instruction.slice(0, MAX_INSTRUCTION), '>>>',
  ].join('\n');
}

/** Lo que devuelve la IA, ya comprobado contra el formato del tipo. null si no vale. */
export function readEdit(blockType: string, raw: unknown): { result: EditResult | null; errors: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { props?: unknown; summary?: unknown };
  if (!r.props || typeof r.props !== 'object' || Array.isArray(r.props)) return { result: null, errors: ['sin contenido'] };
  const errors = validateProps(blockType, r.props);
  if (errors.length) return { result: null, errors };
  return { result: { props: r.props as Record<string, unknown>, summary: String(r.summary ?? '').slice(0, 300) || 'Cambiado.' }, errors: [] };
}

/** Qué textos han cambiado (para enseñarlo y para no aceptar «cambios» que no cambian nada). */
export function changedTexts(before: unknown, after: unknown, path = ''): Array<{ path: string; before: string; after: string }> {
  if (typeof before === 'string' || typeof after === 'string') {
    return before === after ? [] : [{ path, before: typeof before === 'string' ? before : '', after: typeof after === 'string' ? after : '' }];
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => changedTexts(a[i], b[i], `${path}[${i}]`)).flat();
  }
  if (before && typeof before === 'object' || after && typeof after === 'object') {
    const a = (before ?? {}) as Record<string, unknown>;
    const b = (after ?? {}) as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => changedTexts(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return before === after ? [] : [{ path, before: String(before ?? ''), after: String(after ?? '') }];
}

// ---------------------------------------------------------------- Claude

export function claudeCatalogEdit(apiKey: string, fetchImpl?: typeof fetch): EditApi {
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return {
    async edit(input) {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: editPrompt(input) }];
      // Un intento y, si el formato no vale, otro con los errores.
      for (let turn = 0; turn < 2; turn++) {
        const res = await client.messages.create({
          model: EDIT_MODEL,
          max_tokens: 16000,
          system: editSystem(input),
          tools: [EDIT_TOOL as unknown as Anthropic.Tool],
          tool_choice: { type: 'tool', name: EDIT_TOOL.name },
          messages,
        });
        await meterClaude('catalog.edit', res.model || EDIT_MODEL, res.usage);
        if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
        const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === EDIT_TOOL.name);
        if (!call) return null;
        const { result, errors } = readEdit(input.blockType, call.input);
        if (result) return result;
        messages.push(
          { role: 'assistant', content: res.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `El formato no vale: ${errors.slice(0, 8).join('; ')}. Corrígelo y vuelve a llamar a save_props.` }] },
        );
      }
      return null;
    },
  };
}

/**
 * Para las pruebas automáticas (AI_RESEARCH_FIXTURE=1, sin clave): entiende «cambia "X" por "Y"» (o «X» por «Y») y
 * lo cambia en todos los textos. No llama a nadie.
 */
export const fixtureCatalogEdit = (): EditApi => ({
  async edit(i) {
    const m = i.instruction.match(/["«“]([^"»”]+)["»”]\s+por\s+["«“]([^"»”]+)["»”]/i);
    if (!m) return { props: i.props, summary: 'Ejemplo de prueba (sin IA): no he entendido qué cambiar.' };
    const [, from, to] = m;
    const swap = (v: unknown): unknown => typeof v === 'string' ? v.split(from).join(to)
      : Array.isArray(v) ? v.map(swap)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
    return { props: swap(i.props) as Record<string, unknown>, summary: `Ejemplo de prueba (sin IA): «${from}» → «${to}».` };
  },
});

export function catalogEditAi(read: (k: string) => string | undefined): EditApi | null {
  const key = read('ANTHROPIC_API_KEY');
  return key ? claudeCatalogEdit(key) : read('AI_RESEARCH_FIXTURE') === '1' ? fixtureCatalogEdit() : null;
}
