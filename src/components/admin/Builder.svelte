<script lang="ts">
  /**
   * Builder de dossier. Cada cambio es una op (src/lib/admin/ops.ts) contra /admin/api/dossiers/:id;
   * el servidor devuelve el estado completo y lo sustituimos (sin lógica de negocio duplicada aquí).
   * Las ops se encolan en serie para que el orden de los cambios sea el del usuario.
   */
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import type { BuilderItem, BuilderState } from '~/lib/admin/types';
  import type { BuilderOpInput as BuilderOp } from '~/lib/admin/ops';
  import type { TalkTrack, TrackLine } from '~/lib/playbook/talk-track';
  import { renderMarkdown, stripMarkdown } from '~/lib/playbook/markdown';
  import { PRICE_POLICY_LABEL as POLICY_LABEL } from '~/lib/partner/labels';

  interface MarketLite {
    segments: Array<{ id: string; key: string; name: string }>;
    personas: Array<{ id: string; segmentId: string; name: string; role: string }>;
  }
  let { initial, publicOrigin, market = { segments: [], personas: [] } }: { initial: BuilderState; publicOrigin: string; market?: MarketLite } = $props();

  // Copia JSON: las props llegan como proxies y structuredClone no puede clonarlas.
  let s = $state<BuilderState>(JSON.parse(JSON.stringify(initial)));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let details = $state<string[]>([]);
  let previewKey = $state(0);
  let device = $state<'mobile' | 'tablet' | 'desktop'>('desktop');
  let tab = $state<'edit' | 'preview'>('edit');
  /** Panel derecho: vista previa del dossier o guion de venta (playbook). */
  let pane = $state<'preview' | 'script'>('preview');
  let track = $state<TalkTrack | null>(null);
  let trackError = $state<string | null>(null);
  let trackCopied = $state(false);
  let openProps = $state<string | null>(null);
  let propsDraft = $state('');
  let propsError = $state<string | null>(null);
  let linkExpiry = $state('');
  let copied = $state<string | null>(null);

  // Lista local para el drag & drop (svelte-dnd-action la reordena mientras se arrastra).
  // Se inicializa síncrona (SSR) y se re-sincroniza tras cada respuesta del servidor.
  const snapshot = () => s.items.map((i) => ({ ...i }));
  let list = $state<BuilderItem[]>(snapshot());

  const d = $derived(s.dossier);
  const editable = $derived(s.canEdit);
  const api = `/admin/api/dossiers/${initial.dossier.id}`;
  const STATUS = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' } as const;
  const STATUS_CLASS = { draft: 'bg-amber-100 text-amber-900', published: 'bg-emerald-100 text-emerald-900', archived: 'bg-zinc-200 text-zinc-700' } as const;
  const LOCALES = { 'es-ES': 'Español', 'en-GB': 'English', 'ca-ES': 'Català', 'pt-PT': 'Português', 'fr-FR': 'Français' } as const;
  const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN'];
  const DEVICE_W = { mobile: '390px', tablet: '820px', desktop: '100%' } as const;

  let queue: Promise<unknown> = Promise.resolve();
  function run(op: BuilderOp): Promise<boolean> {
    const p = queue.then(async () => {
      busy = true;
      try {
        const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
        const body = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        if (res.status === 401) { location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`; return false; }
        if (!res.ok) {
          error = body.error ?? `Error ${res.status}`;
          details = body.details ?? [];
          list = snapshot(); // deshace el movimiento optimista
          return false;
        }
        s = body;
        list = snapshot();
        error = null;
        details = [];
        previewKey++;
        return true;
      } catch {
        error = 'Sin conexión. El cambio no se ha guardado.';
        return false;
      } finally {
        busy = false;
      }
    });
    queue = p.catch(() => {});
    return p;
  }

  // ---------- campos del dossier
  function saveField<K extends 'title' | 'prospectName' | 'prospectCompany' | 'locale' | 'currency'>(key: K, value: string) {
    const current = (d[key] ?? '') as string;
    if (value.trim() === current) return;
    run({ op: 'update', patch: { [key]: value } });
  }
  const parseMoney = (v: string): number | null => {
    const t = v.trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    const n = Math.round(Number(t) * 100) / 100;
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  function saveTotal(v: string) {
    const n = parseMoney(v);
    if (Number.isNaN(n)) { error = 'Precio no válido'; return; }
    if (n !== d.totalPrice) run({ op: 'update', patch: { totalPrice: n } });
  }
  function saveItemPrice(item: BuilderItem, v: string) {
    const n = parseMoney(v);
    if (Number.isNaN(n)) { error = 'Precio no válido'; return; }
    if (n !== item.priceOverride) run({ op: 'setPrice', itemId: item.id, priceOverride: n });
  }

  // ---------- items
  function onConsider(e: CustomEvent<DndEvent<BuilderItem>>) { list = e.detail.items; }
  function onFinalize(e: CustomEvent<DndEvent<BuilderItem>>) {
    list = e.detail.items;
    const id = e.detail.info.id as string;
    const to = list.findIndex((i) => i.id === id);
    const from = s.items.findIndex((i) => i.id === id);
    if (to >= 0 && from >= 0 && to !== from) run({ op: 'move', itemId: id, toIndex: to });
  }
  function move(item: BuilderItem, delta: number) {
    const from = s.items.findIndex((i) => i.id === item.id);
    const to = from + delta;
    if (to < 0 || to >= s.items.length) return;
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    list = next;
    run({ op: 'move', itemId: item.id, toIndex: to });
  }
  function remove(item: BuilderItem) {
    if (confirm(`¿Quitar «${item.moduleName}» del dossier?`)) run({ op: 'removeItem', itemId: item.id });
  }
  function toggleProps(item: BuilderItem) {
    if (openProps === item.id) { openProps = null; return; }
    openProps = item.id;
    propsDraft = JSON.stringify(item.propOverrides, null, 2);
    propsError = null;
  }
  async function saveProps(item: BuilderItem) {
    let parsed: unknown;
    try { parsed = JSON.parse(propsDraft || '{}'); } catch { propsError = 'JSON no válido'; return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { propsError = 'Debe ser un objeto { … }'; return; }
    propsError = null;
    if (await run({ op: 'setProps', itemId: item.id, propOverrides: parsed as Record<string, unknown> })) openProps = null;
  }

  // ---------- estado y enlaces
  async function setStatus(status: 'draft' | 'published' | 'archived') {
    if (status === 'draft' && d.status === 'published' && !confirm('Al despublicar, los enlaces dejarán de funcionar. ¿Continuar?')) return;
    await run({ op: 'setStatus', status });
  }
  async function createLink() {
    const days = Number(linkExpiry);
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    await run({ op: 'createLink', expiresAt });
  }
  function revoke(id: string) {
    if (confirm('¿Revocar este enlace? Quien lo tenga verá un 404.')) run({ op: 'revokeLink', linkId: id });
  }
  const linkUrl = (token: string) => `${publicOrigin}/d/${token}`;
  async function copy(token: string) {
    const url = linkUrl(token);
    try { await navigator.clipboard.writeText(url); } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
    }
    copied = token;
    setTimeout(() => { if (copied === token) copied = null; }, 1800);
  }
  async function destroy() {
    if (!confirm('¿Borrar el dossier definitivamente?')) return;
    const res = await fetch(api, { method: 'DELETE' });
    if (res.ok) location.href = '/admin';
    else error = (await res.json().catch(() => ({}))).error ?? 'No se pudo borrar';
  }

  // ---------- guion de venta (playbook)
  async function loadTrack() {
    try {
      const res = await fetch(`${api}/talk-track`);
      if (!res.ok) { trackError = (await res.json().catch(() => ({}))).error ?? 'No se pudo cargar el guion'; return; }
      track = await res.json();
      trackError = null;
    } catch { trackError = 'Sin conexión'; }
  }
  $effect(() => {
    if (pane === 'script') { void previewKey; loadTrack(); }
  });
  async function voteLine(l: TrackLine, verdict: 'worked' | 'didnt') {
    const next = l.score.mine === verdict ? null : verdict;
    const res = await fetch('/admin/api/playbook/vote', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType: l.source === 'official' ? 'play' : 'contribution', targetId: l.id, verdict: next, dossierId: d.id }),
    });
    if (res.ok) loadTrack(); else error = (await res.json().catch(() => ({}))).error ?? 'No se pudo votar';
  }
  async function copyTrack() {
    if (!track) return;
    const txt = track.sections.map((sec) => [`## ${sec.title}`, ...sec.blocks.flatMap((b) => [
      ...(b.title ? [`### ${b.title}`] : []), ...(b.note ? [b.note] : []),
      ...b.lines.map((l) => `- ${stripMarkdown(l.title)}: ${stripMarkdown(l.text)}`),
    ])].join('\n')).join('\n\n');
    try { await navigator.clipboard.writeText(txt); trackCopied = true; setTimeout(() => (trackCopied = false), 1800); } catch { error = 'No se pudo copiar'; }
  }
  const OUTCOME = { open: 'En curso', won: 'Ganado 🎉', lost: 'Perdido' } as const;

  // ---------- cuenta y seguimiento
  const STANCE = { aliado: '🟢 Aliado', neutral: '⚪ Neutral', bloqueador: '🔴 Bloqueador', desconocido: '❔ Sin saber' } as const;
  const ROLE = { decisor: 'decide', pagador: 'paga', influenciador: 'influye', campeon: 'aliado interno', usuario: 'lo usa', guardian: 'puede vetar' } as Record<string, string>;
  let newContact = $state({ name: '', personaId: '', stance: 'desconocido' as keyof typeof STANCE });
  const personaName = (id: string | null) => market.personas.find((p) => p.id === id)?.name ?? null;
  const segPersonas = $derived(market.personas.filter((p) => !d.segmentId || p.segmentId === d.segmentId));
  async function addContact() {
    if (!newContact.name.trim()) { error = 'Pon un nombre (o el cargo)'; return; }
    if (await run({ op: 'addContact', contact: { name: newContact.name, personaId: newContact.personaId || null, stance: newContact.stance } })) {
      newContact = { name: '', personaId: '', stance: 'desconocido' };
    }
  }
  const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const dt = new Date(iso);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  let nextText = $state(initial.dossier.nextStep ?? '');
  let nextAt = $state(toLocalInput(initial.dossier.nextStepAt));
  function saveNext(at = nextAt) {
    nextAt = at;
    run({ op: 'setNextStep', text: nextText, at: at ? new Date(at).toISOString() : null });
  }
  function preset(days: number) {
    const dt = new Date(Date.now() + days * 86_400_000);
    dt.setHours(10, 0, 0, 0);
    saveNext(toLocalInput(dt.toISOString()));
  }
  const overdue = $derived(!!d.nextStepAt && new Date(d.nextStepAt).getTime() < Date.now());

  const money = (n: number | null, cur: string) =>
    n == null ? '—' : new Intl.NumberFormat(d.locale, { style: 'currency', currency: cur, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
  const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(iso)) : '');

  const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-ink disabled:bg-surface disabled:text-muted';
  const card = 'rounded-2xl border border-line bg-bg p-4 sm:p-5';
  const btn = 'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent';
  const iconBtn = 'grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:opacity-30';
