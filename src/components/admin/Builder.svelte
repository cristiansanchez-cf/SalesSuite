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
  import { sectorRank } from '~/lib/playbook/market';
  import { DEFAULT_STYLE, MUSIC_STYLES } from '~/modules/live-screen/music';
  import { INTL_LOCALE, type Locale } from '~/lib/i18n/core';
  import { builderMessages } from '~/lib/i18n/messages/builder';

  interface MarketLite {
    /** modules: ids de módulo recomendados para el sector, por prioridad. */
    segments: Array<{ id: string; key: string; name: string; modules?: string[] }>;
    personas: Array<{ id: string; segmentId: string; name: string; role: string }>;
  }
  interface FacetLite { key: string; label: string; question: string | null; scope: 'account' | 'contact'; multi: boolean; options: Array<{ key: string; label: string; hint?: string }> }
  interface CouponLite { id: string; code: string; label: string }
  let { initial, publicOrigin, market = { segments: [], personas: [] }, facets = [], hasStory = false, coupons = [], locale = 'es' }:
    { initial: BuilderState; publicOrigin: string; market?: MarketLite; facets?: FacetLite[]; hasStory?: boolean; coupons?: CouponLite[]; locale?: Locale } = $props();
  // Los textos se importan aquí: las funciones (plurales) no viajan como props de una isla.
  const t = builderMessages[locale] ?? builderMessages.es;

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
  let list = $state<Array<BuilderItem & { cat?: true }>>(snapshot());

  const d = $derived(s.dossier);
  const editable = $derived(s.canEdit);
  const api = `/admin/api/dossiers/${initial.dossier.id}`;
  const STATUS_CLASS = { draft: 'co-badge', published: 'co-badge co-badge--ink', archived: 'co-badge co-badge--soft' } as const;
  const LOCALES = { 'es-ES': 'Español', 'en-GB': 'English', 'ca-ES': 'Català', 'pt-PT': 'Português', 'fr-FR': 'Français' } as const;
  const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN'];
  const DEVICE_W = { mobile: '390px', tablet: '820px', desktop: '100%' } as const;

  // ---------- Personalizar: logo, fotos y vídeo del cliente (docs/PERSONALIZE.md). Subida directa a Storage.
  let uploading = $state<string | null>(null);
  const media = $derived(d.clientMedia ?? {});
  async function postMedia(body: Record<string, unknown>, method = 'POST') {
    const res = await fetch(`${api}/media`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({ error: t.errStatus(res.status) }));
    if (!res.ok) { error = out.error ?? t.errStatus(res.status); return null; }
    return out;
  }
  async function uploadMedia(kind: 'logo' | 'photo' | 'video', files: FileList | null) {
    for (const file of Array.from(files ?? []).slice(0, kind === 'photo' ? 8 : 1)) {
      uploading = kind;
      try {
        const signed = await postMedia({ step: 'sign', kind, type: file.type, size: file.size });
        if (!signed) break;
        const up = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type, ...(signed.headers ?? {}) }, body: file });
        if (!up.ok) { error = t.media.uploadFail; break; }
        const st = await postMedia({ step: 'attach', kind, url: signed.publicUrl });
        if (!st) break;
        s = st; error = null; previewKey++;
      } catch { error = t.offline; break; } finally { uploading = null; }
    }
  }
  const feat = $derived({ songs: true, photos: true, messages: true, album: true, ...(media.features ?? {}) });
  async function setFeature(k: 'songs' | 'photos' | 'messages' | 'album') {
    const st = await postMedia({ step: 'options', features: { ...feat, [k]: !feat[k] } });
    if (st) { s = st; previewKey++; }
  }
  async function setLayout(k: 'slides' | 'scroll') {
    const st = await postMedia({ step: 'options', layout: k });
    if (st) { s = st; previewKey++; }
  }
  async function setStyle(k: string) {
    const st = await postMedia({ step: 'options', musicStyle: k });
    if (st) { s = st; previewKey++; }
  }
  async function removeMedia(url: string) {
    const st = await postMedia({ url }, 'DELETE');
    if (st) { s = st; previewKey++; }
  }

  let queue: Promise<unknown> = Promise.resolve();
  function run(op: BuilderOp): Promise<boolean> {
    const p = queue.then(async () => {
      busy = true;
      try {
        const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
        const body = await res.json().catch(() => ({ error: t.errStatus(res.status) }));
        if (res.status === 401) { location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`; return false; }
        if (!res.ok) {
          failure = res.status >= 500 ? `E${res.status}-${Date.now().toString(36)}` : null;
          error = body.error ?? t.errStatus(res.status);
          details = body.details ?? [];
          list = snapshot(); // deshace el movimiento optimista
          return false;
        }
        s = body;
        list = snapshot();
        cat = toCat();
        error = null;
        failure = null;
        details = [];
        previewKey++;
        return true;
      } catch {
        failure = `NET-${Date.now().toString(36)}`;
        error = t.offline;
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
    if (Number.isNaN(n)) { error = t.invalidPrice; return; }
    if (n !== d.totalPrice) run({ op: 'update', patch: { totalPrice: n } });
  }
  function saveItemPrice(item: BuilderItem, v: string) {
    const n = parseMoney(v);
    if (Number.isNaN(n)) { error = t.invalidPrice; return; }
    if (n !== item.priceOverride) run({ op: 'setPrice', itemId: item.id, priceOverride: n });
  }

  // ---------- items
  function onConsider(e: CustomEvent<DndEvent<BuilderItem>>) { list = e.detail.items; }
  function onFinalize(e: CustomEvent<DndEvent<BuilderItem>>) {
    list = e.detail.items;
    const id = e.detail.info.id as string;
    // Soltado desde «Añadir»: se añade justo donde cae.
    if (id.startsWith('cat:')) {
      run({ op: 'addItem', moduleVersionId: id.slice(4), index: Math.max(0, list.findIndex((i) => i.id === id)) });
      return;
    }
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
    if (await ask({ title: t.confirm.removeModuleTitle(item.moduleName), label: t.confirm.removeModuleLabel, danger: true,
      does: t.confirm.removeModuleDoes,
      doesNot: t.confirm.removeModuleDoesNot })) run({ op: 'removeItem', itemId: item.id });
  }
  function toggleProps(item: BuilderItem) {
    if (openProps === item.id) { openProps = null; return; }
    openProps = item.id;
    propsDraft = JSON.stringify(item.propOverrides, null, 2);
    propsError = null;
  }
  async function saveProps(item: BuilderItem) {
    let parsed: unknown;
    try { parsed = JSON.parse(propsDraft || '{}'); } catch { propsError = t.invalidJson; return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { propsError = t.mustBeObject; return; }
    propsError = null;
    if (await run({ op: 'setProps', itemId: item.id, propOverrides: parsed as Record<string, unknown> })) openProps = null;
  }

  // ---------- «Añadir»: el catálogo también se arrastra a la lista
  type CatItem = BuilderState['catalog'][number] & { id: string; cat: true };
  /** Por la prioridad de los sectores (el sector despriorizado, al final). */
  const rankOf = $derived(sectorRank(market.segments.map((x) => ({ modules: x.modules ?? [] }))));
  const toCat = (): CatItem[] => [...s.catalog].sort((a, b) => rankOf(a.moduleId) - rankOf(b.moduleId)).map((c) => ({ ...c, id: `cat:${c.versionId}`, cat: true as const }));
  let cat = $state<CatItem[]>(toCat());
  function onCatConsider(e: CustomEvent<DndEvent<CatItem>>) { cat = e.detail.items; }
  function onCatFinalize() { cat = toCat(); }
  /** Empieza rápido: los recomendados del sector (por prioridad) o todo el catálogo, en orden. */
  const recommended = $derived(
    (market.segments.find((x) => x.id === d.segmentId)?.modules ?? [])
      .map((mid) => s.catalog.find((c) => c.moduleId === mid))
      .filter((c): c is BuilderState['catalog'][number] => !!c),
  );
  function addMany(cs: Array<{ versionId: string }>) { for (const c of cs) run({ op: 'addItem', moduleVersionId: c.versionId }); }

  // ---------- compartir: publicar y enlace en un paso; prueba o real
  const activeLinks = $derived(s.links.filter((l) => l.state === 'active'));
  const viewMode = $derived(d.viewMode ?? 'live');
  async function publishAndLink() {
    if (!(await run({ op: 'setStatus', status: 'published' }))) return;
    if (!s.links.some((l) => l.state === 'active')) await run({ op: 'createLink', expiresAt: null });
  }
  let customOpen = $state(false);
  // Precio en dos pasos: primero QUÉ es (tipo), luego la tarifa; al elegir el tipo se marca la más típica.
  const kindOf = (o: { kind?: string | null; label: string }) => o.kind || o.label;
  const kinds = $derived([...new Map(s.priceOptions.map((o) => [kindOf(o), o.segmentId])).entries()].map(([k, seg]) => ({ k, seg })));
  let allKinds = $state(false);
  const chosenOption = $derived(s.priceOptions.find((o) => o.id === d.priceOptionId) ?? null);
  let pickedKind = $state<string | null>(null);
  const activeKind = $derived(pickedKind ?? (chosenOption ? kindOf(chosenOption) : null));
  // Con sector elegido, primero los tipos de ese sector; el resto, a un clic.
  const shownKinds = $derived(!d.segmentId || allKinds || !kinds.some((x) => x.seg === d.segmentId) ? kinds : kinds.filter((x) => x.seg === d.segmentId || x.k === activeKind));
  function pickKind(k: string) {
    pickedKind = k;
    const inKind = s.priceOptions.filter((o) => kindOf(o) === k);
    if (chosenOption && kindOf(chosenOption) === k) return;
    const def = inKind.find((o) => o.isDefault) ?? inKind[0];
    if (def) run({ op: 'setPriceOption', priceOptionId: def.id });
  }
  let payCopied = $state(false);
  async function copyPay() {
    if (!s.payment) return;
    try { await navigator.clipboard.writeText(s.payment.url); } catch {
      const x = document.createElement('textarea'); x.value = s.payment.url; document.body.append(x); x.select(); document.execCommand('copy'); x.remove();
    }
    payCopied = true;
    setTimeout(() => (payCopied = false), 1800);
  }
  function setMode(m: 'test' | 'live') { if (viewMode !== m) run({ op: 'update', patch: { viewMode: m } }); }

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
    if (status === 'draft' && d.status === 'published' && !(await ask({ title: t.confirm.unpublishTitle, label: t.confirm.unpublishLabel,
      does: t.confirm.unpublishDoes,
      doesNot: t.confirm.unpublishDoesNot }))) return;
    await run({ op: 'setStatus', status });
  }
  async function createLink() {
    const days = Number(linkExpiry);
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    await run({ op: 'createLink', expiresAt });
  }
  async function revoke(id: string) {
    if (await ask({ title: t.confirm.revokeTitle, label: t.confirm.revokeLabel, danger: true,
      does: t.confirm.revokeDoes,
      doesNot: t.confirm.revokeDoesNot })) run({ op: 'revokeLink', linkId: id });
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
    if (!(await ask({ title: t.confirm.deleteTitle, label: t.confirm.deleteLabel, danger: true,
      does: t.confirm.deleteDoes,
      doesNot: t.confirm.deleteDoesNot }))) return;
    const res = await fetch(api, { method: 'DELETE' });
    if (res.ok) location.href = '/admin';
    else error = (await res.json().catch(() => ({}))).error ?? t.deleteFailed;
  }

  // ---------- guion de venta (playbook)
  async function loadTrack() {
    try {
      const res = await fetch(`${api}/talk-track`);
      if (!res.ok) { trackError = (await res.json().catch(() => ({}))).error ?? t.trackFailed; return; }
      track = await res.json();
      trackError = null;
    } catch { trackError = t.noConnection; }
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
    try { await navigator.clipboard.writeText(txt); trackCopied = true; setTimeout(() => (trackCopied = false), 1800); } catch { error = t.copyFailed; }
  }

  // ---------- cuenta y seguimiento
  type Stance = keyof typeof builderMessages.es.stance;
  let newContact = $state({ name: '', personaId: '', stance: 'desconocido' as Stance });
  const personaName = (id: string | null) => market.personas.find((p) => p.id === id)?.name ?? null;
  const segPersonas = $derived(market.personas.filter((p) => !d.segmentId || p.segmentId === d.segmentId));
  async function addContact() {
    if (!newContact.name.trim()) { error = t.nameRequired; return; }
    if (await run({ op: 'addContact', contact: { name: newContact.name, personaId: newContact.personaId || null, stance: newContact.stance } })) {
      newContact = { name: '', personaId: '', stance: 'desconocido' };
    }
  }
  const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const dt = new Date(iso);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const inDays = (days: number) => { const dt = new Date(Date.now() + days * 86_400_000); dt.setHours(10, 0, 0, 0); return toLocalInput(dt.toISOString()); };
  // Sin próximo paso: lo típico ya escrito (en 2 días, a las 10:00). Se guarda con un clic o al cambiarlo.
  const suggested = !initial.dossier.nextStepAt && !initial.dossier.nextStep;
  let nextText = $state(initial.dossier.nextStep ?? (suggested ? (initial.dossier.status === 'published' ? t.followup.defaultSent : t.followup.defaultDraft) : ''));
  let nextAt = $state(suggested ? inDays(2) : toLocalInput(initial.dossier.nextStepAt));
  const nextDirty = $derived(nextText !== (d.nextStep ?? '') || nextAt !== toLocalInput(d.nextStepAt));
  function saveNext(at = nextAt) {
    nextAt = at;
    run({ op: 'setNextStep', text: nextText, at: at ? new Date(at).toISOString() : null });
  }
  function preset(days: number) { saveNext(inDays(days)); }
  const overdue = $derived(!!d.nextStepAt && new Date(d.nextStepAt).getTime() < Date.now());

  const money = (n: number | null, cur: string) =>
    n == null ? '—' : new Intl.NumberFormat(d.locale, { style: 'currency', currency: cur, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
  const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium' }).format(new Date(iso)) : '');

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
  <!-- cabecera: el título se edita aquí mismo -->
  <div class="mb-5 grid gap-2">
    <a href="/admin" class="co-meta w-fit hover:text-ink">← {s.pricesLocked ? t.header.backAccounts : t.header.backDossiers}</a>
    <div class="flex flex-wrap items-center gap-3">
      <input class="builder-title min-w-0 flex-1" value={d.title} disabled={!editable} maxlength="140" aria-label={t.prospect.name}
        onchange={(e) => saveField('title', e.currentTarget.value)} data-testid="title" />
      <span class={STATUS_CLASS[d.status]} data-testid="status">{t.status[d.status]}</span>
      {#if d.status === 'published'}<span class="co-badge {viewMode === 'test' ? 'co-badge--attention' : 'co-badge--signal'}" data-testid="view-mode-badge">{viewMode === 'test' ? t.share.test : t.share.live}</span>{/if}
      <span class="co-meta" aria-live="polite">{busy ? t.header.saving : t.header.saved}</span>
    </div>
  </div>

  {#if !editable}
    <p class="co-alert co-alert--info mb-4">{t.header.readOnly}</p>
  {/if}
  {#if error}
    <div class="co-alert mb-4 {failure ? 'co-alert--failure' : 'co-alert--rejection'} block" role="alert" data-testid="error">
      <div class="flex items-start gap-3">
        <p class="flex-1 font-semibold">{error}{#if failure}<span class="block font-normal">{t.header.failure} <code>{failure}</code>.</span>{/if}</p>
        <button class={iconBtn} onclick={() => { error = null; failure = null; details = []; }} aria-label={t.header.closeAlert}>✕</button>
      </div>
      {#if details.length}<ul class="mt-1 list-disc pl-5">{#each details as x}<li>{x}</li>{/each}</ul>{/if}
    </div>
  {/if}

  <div class="co-segmented mb-4 xl:hidden" role="tablist">
    <button role="tab" aria-selected={tab === 'edit'} aria-pressed={tab === 'edit'} onclick={() => (tab = 'edit')}>{t.tabs.edit}</button>
    <button role="tab" aria-selected={tab === 'preview' && pane === 'preview'} aria-pressed={tab === 'preview' && pane === 'preview'} onclick={() => { tab = 'preview'; pane = 'preview'; }}>{t.tabs.preview}</button>
    <button role="tab" aria-selected={tab === 'preview' && pane === 'script'} aria-pressed={tab === 'preview' && pane === 'script'} onclick={() => { tab = 'preview'; pane = 'script'; }}>{t.tabs.script}</button>
  </div>

  <div class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
    <!-- ============ editor ============ -->
    <div class="space-y-5 {tab === 'edit' ? '' : 'hidden xl:block'}">
      <!-- compartir: lo primero que necesita el comercial -->
      <section class="{card} share-card" data-testid="share">
        <h2 class="mb-3 co-card-title">{t.share.title}</h2>
        {#if d.status !== 'published'}
          {#if s.publishBlockers.length}
            <div class="co-alert co-alert--rejection mb-3 block"><p class="font-semibold">{t.publish.blockers}</p><ul>{#each s.publishBlockers as b}<li>{b}</li>{/each}</ul></div>
          {:else}
            <p class="co-meta mb-3">{t.share.draftHelp}</p>
          {/if}
          <button class="co-btn co-btn--primary co-btn--block" disabled={!editable || s.publishBlockers.length > 0 || busy} onclick={publishAndLink} data-testid="publish">{t.share.publishAndLink} <span aria-hidden="true">→</span></button>
        {:else}
          {#if activeLinks[0]}
            <div class="flex flex-wrap items-center gap-2">
              <code class="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs" data-testid="share-url">{linkUrl(activeLinks[0].token)}</code>
              <button class="co-btn co-btn--primary co-btn--sm" onclick={() => copy(activeLinks[0].token)} data-testid="share-copy">{copied === activeLinks[0].token ? t.links.copied : t.links.copy}</button>
              <a class={btn} href={linkUrl(activeLinks[0].token)} target="_blank" rel="noopener noreferrer">{t.links.open}</a>
            </div>
          {/if}
          <div class="mt-4 grid gap-2">
            <div class="co-segmented" role="radiogroup" aria-label={t.share.mode}>
              <button role="radio" aria-checked={viewMode === 'test'} disabled={!editable} onclick={() => setMode('test')} data-testid="view-mode-test">{t.share.test}</button>
              <button role="radio" aria-checked={viewMode === 'live'} disabled={!editable} onclick={() => setMode('live')} data-testid="view-mode-live">{t.share.live}</button>
            </div>
            <p class="co-meta">{viewMode === 'test' ? t.share.testHelp : t.share.liveHelp}</p>
          </div>
        {/if}
        {#if s.payment}
          <div class="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-[var(--console-divider)] pt-4" data-testid="payment">
            <p class="text-sm font-semibold">{t.tariff.payment} · {s.payment.label}</p>
            <div class="flex flex-wrap items-center gap-2">
              <code class="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs" data-testid="payment-url">{s.payment.url}</code>
              <button class="co-btn co-btn--primary co-btn--sm" onclick={copyPay} data-testid="payment-copy">{payCopied ? t.links.copied : t.links.copy}</button>
              <a class={btn} href={s.payment.url} target="_blank" rel="noopener noreferrer">{t.links.open}</a>
            </div>
            <p class="co-meta">{t.tariff.paymentHelp}</p>
          </div>
        {:else if d.priceOptionId}
          <p class="co-meta mt-4">{t.tariff.noLink}</p>
        {/if}
        <details class="mt-4 border-t border-[var(--console-divider)] pt-3" open={d.status === 'published'}>
          <summary class="cursor-pointer text-sm font-semibold text-muted">{t.share.moreLinks(s.links.length)}</summary>
          <div class="mt-3">
            {#if d.status !== 'published'}<p class="mb-3 text-sm text-muted">{t.links.unpublished}</p>{/if}
        {#if editable}
            <div class="mb-3 flex flex-wrap gap-2">
              <select class="co-select !w-auto" bind:value={linkExpiry} aria-label={t.links.expiry}>
                <option value="">{t.links.noExpiry}</option><option value="7">{t.links.in7}</option><option value="30">{t.links.in30}</option>
              </select>
              <button class="co-btn co-btn--primary co-btn--sm" onclick={createLink} data-testid="create-link">{t.links.create}</button>
            </div>
          {/if}
          <ul class="space-y-2 p-0" data-testid="links">
            {#each s.links as l (l.id)}
              <li class="co-card list-none !p-3 text-sm {l.state === 'active' ? '' : 'opacity-60'}" data-state={l.state}>
                <div class="flex flex-wrap items-center gap-2">
                  <code class="min-w-0 flex-1 truncate text-xs" data-testid="link-url">{linkUrl(l.token)}</code>
                  <span class="text-xs font-semibold">{l.state === 'active' ? (l.expiresAt ? t.links.expiresOn(fmtDate(l.expiresAt)) : t.links.active) : l.state === 'revoked' ? t.links.revoked : t.links.expired}</span>
                </div>
                {#if l.state === 'active'}
                  <div class="mt-2 flex gap-2">
                    <button class={btn} onclick={() => copy(l.token)}>{copied === l.token ? t.links.copied : t.links.copy}</button>
                    <a class={btn} href={linkUrl(l.token)} target="_blank" rel="noopener noreferrer">{t.links.open}</a>
                    {#if editable}<button class="co-btn co-btn--danger co-btn--sm ml-auto" onclick={() => revoke(l.id)}>{t.links.revoke}</button>{/if}
                  </div>
                {/if}
              </li>
            {:else}
              <li class="co-meta list-none">{editable ? t.links.emptyEditable : t.links.empty}</li>
            {/each}
          </ul>
          </div>
          {#if d.status === 'published'}<button class="{btn} mt-3" disabled={!editable} onclick={() => setStatus('draft')}>{t.publish.unpublish}</button>{/if}
        </details>
      </section>

      <!-- personalizar: lo que hace que el cliente diga «wow, es mi local» -->
      {#if editable}
        <section class="{card} media-card" data-testid="personalize">
          <div class="flex items-start gap-3">
            <span class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--co-signal-soft)] text-[color:var(--co-signal)]" aria-hidden="true">✦</span>
            <div class="grid gap-0.5"><h2 class="co-card-title">{t.media.title(d.prospectCompany || t.media.client)}</h2><p class="co-help">{t.media.lede}</p></div>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div class="media-tile" data-testid="media-logo">
              <p class="media-tile__label">{t.media.logo}</p>
              {#if media.logo}
                <div class="media-thumb media-thumb--logo"><img src={media.logo} alt="" /><button type="button" class="media-x" onclick={() => removeMedia(media.logo!)} aria-label={t.media.remove}>✕</button></div>
              {:else}
                <label class="media-add">{uploading === 'logo' ? t.media.uploading : t.media.addLogo}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" disabled={!!uploading} onchange={(e) => uploadMedia('logo', e.currentTarget.files)} data-testid="media-logo-input" /></label>
              {/if}
            </div>
            <div class="media-tile" data-testid="media-photos">
              <p class="media-tile__label">{t.media.photos}</p>
              <div class="grid grid-cols-3 gap-1.5">
                {#each media.photos ?? [] as url (url)}
                  <div class="media-thumb"><img src={url} alt="" /><button type="button" class="media-x" onclick={() => removeMedia(url)} aria-label={t.media.remove}>✕</button></div>
                {/each}
                {#if (media.photos?.length ?? 0) < 8}
                  <label class="media-add media-add--sm">{uploading === 'photo' ? '…' : '＋'}<input type="file" accept="image/png,image/jpeg,image/webp" multiple class="sr-only" disabled={!!uploading} onchange={(e) => uploadMedia('photo', e.currentTarget.files)} data-testid="media-photo-input" /></label>
                {/if}
              </div>
            </div>
            <div class="media-tile" data-testid="media-video">
              <p class="media-tile__label">{t.media.video}</p>
              {#if media.video}
                <div class="media-thumb media-thumb--video"><video src={media.video} muted loop playsinline autoplay></video><button type="button" class="media-x" onclick={() => removeMedia(media.video!)} aria-label={t.media.remove}>✕</button></div>
              {:else}
                <label class="media-add">{uploading === 'video' ? t.media.uploading : t.media.addVideo}<input type="file" accept="video/mp4,video/webm" class="sr-only" disabled={!!uploading} onchange={(e) => uploadMedia('video', e.currentTarget.files)} data-testid="media-video-input" /></label>
              {/if}
            </div>
          </div>
          <p class="co-help mt-3">{t.media.where}</p>
          <div class="mt-5 grid gap-2 border-t border-[var(--console-divider)] pt-4">
            <p class="media-tile__label">{t.media.layout}</p>
            <div class="co-chips" data-testid="media-layout">
              {#each Object.entries(t.media.layouts) as [k, label] (k)}
                <button type="button" class="co-chip" aria-pressed={(media.layout ?? 'slides') === k} onclick={() => setLayout(k as 'slides')} data-testid="layout-{k}">{label}</button>
              {/each}
            </div>
            <p class="media-tile__label mt-2">{t.media.has}</p>
            <div class="co-chips" data-testid="media-features">
              {#each Object.entries(t.media.features) as [k, label] (k)}
                <button type="button" class="co-chip" aria-pressed={feat[k as 'songs']} onclick={() => setFeature(k as 'songs')} data-testid="feature-{k}">{label}</button>
              {/each}
            </div>
            {#if feat.songs}
              <p class="media-tile__label mt-2">{t.media.style}</p>
              <div class="co-chips" data-testid="media-style">
                {#each Object.entries(MUSIC_STYLES) as [k, st] (k)}
                  <button type="button" class="co-chip" aria-pressed={(media.musicStyle || DEFAULT_STYLE) === k} onclick={() => setStyle(k)} data-testid="style-{k}">{st.label}</button>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {/if}

      <!-- módulos: arrastrar para ordenar o desde «Añadir» -->
      <section class={card}>
        <h2 class="mb-1 co-card-title">{t.modules.title}</h2>
        <p class="co-meta mb-3">{t.quick.dragHint}</p>
        {#if s.items.length === 0 && editable}
          <div class="mb-3 grid gap-3 rounded-[var(--console-radius-control)] bg-surface p-4" data-testid="quick-start">
            <p class="text-eyebrow">{t.quick.title}</p>
            {#if market.segments.length}
              <p class="text-sm font-semibold">{t.quick.sector}</p>
              <div class="co-chips">
                {#each market.segments as sg (sg.id)}
                  <button type="button" class="co-chip" aria-pressed={d.segmentId === sg.id} onclick={() => run({ op: 'setSegment', segmentId: sg.id })}>{sg.name}</button>
                {/each}
              </div>
            {/if}
            <div class="flex flex-wrap gap-2">
              {#if recommended.length}<button class="co-btn co-btn--primary co-btn--sm" disabled={busy} onclick={() => addMany(recommended)} data-testid="add-recommended">{t.quick.recommended(recommended.length)}</button>{/if}
              {#if s.catalog.length}<button class="{btn}" disabled={busy} onclick={() => addMany(s.catalog)} data-testid="add-all">{t.quick.all(s.catalog.length)}</button>{/if}
            </div>
          </div>
        {/if}
        <ol
          class="space-y-2 p-0 {s.items.length === 0 ? 'drop-empty' : 'min-h-[3rem]'}"
          use:dndzone={{ items: list, type: 'module', flipDurationMs: 150, dragDisabled: !editable || busy, dropTargetStyle: { outline: '2px dashed var(--co-signal)', outlineOffset: '4px', borderRadius: '12px' } }}
          onconsider={onConsider}
          onfinalize={onFinalize}
          data-testid="items"
        >
          {#each list as item, idx (item.id)}
            <li class="list-none rounded-[var(--console-radius-control)] {item.cat ? 'border-2 border-dashed border-[color:var(--co-signal)] p-3 font-semibold' : `border border-[var(--console-card-border)] bg-[var(--console-surface)] ${item.visible ? '' : 'opacity-60'}`}" animate:flip={{ duration: 150 }} data-testid={item.cat ? undefined : 'item'} data-item-key={item.moduleKey}>
              {#if item.cat}{item.moduleName}{:else}
              <div class="flex items-center gap-2 p-2 pl-3">
                <span class="cursor-grab select-none text-muted" aria-hidden="true">⠿</span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{item.moduleName}</p>
                  {#if !item.visible || item.price}<p class="truncate text-xs text-muted">
                    {#if !item.visible}<span class="font-semibold">{t.modules.hidden}</span>{/if}
                    {#if item.price}{!item.visible ? ' · ' : ''}{item.price.formatted}{/if}
                  </p>{/if}
                </div>
                <button class={iconBtn} disabled={!editable || idx === 0} onclick={() => move(item, -1)} aria-label={t.modules.moveUp(item.moduleName)}>↑</button>
                <button class={iconBtn} disabled={!editable || idx === list.length - 1} onclick={() => move(item, 1)} aria-label={t.modules.moveDown(item.moduleName)}>↓</button>
                <button class={iconBtn} disabled={!editable} onclick={() => run({ op: 'setVisible', itemId: item.id, visible: !item.visible })} aria-label={item.visible ? t.modules.hide(item.moduleName) : t.modules.show(item.moduleName)} aria-pressed={!item.visible} data-testid="toggle-visible">{item.visible ? '👁' : '◌'}</button>
                <button class={iconBtn} disabled={!editable} onclick={() => remove(item)} aria-label={t.modules.remove(item.moduleName)}>✕</button>
                {#if s.customPrices}<button class={iconBtn} onclick={() => toggleProps(item)} aria-expanded={openProps === item.id} aria-label="{t.advanced}: {item.moduleName}" title={t.advanced}>⋯</button>{/if}
              </div>
              {#if item.error}<p class="co-alert co-alert--rejection mx-3 mb-2 text-xs">{t.modules.invalid} {item.error}</p>{/if}
              <!-- Segunda fila solo si tiene algo (precio por módulo o versión nueva): nada de huecos vacíos. -->
              {#if (d.priceMode === 'per_module' && s.customPrices) || item.upgradeTo}
              <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-sm">
                {#if d.priceMode === 'per_module' && s.customPrices}
                  <label class="flex items-center gap-2">
                    <span class="text-muted">{t.modules.price}</span>
                    <input class="co-input !w-28 !min-h-[32px] !py-1" inputmode="decimal" value={item.priceOverride ?? ''} disabled={!editable}
                      placeholder={item.defaultPrice != null ? String(item.defaultPrice) : '—'} onchange={(e) => saveItemPrice(item, e.currentTarget.value)}
                      aria-label={t.modules.priceOf(item.moduleName)} data-testid="item-price-input" />
                  </label>
                {/if}
                {#if item.upgradeTo}
                  <button class={btn} disabled={!editable} onclick={() => run({ op: 'upgradeItem', itemId: item.id })}>{t.modules.upgrade(item.upgradeTo.version)}</button>
                {/if}
              </div>
              {/if}
              {#if openProps === item.id}
                <div class="space-y-2 border-t border-line p-3 text-sm">
                  <p class="text-xs text-muted">{t.modules.propsHelp}</p>
                  <textarea class="{field} h-40 font-mono text-xs" bind:value={propsDraft} disabled={!editable} spellcheck="false"></textarea>
                  {#if propsError}<p class="co-alert co-alert--rejection text-xs">{propsError}</p>{/if}
                  <details class="text-xs"><summary class="cursor-pointer text-muted">{t.modules.catalogValues}</summary><pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-surface p-2">{JSON.stringify(item.defaultProps, null, 2)}</pre></details>
                  {#if editable}<button class="co-btn co-btn--primary co-btn--sm" onclick={() => saveProps(item)}>{t.modules.saveProps}</button>{/if}
                </div>
              {/if}
              {/if}
            </li>
          {/each}
        </ol>
        {#if editable && cat.length}
          <p class="text-eyebrow mb-2 mt-5">{t.quick.add}</p>
          <ul
            class="grid gap-2 p-0 sm:grid-cols-2"
            use:dndzone={{ items: cat, type: 'module', dropFromOthersDisabled: true, flipDurationMs: 150, dragDisabled: busy, dropTargetStyle: {} }}
            onconsider={onCatConsider}
            onfinalize={onCatFinalize}
            data-testid="catalog"
          >
            {#each cat as c (c.id)}
              <li class="co-row list-none !items-center !p-3" animate:flip={{ duration: 150 }}>
                <span class="cursor-grab select-none text-muted" aria-hidden="true">⠿</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{c.moduleName}</span>
                  {#if c.description}<span class="block truncate text-xs text-muted">{c.description}</span>{/if}
                </span>
                <button class={iconBtn} disabled={busy} onclick={() => run({ op: 'addItem', moduleVersionId: c.versionId })} aria-label={t.catalog.addNamed(c.moduleName)} data-testid="add-{c.moduleKey}">＋</button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- seguimiento -->
      <section class={card} data-testid="followup">
        <h2 class="mb-3 co-card-title">{t.followup.title} {#if overdue}<span class="co-badge co-badge--attention ml-1">{t.followup.overdue}</span>{/if}</h2>
        <div class="grid gap-2 sm:grid-cols-[1fr_13rem]">
          <input class={field} placeholder={t.followup.nextPlaceholder} bind:value={nextText} maxlength="300" disabled={!editable}
            onchange={() => saveNext()} aria-label={t.followup.next} data-testid="next-step" />
          <input class={field} type="datetime-local" bind:value={nextAt} disabled={!editable} onchange={() => saveNext()} aria-label={t.followup.nextAt} data-testid="next-at" />
        </div>
        {#if editable}
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            <button class={btn} onclick={() => preset(2)}>{t.followup.in2d}</button>
            <button class={btn} onclick={() => preset(7)}>{t.followup.in1w}</button>
            <button class={btn} onclick={() => preset(14)}>{t.followup.in2w}</button>
            {#if d.nextStepAt}<button class={btn} onclick={() => { nextText = ''; saveNext(''); }}>{t.followup.clear}</button>{/if}
            {#if nextDirty && nextText}<button class="co-btn co-btn--primary co-btn--sm ml-auto" onclick={() => saveNext()} data-testid="followup-save">{t.followup.save}</button>{/if}
          </div>
        {/if}
        <a class="mt-3 co-btn co-btn--ghost co-btn--sm" href="/admin/compose?dossier={d.id}&type=seguimiento">{t.followup.compose}</a>
        <div class="mt-4 border-t border-[var(--console-divider)] pt-4">
        <div class="grid gap-2">
          <label class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold">{t.publish.outcome}</span>
            <select class="co-select !w-auto" value={d.outcome} disabled={!editable} onchange={(e) => onOutcome(e.currentTarget.value)} data-testid="outcome">
              {#each Object.entries(t.outcome) as [k, v]}<option value={k}>{v}</option>{/each}
            </select>
          </label>
          {#if d.outcome !== 'open' && editable}
            <a class="co-action" href="/admin/dossiers/{d.id}/debrief" data-testid="debrief-cta">
              <span class="co-action__label">{hasStory ? t.publish.reviewStory : t.publish.writeStory}<small>{hasStory ? t.publish.reviewStoryHint : t.publish.writeStoryHint}</small></span>
              <span aria-hidden="true">→</span>
            </a>
          {:else}
            <p class="co-meta">{t.publish.outcomeHelp}</p>
          {/if}
        </div>
      </div>
      </section>


      <!-- cuenta y actores -->
      <section class={card} data-testid="account">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h2 class="flex-1 co-card-title">{t.account.title}</h2>
          <select class="co-select !w-auto" value={d.segmentId ?? ''} disabled={!editable}
            onchange={(e) => run({ op: 'setSegment', segmentId: e.currentTarget.value || null })} aria-label={t.account.sector} data-testid="segment">
            <option value="">{t.account.sectorPick}</option>
            {#each market.segments as sg}<option value={sg.id}>{sg.name}</option>{/each}
          </select>
          {#if d.segmentId}<a class="text-xs underline" href="/admin/learn/sector/{market.segments.find((x) => x.id === d.segmentId)?.key}" target="_blank" rel="noopener">{t.account.viewSector}</a>{/if}
        </div>
        <p class="co-help mb-3">{t.account.help}</p>
        {#if accountFacets.length}
          <div class="mb-4 grid gap-3" data-testid="situation">
            {#each accountFacets as f (f.key)}
              <div>
                <p class="co-field mb-1">{f.question ?? f.label} <span class="co-help">{f.multi ? t.account.facetMulti : t.account.facetSingle} {t.account.optional}</span></p>
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
                  onchange={(e) => run({ op: 'updateContact', contactId: c.id, contact: { stance: e.currentTarget.value as Stance } })} aria-label={t.account.stanceOf(c.name)}>
                  {#each Object.entries(t.stance) as [k, v]}<option value={k}>{v}</option>{/each}
                </select>
                {#each contactFacets as f (f.key)}
                  <select class={smallSelect} value={(c.traits?.[f.key] ?? [])[0] ?? ''} disabled={!editable} onchange={(e) => setTrait(c.id, f, e.currentTarget.value)} aria-label={t.account.traitOf(f.label, c.name)} data-testid="trait-{f.key}">
                    <option value="">{t.account.traitUnknown(f.label)}</option>
                    {#each f.options as o}<option value={o.key}>{o.label}</option>{/each}
                  </select>
                {/each}
                <a class="co-btn co-btn--ghost co-btn--sm" href="/admin/compose?dossier={d.id}&contact={c.id}&type=primer_contacto">{t.account.message}</a>
                {#if editable}<button class={iconBtn} onclick={async () => (await ask({ title: t.confirm.removeContactTitle(c.name), label: t.confirm.removeContactLabel, danger: true,
                  does: t.confirm.removeContactDoes,
                  doesNot: t.confirm.removeContactDoesNot })) && run({ op: 'removeContact', contactId: c.id })} aria-label={t.modules.remove(c.name)}>✕</button>{/if}
              </div>
            </li>
          {:else}
            <li class="co-meta list-none">{t.account.empty}</li>
          {/each}
        </ul>
        {#if editable}
          <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input class={field} placeholder={t.account.namePlaceholder} bind:value={newContact.name} maxlength="120" aria-label={t.account.nameLabel} data-testid="contact-name" />
            <select class={field} bind:value={newContact.personaId} aria-label={t.account.actorType} data-testid="contact-persona">
              <option value="">{t.account.actorTypePick}</option>
              {#each segPersonas as p}<option value={p.id}>{p.name} ({t.personaRole[p.role]})</option>{/each}
            </select>
            <select class={field} bind:value={newContact.stance} aria-label={t.account.stance}>
              {#each Object.entries(t.stance) as [k, v]}<option value={k}>{v}</option>{/each}
            </select>
            <button class="co-btn co-btn--primary" onclick={addContact} data-testid="add-contact">{t.account.add}</button>
          </div>
        {/if}
      </section>

      <!-- datos del cliente y precio: a mano, pero sin ocupar la pantalla -->
      <details class={card} data-testid="client-data">
        <summary class="cursor-pointer co-card-title">{t.clientData}</summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-medium">{t.prospect.company}
            <input class={field} value={d.prospectCompany ?? ''} disabled={!editable} maxlength="120" onchange={(e) => saveField('prospectCompany', e.currentTarget.value)} />
          </label>
          <label class="text-sm font-medium">{t.prospect.contact}
            <input class={field} value={d.prospectName ?? ''} disabled={!editable} maxlength="120" onchange={(e) => saveField('prospectName', e.currentTarget.value)} />
          </label>
          <label class="text-sm font-medium">{t.prospect.language}
            <select class={field} value={d.locale} disabled={!editable} onchange={(e) => saveField('locale', e.currentTarget.value)}>
              {#each Object.entries(LOCALES) as [k, v]}<option value={k}>{v}</option>{/each}
            </select>
          </label>
        </div>
        <p class="mt-2 text-xs text-muted">{t.prospect.tokensPre}<code>{'{company}'}</code>{t.prospect.tokensMid}<code>{'{prospect}'}</code>{t.prospect.tokensPost}</p>
      </details>

      <details class={card} data-testid="price-panel" open={d.priceMode !== 'none' || !!s.partnerAccount || !!d.priceOptionId}>
        <summary class="flex cursor-pointer items-center justify-between gap-3">
          <span class="co-card-title">{t.price.title}</span>
          <span class="text-sm">{#if s.total}{#if s.total.before}<s class="text-muted">{s.total.before.formatted}</s> {/if}<strong data-testid="total">{s.total.formatted}</strong>{:else}<span class="text-muted">{t.price.modeNone}</span>{/if}</span>
        </summary>
        <div class="mt-3 grid gap-5">
        {#if s.partnerAccount}
          <p class="co-alert co-alert--info mb-3 block" data-testid="partner-account">
            {t.price.account} <strong>{s.partnerAccount.name}</strong> · {t.policy[s.partnerAccount.pricePolicy]}{s.partnerAccount.pricePolicy === 'adjusted' && s.partnerAccount.priceAdjustPct != null ? t.price.overList(`${s.partnerAccount.priceAdjustPct > 0 ? '+' : ''}${s.partnerAccount.priceAdjustPct}`) : ''}
            {#if s.pricesLocked}
              <span class="mt-1 block text-muted">{t.price.locked}{s.partnerAccount.pricePolicy === 'hidden' ? t.price.lockedHidden : ''}</span>
            {:else}
              <span class="mt-1 block text-muted">{t.price.partner}</span>
            {/if}
          </p>
        {/if}
        {#if !s.pricesLocked}
          <!-- Tarifas: las fija la empresa; aquí solo se eligen -->
          <div class="grid gap-2">
            {#if s.priceOptions.length === 0 && !s.customPrices}<p class="co-meta">{t.tariff.empty}</p>{/if}
            {#if s.priceOptions.length}<p class="co-field">{t.tariff.what}</p>{/if}
            <div class="co-chips" data-testid="price-kinds">
              <button type="button" class="co-chip" aria-pressed={!d.priceOptionId && d.priceMode === 'none' && !customOpen} disabled={!editable} onclick={() => { pickedKind = null; customOpen = false; run({ op: 'setPriceOption', priceOptionId: null }); }} data-testid="price-option-none">{t.tariff.none}</button>
              {#each shownKinds as x (x.k)}
                <button type="button" class="co-chip" aria-pressed={activeKind === x.k} disabled={!editable} onclick={() => pickKind(x.k)} data-testid="price-kind" data-kind={x.k}>{x.k}</button>
              {/each}
              {#if shownKinds.length < kinds.length}<button type="button" class="co-chip co-chip--quiet" onclick={() => (allKinds = true)} data-testid="price-kinds-more">{t.tariff.otherSectors}</button>{/if}
              {#if s.customPrices}<button type="button" class="co-chip" aria-pressed={customOpen || (!d.priceOptionId && d.priceMode !== 'none')} disabled={!editable} onclick={() => (customOpen = !customOpen)} data-testid="price-custom">{t.tariff.custom}</button>{/if}
            </div>
            {#if activeKind && s.priceOptions.filter((o) => kindOf(o) === activeKind).length > 1}
              <div class="co-chips mt-1" data-testid="price-options">
                {#each s.priceOptions.filter((o) => kindOf(o) === activeKind) as o (o.id)}
                  <button type="button" class="co-chip" aria-pressed={d.priceOptionId === o.id} disabled={!editable} onclick={() => d.priceOptionId !== o.id && run({ op: 'setPriceOption', priceOptionId: o.id })} data-testid="price-option" data-label={o.label}>{o.kind && o.label.startsWith(o.kind + ' · ') ? o.label.slice(o.kind.length + 3) : o.label} · <strong>{money(o.amount, o.currency)}{t.tariff.period[o.period] ?? ''}</strong></button>
                {/each}
              </div>
            {/if}
          </div>
          {#if s.customPrices && (customOpen || (!d.priceOptionId && d.priceMode !== 'none'))}
            <div class="grid gap-3 rounded-[var(--console-radius-control)] bg-surface p-3">
        <div class="co-segmented" role="radiogroup" aria-label={t.price.mode}>
          {#each [['none', t.price.modeNone], ['total', t.price.modeTotal], ['per_module', t.price.modePerModule]] as [mode, label]}
            <button
              role="radio" aria-checked={d.priceMode === mode} disabled={!editable}
              onclick={() => d.priceMode !== mode && run({ op: 'update', patch: { priceMode: mode as 'none' | 'total' | 'per_module' } })}
              data-testid={`price-mode-${mode}`}
            >{label}</button>
          {/each}
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          {#if d.priceMode === 'total'}
            <label class="text-sm font-medium">{t.price.totalPrice}
              <input class={field} inputmode="decimal" value={d.totalPrice ?? ''} disabled={!editable} placeholder="0" onchange={(e) => saveTotal(e.currentTarget.value)} data-testid="total-price" />
            </label>
          {/if}
          {#if d.priceMode !== 'none'}
            <label class="text-sm font-medium">{t.price.currency}
              <select class={field} value={d.currency} disabled={!editable} onchange={(e) => saveField('currency', e.currentTarget.value)}>
                {#each CURRENCIES as c}<option>{c}</option>{/each}
              </select>
            </label>
          {/if}
        </div>
        {#if d.priceMode === 'per_module'}<p class="mt-2 text-xs text-muted">{t.price.perModuleHelp}</p>{/if}
            </div>
          {/if}
          {#if d.priceMode !== 'none' && (coupons.length || d.discount)}
            <div class="grid gap-2">
              <p class="co-field">{t.tariff.discount}</p>
              <div class="co-chips" data-testid="coupons">
                <button type="button" class="co-chip" aria-pressed={!d.couponId} disabled={!editable} onclick={() => d.couponId && run({ op: 'setCoupon', couponId: null })} data-testid="coupon-none">{t.tariff.noDiscount}</button>
                {#if d.couponId && d.discount && !coupons.some((c) => c.id === d.couponId)}<button type="button" class="co-chip" aria-pressed="true" disabled>{d.discount.label}</button>{/if}
                {#each coupons as c (c.id)}
                  <button type="button" class="co-chip" aria-pressed={d.couponId === c.id} disabled={!editable} onclick={() => d.couponId !== c.id && run({ op: 'setCoupon', couponId: c.id })} data-testid="coupon-{c.code}">{c.label}</button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
        </div>
      </details>

      <details class="px-1">
        <summary class="cursor-pointer text-sm text-muted">{t.moreActions}</summary>
        <div class="mt-3 flex flex-wrap gap-2">
          {#if d.status !== 'archived'}<button class={btn} disabled={!editable} onclick={() => setStatus('archived')}>{t.publish.archive}</button>{/if}
          {#if d.status !== 'published'}<button class="co-btn co-btn--danger co-btn--sm" disabled={!editable} onclick={destroy}>{t.publish.delete}</button>{/if}
        </div>
      </details>
    </div>

    <!-- ============ preview ============ -->
    <div class="{tab === 'preview' ? '' : 'hidden xl:block'}">
      <div class="xl:sticky xl:top-4">
        <div class="co-segmented mb-3 hidden xl:grid" role="tablist" aria-label={t.tabs.panel}>
          <button role="tab" aria-selected={pane === 'preview'} aria-pressed={pane === 'preview'} onclick={() => (pane = 'preview')}>{t.tabs.preview}</button>
          <button role="tab" aria-selected={pane === 'script'} aria-pressed={pane === 'script'} onclick={() => (pane = 'script')} data-testid="tab-script">{t.tabs.scriptLong}</button>
        </div>
        {#if pane === 'script'}
          <div class="co-card" data-testid="talk-track">
            {#if similar && similar.total > 0}
              <section class="co-card co-card--soft mb-4 grid gap-2" data-testid="similar">
                <p class="text-eyebrow">{t.script.similar}</p>
                {#if similar.plays.length}
                  <p class="text-sm"><strong>{t.script.mostWon}</strong> {#each similar.plays.slice(0, 3) as p, i}{#if i} · {/if}{p.title} <span class="co-meta">({t.script.wonCount(p.wonIn)})</span>{/each}</p>
                {/if}
                {#each similar.stories.slice(0, 2) as m (m.story.id)}
                  <div class="text-sm">
                    <span class="co-badge {m.story.outcome === 'won' ? 'co-badge--ink' : 'co-badge--attention'}">{m.story.outcome === 'won' ? t.outcome.won : t.outcome.lost}</span>
                    <strong>{m.story.title}</strong> <span class="co-meta">· {m.matches.map((x) => x.label).join(' · ')}{m.differs.length ? t.script.watchOut(m.differs.map((x) => x.label).join(', ')) : ''}</span>
                    <p class="co-body mt-1">{t.script.quote((m.story.outcome === 'won' ? m.story.whatWorked : m.story.whatFailed ?? m.story.whatWorked) ?? '')}</p>
                  </div>
                {/each}
                <a class="co-meta underline" href="/admin/wins?dossier={d.id}">{t.script.seeAll}</a>
              </section>
            {/if}
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <p class="min-w-0 flex-1 text-sm text-muted">{t.script.introPre}<strong>{t.script.introStrong}</strong>{t.script.introPost}</p>
              <button class={btn} onclick={copyTrack}>{trackCopied ? t.links.copied : t.links.copy}</button>
              <a class={btn} href="/admin/dossiers/{d.id}/script" target="_blank" rel="noopener">{t.script.print}</a>
            </div>
            {#if trackError}<p class="co-alert co-alert--failure">{trackError}</p>{/if}
            {#if !track && !trackError}<p class="text-sm text-muted">{t.script.loading}</p>{/if}
            {#if track}
              {#if track.empty}<p class="co-alert co-alert--info">{t.script.noPlaybook}</p>{/if}
              {#if track.uncovered.length}<p class="co-alert co-alert--info mb-3 text-xs">{t.script.uncovered(track.uncovered.join(', '))}</p>{/if}
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
                            {#if b.contactId}<a class="mt-1 inline-block font-semibold underline" href="/admin/compose?dossier={d.id}&contact={b.contactId}">{t.script.compose}</a>{/if}
                          </dl>
                        {/if}
                        {#if b.note}<p class="mt-1 rounded-lg bg-surface p-2 text-xs">{b.note}</p>{/if}
                        <ul class="mt-2 space-y-2 p-0">
                          {#each b.lines as l (l.source + l.id)}
                            <li class="co-card list-none !p-3 text-sm" data-testid="track-line">
                              <p class="font-semibold">{#if l.source === 'team'}<span class="co-badge co-badge--soft mr-1">{t.script.team}</span>{/if}{l.title}</p>
                              {#if l.text}<div class="prose-play mt-1 text-muted">{@html renderMarkdown(l.text)}</div>{/if}
                              {#if l.refs.length}
                                <p class="mt-1 text-xs">{#each l.refs as r, i}{#if i} · {/if}{#if r.url}<a class="underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>{:else}{r.title}{/if}{#if r.creator} ({r.creator}){/if}{/each}</p>
                              {/if}
                              {#if l.source === 'official'}
                                <p class="co-meta mt-2" data-testid="line-evidence">{l.score.worked || l.score.didnt ? t.script.used(l.score.worked + l.score.didnt, l.score.worked) : t.script.noEvidence}</p>
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
          <span class="co-row-title">{t.preview.title}</span>
          <div class="co-segmented ml-auto hidden md:grid">
            {#each [['mobile', t.preview.mobile], ['tablet', t.preview.tablet], ['desktop', t.preview.desktop]] as [k, label]}
              <button class="!min-h-[28px] px-3" aria-pressed={device === k} onclick={() => (device = k as typeof device)}>{label}</button>
            {/each}
          </div>
          <a class="ml-auto text-xs text-muted underline md:ml-0" href="/admin/dossiers/{d.id}/preview" target="_blank" rel="noopener">{t.preview.open}</a>
        </div>
        <div class="overflow-hidden rounded-2xl border border-line bg-bg">
          <iframe
            title={t.preview.frame}
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
        <p class="co-dialog__not"><strong>{t.confirm.doesNot}</strong> {asking.doesNot}</p>
      </div>
      <div class="co-dialog__foot">
        <button type="button" class="co-btn co-btn--ghost" onclick={() => answer(false)}>{t.confirm.cancel}</button>
        <button type="button" class="co-btn {asking.danger ? 'co-btn--danger' : 'co-btn--primary'}" onclick={() => answer(true)} data-testid="confirm-modal-ok">{asking.label}</button>
      </div>
    {/if}
  </dialog>
</div>

<style>
  .media-card { border-color: color-mix(in srgb, var(--co-signal, #6d28d9) 35%, transparent); }
  .media-tile { display: grid; align-content: start; gap: .5rem; }
  .media-tile__label { font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--co-ink-dim); }
  .media-add { display: grid; place-items: center; min-height: 6.5rem; border: 2px dashed var(--console-card-border-hover); border-radius: .9rem; cursor: pointer; font-weight: 700; text-align: center; padding: .5rem; }
  .media-add:hover { border-color: var(--co-signal, #6d28d9); color: var(--co-signal, #6d28d9); }
  .media-add--sm { min-height: 0; aspect-ratio: 1; font-size: 1.4rem; }
  .media-thumb { position: relative; aspect-ratio: 1; border-radius: .6rem; overflow: hidden; background: #111; }
  .media-thumb img, .media-thumb video { width: 100%; height: 100%; object-fit: cover; }
  .media-thumb--logo { aspect-ratio: 16 / 9; background: var(--console-chip-bg); }
  .media-thumb--logo img { object-fit: contain; padding: .5rem; }
  .media-thumb--video { aspect-ratio: 16 / 9; }
  .media-x { position: absolute; top: .25rem; right: .25rem; width: 1.6rem; height: 1.6rem; border-radius: 999px; background: rgba(0,0,0,.65); color: #fff; font-size: .75rem; }
</style>
