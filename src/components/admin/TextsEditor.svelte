<script lang="ts">
  /**
   * «Editar textos» de una diapositiva, solo para esta propuesta: cada texto que lee el cliente en su campo, con su nombre
   * («Título», «Tarjeta 2 · Problema»), sin JSON. Lo que no se toca sigue el catálogo. Ver lib/admin/text-fields.ts.
   * Los apartados, tarjetas y puntos se pueden quitar (criterio de Teresa: «puedo cambiar el apartado, pero no eliminarlo»);
   * siempre queda uno, y si el módulo necesita más, el servidor lo dice al guardar.
   */
  import type { BuilderItem } from '~/lib/admin/types';
  import { collectTextFields, elementPaths, fieldLabel, getAt, mergeProps, removeAt, setAt, textOverrides, type TextPath } from '~/lib/admin/text-fields';

  type T = { help: string; company: string; save: string; cancel: string; reset: string; changed: string; empty: string; saved: string; remove: string; undo: string; labels: Record<string, string> };
  let { item, editable, t, onsave, onclose }: {
    item: BuilderItem; editable: boolean; t: T;
    onsave: (overrides: Record<string, unknown>) => Promise<boolean>; onclose: () => void;
  } = $props();

  const current = $derived(mergeProps(item.defaultProps ?? {}, item.propOverrides ?? {}));
  const catalog = $derived(collectTextFields(item.defaultProps ?? {}));
  let draft = $state<Record<string, unknown>>({});
  let saving = $state(false);
  let done = $state(false);
  $effect(() => { draft = structuredClone($state.snapshot(current)) as Record<string, unknown>; });

  const fields = $derived(collectTextFields(draft));
  const key = (p: TextPath) => p.join('.');
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(current));
  const hasCompany = $derived(fields.some((f) => f.value.includes('{company}')));
  /** Misma forma que el catálogo en esa ruta (si se quitó algo, los números ya no casan: sin «cambiado» ahí). */
  const sameShape = (p: TextPath) => elementPaths(p).every((ep) => {
    const list = ep.slice(0, -1);
    return (getAt(draft, list) as unknown[] | undefined)?.length === (getAt(item.defaultProps, list) as unknown[] | undefined)?.length;
  });
  const catalogValue = (p: TextPath) => (sameShape(p) ? catalog.find((f) => key(f.path) === key(p))?.value : undefined);
  /** Se puede quitar si su lista tiene más de uno. */
  const removable = (ep: TextPath) => ((getAt(draft, ep.slice(0, -1)) as unknown[] | undefined)?.length ?? 0) > 1;
  /** Los apartados/tarjetas que empiezan en este campo (su cabecera, con «Quitar»): no los que son el propio texto. */
  const startsAt = (i: number) => elementPaths(fields[i].path)
    .filter((ep) => ep.length < fields[i].path.length && (i === 0 || !key(fields[i - 1].path).startsWith(key(ep) + '.')));
  const ownElement = (p: TextPath) => (typeof p[p.length - 1] === 'number' ? p : null);

  function edit(p: TextPath, v: string) { draft = setAt(draft, p, v); done = false; }
  function remove(ep: TextPath) { draft = removeAt(draft, ep); done = false; }
  function undo() { draft = structuredClone($state.snapshot(current)) as Record<string, unknown>; }
  async function save() {
    saving = true;
    const ok = await onsave(textOverrides(item.defaultProps ?? {}, current, draft, item.propOverrides ?? {}));
    saving = false;
    if (ok) done = true;
  }
</script>

<div class="space-y-3 border-t border-line p-3 text-sm" data-testid="texts-editor">
  <p class="text-xs text-muted">{t.help}{#if hasCompany}{' '}{t.company}{/if}</p>
  {#if fields.length === 0}<p class="co-meta">{t.empty}</p>{/if}
  {#each fields as f, i (key(f.path))}
    {@const orig = catalogValue(f.path)}
    {@const own = ownElement(f.path)}
    {#each startsAt(i) as ep (key(ep))}
      <div class="flex items-center gap-2 border-t border-line pt-3" data-testid="text-group" data-path={key(ep)}>
        <p class="m-0 flex-1 text-xs font-bold uppercase tracking-wide text-muted">{fieldLabel(ep, t.labels)}</p>
        {#if editable && removable(ep)}<button type="button" class="co-btn co-btn--quiet co-btn--sm" onclick={() => remove(ep)} data-testid="text-remove" data-path={key(ep)} aria-label="{t.remove}: {fieldLabel(ep, t.labels)}">✕ {t.remove}</button>{/if}
      </div>
    {/each}
    <div class="grid gap-1">
      <span class="flex items-baseline gap-2 text-xs font-semibold">
        <label for="tf-{item.id}-{key(f.path)}">{fieldLabel(f.path, t.labels)}</label>
        {#if orig !== undefined && orig !== f.value}
          <span class="font-normal text-muted">· {t.changed}</span>
          {#if editable}<button type="button" class="text-xs font-normal underline" onclick={() => edit(f.path, orig)}>{t.reset}</button>{/if}
        {/if}
        {#if editable && own && removable(own)}<button type="button" class="ml-auto text-xs font-normal text-muted underline" onclick={() => remove(own)} data-testid="text-remove" data-path={key(own)} aria-label="{t.remove}: {fieldLabel(own, t.labels)}">{t.remove}</button>{/if}
      </span>
      {#if f.long || (orig?.length ?? 0) > 70}
        <textarea id="tf-{item.id}-{key(f.path)}" class="co-input min-h-[5rem] text-sm" rows={Math.min(6, Math.ceil(f.value.length / 70) + 1)} value={f.value} disabled={!editable}
          oninput={(e) => edit(f.path, e.currentTarget.value)} data-testid="text-field" data-path={key(f.path)}></textarea>
      {:else}
        <input id="tf-{item.id}-{key(f.path)}" class="co-input text-sm" value={f.value} disabled={!editable} oninput={(e) => edit(f.path, e.currentTarget.value)} data-testid="text-field" data-path={key(f.path)} />
      {/if}
    </div>
  {/each}
  <div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
    {#if editable}<button type="button" class="co-btn co-btn--primary co-btn--sm" disabled={!dirty || saving} onclick={save} data-testid="texts-save">{t.save}</button>{/if}
    {#if editable && dirty}<button type="button" class="co-btn co-btn--quiet co-btn--sm" onclick={undo} data-testid="texts-undo">{t.undo}</button>{/if}
    <button type="button" class="co-btn co-btn--quiet co-btn--sm" onclick={onclose}>{t.cancel}</button>
    {#if done && !dirty}<span class="text-xs text-muted" role="status">{t.saved}</span>{/if}
  </div>
</div>
