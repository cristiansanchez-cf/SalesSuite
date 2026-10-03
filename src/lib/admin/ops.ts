import { z } from 'zod';
import { REGISTRY } from '../../modules/registry';
import { brandSchema } from '../brand';
import { themeTokensSchema } from '../theme';

/** Operaciones del builder (contrato compartido cliente/servidor). Cada op devuelve el BuilderState completo. */
const id = z.string().uuid();
/** Situación: { clave de faceta: [claves de opción] } (src/lib/evidence). */
export const situationSchema = z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/), z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)).max(20))
  .refine((o) => Object.keys(o).length <= 30, 'Demasiadas facetas');
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

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Pon un nombre (o el cargo)').max(120),
  personaId: id.nullable().default(null),
  stance: z.enum(['aliado', 'neutral', 'bloqueador', 'desconocido']).default('desconocido'),
  email: z.string().trim().email().max(200).nullable().or(z.literal('').transform(() => null)).default(null),
  phone: z.string().trim().max(40).regex(/^[+\d\s()-]*$/, 'teléfono').nullable().transform((v) => v || null).default(null),
  notes: optText(1000).default(null),
  traits: situationSchema.default({}),
});

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
  z.object({ op: z.literal('setSegment'), segmentId: id.nullable() }),
  z.object({ op: z.literal('setNextStep'), text: optText(300), at: z.string().datetime({ offset: true }).nullable() }),
  z.object({ op: z.literal('addContact'), contact: contactSchema }),
  z.object({ op: z.literal('updateContact'), contactId: id, contact: contactSchema.partial() }),
  z.object({ op: z.literal('removeContact'), contactId: id }),
  z.object({ op: z.literal('setSituation'), situation: situationSchema }),
  z.object({ op: z.literal('setAccount'), accountId: id.nullable() }),
]);

export type BuilderOp = z.infer<typeof builderOpSchema>;
/** Forma de entrada (campos con valor por defecto opcionales): lo que envía el cliente. */
export type BuilderOpInput = z.input<typeof builderOpSchema>;
export type DossierPatch = z.infer<typeof dossierPatchSchema>;

export const createDossierSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(140),
  prospectName: optText(120).optional(),
  prospectCompany: optText(120).optional(),
  /** Copiar módulos/precio de otro dossier del tenant (plantilla). */
  fromDossierId: id.optional(),
  /** Colaborador: cuenta asignada (obligatoria para él; fija sector y política de precio). */
  partnerAccountId: id.optional(),
  /** Cuenta del CRM (docs/ACCOUNTS.md): vincularla cuenta como contacto. */
  accountId: id.optional(),
});
export type CreateDossierInput = z.infer<typeof createDossierSchema>;

// ---------------------------------------------------------------- gestión del tenant (admins)

export const roleSchema = z.enum(['admin', 'lead', 'rep']);

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email no válido').max(200),
  role: roleSchema,
});

const blockTypes = Object.keys(REGISTRY) as [keyof typeof REGISTRY, ...(keyof typeof REGISTRY)[]];

// ---------------------------------------------------------------- colaboradores (docs/PARTNERS.md)

/** "AAAA-MM-DD" (input date) → fin de ese día; vacío → sin caducidad. */
const expiryDate = z.union([
  z.literal('').transform(() => null),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').transform((d) => `${d}T23:59:59.000Z`),
  z.string().datetime({ offset: true }),
]).nullable().default(null);

export const partnerProfileSchema = z.object({
  moduleIds: z.array(id).max(100).default([]),
  seeTeamTips: z.boolean().default(false),
  canInvite: z.boolean().default(false),
  welcomeNote: optText(4000).default(null),
  expiresAt: expiryDate,
});

export const partnerInviteSchema = partnerProfileSchema.extend({
  email: z.string().trim().toLowerCase().email('Email no válido').max(200),
});

export const PRICE_POLICIES = ['hidden', 'list', 'adjusted'] as const;
export const partnerAccountSchema = z.object({
  name: z.string().trim().min(1, 'Pon el nombre de la cuenta (local, centro…)').max(120),
  segmentId: id.nullable().or(z.literal('').transform(() => null)).default(null),
  pricePolicy: z.enum(PRICE_POLICIES).default('hidden'),
  priceAdjustPct: z.coerce.number().finite().min(-90, 'Mínimo −90 %').max(200, 'Máximo +200 %').multipleOf(0.01).default(0),
  notes: optText(2000).default(null),
});

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
