<script lang="ts">
  /**
   * Pantallas de la pantalla en vivo de UNA propuesta (docs/PERSONALIZE.md §Pantallas): qué sale, en qué orden y con qué
   * texto y fotos, sin tocar JSON. Se guarda en las props de la propuesta (`scenes`); «Volver a las del catálogo» lo quita.
   * Las fotos se eligen de las que el comercial sube en Personaliza (el cartel del anuncio, las del carrusel…).
   */
  import type { BuilderItem } from '~/lib/admin/types';
  import type { builderMessages } from '~/lib/i18n/messages/builder';

  type T = typeof builderMessages.es.scenes;
  type Scene = { scene: string; label: string; says?: string; text?: string; images?: string[]; video?: boolean };
  type Row = { id: number; kind: string; label: string; says: string; text: string; images: string[] };
  let { item, photos, hasVideo, editable, t, onsave }:
    { item: BuilderItem; photos: string[]; hasVideo: boolean; editable: boolean; t: T; onsave: (scenes: Scene[] | null) => Promise<boolean> } = $props();

  const MAX = 16;
  const KINDS = ['tp.idle', 'video', 'tp.full', 'tp.photo', 'tp.message', 'club.idle', 'club.photo', 'club.message', 'club.promo', 'club.carousel', 'club.song', 'club.toast', 'tp.song'];
  /** Lo que no lleva texto propio (el reclamo pequeño, su vídeo, las canciones en pequeño). */
  const NO_TEXT = new Set(['tp.idle', 'video', 'club.toast', 'tp.song']);
  /** Una foto (el cartel, la que sale) o varias (el carrusel). */
  const ONE_PHOTO = new Set(['club.promo', 'club.photo', 'tp.full']);

  const custom = $derived(Array.isArray(item.propOverrides?.scenes));
  const current = $derived(((custom ? item.propOverrides.scenes : item.defaultProps?.scenes) ?? []) as Scene[]);
  let open = $state(false);
  let rows = $state<Row[]>([]);
  let seq = 0;
  let saving = $state(false);

  const toRow = (s: Scene): Row => ({ id: seq++, kind: s.video ? 'video' : s.scene, label: s.label ?? '', says: s.says ?? '', text: s.text ?? '', images: [...(s.images ?? [])] });
  const toScene = (r: Row): Scene => {
    const base = { label: r.label.trim().slice(0, 30) || short(t.kinds[r.kind] ?? r.kind), says: r.says.trim().slice(0, 220) };
    if (r.kind === 'video') return { scene: 'tp.idle', video: true, ...base };
    const imgs = r.images.filter((u) => photos.includes(u));
    return { scene: r.kind, ...base, ...(r.text.trim() && !NO_TEXT.has(r.kind) ? { text: r.text.trim().slice(0, 120) } : {}), ...(imgs.length ? { images: ONE_PHOTO.has(r.kind) ? imgs.slice(0, 1) : imgs.slice(0, 8) } : {}) };
  };
  /** Nombre por defecto: el tipo sin su aclaración entre paréntesis, cortado por una palabra (máx. 30). */
  function short(raw: string) {
    const s = raw.replace(/\s*\(.*\)\s*$/, '');
    if (s.length <= 30) return s;
    const cut = s.slice(0, 30);
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s+]+$/, '');
  }

  function start() { rows = current.map(toRow); open = true; }
  function add(kind: string) {
    if (!kind || rows.length >= MAX) return;
    rows = [...rows, { id: seq++, kind, label: short(t.kinds[kind] ?? kind), says: '', text: '', images: kind === 'club.carousel' ? photos.slice(0, 5) : [] }];
  }
  function addLove() { rows = [...rows, ...t.love.map((s) => toRow(s))].slice(0, MAX); }
  function move(i: number, d: number) { const n = [...rows]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); rows = n; }
  function togglePhoto(r: Row, url: string) {
    if (ONE_PHOTO.has(r.kind)) r.images = r.images[0] === url ? [] : [url];
    else r.images = r.images.includes(url) ? r.images.filter((u) => u !== url) : [...r.images, url].slice(0, 8);
  }
  async function save(scenes: Scene[] | null) {
    saving = true;
    try { if (await onsave(scenes)) open = false; } finally { saving = false; }
  }
</script>

