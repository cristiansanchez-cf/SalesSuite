-- Analítica de dossiers (docs/ANALYTICS.md): quién abre la propuesta, cuánto tiempo y qué secciones lee.
-- Sin datos personales del visitante: un id aleatorio del navegador (cookie de primera parte) y el tipo de dispositivo.
-- Se escribe SOLO con track_dossier_view (anónimo, valida el enlace igual que get_public_dossier).

create table public.dossier_view (
  id           uuid primary key,
  tenant_id    uuid not null,
  dossier_id   uuid not null,
  link_id      uuid references public.share_link(id) on delete set null,
  visitor      text not null check (visitor ~ '^[A-Za-z0-9_-]{8,64}$'),
  device       text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Tiempo con la pestaña visible (máx. 4 h por visita) y hasta dónde bajó (0–100 %).
  duration_ms  integer not null default 0 check (duration_ms between 0 and 14400000),
  max_scroll   smallint not null default 0 check (max_scroll between 0 and 100),
  -- { id de dossier_item: ms visible en pantalla }
  sections     jsonb not null default '{}'::jsonb check (jsonb_typeof(sections) = 'object'),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete cascade
);
create index dossier_view_dossier_idx on public.dossier_view (tenant_id, dossier_id, started_at desc);

alter table public.dossier_view enable row level security;
-- Lo ve quien ve el dossier (las políticas de public.dossier deciden: miembros, o el colaborador autor).
create policy dossier_view_select on public.dossier_view for select to authenticated
  using (exists (select 1 from public.dossier d where d.id = dossier_view.dossier_id and d.tenant_id = dossier_view.tenant_id));
revoke insert, update, delete on public.dossier_view from anon, authenticated;

-- Registro de una visita (se llama varias veces durante la misma visita: la última manda, sin bajar nunca).
create or replace function public.track_dossier_view(
  p_token text, p_tenant_id uuid, p_view uuid, p_visitor text, p_device text,
  p_duration_ms integer, p_scroll integer, p_sections jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_link record;
  v_view public.dossier_view;
  v_sections jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_n int := 0;
begin
  select l.id as link_id, d.id as dossier_id, d.tenant_id, d.author_id, d.title, d.prospect_company
    into v_link
    from public.share_link l
    join public.dossier d on d.id = l.dossier_id
    join public.tenant t on t.id = d.tenant_id
   where l.token = p_token and l.is_active and (l.expires_at is null or l.expires_at > now())
     and d.status = 'published' and d.tenant_id = p_tenant_id and t.status = 'active';
  if not found then return false; end if;
  if p_view is null or p_visitor is null or p_visitor !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  -- Freno al abuso de quien tenga el enlace: como mucho 20 visitas nuevas por navegador y hora.
  if not exists (select 1 from public.dossier_view where id = p_view) and (
    select count(*) from public.dossier_view
     where dossier_id = v_link.dossier_id and visitor = p_visitor and started_at > now() - interval '1 hour') >= 20 then
    return false;
  end if;

  -- Secciones: solo ids de items de ESTE dossier, como mucho 60, valores acotados.
  if jsonb_typeof(p_sections) = 'object' then
    for v_key, v_val in select * from jsonb_each(p_sections) loop
      exit when v_n >= 60;
      if jsonb_typeof(v_val) = 'number' and exists (
        select 1 from public.dossier_item i where i.dossier_id = v_link.dossier_id and i.id::text = v_key
      ) then
        v_sections := v_sections || jsonb_build_object(v_key, least(greatest((v_val)::text::numeric, 0), 14400000)::integer);
        v_n := v_n + 1;
      end if;
    end loop;
  end if;

  select * into v_view from public.dossier_view where id = p_view;
  if found then
    -- Otro dossier u otro navegador con el mismo id de visita: se ignora. Más de 4 h después: visita cerrada.
    if v_view.dossier_id <> v_link.dossier_id or v_view.visitor <> p_visitor or v_view.started_at < now() - interval '4 hours' then
      return false;
    end if;
    update public.dossier_view set
      last_seen_at = now(),
      duration_ms  = greatest(duration_ms, least(greatest(coalesce(p_duration_ms, 0), 0), 14400000)),
      max_scroll   = greatest(max_scroll, least(greatest(coalesce(p_scroll, 0), 0), 100)),
      sections     = (select coalesce(jsonb_object_agg(k, greatest(coalesce((sections->>k)::integer, 0), coalesce((v_sections->>k)::integer, 0))), '{}'::jsonb)
                        from (select jsonb_object_keys(sections) as k union select jsonb_object_keys(v_sections)) keys)
     where id = p_view;
    return true;
  end if;

  insert into public.dossier_view (id, tenant_id, dossier_id, link_id, visitor, device, duration_ms, max_scroll, sections)
  values (p_view, v_link.tenant_id, v_link.dossier_id, v_link.link_id, p_visitor,
          case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end,
          least(greatest(coalesce(p_duration_ms, 0), 0), 14400000), least(greatest(coalesce(p_scroll, 0), 0), 100), v_sections);

  -- Aviso al autor: como mucho uno por propuesta y día («Sala X ha abierto tu propuesta»).
  if v_link.author_id is not null then
    insert into public.notification (tenant_id, user_id, kind, severity, entity_key, params)
    values (v_link.tenant_id, v_link.author_id, 'dossier_opened', 'info',
            v_link.dossier_id::text || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
            jsonb_build_object('dossierId', v_link.dossier_id, 'title', v_link.title, 'company', v_link.prospect_company))
    on conflict (user_id, tenant_id, kind, entity_key) do nothing;
  end if;
  return true;
end $$;
revoke all on function public.track_dossier_view(text, uuid, uuid, text, text, integer, integer, jsonb) from public;
grant execute on function public.track_dossier_view(text, uuid, uuid, text, text, integer, integer, jsonb) to anon, authenticated;
