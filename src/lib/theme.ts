import { z } from 'zod';

/**
 * Contrato de `tenant.theme_tokens` / `dossier.theme_override`.
 * Lista blanca de claves + validación de valores: estos JSON los escribe un admin de
 * tenant y acaban dentro de un <style>, así que nada de texto libre sin validar.
 */
const hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color hex (#rgb o #rrggbb)');
const length = z.string().regex(/^(?:0|\d+(?:\.\d+)?(?:px|rem|em|%))$/, 'longitud CSS (px|rem|em|%)');
const fontStack = z.string().max(300).regex(/^[\w\s,'"-]+$/, 'stack de fuentes');
const fontUrl = z.string().url().refine((u) => /^https:\/\//.test(u) || u.startsWith('/'), 'https o ruta absoluta')
  .refine((u) => !/["'()\\\s]/.test(u), 'url sin comillas/paréntesis');

export const COLOR_KEYS = [
  'bg', 'surface', 'text', 'muted', 'border',
  'primary', 'primary-contrast', 'accent', 'accent-contrast',
] as const;
export const RADIUS_KEYS = ['card', 'button', 'pill'] as const;

export const themeTokensSchema = z.object({
  colors: z.object(Object.fromEntries(COLOR_KEYS.map((k) => [k, hex.optional()])) as Record<(typeof COLOR_KEYS)[number], z.ZodOptional<typeof hex>>).strict().optional(),
  radius: z.object(Object.fromEntries(RADIUS_KEYS.map((k) => [k, length.optional()])) as Record<(typeof RADIUS_KEYS)[number], z.ZodOptional<typeof length>>).strict().optional(),
  font: z.object({
    sans: fontStack.optional(),
    display: fontStack.optional(),
    faces: z.array(z.object({
      family: z.string().regex(/^[\w\s-]+$/),
      src: fontUrl,
      weight: z.string().regex(/^\d{3}(?: \d{3})?$/).default('400'),
      style: z.enum(['normal', 'italic']).default('normal'),
    })).max(8).optional(),
  }).strict().optional(),
}).strict();

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

/** Parsea tokens desconocidos; si son inválidos se descartan (tema por defecto) y se avisa. */
export function parseTheme(raw: unknown): ThemeTokens {
  if (raw == null) return {};
  const r = themeTokensSchema.safeParse(raw);
  if (!r.success) {
    console.warn('[theme] tokens inválidos, se ignoran:', r.error.issues.map((i) => i.path.join('.')).join(', '));
    return {};
  }
  return r.data;
}

/** tenant ⊕ override de dossier (merge por grupo). */
export function mergeTheme(base: ThemeTokens, override: ThemeTokens | null | undefined): ThemeTokens {
  if (!override) return base;
  return {
    colors: { ...base.colors, ...override.colors },
    radius: { ...base.radius, ...override.radius },
    font: {
      ...base.font,
      ...override.font,
      faces: [...(base.font?.faces ?? []), ...(override.font?.faces ?? [])],
    },
  };
}

export function hexToChannels(h: string): string {
  let s = h.slice(1);
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Serializa tokens validados a CSS. Solo debe recibir ThemeTokens que pasaron por parseTheme. */
export function themeToCss(tokens: ThemeTokens, selector = '.ds-root'): string {
  const decls: string[] = [];
  for (const [k, v] of Object.entries(tokens.colors ?? {})) if (v) decls.push(`--color-${k}: ${hexToChannels(v)};`);
  for (const [k, v] of Object.entries(tokens.radius ?? {})) if (v) decls.push(`--radius-${k}: ${v};`);
  if (tokens.font?.sans) decls.push(`--font-sans: ${tokens.font.sans};`);
  if (tokens.font?.display) decls.push(`--font-display: ${tokens.font.display};`);

  const faces = (tokens.font?.faces ?? []).map((f) =>
    `@font-face{font-family:'${f.family}';src:url(${f.src}) format('woff2');font-weight:${f.weight};font-style:${f.style};font-display:swap;}`,
  );
  const body = decls.length ? `${selector}{${decls.join('')}}` : '';
  return [...faces, body].filter(Boolean).join('\n');
}