</script>

<div class="builder" data-testid="builder" data-busy={busy ? '' : undefined}>
  <!-- cabecera -->
  <div class="mb-5 flex flex-wrap items-center gap-3">
    <a href="/admin" class="text-sm text-muted hover:text-ink">← Dossiers</a>
    <h1 class="min-w-0 flex-1 truncate text-2xl font-extrabold">{d.title}</h1>
    <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {STATUS_CLASS[d.status]}" data-testid="status">{STATUS[d.status]}</span>
    <span class="text-xs text-muted" aria-live="polite">{busy ? 'Guardando…' : 'Guardado'}</span>
  </div>

  {#if !editable}
    <p class="mb-4 rounded-xl bg-surface p-3 text-sm">Solo lectura: este dossier es de otro comercial. Puedes usarlo como plantilla desde el listado.</p>
  {/if}
  {#if error}
    <div class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="error">
      <div class="flex items-start gap-3">
        <p class="flex-1 font-semibold">{error}</p>
        <button class="text-red-700" onclick={() => { error = null; details = []; }} aria-label="Cerrar">✕</button>
      </div>
      {#if details.length}<ul class="mt-1 list-disc pl-5">{#each details as x}<li>{x}</li>{/each}</ul>{/if}
    </div>
  {/if}

  <div class="mb-4 flex rounded-xl bg-bg p-1 xl:hidden" role="tablist">
    <button role="tab" aria-selected={tab === 'edit'} class="flex-1 rounded-lg py-2 text-sm font-semibold {tab === 'edit' ? 'bg-ink text-bg' : ''}" onclick={() => (tab = 'edit')}>Editar</button>
    <button role="tab" aria-selected={tab === 'preview' && pane === 'preview'} class="flex-1 rounded-lg py-2 text-sm font-semibold {tab === 'preview' && pane === 'preview' ? 'bg-ink text-bg' : ''}" onclick={() => { tab = 'preview'; pane = 'preview'; }}>Vista previa</button>
    <button role="tab" aria-selected={tab === 'preview' && pane === 'script'} class="flex-1 rounded-lg py-2 text-sm font-semibold {tab === 'preview' && pane === 'script' ? 'bg-ink text-bg' : ''}" onclick={() => { tab = 'preview'; pane = 'script'; }}>Guion</button>
  </div>

  <div class="grid gap-5 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
    <!-- ============ editor ============ -->
    <div class="space-y-5 {tab === 'edit' ? '' : 'hidden xl:block'}">
      <!-- datos -->
      <section class={card}>
        <h2 class="mb-3 font-bold">Prospecto</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-medium sm:col-span-2">Título
            <input class={field} value={d.title} disabled={!editable} maxlength="140" onchange={(e) => saveField('title', e.currentTarget.value)} data-testid="title" />
          </label>
          <label class="text-sm font-medium">Empresa
            <input class={field} value={d.prospectCompany ?? ''} disabled={!editable} maxlength="120" onchange={(e) => saveField('prospectCompany', e.currentTarget.value)} />
          </label>
          <label class="text-sm font-medium">Contacto
            <input class={field} value={d.prospectName ?? ''} disabled={!editable} maxlength="120" onchange={(e) => saveField('prospectName', e.currentTarget.value)} />
          </label>
          <label class="text-sm font-medium">Idioma
            <select class={field} value={d.locale} disabled={!editable} onchange={(e) => saveField('locale', e.currentTarget.value)}>
              {#each Object.entries(LOCALES) as [k, v]}<option value={k}>{v}</option>{/each}
            </select>
          </label>
        </div>
        <p class="mt-2 text-xs text-muted">Los textos de los módulos pueden usar <code>{'{company}'}</code> y <code>{'{prospect}'}</code>.</p>
      </section>

      <!-- precio -->
      <section class={card}>
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="font-bold">Precio</h2>
          {#if s.total}<span class="text-sm">Total: <strong data-testid="total">{s.total.formatted}</strong></span>{/if}
        </div>
        {#if s.partnerAccount}
          <p class="mb-3 rounded-xl bg-surface p-3 text-sm" data-testid="partner-account">
            Cuenta <strong>{s.partnerAccount.name}</strong> · {POLICY_LABEL[s.partnerAccount.pricePolicy]}{s.partnerAccount.pricePolicy === 'adjusted' && s.partnerAccount.priceAdjustPct != null ? ` (${s.partnerAccount.priceAdjustPct > 0 ? '+' : ''}${s.partnerAccount.priceAdjustPct} % sobre tarifa)` : ''}
            {#if s.pricesLocked}
              <span class="mt-1 block text-muted">Los precios de esta cuenta los gestiona la empresa: se aplican solos al añadir módulos.{s.partnerAccount.pricePolicy === 'hidden' ? ' Esta propuesta se envía sin precios.' : ''}</span>
            {:else}
              <span class="mt-1 block text-muted">Propuesta de un colaborador. Puedes ajustar precios a mano; si cambias la política de la cuenta (Equipo → colaborador) se recalculan.</span>
            {/if}
          </p>
        {/if}
        {#if !s.pricesLocked}
        <div class="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Modo de precio">
          {#each [['none', 'Sin precio'], ['total', 'Total'], ['per_module', 'Por módulo']] as [mode, label]}
            <button
              role="radio" aria-checked={d.priceMode === mode} disabled={!editable}
              class="rounded-lg py-2 text-sm font-semibold {d.priceMode === mode ? 'bg-bg shadow-sm' : 'text-muted'}"
              onclick={() => d.priceMode !== mode && run({ op: 'update', patch: { priceMode: mode as 'none' | 'total' | 'per_module' } })}
              data-testid={`price-mode-${mode}`}
            >{label}</button>
          {/each}
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          {#if d.priceMode === 'total'}
            <label class="text-sm font-medium">Precio total
              <input class={field} inputmode="decimal" value={d.totalPrice ?? ''} disabled={!editable} placeholder="0" onchange={(e) => saveTotal(e.currentTarget.value)} data-testid="total-price" />
            </label>
          {/if}
          {#if d.priceMode !== 'none'}
            <label class="text-sm font-medium">Moneda
              <select class={field} value={d.currency} disabled={!editable} onchange={(e) => saveField('currency', e.currentTarget.value)}>
                {#each CURRENCIES as c}<option>{c}</option>{/each}
              </select>
            </label>
          {/if}
        </div>
        {#if d.priceMode === 'per_module'}<p class="mt-2 text-xs text-muted">Cada módulo usa su precio de catálogo salvo que lo sobrescribas abajo. El total suma los módulos visibles. Importes sin IVA.</p>{/if}
        {/if}
      </section>

      <!-- módulos -->
      <section class={card}>
        <h2 class="mb-3 font-bold">Módulos <span class="font-normal text-muted">· arrastra para ordenar</span></h2>
        {#if list.length === 0}
          <p class="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Añade módulos desde el catálogo.</p>
        {/if}
        <ol
          class="space-y-2 p-0"
          use:dndzone={{ items: list, flipDurationMs: 150, dragDisabled: !editable || busy, dropTargetStyle: {} }}
          onconsider={onConsider}
          onfinalize={onFinalize}
          data-testid="items"
        >
          {#each list as item, idx (item.id)}
            <li class="list-none rounded-xl border border-line bg-bg {item.visible ? '' : 'opacity-60'}" animate:flip={{ duration: 150 }} data-testid="item" data-item-key={item.moduleKey}>
              <div class="flex items-center gap-2 p-2 pl-3">
                <span class="cursor-grab select-none text-muted" aria-hidden="true">⠿</span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{item.moduleName}</p>
                  <p class="truncate text-xs text-muted">
                    {item.blockType} · v{item.version}
                    {#if !item.visible} · <span class="font-semibold">oculto</span>{/if}
                    {#if item.price} · {item.price.formatted}{/if}
                  </p>
                </div>
                <button class={iconBtn} disabled={!editable || idx === 0} onclick={() => move(item, -1)} aria-label="Subir {item.moduleName}">↑</button>
                <button class={iconBtn} disabled={!editable || idx === list.length - 1} onclick={() => move(item, 1)} aria-label="Bajar {item.moduleName}">↓</button>
                <button class={iconBtn} disabled={!editable} onclick={() => run({ op: 'setVisible', itemId: item.id, visible: !item.visible })} aria-label={item.visible ? `Ocultar ${item.moduleName}` : `Mostrar ${item.moduleName}`} aria-pressed={!item.visible} data-testid="toggle-visible">{item.visible ? '👁' : '◌'}</button>
                <button class={iconBtn} disabled={!editable} onclick={() => remove(item)} aria-label="Quitar {item.moduleName}">✕</button>
              </div>
              {#if item.error}<p class="mx-3 mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">Contenido inválido: {item.error}</p>{/if}
              <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-sm">
                {#if d.priceMode === 'per_module' && !s.pricesLocked}
                  <label class="flex items-center gap-2">
                    <span class="text-muted">Precio</span>
                    <input class="w-28 rounded-lg border border-line px-2 py-1" inputmode="decimal" value={item.priceOverride ?? ''} disabled={!editable}
                      placeholder={item.defaultPrice != null ? String(item.defaultPrice) : '—'} onchange={(e) => saveItemPrice(item, e.currentTarget.value)}
                      aria-label="Precio de {item.moduleName}" data-testid="item-price-input" />
                  </label>
                {/if}
                {#if item.upgradeTo}
                  <button class={btn} disabled={!editable} onclick={() => run({ op: 'upgradeItem', itemId: item.id })}>Actualizar a v{item.upgradeTo.version}</button>
                {/if}
                <button class="{btn} ml-auto" onclick={() => toggleProps(item)} aria-expanded={openProps === item.id}>Personalizar</button>
              </div>
              {#if openProps === item.id}
                <div class="space-y-2 border-t border-line p-3 text-sm">
                  <p class="text-xs text-muted">Sobrescribe textos del módulo (JSON). Lo que no pongas usa el valor del catálogo.</p>
                  <textarea class="{field} h-40 font-mono text-xs" bind:value={propsDraft} disabled={!editable} spellcheck="false"></textarea>
                  {#if propsError}<p class="text-xs text-red-700">{propsError}</p>{/if}
                  <details class="text-xs"><summary class="cursor-pointer text-muted">Valores del catálogo</summary><pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-surface p-2">{JSON.stringify(item.defaultProps, null, 2)}</pre></details>
                  {#if editable}<button class="rounded-lg bg-ink px-3 py-1.5 font-semibold text-bg" onclick={() => saveProps(item)}>Guardar personalización</button>{/if}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      </section>

      <!-- catálogo -->
      {#if editable}
        <section class={card}>
          <h2 class="mb-3 font-bold">Catálogo</h2>
          <ul class="grid gap-2 p-0 sm:grid-cols-2" data-testid="catalog">
            {#each s.catalog as c (c.versionId)}
              <li class="flex list-none items-start gap-2 rounded-xl border border-line p-3">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{c.moduleName}</p>
                  <p class="text-xs text-muted">{c.blockType} · v{c.version}{c.defaultPrice != null ? ` · ${money(c.defaultPrice, c.currency)}` : ''}</p>
                  {#if c.description}<p class="mt-1 text-xs text-muted">{c.description}</p>{/if}
                </div>
                <button class={btn} disabled={busy} onclick={() => run({ op: 'addItem', moduleVersionId: c.versionId })} aria-label="Añadir {c.moduleName}" data-testid="add-{c.moduleKey}">Añadir</button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- cuenta y actores -->
      <section class={card} data-testid="account">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h2 class="flex-1 font-bold">Cuenta y actores</h2>
          <select class="rounded-lg border border-line px-2 py-1.5 text-sm" value={d.segmentId ?? ''} disabled={!editable}
            onchange={(e) => run({ op: 'setSegment', segmentId: e.currentTarget.value || null })} aria-label="Sector" data-testid="segment">
            <option value="">Sector…</option>
            {#each market.segments as sg}<option value={sg.id}>{sg.name}</option>{/each}
          </select>
          {#if d.segmentId}<a class="text-xs underline" href="/admin/learn/sector/{market.segments.find((x) => x.id === d.segmentId)?.key}" target="_blank" rel="noopener">Ver sector ↗</a>{/if}
        </div>
        <p class="mb-3 text-xs text-muted">¿Quién decide, quién paga y quién puede tumbarlo? Mapéalos: el guion y los mensajes se adaptan a cada uno.</p>
        <ul class="space-y-2 p-0" data-testid="contacts">
          {#each s.contacts as c (c.id)}
            <li class="list-none rounded-xl border p-3 text-sm {c.stance === 'bloqueador' ? 'border-red-200 bg-red-50/40' : c.stance === 'aliado' ? 'border-emerald-200 bg-emerald-50/40' : 'border-line'}" data-testid="contact">
              <div class="flex flex-wrap items-center gap-2">
                <span class="min-w-0 flex-1"><strong>{c.name}</strong>{#if personaName(c.personaId)}<span class="text-muted"> · {personaName(c.personaId)}</span>{/if}</span>
                <select class="rounded-md border border-line px-1.5 py-1 text-xs" value={c.stance} disabled={!editable}
                  onchange={(e) => run({ op: 'updateContact', contactId: c.id, contact: { stance: e.currentTarget.value as keyof typeof STANCE } })} aria-label="Postura de {c.name}">
                  {#each Object.entries(STANCE) as [k, v]}<option value={k}>{v}</option>{/each}
                </select>
                <a class="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-surface" href="/admin/compose?dossier={d.id}&contact={c.id}&type=primer_contacto">✉️ Mensaje</a>
                {#if editable}<button class={iconBtn} onclick={() => confirm(`¿Quitar a ${c.name}?`) && run({ op: 'removeContact', contactId: c.id })} aria-label="Quitar {c.name}">✕</button>{/if}
              </div>
            </li>
          {:else}
            <li class="list-none text-sm text-muted">Nadie mapeado todavía.</li>
          {/each}
        </ul>
        {#if editable}
          <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input class={field} placeholder="Nombre (o cargo)" bind:value={newContact.name} maxlength="120" aria-label="Nombre del contacto" data-testid="contact-name" />
            <select class={field} bind:value={newContact.personaId} aria-label="Tipo de actor" data-testid="contact-persona">
              <option value="">Tipo de actor…</option>
              {#each segPersonas as p}<option value={p.id}>{p.name} ({ROLE[p.role]})</option>{/each}
            </select>
            <select class={field} bind:value={newContact.stance} aria-label="Postura">
              {#each Object.entries(STANCE) as [k, v]}<option value={k}>{v}</option>{/each}
            </select>
            <button class="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-bg" onclick={addContact} data-testid="add-contact">Añadir</button>
          </div>
        {/if}
      </section>

      <!-- seguimiento -->
      <section class={card} data-testid="followup">
        <h2 class="mb-3 font-bold">Seguimiento {#if overdue}<span class="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Vencido</span>{/if}</h2>
        <div class="grid gap-2 sm:grid-cols-[1fr_13rem]">
          <input class={field} placeholder="Próximo paso (p. ej. Llamar para cerrar fecha)" bind:value={nextText} maxlength="300" disabled={!editable}
            onchange={() => saveNext()} aria-label="Próximo paso" data-testid="next-step" />
          <input class={field} type="datetime-local" bind:value={nextAt} disabled={!editable} onchange={() => saveNext()} aria-label="Fecha del próximo paso" data-testid="next-at" />
        </div>
        {#if editable}
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            <button class={btn} onclick={() => preset(2)}>+2 días</button>
            <button class={btn} onclick={() => preset(7)}>+1 semana</button>
            <button class={btn} onclick={() => preset(14)}>+2 semanas</button>
            {#if d.nextStepAt}<button class={btn} onclick={() => { nextText = ''; saveNext(''); }}>Hecho / quitar</button>{/if}
          </div>
        {/if}
        <a class="mt-3 inline-flex rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface" href="/admin/compose?dossier={d.id}&type=seguimiento">✉️ Preparar mensaje de seguimiento</a>
      </section>

      <!-- publicación -->
      <section class={card}>
        <h2 class="mb-3 font-bold">Publicación</h2>
        {#if s.publishBlockers.length && d.status !== 'published'}
          <ul class="mb-3 list-disc space-y-1 rounded-xl bg-amber-50 p-3 pl-7 text-sm text-amber-900">{#each s.publishBlockers as b}<li>{b}</li>{/each}</ul>
        {/if}
        <div class="flex flex-wrap gap-2">
          {#if d.status !== 'published'}
            <button class="rounded-lg bg-ink px-4 py-2 font-semibold text-bg disabled:opacity-40" disabled={!editable || s.publishBlockers.length > 0} onclick={() => setStatus('published')} data-testid="publish">Publicar</button>
          {:else}
            <button class={btn} disabled={!editable} onclick={() => setStatus('draft')}>Despublicar</button>
          {/if}
          {#if d.status !== 'archived'}<button class={btn} disabled={!editable} onclick={() => setStatus('archived')}>Archivar</button>{/if}
          {#if d.status !== 'published'}<button class="{btn} text-red-700" disabled={!editable} onclick={destroy}>Borrar</button>{/if}
        </div>
        {#if d.publishedAt && d.status === 'published'}<p class="mt-2 text-xs text-muted">Publicado el {fmtDate(d.publishedAt)}. Los cambios se ven al instante en los enlaces.</p>{/if}
        <label class="mt-4 flex items-center gap-2 text-sm">
          <span class="font-semibold">Resultado</span>
          <select class="rounded-lg border border-line px-2 py-1.5" value={d.outcome} disabled={!editable}
            onchange={(e) => run({ op: 'setOutcome', outcome: e.currentTarget.value as 'open' | 'won' | 'lost' })} data-testid="outcome">
            {#each Object.entries(OUTCOME) as [k, v]}<option value={k}>{v}</option>{/each}
          </select>
          <span class="text-xs text-muted">Ayuda a saber qué jugadas funcionan.</span>
        </label>
      </section>

      <!-- enlaces -->
      <section class={card}>
        <h2 class="mb-3 font-bold">Enlaces</h2>
        {#if d.status !== 'published'}<p class="mb-3 text-sm text-muted">Los enlaces muestran 404 hasta que publiques el dossier.</p>{/if}
        {#if editable}
          <div class="mb-3 flex flex-wrap gap-2">
            <select class="rounded-lg border border-line px-2 py-1.5 text-sm" bind:value={linkExpiry} aria-label="Caducidad">
              <option value="">Sin caducidad</option><option value="7">Caduca en 7 días</option><option value="30">Caduca en 30 días</option>
            </select>
            <button class="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-bg" onclick={createLink} data-testid="create-link">Generar enlace</button>
          </div>
        {/if}
        <ul class="space-y-2 p-0" data-testid="links">
          {#each s.links as l (l.id)}
            <li class="list-none rounded-xl border border-line p-3 text-sm {l.state === 'active' ? '' : 'opacity-60'}" data-state={l.state}>
              <div class="flex flex-wrap items-center gap-2">
                <code class="min-w-0 flex-1 truncate text-xs" data-testid="link-url">{linkUrl(l.token)}</code>
                <span class="text-xs font-semibold">{l.state === 'active' ? (l.expiresAt ? `Caduca ${fmtDate(l.expiresAt)}` : 'Activo') : l.state === 'revoked' ? 'Revocado' : 'Caducado'}</span>
              </div>
              {#if l.state === 'active'}
                <div class="mt-2 flex gap-2">
                  <button class={btn} onclick={() => copy(l.token)}>{copied === l.token ? '¡Copiado!' : 'Copiar'}</button>
                  <a class={btn} href={linkUrl(l.token)} target="_blank" rel="noopener noreferrer">Abrir</a>
                  {#if editable}<button class="{btn} ml-auto text-red-700" onclick={() => revoke(l.id)}>Revocar</button>{/if}
                </div>
              {/if}
            </li>
          {:else}
            <li class="list-none text-sm text-muted">Aún no hay enlaces.</li>
          {/each}
        </ul>
      </section>
    </div>

    <!-- ============ preview ============ -->
    <div class="{tab === 'preview' ? '' : 'hidden xl:block'}">
      <div class="xl:sticky xl:top-4">
        <div class="mb-3 hidden rounded-xl bg-bg p-1 xl:flex" role="tablist" aria-label="Panel">
          <button role="tab" aria-selected={pane === 'preview'} class="flex-1 rounded-lg py-1.5 text-sm font-semibold {pane === 'preview' ? 'bg-ink text-bg' : 'text-muted'}" onclick={() => (pane = 'preview')}>Vista previa</button>
          <button role="tab" aria-selected={pane === 'script'} class="flex-1 rounded-lg py-1.5 text-sm font-semibold {pane === 'script' ? 'bg-ink text-bg' : 'text-muted'}" onclick={() => (pane = 'script')} data-testid="tab-script">🎯 Guion de venta</button>
        </div>
        {#if pane === 'script'}
          <div class="rounded-2xl border border-line bg-bg p-4" data-testid="talk-track">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <p class="min-w-0 flex-1 text-sm text-muted">Generado con el playbook de tu empresa para <strong>este</strong> dossier, en su orden.</p>
              <button class={btn} onclick={copyTrack}>{trackCopied ? '¡Copiado!' : 'Copiar'}</button>
              <a class={btn} href="/admin/dossiers/{d.id}/script" target="_blank" rel="noopener">Imprimir</a>
            </div>
            {#if trackError}<p class="text-sm text-red-700">{trackError}</p>{/if}
            {#if !track && !trackError}<p class="text-sm text-muted">Cargando…</p>{/if}
            {#if track}
              {#if track.empty}<p class="rounded-xl bg-surface p-3 text-sm">Tu empresa aún no tiene playbook. Pídeselo a tu líder (sección «Playbook») o comparte lo que te funciona en «Aprende».</p>{/if}
              {#if track.uncovered.length}<p class="mb-3 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">Sin jugadas para: {track.uncovered.join(', ')}.</p>{/if}
              <div class="max-h-[72vh] space-y-5 overflow-auto pr-1">
                {#each track.sections as sec (sec.id)}
                  {#if sec.blocks.some((b) => b.lines.length || b.note)}
                    <section>
                      <h3 class="text-base font-extrabold">{sec.title}</h3>
                      <p class="text-xs text-muted">{sec.hint}</p>
                      {#each sec.blocks as b}
                        {#if b.title}<h4 class="mt-3 text-sm font-bold">{b.title}</h4>{/if}
                        {#if b.facts?.length}
                          <dl class="mt-2 space-y-1 rounded-xl border p-3 text-xs {b.tone === 'risk' ? 'border-red-200 bg-red-50/40' : b.tone === 'ally' ? 'border-emerald-200 bg-emerald-50/40' : 'border-line'}" data-testid="account-block">
                            {#each b.facts as f}<div><dt class="inline font-semibold">{f.label}:</dt> <dd class="inline">{f.text}</dd></div>{/each}
                            {#if b.contactId}<a class="mt-1 inline-block font-semibold underline" href="/admin/compose?dossier={d.id}&contact={b.contactId}">✉️ Preparar mensaje</a>{/if}
                          </dl>
                        {/if}
                        {#if b.note}<p class="mt-1 rounded-lg bg-surface p-2 text-xs">{b.note}</p>{/if}
                        <ul class="mt-2 space-y-2 p-0">
                          {#each b.lines as l (l.source + l.id)}
                            <li class="list-none rounded-xl border p-3 text-sm {l.source === 'team' ? 'border-violet-200 bg-violet-50/40' : 'border-line'}" data-testid="track-line">
                              <p class="font-semibold">{#if l.source === 'team'}<span class="mr-1 rounded-full bg-violet-100 px-1.5 text-[10px] text-violet-900">Equipo</span>{/if}{l.title}</p>
                              {#if l.text}<div class="prose-play mt-1 text-muted">{@html renderMarkdown(l.text)}</div>{/if}
                              {#if l.refs.length}
                                <p class="mt-1 text-xs">🧠 {#each l.refs as r, i}{#if i} · {/if}{#if r.url}<a class="underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>{:else}{r.title}{/if}{#if r.creator} ({r.creator}){/if}{/each}</p>
                              {/if}
                              <div class="mt-2 flex gap-1">
                                <button class="rounded-md border px-2 py-0.5 text-xs {l.score.mine === 'worked' ? 'border-ink bg-ink text-bg' : 'border-line'}" onclick={() => voteLine(l, 'worked')} aria-pressed={l.score.mine === 'worked'}>👍 {l.score.worked || ''}</button>
                                <button class="rounded-md border px-2 py-0.5 text-xs {l.score.mine === 'didnt' ? 'border-ink bg-ink text-bg' : 'border-line'}" onclick={() => voteLine(l, 'didnt')} aria-pressed={l.score.mine === 'didnt'}>👎 {l.score.didnt || ''}</button>
                              </div>
                            </li>
                          {/each}
                        </ul>
                      {/each}
                    </section>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {:else}
        <div class="mb-2 flex items-center gap-2">
          <span class="text-sm font-bold">Vista previa</span>
          <div class="ml-auto hidden rounded-lg bg-bg p-0.5 text-xs md:flex">
            {#each [['mobile', 'Móvil'], ['tablet', 'Tablet'], ['desktop', 'Escritorio']] as [k, label]}
              <button class="rounded-md px-2.5 py-1 font-semibold {device === k ? 'bg-ink text-bg' : 'text-muted'}" onclick={() => (device = k as typeof device)}>{label}</button>
            {/each}
          </div>
          <a class="ml-auto text-xs text-muted underline md:ml-0" href="/admin/dossiers/{d.id}/preview" target="_blank" rel="noopener">Abrir ↗</a>
        </div>
        <div class="overflow-hidden rounded-2xl border border-line bg-bg">
          <iframe
            title="Vista previa del dossier"
            src="/admin/dossiers/{d.id}/preview?v={previewKey}"
            class="mx-auto block h-[78vh] w-full border-0 transition-[max-width] duration-300"
            style:max-width={DEVICE_W[device]}
            data-testid="preview"
          ></iframe>
        </div>
        {/if}
      </div>
    </div>
  </div>
</div>
