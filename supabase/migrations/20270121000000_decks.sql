-- Decks de inversión (docs/DECKS.md): sección temporal para las startups (Enjoy, Oquea, SciScreen). Un deck es como una
-- propuesta (mismo editor, mismo enlace /d/…, mismas analíticas), pero para un inversor y con bloques de inversión.
--  · dossier.kind: 'proposal' (lo de siempre) o 'deck'.
--  · Los bloques de un deck son los de tipo deck-* (no salen al montar una propuesta, y al revés).
--  · tenant_feature.decks: la sección la activa el superadmin (platform_set_feature); el espacio solo la lee.
--  · El tipo «Inversor» en el CRM (perfil 'investor': sin cualificación de venta) y los bloques de serie del deck.

alter table public.dossier add column if not exists kind text not null default 'proposal' check (kind in ('proposal', 'deck'));
create index if not exists dossier_kind_idx on public.dossier (tenant_id, kind);

create table if not exists public.tenant_feature (
  tenant_id  uuid primary key references public.tenant(id) on delete cascade,
  decks      boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.tenant_feature enable row level security;
drop policy if exists tenant_feature_read on public.tenant_feature;
create policy tenant_feature_read on public.tenant_feature for select to authenticated using (public.is_member(tenant_id) or public.is_superadmin());
revoke insert, update, delete on public.tenant_feature from anon, authenticated;

-- Solo el superadmin la cambia (Plataforma).
create or replace function public.platform_set_feature(p_tenant uuid, p_decks boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin'; end if;
  insert into public.tenant_feature (tenant_id, decks, updated_at) values (p_tenant, coalesce(p_decks, false), now())
  on conflict (tenant_id) do update set decks = excluded.decks, updated_at = now();
end $$;
revoke all on function public.platform_set_feature(uuid, boolean) from public, anon;
grant execute on function public.platform_set_feature(uuid, boolean) to authenticated;

-- Las startups: sección activada, tipo «Inversor» y los bloques de serie del deck (se editan en Catálogo).
do $$
declare t record; m uuid; b record;
begin
  for t in select id, name from public.tenant where slug in ('enjoy', 'oquea', 'sciscreen') loop
    insert into public.tenant_feature (tenant_id, decks) values (t.id, true) on conflict (tenant_id) do update set decks = true;

    update public.crm_settings s set kinds = s.kinds || '[{"key": "inversor", "label": "Inversor", "plural": "Inversores", "icon": "briefcase", "profile": "investor"}]'::jsonb
    where s.tenant_id = t.id and jsonb_array_length(s.kinds) between 1 and 11
      and not exists (select 1 from jsonb_array_elements(s.kinds) k where k ->> 'key' = 'inversor');

    for b in select * from (values
      (1, 'deck-portada', 'deck-cover', 'Deck · Portada', jsonb_build_object('eyebrow', 'Para {company}', 'title', t.name, 'tagline', 'Qué hacéis y para quién, en una frase.', 'round', 'Ronda pre-semilla · 2027')),
      (2, 'deck-problema', 'deck-slide', 'Deck · El problema', '{"eyebrow": "El problema", "title": "Lo que pasa hoy", "bullets": ["Quién tiene el problema", "Qué le cuesta (tiempo, dinero, clientes)", "Por qué lo de ahora no lo resuelve"]}'::jsonb),
      (3, 'deck-solucion', 'deck-slide', 'Deck · La solución', '{"eyebrow": "La solución", "title": "Cómo lo resolvemos", "bullets": ["Qué hace el producto", "Por qué funciona mejor", "Qué tenemos ya hecho"]}'::jsonb),
      (4, 'deck-mercado', 'deck-stats', 'Deck · Mercado', '{"eyebrow": "Mercado", "title": "El tamaño de la oportunidad", "stats": [{"value": "—", "label": "TAM", "note": "Mercado total"}, {"value": "—", "label": "SAM", "note": "Al que llegamos"}, {"value": "—", "label": "SOM", "note": "Lo que queremos en 3 años"}]}'::jsonb),
      (5, 'deck-traccion', 'deck-stats', 'Deck · Tracción', '{"eyebrow": "Tracción", "title": "Lo que ya funciona", "stats": [{"value": "—", "label": "Clientes"}, {"value": "—", "label": "Ingresos al mes"}, {"value": "—", "label": "Crecimiento"}]}'::jsonb),
      (6, 'deck-modelo', 'deck-slide', 'Deck · Modelo de negocio', '{"eyebrow": "Modelo de negocio", "title": "Cómo ganamos dinero", "bullets": ["Qué se cobra y a quién", "Precio y margen", "Cómo crece cada cliente"]}'::jsonb),
      (7, 'deck-competencia', 'deck-slide', 'Deck · Competencia', '{"eyebrow": "Competencia", "title": "Por qué nosotros", "bullets": ["Con quién nos comparan", "Qué hacemos distinto", "Qué es difícil de copiar"]}'::jsonb),
      (8, 'deck-equipo', 'deck-team', 'Deck · Equipo', '{"eyebrow": "Equipo", "title": "Quién lo hace", "people": [{"name": "Nombre Apellido", "role": "CEO", "bio": "Por qué tú"}]}'::jsonb),
      (9, 'deck-ronda', 'deck-stats', 'Deck · La ronda', '{"eyebrow": "La ronda", "title": "Lo que levantamos", "stats": [{"value": "—", "label": "Ronda"}, {"value": "—", "label": "Meses de caja"}], "breakdownTitle": "Uso de los fondos", "breakdown": [{"label": "Producto", "percent": 40}, {"label": "Ventas y marketing", "percent": 40}, {"label": "Operaciones", "percent": 20}]}'::jsonb)
    ) as x(pos, key, block_type, name, props) loop
      m := null;
      insert into public.module (tenant_id, key, block_type, name, description, is_catalog)
      values (t.id, b.key, b.block_type, b.name, 'Bloque de deck de inversión: edítalo con lo vuestro.', true)
      on conflict (tenant_id, key) do nothing
      returning id into m;
      if m is not null then
        insert into public.module_version (tenant_id, module_id, version, default_props, status) values (t.id, m, 1, b.props, 'published');
      end if;
    end loop;
  end loop;
end $$;
