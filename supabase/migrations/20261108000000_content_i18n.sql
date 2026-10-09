-- Contenido de cada empresa en varios idiomas (docs/I18N.md §Contenido). Opcional por espacio: content_locales vacío =
-- solo el idioma del espacio (default_locale), como hasta ahora. Las traducciones las escribe el script
-- scripts/content-translate.ts (service role); la consola las lee y las pone encima del original al vender. El
-- original nunca se toca: se edita en Configurar y la traducción se rehace cuando cambia (source_hash).

alter table public.tenant add column content_locales text[] not null default '{}'
  check (cardinality(content_locales) <= 6 and content_locales <@ array['es', 'en', 'pt', 'ko']::text[]);

create table public.content_i18n (
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  locale      text not null check (locale in ('es', 'en', 'pt', 'ko')),
  -- Qué es: play, segment, persona, facet, module, module_version, segment_module, tenant.
  kind        text not null check (kind in ('play', 'segment', 'persona', 'facet', 'module', 'module_version', 'segment_module', 'tenant')),
  -- Su id (uuid como texto; segment_module: «<segmento>:<módulo>»).
  ref         text not null check (length(ref) between 1 and 80),
  -- Ruta → texto traducido («title», «props/cards/0/title»…).
  texts       jsonb not null check (jsonb_typeof(texts) = 'object' and pg_column_size(texts) <= 200000),
  -- Huella del original que se tradujo: si cambia, la traducción está desactualizada.
  source_hash text not null check (length(source_hash) between 8 and 128),
  -- auto: traducción automática (se enseña con esa marca). reviewed: revisada por una persona.
  status      text not null default 'auto' check (status in ('auto', 'reviewed')),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, locale, kind, ref)
);

alter table public.content_i18n enable row level security;
-- La leen los miembros del espacio (como el contenido original). Solo la escribe el service role (script de traducción).
create policy content_i18n_select on public.content_i18n for select to authenticated using (public.is_member(tenant_id));
-- El anónimo no la lee nunca directamente: la propuesta pública usa get_public_content_i18n.
revoke all on public.content_i18n from anon;

-- Propuesta pública en otro idioma: los textos traducidos de sus módulos, por la huella del original (así valen
-- también para versiones fijadas antes de traducir, si sus textos no han cambiado). Misma puerta que get_public_dossier:
-- enlace activo y sin caducar, propuesta publicada y espacio activo. Solo si el espacio traduce a ese idioma.
create or replace function public.get_public_content_i18n(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_object_agg(c.source_hash, c.texts)
    from public.content_i18n c
    where c.tenant_id = d.tenant_id and c.kind = 'module_version' and c.locale = left(d.locale, 2)
      and left(d.locale, 2) = any(t.content_locales)
  ), '{}'::jsonb)
  from public.share_link l
  join public.dossier d on d.id = l.dossier_id
  join public.tenant t on t.id = d.tenant_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and d.status = 'published'
    and d.tenant_id = p_tenant_id
    and t.status = 'active';
$$;
revoke all on function public.get_public_content_i18n(text, uuid) from public;
grant execute on function public.get_public_content_i18n(text, uuid) to anon, authenticated;
