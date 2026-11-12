import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * Su web, verificada: la captura de la web del cliente (Personalizar → Su web) en un navegador, con el sello encima.
 * Un cursor lo pulsa y se abre el registro, como lo vería quien visita su página: estado, nivel de evidencia y cada
 * afirmación con su dictamen. Sin captura, una página de ejemplo con su nombre.
 * - `seal`: el dibujo tal cual (entero, nunca por debajo de 72 px de alto). `sealAt`: dónde va, en % de la página.
 * - `record`: lo que enseña el registro. `{company}` es la empresa de la propuesta; `{date}`, el día de hoy.
 */
export const siteVerifySchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(400).optional(),
  seal: z.object({ src: url, alt: z.string().min(1).max(140) }),
  sealAt: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).default({ x: 50, y: 74 }),
  hint: z.string().max(80).default('Pulsa el sello'),
  replay: z.string().max(40).default('Ver otra vez'),
  record: z.object({
    heading: z.string().max(60).default('Registro de verificación'),
    status: z.string().min(1).max(40).default('Vigente'),
    statusNote: z.string().max(120).default('Verificado a día {date}'),
    level: z.object({
      label: z.string().max(40).default('Nivel de evidencia'),
      value: z.string().min(1).max(40),
      score: z.number().int().min(0).max(6),
      of: z.number().int().min(2).max(6).default(5),
    }).optional(),
    claimsLabel: z.string().max(60).default('Afirmaciones verificadas'),
    claims: z.array(z.object({
      text: z.string().min(1).max(200),
      verdict: z.string().min(1).max(40),
      evidence: z.string().max(160).optional(),
    })).min(1).max(4),
    facts: z.array(z.object({ label: z.string().min(1).max(40), value: z.string().min(1).max(80) })).max(4).default([]),
    cta: z.string().max(60).optional(),
    close: z.string().max(30).default('Cerrar'),
  }),
  /** Sin captura de su web: la página de ejemplo (dirección y lo que afirma). */
  fallback: z.object({
    address: z.string().max(80).default('tumarca.com'),
    claims: z.array(z.string().min(1).max(160)).min(1).max(3),
  }).optional(),
  note: z.string().max(300).optional(),
});

export type SiteVerifyProps = z.infer<typeof siteVerifySchema>;
