/** Glosario y notas del espacio (lo carga el alta del espacio; aquí solo se lee). Solo dentro de la app (Vite). */
const FILES = import.meta.glob<{ glossary?: string[]; notes?: string } | undefined>('../../../tenants/*/tenant.json', { import: 'content_i18n' });
export async function glossaryFor(slug: string): Promise<{ glossary: string[]; notes?: string }> {
  const load = Object.entries(FILES).find(([p]) => p.endsWith(`/tenants/${slug}/tenant.json`))?.[1];
  const c = load ? await load().catch(() => undefined) : undefined;
  return { glossary: Array.isArray(c?.glossary) ? c!.glossary.filter((x) => typeof x === 'string') : [], notes: typeof c?.notes === 'string' ? c.notes : undefined };
}
