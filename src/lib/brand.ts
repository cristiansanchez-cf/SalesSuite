import { z } from 'zod';

/**
 * `tenant.brand`: identidad fuera del tema (logo, favicon, imagen para compartir, contacto).
 * URLs https o rutas absolutas (/…); los assets subidos viven en Supabase Storage (bucket tenant-assets).
 */
const url = z.string().max(500).refine((u) => /^https:\/\/[^\s"'<>()]+$/.test(u) || /^\/[^\s"'<>()]*$/.test(u), 'URL https o ruta absoluta');
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().or(z.literal('').transform(() => undefined));

export const brandSchema = z.object({
  logoUrl: opt(url),
  /** Variante para fondos oscuros (opcional). */
  logoOnDarkUrl: opt(url),
  logoAlt: opt(z.string().max(80)),
  faviconUrl: opt(url),
  /** 1200×630 recomendado: lo que se ve al pegar el enlace en WhatsApp/Slack/LinkedIn. */
  ogImageUrl: opt(url),
  contact: z.object({
    email: opt(z.string().email().max(120)),
    phone: opt(z.string().regex(/^\+?[\d\s()-]{6,20}$/, 'teléfono')),
    /** Número en formato internacional sin '+' ni espacios (wa.me). */
    whatsapp: opt(z.string().regex(/^\d{8,15}$/, 'WhatsApp: solo dígitos, con prefijo de país')),
    website: opt(z.string().url().refine((u) => u.startsWith('https://'), 'https')),
  }).strict().optional(),
  /** Texto legal del pie (razón social, etc.). */
  legal: opt(z.string().max(200)),
}).strict();

export type Brand = z.infer<typeof brandSchema>;

export function parseBrand(raw: unknown): Brand {
  if (raw == null) return {};
  const r = brandSchema.safeParse(raw);
  if (!r.success) {
    console.warn('[brand] inválido, se ignora:', r.error.issues.map((i) => i.path.join('.')).join(', '));
    return {};
  }
  return r.data;
}
