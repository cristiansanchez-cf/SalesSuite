import { REGISTRY, isBlockType, type BlockType } from './registry';
import { resolveItemPrice, type ResolvedPrice } from '~/lib/pricing';
import type { PublicDossier, RenderItem } from '~/lib/types';
import type { ModuleContext } from './types';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Merge profundo para objetos; arrays y escalares del override reemplazan. */
export function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k] as Record<string, unknown>, v) : v;
  }
  return out;
}

export type ResolvedItem =
  | { ok: true; item: RenderItem; blockType: BlockType; props: Record<string, unknown>; ctx: ModuleContext }
  | { ok: false; item: RenderItem; reason: string };

/** default_props ⊕ prop_overrides, validado contra schema.ts, + contexto/precio. */
export function resolveItem(item: RenderItem, dossier: PublicDossier, total: ResolvedPrice | null): ResolvedItem {
  if (!isBlockType(item.blockType)) return { ok: false, item, reason: `block_type desconocido: ${item.blockType}` };
  const merged = deepMerge(item.defaultProps ?? {}, item.propOverrides ?? {});
  const parsed = REGISTRY[item.blockType].schema.safeParse(merged);
  if (!parsed.success) {
    return { ok: false, item, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return {
    ok: true,
    item,
    blockType: item.blockType,
    props: parsed.data as Record<string, unknown>,
    ctx: {
      itemId: item.id,
      locale: dossier.locale,
      prospectName: dossier.prospectName,
      prospectCompany: dossier.prospectCompany,
      priceMode: dossier.priceMode,
      price: resolveItemPrice(item, dossier.priceMode, dossier.currency, dossier.locale),
      total,
    },
  };
}

/** Sustituye {prospect} / {company} en textos (personalización ligera por dossier). */
export function interpolate(text: string, ctx: Pick<ModuleContext, 'prospectName' | 'prospectCompany'>): string {
  return text
    .replaceAll('{prospect}', ctx.prospectName ?? '')
    .replaceAll('{company}', ctx.prospectCompany ?? ctx.prospectName ?? '');
}