<div class="grid gap-2 border-t border-line px-3 py-2 text-sm" data-testid="scenes-editor">
  <div class="flex flex-wrap items-center gap-2">
    <span class="font-semibold">{t.title}</span>
    <span class="co-meta">{custom ? `${t.custom} · ${current.length}` : current.length}</span>
    {#if editable && !open}
      <button type="button" class="co-btn co-btn--quiet co-btn--sm ml-auto" onclick={start} data-testid="scenes-open">{t.edit}</button>
    {/if}
  </div>
  {#if !open}
    <p class="co-meta truncate">{current.map((s) => s.label).join(' · ')}</p>
  {:else}
    <p class="co-help">{t.help}</p>
    <ol class="m-0 grid gap-2 p-0">
      {#each rows as r, i (r.id)}
        <li class="grid list-none gap-2 rounded-[var(--console-radius-control)] border border-[var(--console-card-border)] p-2" data-testid="scene-row" data-kind={r.kind}>
          <div class="flex flex-wrap items-center gap-2">
            <span class="co-meta w-6 text-right">{String(i + 1).padStart(2, '0')}</span>
            <select class="co-select !min-h-[32px] !w-auto !py-1" bind:value={r.kind} aria-label={t.add} data-testid="scene-kind">
              {#each KINDS as k (k)}<option value={k}>{t.kinds[k]}</option>{/each}
            </select>
            <span class="ml-auto flex gap-1">
              <button type="button" class="co-btn co-btn--quiet co-btn--sm" disabled={i === 0} onclick={() => move(i, -1)} aria-label={t.up}>↑</button>
              <button type="button" class="co-btn co-btn--quiet co-btn--sm" disabled={i === rows.length - 1} onclick={() => move(i, 1)} aria-label={t.down}>↓</button>
              <button type="button" class="co-btn co-btn--quiet co-btn--sm" onclick={() => (rows = rows.filter((x) => x.id !== r.id))} aria-label={t.remove} data-testid="scene-remove">✕</button>
            </span>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <label class="grid gap-1"><span class="text-xs text-muted">{t.name}</span>
              <input class="co-input !min-h-[32px] !py-1" maxlength="30" bind:value={r.label} data-testid="scene-label" /></label>
            {#if !NO_TEXT.has(r.kind)}
              <label class="grid gap-1"><span class="text-xs text-muted">{t.text}</span>
                <input class="co-input !min-h-[32px] !py-1" maxlength="120" bind:value={r.text} data-testid="scene-text" /></label>
            {/if}
            <label class="grid gap-1 sm:col-span-2"><span class="text-xs text-muted">{t.says}</span>
              <input class="co-input !min-h-[32px] !py-1" maxlength="220" bind:value={r.says} data-testid="scene-says" /></label>
          </div>
          {#if r.kind === 'video' && !hasVideo}<p class="co-help">{t.noVideo}</p>{/if}
          {#if ONE_PHOTO.has(r.kind) || r.kind === 'club.carousel'}
            <div class="grid gap-1">
              <span class="text-xs text-muted">{t.photos}{ONE_PHOTO.has(r.kind) && r.kind === 'club.promo' && !r.images.length ? ` · ${t.textOnly}` : ''}</span>
              {#if photos.length}
                <div class="flex flex-wrap gap-1.5">
                  {#each photos as url, k (url)}
                    <button type="button" class="relative h-12 w-12 overflow-hidden rounded-md border-2 {r.images.includes(url) ? 'border-[color:var(--co-signal)]' : 'border-transparent opacity-60'}"
                      aria-pressed={r.images.includes(url)} aria-label="{t.photos} {k + 1}" onclick={() => togglePhoto(r, url)} data-testid="scene-photo">
                      <img src={url} alt="" class="h-full w-full object-cover" loading="lazy" />
                    </button>
                  {/each}
                </div>
              {:else}<p class="co-help">{t.noPhotos}</p>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    <div class="flex flex-wrap items-center gap-2">
      <select class="co-select !min-h-[32px] !w-auto !py-1" disabled={rows.length >= MAX} onchange={(e) => { add(e.currentTarget.value); e.currentTarget.value = ''; }} data-testid="scene-add">
        <option value="">{t.add}</option>
        {#each KINDS as k (k)}<option value={k}>{t.kinds[k]}</option>{/each}
      </select>
      <button type="button" class="co-btn co-btn--quiet co-btn--sm" disabled={rows.length >= MAX} onclick={addLove} data-testid="scene-add-love">{t.addLove}</button>
      {#if rows.length >= MAX}<span class="co-meta">{t.max(MAX)}</span>{/if}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="co-btn co-btn--primary co-btn--sm" disabled={saving || !rows.length} onclick={() => save(rows.map(toScene))} data-testid="scenes-save">{t.save}</button>
      <button type="button" class="co-btn co-btn--quiet co-btn--sm" disabled={saving} onclick={() => (open = false)}>{t.cancel}</button>
      {#if custom}<button type="button" class="co-btn co-btn--quiet co-btn--sm ml-auto" disabled={saving} onclick={() => save(null)} data-testid="scenes-reset">{t.reset}</button>{/if}
    </div>
  {/if}
</div>
