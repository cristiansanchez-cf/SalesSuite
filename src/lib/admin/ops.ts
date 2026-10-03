import { z } from 'zod';
import { REGISTRY } from '../../modules/registry';
import { brandSchema } from '../brand';
import { themeTokensSchema } from '../theme';

/** Operaciones del builder (contrato compartido cliente/servidor). Cada op devuelve el BuilderState completo. */
const id = z.string().uuid();
const money = z.number().finite().min(0).max(10_000_000).multipleOf(0.01);
const optText = (max: number) => z.string().trim().max(max).transform((s) => (s === '' ? null : s)).nullable();

export const dossierPatchSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(140),
  prospectName: optText(120),
  prospectCompany: optText(120),
  locale: z.enum(['es-ES', 'en-GB', 'ca-ES', 'pt-PT', 'fr-FR']),
  priceMode: z.enum(['none', 'total', 'per_module']),
  totalPrice: money.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).partial().strict();

export const builderOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update'), patch: dossierPatchSchema }),
  z.object({ op: z.literal('addItem'), moduleVersionId: id, index: z.number().int().min(0).optional() }),
  z.object({ op: z.literal('move'), itemId: id, toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal('setVisible'), itemId: id, visible: z.boolean() }),
  z.object({ op: z.literal('setPrice'), itemId: id, priceOverride: money.nullable() }),
  z.object({ op: z.literal('setProps'), itemId: id, propOverrides: z.record(z.unknown()) }),
  z.object({ op: z.literal('removeItem'), itemId: id }),
  z.object({ op: z.literal('upgradeItem'), itemId: id }),
  z.object({ op: z.literal('setStatus'), status: z.enum(['draft', 'published', 'archived']) }),
  z.object({ op: z.literal('createLink'), expiresAt: z.string().datetime({ offset: true }).nullable().optional() }),
  z.object({ op: z.literal('revokeLink'), linkId: id }),
  z.object({ op: z.literal('setOutcome'), outcome: z.enum(['open', 'won', 'lost']), note: optText(500).optional() }),
]);

export type BuilderOp = z.infer<typeof builderOpSchema>;
export type DossierPatch = z.infer<typeof dossierPatchSchema>;

export const createDossierSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(140),
  prospectName: optText(120).optional(),
  prospectCompany: optText(120).optional(),
  /** Copiar módulos/precio de otro dossier del tenant (plantilla). */
  fromDossierId: id.optional(),
});
export type CreateDossierInput = z.infer<typeof createDossierSchema>;

// ---------------------------------------------------------------- gestión del tenant (admins)

export const roleSchema = z.enum(['admin', 'rep']);

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email no válido').max(200),
  role: roleSchema,
});

const blockTypes = Object.keys(REGISTRY) as [keyof typeof REGISTRY, ...(keyof typeof REGISTRY)[]];

export const moduleCreateSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Clave: minúsculas, números y guiones (2-63)'),
  blockType: z.enum(blockTypes),
  name: z.string().trim().min(1, 'Nombre obligatorio').max(80),
  description: optText(240).optional(),
});

export const moduleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optText(240).optional(),
  isCatalog: z.boolean(),
}).partial();

export const draftSchema = z.object({
  defaultProps: z.record(z.unknown()),
  defaultPrice: money.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const LOCALES = ['es-ES', 'en-GB', 'ca-ES', 'pt-PT', 'fr-FR'] as const;

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  defaultLocale: z.enum(LOCALES),
  themeTokens: themeTokensSchema,
  brand: brandSchema,
});
export type SettingsInput = z.infer<typeof settingsSchema>;
