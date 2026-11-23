/**
 * Investigación con IA: qué mirar (docs/CRM_DINAMICO.md §13 «Qué mirar»). Criterio de Cristian: «que cuando le das a
 * "Investigación con IA" puedas personalizar qué quieres que mire. En el caso de Oquea quieren ver si la página web es
 * antigua, si cumple con la normativa de términos, privacidad, cookies… y así poder ofrecerles páginas web».
 *
 * Lo de siempre lo pone el admin (Configurar → Campos del CRM → Investigación con IA); al investigar una empresa se
 * puede cambiar para esa vez. `web`: la app abre su web y la revisa (src/lib/crm/web-audit.ts) antes de la IA.
 */
export interface ResearchFocus { focus: string; web: boolean }

export const MAX_FOCUS = 1500;
export const NO_FOCUS: ResearchFocus = { focus: '', web: false };

/** Lo guardado (jsonb) o lo que llega del formulario → lo que vale. */
export function readFocus(raw: unknown): ResearchFocus {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { focus: cleanFocus(r.focus), web: r.web === true || r.web === 'true' || r.web === 'on' || r.web === '1' };
}
export const cleanFocus = (v: unknown): string =>
  (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_FOCUS);

/** Atajos para escribir lo de siempre (se añaden como líneas). Las frases, en src/lib/i18n/messages/research.ts. */
export const FOCUS_PRESETS = ['webOld', 'webLegal', 'seo', 'socials', 'reviews', 'ads'] as const;
export type FocusPreset = (typeof FOCUS_PRESETS)[number];
/** Los que necesitan abrir su web: al elegirlos, se marca también «Revisar su web». */
export const WEB_PRESETS: readonly FocusPreset[] = ['webOld', 'webLegal', 'seo'];
