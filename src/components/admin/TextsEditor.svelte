<script lang="ts">
  /**
   * «Editar textos» de una diapositiva, solo para esta propuesta: cada texto que lee el cliente en su campo, con su nombre
   * («Título», «Tarjeta 2 · Problema»), sin JSON. Lo que no se toca sigue el catálogo. Ver lib/admin/text-fields.ts.
   */
  import type { BuilderItem } from '~/lib/admin/types';
  import { collectTextFields, fieldLabel, mergeProps, setAt, textOverrides } from '~/lib/admin/text-fields';

  type T = { help: string; company: string; save: string; cancel: string; reset: string; changed: string; empty: string; saved: string; labels: Record<string, string> };
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
  const key = (p: Array<string | number>) => p.join('.');
  const catalogValue = (p: Array<string | number>) => catalog.find((f) => key(f.path) === key(p))?.value;
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(current));
  const hasCompany = $derived(fields.some((f) => f.value.includes('{company}')));

  function edit(p: Array<string | number>, v: string) { draft = setAt(draft, p, v); done = false; }
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
  {#each fields as f (key(f.path))}
    {@const orig = catalogValue(f.path)}
    <label class="grid gap-1">
      <span class="flex items-baseline gap-2 text-xs font-semibold">
        {fieldLabel(f.path, t.labels)}
        {#if orig !== undefined && orig !== f.value}
          <span class="font-normal text-muted">· {t.changed}</span>
          {#if editable}<button type="button" class="text-xs font-normal underline" onclick={() => edit(f.path, orig)}>{t.reset}</button>{/if}
        {/if}
      </span>
      {#if f.long || (orig?.length ?? 0) > 70}
        <textarea class="co-input min-h-[5rem] text-sm" rows={Math.min(6, Math.ceil(f.value.length / 70) + 1)} value={f.value} disabled={!editable}
          oninput={(e) => edit(f.path, e.currentTarget.value)} data-testid="text-field" data-path={key(f.path)}></textarea>
      {:else}
        <input class="co-input text-sm" value={f.value} disabled={!editable} oninput={(e) => edit(f.path, e.currentTarget.value)} data-testid="text-field" data-path={key(f.path)} />
      {/if}
    </label>
  {/each}
  <div class="flex flex-wrap items-center gap-2">
    {#if editable}<button type="button" class="co-btn co-btn--primary co-btn--sm" disabled={!dirty || saving} onclick={save} data-testid="texts-save">{t.save}</button>{/if}
    <button type="button" class="co-btn co-btn--quiet co-btn--sm" onclick={onclose}>{t.cancel}</button>
    {#if done && !dirty}<span class="text-xs text-muted" role="status">{t.saved}</span>{/if}
  </div>
</div>
