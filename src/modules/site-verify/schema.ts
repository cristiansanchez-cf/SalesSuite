import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * Su web con el sello (SciScreen): la captura de su web (Personalizar → Su web) en un navegador, con el sello real
 * encima, a su tamaño (como si estuviera instalado). Un cursor lo pulsa y el navegador abre la página pública del sello en
 * sciscreen.com: lo que ve el consumidor (marca, estado, URL verificada, fechas y cada afirmación con su evidencia).
 *
 * - Siempre lleva la etiqueta «Simulación» sobre su web: la marca aún no está verificada (no se puede quitar).
 * - `seals`: 1–3 sellos (compacto, placa o tarjeta; claro u oscuro según lo que haya debajo). `x`/`y`: su esquina de
 *   arriba a la izquierda, en % de la captura. Miden lo que medirían instalados en una página de 1440 px; `scale` lo
 *   agranda (hasta ×3) para webs cargadas que no controla la marca (las tiendas que venden su producto).
 * - Al entrar, el sello cae sobre la página y lo de alrededor se oscurece un momento (para que se vea en cualquier web).
 * - Textos: `{company}` es la empresa de la propuesta; `{date}`, hoy («12 de noviembre de 2026»); `{nextYear}`, dentro
 *   de un año. El sello certifica que las afirmaciones de esa página se han revisado contra la literatura científica:
 *   nunca el producto ni la marca.
 */
const sealSchema = z.object({
  size: z.enum(['compacto', 'placa', 'tarjeta']).default('compacto'),
  ground: z.enum(['claro', 'oscuro']).default('claro'),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  scale: z.number().min(1).max(3).default(1),
});

export const siteVerifySchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(400).optional(),
  seals: z.array(sealSchema).min(1).max(3).default([{ size: 'compacto', ground: 'claro', x: 4, y: 70 }]),
  /** El que pulsa el cursor (posición en `seals`). */
  press: z.number().int().min(0).max(2).default(0),
  /** Siempre se enseña: la marca aún no está verificada. */
  simulation: z.string().min(1).max(30).default('Simulación'),
  hint: z.string().max(80).default('Pulsa el sello'),
  replay: z.string().max(40).default('Volver a verlo'),
  back: z.string().max(40).default('Volver a su web'),
  /** Las frases que acompañan cada momento de la escena. */
  captions: z.object({
    start: z.string().max(160).default('Así se vería {company} con el sello de SciScreen.'),
    seal: z.string().max(160).default('El sello va junto a las afirmaciones y dice cuándo se revisaron.'),
    click: z.string().max(160).default('Quien duda, lo pulsa…'),
    page: z.string().max(200).default('…y abre en sciscreen.com qué se revisó, con qué estudios y hasta cuándo. Lo dice un tercero, no la marca.'),
  }).default({}),
  /** La página pública del sello en sciscreen.com (lo que se abre al pulsarlo). */
  page: z.object({
    path: z.string().max(80).default('sciscreen.com/es/sello/'),
    status: z.string().min(1).max(40).default('Vigente'),
    reviewed: z.string().max(80).default('Revisado el {date}'),
    validUntil: z.string().max(60).default('{nextYear}'),
    labels: z.object({
      brand: z.string().max(40).default('Marca'),
      seal: z.string().max(40).default('Sello'),
      url: z.string().max(40).default('URL verificada'),
      date: z.string().max(40).default('Fecha del dictamen'),
      until: z.string().max(40).default('Vigente hasta'),
      claims: z.string().max(60).default('Afirmaciones publicadas'),
    }).default({}),
    /** Cada afirmación de la página, con su evidencia (el nivel va aquí, por afirmación) y sus estudios. */
    claims: z.array(z.object({
      text: z.string().min(1).max(200),
      evidence: z.string().max(200).optional(),
      sources: z.array(z.object({ title: z.string().min(1).max(160), ref: z.string().max(120).optional() })).max(3).default([]),
    })).min(1).max(4),
  }),
  /** Sin captura de su web: una página de ejemplo con su nombre y lo que afirma. */
  fallback: z.object({
    address: z.string().max(80).default('tumarca.com'),
    claims: z.array(z.string().min(1).max(160)).min(1).max(3),
  }).optional(),
  note: z.string().max(300).optional(),
});

export type SiteVerifyProps = z.infer<typeof siteVerifySchema>;
