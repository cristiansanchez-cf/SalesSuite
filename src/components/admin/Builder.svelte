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
  interface FacetLite { key: string; label: string; question: string | null; scope: 'account' | 'contact'; multi: boolean; options: Array<{ key: string; label: string; hint?: string }> }
  interface CouponLite { id: string; code: string; label: string }
  let { initial, publicOrigin, market = { segments: [], personas: [] }, facets = [], hasStory = false, coupons = [] }:
    { initial: BuilderState; publicOrigin: string; market?: MarketLite; facets?: FacetLite[]; hasStory?: boolean; coupons?: CouponLite[] } = $props();

  // Copia JSON: las props llegan como proxies y structuredClone no puede clonarlas.
  let s = $state<BuilderState>(JSON.parse(JSON.stringify(initial)));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let details = $state<string[]>([]);
  /** Fallo nuestro (5xx o red) ≠ rechazo de negocio (4xx): se pintan distinto y el fallo lleva código. */
  let failure = $state<string | null>(null);
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
  const STATUS_CLASS = { draft: 'co-badge', published: 'co-badge co-badge--ink', archived: 'co-badge co-badge--soft' } as const;
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
          failure = res.status >= 500 ? `E${res.status}-${Date.now().toString(36)}` : null;
          error = body.error ?? `Error ${res.status}`;
          details = body.details ?? [];
          list = snapshot(); // deshace el movimiento optimista
          return false;
        }
        s = body;
        list = snapshot();
        error = null;
        failure = null;
        details = [];
        previewKey++;
        return true;
      } catch {
        failure = `NET-${Date.now().toString(36)}`;
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
  async function remove(item: BuilderItem) {
    if (await ask({ title: `Quitar «${item.moduleName}»`, label: 'Quitar módulo', danger: true,
      does: 'El módulo sale de esta propuesta, con los cambios que le hubieras hecho aquí.',
      doesNot: 'No lo borra del catálogo: puedes volver a añadirlo cuando quieras.' })) run({ op: 'removeItem', itemId: item.id });
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

  // ---------- confirmación (guía Lumbra §9–11: dice lo que hace y lo que NO hace; nada de confirm() nativo)
  type Ask = { title: string; does: string; doesNot: string; label: string; danger?: boolean };
  let askDlg: HTMLDialogElement | undefined = $state();
  let asking: Ask | null = $state(null);
  let askResolve: ((ok: boolean) => void) | null = null;
  function ask(o: Ask): Promise<boolean> {
    askResolve?.(false);
    asking = o;
    queueMicrotask(() => askDlg?.showModal());
    return new Promise((r) => (askResolve = r));
  }
  function answer(ok: boolean) {
    const r = askResolve;
    askResolve = null;
    askDlg?.close();
    r?.(ok);
  }

  // ---------- estado y enlaces
  async function setStatus(status: 'draft' | 'published' | 'archived') {
    if (status === 'draft' && d.status === 'published' && !(await ask({ title: 'Despublicar la propuesta', label: 'Despublicar',
      does: 'Los enlaces que has enviado dejan de abrir la propuesta hasta que la vuelvas a publicar.',
      doesNot: 'No borra la propuesta ni sus enlaces, y no avisa al cliente.' }))) return;
    await run({ op: 'setStatus', status });
  }
  async function createLink() {
    const days = Number(linkExpiry);
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    await run({ op: 'createLink', expiresAt });
  }
  async function revoke(id: string) {
    if (await ask({ title: 'Revocar el enlace', label: 'Revocar enlace', danger: true,
      does: 'Quien tenga este enlace verá que ya no está disponible. No se puede reactivar: tendrías que crear otro.',
      doesNot: 'No despublica la propuesta ni afecta a los demás enlaces.' })) run({ op: 'revokeLink', linkId: id });
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
    if (!(await ask({ title: 'Borrar la propuesta', label: 'Borrar para siempre', danger: true,
      does: 'Se borra la propuesta con sus módulos, personas y enlaces. No se puede deshacer.',
      doesNot: 'No toca el catálogo, el playbook ni los cierres ya documentados.' }))) return;
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
    if (pane === 'script') { void previewKey; loadTrack(); loadSimilar(); }
  });
  async function copyTrack() {
    if (!track) return;
    const txt = track.sections.map((sec) => [`## ${sec.title}`, ...sec.blocks.flatMap((b) => [
      ...(b.title ? [`### ${b.title}`] : []), ...(b.note ? [b.note] : []),
      ...b.lines.map((l) => `- ${stripMarkdown(l.title)}: ${stripMarkdown(l.text)}`),
    ])].join('\n')).join('\n\n');
    try { await navigator.clipboard.writeText(txt); trackCopied = true; setTimeout(() => (trackCopied = false), 1800); } catch { error = 'No se pudo copiar'; }
  }
  const OUTCOME = { open: 'En curso', won: 'Ganado', lost: 'Perdido' } as const;

  // ---------- cuenta y seguimiento
  const STANCE = { aliado: 'Aliado', neutral: 'Neutral', bloqueador: 'Bloqueador', desconocido: 'Sin saber' } as const;
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

  // Clases del design system (src/styles/console.css).
  const field = 'co-input';
  const card = 'co-card';
  const btn = 'co-btn co-btn--ghost co-btn--sm';
  const iconBtn = 'co-btn co-btn--quiet co-btn--icon co-btn--sm';
  const smallSelect = 'co-select !w-auto !min-h-[32px] !py-1 text-xs';

  // ---------- situación de la cuenta (facetas del tenant) y rasgos de cada persona
  const accountFacets = $derived(facets.filter((f) => f.scope === 'account'));
  const contactFacets = $derived(facets.filter((f) => f.scope === 'contact'));
  function toggleSituation(f: FacetLite, opt: string) {
    const cur = d.situation[f.key] ?? [];
    const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : f.multi ? [...cur, opt] : [opt];
    run({ op: 'setSituation', situation: { ...d.situation, [f.key]: next } });
  }
  function setTrait(contactId: string, f: FacetLite, value: string) {
    const c = s.contacts.find((x) => x.id === contactId);
    if (!c) return;
    run({ op: 'updateContact', contactId, contact: { traits: { ...(c.traits ?? {}), [f.key]: value ? [value] : [] } } });
  }
  async function onOutcome(value: string) {
    // El resultado se guarda YA (cuenta, comisión y conflictos dependen de él); después se documenta el cierre,
    // que es lo que alimenta «Qué ha funcionado».
    const ok = await run({ op: 'setOutcome', outcome: value as 'open' | 'won' | 'lost' });
    if (ok && value !== 'open') location.href = `/admin/dossiers/${d.id}/debrief?outcome=${value}`;
  }

  // ---------- «en situaciones parecidas» (cierres documentados del equipo)
  interface Similar { described: boolean; total: number; stories: Array<{ story: { id: string; title: string; outcome: 'won' | 'lost'; whatWorked: string | null; whatFailed: string | null }; matches: Array<{ label: string }>; differs: Array<{ label: string }>; authorName: string | null }>; plays: Array<{ playId: string; title: string; wonIn: number; lostIn: number }> }
  let similar = $state<Similar | null>(null);
  async function loadSimilar() {
    try {
      const res = await fetch(`${api}/similar`);
      if (res.ok) similar = await res.json();
    } catch { /* el guion sigue funcionando sin esto */ }
  }
</script>

<div class="builder" data-testid="builder" data-busy={busy ? '' : undefined}>
  <!-- cabecera -->
  <div class="mb-5 flex flex-wrap items-end gap-3">
    <div class="min-w-0 flex-1">
      <a href="/admin" class="co-meta hover:text-ink">← {s.pricesLocked ? 'Mis cuentas' : 'Dossiers'}</a>
      <p class="text-eyebrow mb-2 mt-3">Dossier</p>
      <h1 class="co-page-title truncate">{d.title}</h1>
    </div>
    <span class={STATUS_CLASS[d.status]} data-testid="status">{STATUS[d.status]}</span>
    <span class="co-meta" aria-live="polite">{busy ? 'Guardando…' : 'Guardado'}</span>
  </div>

  {#if !editable}
    <p class="co-alert co-alert--info mb-4">Solo lectura: este dossier es de otro comercial. Puedes usarlo como plantilla desde el listado.</p>
  {/if}
  {#if error}
    <div class="co-alert mb-4 {failure ? 'co-alert--failure' : 'co-alert--rejection'} block" role="alert" data-testid="error">
      <div class="flex items-start gap-3">
        <p class="flex-1 font-semibold">{error}{#if failure}<span class="block font-normal">Es un fallo nuestro, no tuyo. Si se repite, pásanos el código <code>{failure}</code>.</span>{/if}</p>
        <button class={iconBtn} onclick={() => { error = null; failure = null; details = []; }} aria-label="Cerrar aviso">✕</button>
      </div>
      {#if details.length}<ul class="mt-1 list-disc pl-5">{#each details as x}<li>{x}</li>{/each}</ul>{/if}
    </div>
  {/if}

  <div class="co-segmented mb-4 xl:hidden" role="tablist">
    <button role="tab" aria-selected={tab === 'edit'} aria-pressed={tab === 'edit'} onclick={() => (tab = 'edit')}>Editar</button>
    <button role="tab" aria-selected={tab === 'preview' && pane === 'preview'} aria-pressed={tab === 'preview' && pane === 'preview'} onclick={() => { tab = 'preview'; pane = 'preview'; }}>Vista previa</button>
    <button role="tab" aria-selected={tab === 'preview' && pane === 'script'} aria-pressed={tab === 'preview' && pane === 'script'} onclick={() => { tab = 'preview'; pane = 'script'; }}>Guion</button>
  </div>

  <div class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
    <!-- ============ editor ============ -->
    <div class="space-y-5 {tab === 'edit' ? '' : 'hidden xl:block'}">
      <!-- datos -->
      <section class={card}>
        <h2 class="mb-3 co-card-title">Prospecto</h2>
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
          <h2 class="co-card-title">Precio</h2>
          {#if s.total}<span class="text-sm">Total: {#if s.total.before}<s class="text-muted">{s.total.before.formatted}</s> {/if}<strong data-testid="total">{s.total.formatted}</strong></span>{/if}
        </div>
        {#if s.partnerAccount}
          <p class="co-alert co-alert--info mb-3 block" data-testid="partner-account">
            Cuenta <strong>{s.partnerAccount.name}</strong> · {POLICY_LABEL[s.partnerAccount.pricePolicy]}{s.partnerAccount.pricePolicy === 'adjusted' && s.partnerAccount.priceAdjustPct != null ? ` (${s.partnerAccount.priceAdjustPct > 0 ? '+' : ''}${s.partnerAccount.priceAdjustPct} % sobre tarifa)` : ''}
            {#if s.pricesLocked}
              <span class="mt-1 block text-muted">Los precios de esta cuenta los gestiona la empresa: se aplican solos al añadir módulos.{s.partnerAccount.pricePolicy === 'hidden' ? ' Esta propuesta se envía sin precios.' : ''}</span>
            {:else}
              <span class="mt-1 block text-muted">Propuesta de un colaborador. Puedes ajustar precios a mano; si cambias la política de la cuenta (Equipo → colaborador) se recalculan.</span>
            {/if}
          </p>
        {/if}
        {#if !s.pricesLocked}
        <div class="co-segmented" role="radiogroup" aria-label="Modo de precio">
          {#each [['none', 'Sin precio'], ['total', 'Total'], ['per_module', 'Por módulo']] as [mode, label]}
            <button
              role="radio" aria-checked={d.priceMode === mode} disabled={!editable}
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
        {#if d.priceMode !== 'none' && (coupons.length || d.discount)}
          <label class="mt-3 block text-sm font-medium">Cupón <span class="font-normal text-muted">· palanca de negociación; el cliente lo ve aplicado</span>
            <select class={field} value={d.couponId ?? ''} disabled={!editable} onchange={(e) => run({ op: 'setCoupon', couponId: e.currentTarget.value || null })} data-testid="coupon">
              <option value="">Sin cupón</option>
              {#if d.couponId && d.discount && !coupons.some((c) => c.id === d.couponId)}<option value={d.couponId}>{d.discount.label} ({d.discount.code})</option>{/if}
              {#each coupons as c}<option value={c.id}>{c.label} ({c.code})</option>{/each}
            </select>
          </label>
        {/if}
        {/if}
      </section>

      <!-- módulos -->
      <section class={card}>
        <h2 class="mb-3 co-card-title">Módulos <span class="font-normal text-muted">· arrastra para ordenar</span></h2>
        {#if list.length === 0}
          <p class="co-empty co-meta">Añade módulos desde el catálogo: cada uno es una sección de la propuesta.</p>
        {/if}
        <ol
          class="space-y-2 p-0"
          use:dndzone={{ items: list, flipDurationMs: 150, dragDisabled: !editable || busy, dropTargetStyle: {} }}
          onconsider={onConsider}
          onfinalize={onFinalize}
          data-testid="items"
        >
          {#each list as item, idx (item.id)}
            <li class="list-none rounded-[var(--console-radius-control)] border border-[var(--console-card-border)] bg-[var(--console-surface)] {item.visible ? '' : 'opacity-60'}" animate:flip={{ duration: 150 }} data-testid="item" data-item-key={item.moduleKey}>
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
              {#if item.error}<p class="co-alert co-alert--rejection mx-3 mb-2 text-xs">Contenido inválido: {item.error}</p>{/if}
              <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-sm">
                {#if d.priceMode === 'per_module' && !s.pricesLocked}
                  <label class="flex items-center gap-2">
                    <span class="text-muted">Precio</span>
                    <input class="co-input !w-28 !min-h-[32px] !py-1" inputmode="decimal" value={item.priceOverride ?? ''} disabled={!editable}
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
                  {#if propsError}<p class="co-alert co-alert--rejection text-xs">{propsError}</p>{/if}
                  <details class="text-xs"><summary class="cursor-pointer text-muted">Valores del catálogo</summary><pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-surface p-2">{JSON.stringify(item.defaultProps, null, 2)}</pre></details>
                  {#if editable}<button class="co-btn co-btn--primary co-btn--sm" onclick={() => saveProps(item)}>Guardar personalización</button>{/if}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      </section>

      <!-- catálogo -->
      {#if editable}
        <section class={card}>
          <h2 class="mb-3 co-card-title">Catálogo</h2>
          <ul class="grid gap-2 p-0 sm:grid-cols-2" data-testid="catalog">
            {#each s.catalog as c (c.versionId)}
              <li class="co-row list-none !items-start !p-3">
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
          <h2 class="flex-1 co-card-title">Cuenta y actores</h2>
          <select class="co-select !w-auto" value={d.segmentId ?? ''} disabled={!editable}
            onchange={(e) => run({ op: 'setSegment', segmentId: e.currentTarget.value || null })} aria-label="Sector" data-testid="segment">
            <option value="">Sector…</option>
            {#each market.segments as sg}<option value={sg.id}>{sg.name}</option>{/each}
          </select>
          {#if d.segmentId}<a class="text-xs underline" href="/admin/learn/sector/{market.segments.find((x) => x.id === d.segmentId)?.key}" target="_blank" rel="noopener">Ver sector ↗</a>{/if}
        </div>
        <p class="co-help mb-3">¿Quién decide, quién paga y quién puede tumbarlo? Mapéalos: el guion, los mensajes y las recomendaciones se adaptan a cada uno.</p>
        {#if accountFacets.length}
          <div class="mb-4 grid gap-3" data-testid="situation">
            {#each accountFacets as f (f.key)}
              <div>
                <p class="co-field mb-1">{f.question ?? f.label} <span class="co-help">{f.multi ? 'Marca todas las que apliquen' : 'Una opción'} · opcional</span></p>
                <div class="co-chips">
                  {#each f.options as o (o.key)}
                    <button type="button" class="co-chip" aria-pressed={(d.situation[f.key] ?? []).includes(o.key)} disabled={!editable} title={o.hint ?? ''}
                      onclick={() => toggleSituation(f, o.key)} data-testid="facet-{f.key}-{o.key}">{o.label}</button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
        <ul class="space-y-2 p-0" data-testid="contacts">
          {#each s.contacts as c (c.id)}
            <li class="co-row list-none !block !p-3 text-sm {c.stance === 'bloqueador' ? 'co-row--attention' : ''}" data-testid="contact">
              <div class="flex flex-wrap items-center gap-2">
                <span class="w-full"><strong>{c.name}</strong>{#if personaName(c.personaId)}<span class="text-muted"> · {personaName(c.personaId)}</span>{/if}</span>
                <select class={smallSelect} value={c.stance} disabled={!editable}
                  onchange={(e) => run({ op: 'updateContact', contactId: c.id, contact: { stance: e.currentTarget.value as keyof typeof STANCE } })} aria-label="Postura de {c.name}">
                  {#each Object.entries(STANCE) as [k, v]}<option value={k}>{v}</option>{/each}
                </select>
                {#each contactFacets as f (f.key)}
                  <select class={smallSelect} value={(c.traits?.[f.key] ?? [])[0] ?? ''} disabled={!editable} onchange={(e) => setTrait(c.id, f, e.currentTarget.value)} aria-label="{f.label} de {c.name}" data-testid="trait-{f.key}">
                    <option value="">{f.label}: no lo sé</option>
                    {#each f.options as o}<option value={o.key}>{o.label}</option>{/each}
                  </select>
                {/each}
                <a class="co-btn co-btn--ghost co-btn--sm" href="/admin/compose?dossier={d.id}&contact={c.id}&type=primer_contacto">Mensaje</a>
                {#if editable}<button class={iconBtn} onclick={async () => (await ask({ title: `Quitar a ${c.name}`, label: 'Quitar', danger: true,
                  does: 'Sale de las personas de esta cuenta, con su postura y sus notas.',
                  doesNot: 'No borra el actor del mercado ni afecta a otras propuestas.' })) && run({ op: 'removeContact', contactId: c.id })} aria-label="Quitar {c.name}">✕</button>{/if}
              </div>
            </li>
          {:else}
            <li class="co-meta list-none">Nadie mapeado todavía: añade abajo a la primera persona.</li>
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
            <button class="co-btn co-btn--primary" onclick={addContact} data-testid="add-contact">Añadir</button>
          </div>
        {/if}
      </section>

      <!-- seguimiento -->
      <section class={card} data-testid="followup">
        <h2 class="mb-3 co-card-title">Seguimiento {#if overdue}<span class="co-badge co-badge--attention ml-1">Vencido</span>{/if}</h2>
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
        <a class="mt-3 co-btn co-btn--ghost co-btn--sm" href="/admin/compose?dossier={d.id}&type=seguimiento">Preparar mensaje de seguimiento →</a>
      </section>

      <!-- publicación -->
      <section class={card}>
        <h2 class="mb-3 co-card-title">Publicación</h2>
        {#if s.publishBlockers.length && d.status !== 'published'}
          <div class="co-alert co-alert--rejection mb-3 block"><p class="font-semibold">Antes de publicar:</p><ul>{#each s.publishBlockers as b}<li>{b}</li>{/each}</ul></div>
        {/if}
        <div class="flex flex-wrap gap-2">
          {#if d.status !== 'published'}
            <button class="co-btn co-btn--primary" disabled={!editable || s.publishBlockers.length > 0} onclick={() => setStatus('published')} data-testid="publish">Publicar</button>
          {:else}
            <button class={btn} disabled={!editable} onclick={() => setStatus('draft')}>Despublicar</button>
          {/if}
          {#if d.status !== 'archived'}<button class={btn} disabled={!editable} onclick={() => setStatus('archived')}>Archivar</button>{/if}
          {#if d.status !== 'published'}<button class="co-btn co-btn--danger co-btn--sm ml-auto" disabled={!editable} onclick={destroy}>Borrar</button>{/if}
        </div>
        {#if d.publishedAt && d.status === 'published'}<p class="mt-2 text-xs text-muted">Publicado el {fmtDate(d.publishedAt)}. Los cambios se ven al instante en los enlaces.</p>{/if}
        <div class="mt-4 grid gap-2 border-t border-[var(--console-divider)] pt-4">
          <label class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold">Resultado</span>
            <select class="co-select !w-auto" value={d.outcome} disabled={!editable} onchange={(e) => onOutcome(e.currentTarget.value)} data-testid="outcome">
              {#each Object.entries(OUTCOME) as [k, v]}<option value={k}>{v}</option>{/each}
            </select>
          </label>
          {#if d.outcome !== 'open' && editable}
            <a class="co-action" href="/admin/dossiers/{d.id}/debrief" data-testid="debrief-cta">
              <span class="co-action__label">{hasStory ? 'Revisar lo que funcionó' : 'Documenta qué funcionó (2 minutos)'}<small>{hasStory ? 'Ya cuenta para el equipo' : 'Es lo que convierte esta venta en una recomendación para tus compañeros'}</small></span>
              <span aria-hidden="true">→</span>
            </a>
          {:else}
            <p class="co-meta">Al marcarlo como ganado o perdido documentarás qué funcionó: así el equipo aprende de ventas reales.</p>
          {/if}
        </div>
      </section>

      <!-- enlaces -->
      <section class={card}>
        <h2 class="mb-3 co-card-title">Enlaces</h2>
        {#if d.status !== 'published'}<p class="mb-3 text-sm text-muted">Los enlaces muestran 404 hasta que publiques el dossier.</p>{/if}
        {#if editable}
          <div class="mb-3 flex flex-wrap gap-2">
            <select class="co-select !w-auto" bind:value={linkExpiry} aria-label="Caducidad">
              <option value="">Sin caducidad</option><option value="7">Caduca en 7 días</option><option value="30">Caduca en 30 días</option>
            </select>
            <button class="co-btn co-btn--primary co-btn--sm" onclick={createLink} data-testid="create-link">Generar enlace</button>
          </div>
        {/if}
        <ul class="space-y-2 p-0" data-testid="links">
          {#each s.links as l (l.id)}
            <li class="co-card list-none !p-3 text-sm {l.state === 'active' ? '' : 'opacity-60'}" data-state={l.state}>
              <div class="flex flex-wrap items-center gap-2">
                <code class="min-w-0 flex-1 truncate text-xs" data-testid="link-url">{linkUrl(l.token)}</code>
                <span class="text-xs font-semibold">{l.state === 'active' ? (l.expiresAt ? `Caduca ${fmtDate(l.expiresAt)}` : 'Activo') : l.state === 'revoked' ? 'Revocado' : 'Caducado'}</span>
              </div>
              {#if l.state === 'active'}
                <div class="mt-2 flex gap-2">
                  <button class={btn} onclick={() => copy(l.token)}>{copied === l.token ? '¡Copiado!' : 'Copiar'}</button>
                  <a class={btn} href={linkUrl(l.token)} target="_blank" rel="noopener noreferrer">Abrir</a>
                  {#if editable}<button class="co-btn co-btn--danger co-btn--sm ml-auto" onclick={() => revoke(l.id)}>Revocar</button>{/if}
                </div>
              {/if}
            </li>
          {:else}
            <li class="co-meta list-none">{editable ? 'Genera el primero con «Generar enlace».' : 'Sin enlaces.'}</li>
          {/each}
        </ul>
      </section>
    </div>

    <!-- ============ preview ============ -->
    <div class="{tab === 'preview' ? '' : 'hidden xl:block'}">
      <div class="xl:sticky xl:top-4">
        <div class="co-segmented mb-3 hidden xl:grid" role="tablist" aria-label="Panel">
          <button role="tab" aria-selected={pane === 'preview'} aria-pressed={pane === 'preview'} onclick={() => (pane = 'preview')}>Vista previa</button>
          <button role="tab" aria-selected={pane === 'script'} aria-pressed={pane === 'script'} onclick={() => (pane = 'script')} data-testid="tab-script">Guion de venta</button>
        </div>
        {#if pane === 'script'}
          <div class="co-card" data-testid="talk-track">
            {#if similar && similar.total > 0}
              <section class="co-card co-card--soft mb-4 grid gap-2" data-testid="similar">
                <p class="text-eyebrow">En situaciones parecidas</p>
                {#if similar.plays.length}
                  <p class="text-sm"><strong>Lo que más ha ganado:</strong> {#each similar.plays.slice(0, 3) as p, i}{#if i} · {/if}{p.title} <span class="co-meta">({p.wonIn} {p.wonIn === 1 ? 'cierre ganado' : 'cierres ganados'})</span>{/each}</p>
                {/if}
                {#each similar.stories.slice(0, 2) as m (m.story.id)}
                  <div class="text-sm">
                    <span class="co-badge {m.story.outcome === 'won' ? 'co-badge--ink' : 'co-badge--attention'}">{m.story.outcome === 'won' ? 'Ganado' : 'Perdido'}</span>
                    <strong>{m.story.title}</strong> <span class="co-meta">· {m.matches.map((x) => x.label).join(' · ')}{m.differs.length ? ` · ojo: ${m.differs.map((x) => x.label).join(', ')}` : ''}</span>
                    <p class="co-body mt-1">«{m.story.outcome === 'won' ? m.story.whatWorked : m.story.whatFailed ?? m.story.whatWorked}»</p>
                  </div>
                {/each}
                <a class="co-meta underline" href="/admin/wins?dossier={d.id}">Ver todo lo que ha funcionado →</a>
              </section>
            {/if}
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <p class="min-w-0 flex-1 text-sm text-muted">Generado con el playbook de tu empresa para <strong>este</strong> dossier, en su orden.</p>
              <button class={btn} onclick={copyTrack}>{trackCopied ? '¡Copiado!' : 'Copiar'}</button>
              <a class={btn} href="/admin/dossiers/{d.id}/script" target="_blank" rel="noopener">Imprimir</a>
            </div>
            {#if trackError}<p class="co-alert co-alert--failure">{trackError}</p>{/if}
            {#if !track && !trackError}<p class="text-sm text-muted">Cargando…</p>{/if}
            {#if track}
              {#if track.empty}<p class="co-alert co-alert--info">Tu empresa aún no tiene playbook. Pídeselo a tu líder (sección «Playbook») o comparte lo que te funciona en «Aprende».</p>{/if}
              {#if track.uncovered.length}<p class="co-alert co-alert--info mb-3 text-xs">Sin jugadas para: {track.uncovered.join(', ')}.</p>{/if}
              <div class="max-h-[72vh] space-y-5 overflow-auto pr-1">
                {#each track.sections as sec (sec.id)}
                  {#if sec.blocks.some((b) => b.lines.length || b.note)}
                    <section>
                      <h3 class="co-card-title">{sec.title}</h3>
                      <p class="text-xs text-muted">{sec.hint}</p>
                      {#each sec.blocks as b}
                        {#if b.title}<h4 class="co-row-title mt-3">{b.title}</h4>{/if}
                        {#if b.facts?.length}
                          <dl class="co-row !block mt-2 space-y-1 !p-3 text-xs {b.tone === 'risk' ? 'co-row--attention' : ''}" data-testid="account-block">
                            {#each b.facts as f}<div><dt class="inline font-semibold">{f.label}:</dt> <dd class="inline">{f.text}</dd></div>{/each}
                            {#if b.contactId}<a class="mt-1 inline-block font-semibold underline" href="/admin/compose?dossier={d.id}&contact={b.contactId}">Preparar mensaje</a>{/if}
                          </dl>
                        {/if}
                        {#if b.note}<p class="mt-1 rounded-lg bg-surface p-2 text-xs">{b.note}</p>{/if}
                        <ul class="mt-2 space-y-2 p-0">
                          {#each b.lines as l (l.source + l.id)}
                            <li class="co-card list-none !p-3 text-sm" data-testid="track-line">
                              <p class="font-semibold">{#if l.source === 'team'}<span class="co-badge co-badge--soft mr-1">Equipo</span>{/if}{l.title}</p>
                              {#if l.text}<div class="prose-play mt-1 text-muted">{@html renderMarkdown(l.text)}</div>{/if}
                              {#if l.refs.length}
                                <p class="mt-1 text-xs">{#each l.refs as r, i}{#if i} · {/if}{#if r.url}<a class="underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>{:else}{r.title}{/if}{#if r.creator} ({r.creator}){/if}{/each}</p>
                              {/if}
                              {#if l.source === 'official'}
                                <p class="co-meta mt-2" data-testid="line-evidence">{l.score.worked || l.score.didnt ? `Usada en ${l.score.worked + l.score.didnt} cierres documentados · ganó ${l.score.worked}` : 'Sin cierres documentados todavía'}</p>
                              {/if}
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
          <span class="co-row-title">Vista previa</span>
          <div class="co-segmented ml-auto hidden md:grid">
            {#each [['mobile', 'Móvil'], ['tablet', 'Tablet'], ['desktop', 'Escritorio']] as [k, label]}
              <button class="!min-h-[28px] px-3" aria-pressed={device === k} onclick={() => (device = k as typeof device)}>{label}</button>
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
  <dialog bind:this={askDlg} class="co-dialog" aria-labelledby="ask-title" data-testid="confirm-modal" onclose={() => answer(false)}>
    {#if asking}
      <div class="co-dialog__body">
        <h2 id="ask-title" class="co-entity">{asking.title}</h2>
        <p class="co-body">{asking.does}</p>
        <p class="co-dialog__not"><strong>Lo que no hace:</strong> {asking.doesNot}</p>
      </div>
      <div class="co-dialog__foot">
        <button type="button" class="co-btn co-btn--ghost" onclick={() => answer(false)}>Cancelar</button>
        <button type="button" class="co-btn {asking.danger ? 'co-btn--danger' : 'co-btn--primary'}" onclick={() => answer(true)} data-testid="confirm-modal-ok">{asking.label}</button>
      </div>
    {/if}
  </dialog>
</div>
