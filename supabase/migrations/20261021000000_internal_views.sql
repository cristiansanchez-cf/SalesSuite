-- Aperturas internas (docs/ANALYTICS.md §Internas): que «te están mirando» sea siempre el cliente.
-- Una visita es interna si:
--   · la propuesta está en modo prueba (dossier.view_mode = 'test'): para enviártela a ti o a un compañero;
--   · se abre en un navegador con sesión de la consola en este dominio (member);
--   · llega desde una red (IP) desde la que alguien del equipo ha usado la consola en los últimos 7 días (team).
-- Las internas se guardan marcadas (no se pierde nada) pero no cuentan en la analítica ni avisan al autor.

-- Las propuestas que ya existen siguen contando (live); las nuevas empiezan en prueba (la app lo pide al crearlas).
alter table public.dossier add column view_mode text not null default 'live' check (view_mode in ('test', 'live'));

alter table public.dossier_view add column internal text check (internal in ('test', 'member', 'team'));

-- Redes del equipo: hash de la IP (con sal por espacio, nunca la IP en claro) y cuándo se vio por última vez.
create table public.team_ip (
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  ip_hash      text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  last_seen_at timestamptz not null default now(),
  primary key (tenant_id, ip_hash)
);
alter table public.team_ip enable row level security;
revoke all on public.team_ip from anon, authenticated;

-- La consola anota la red de quien la usa (miembros del espacio, comprobado aquí).
create or replace function public.note_team_ip(p_tenant_id uuid, p_ip_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or not public.is_member(p_tenant_id) then return; end if;
  insert into public.team_ip (tenant_id, ip_hash, last_seen_at) values (p_tenant_id, p_ip_hash, now())
  on conflict (tenant_id, ip_hash) do update set last_seen_at = now();
  -- Limpieza: redes que nadie del equipo usa desde hace un mes.
  delete from public.team_ip where tenant_id = p_tenant_id and last_seen_at < now() - interval '30 days';
end $$;
revoke all on function public.note_team_ip(uuid, text) from public;
grant execute on function public.note_team_ip(uuid, text) to authenticated;

drop function public.track_dossier_view(text, uuid, uuid, text, text, integer, integer, jsonb);
create or replace function public.track_dossier_view(
  p_token text, p_tenant_id uuid, p_view uuid, p_visitor text, p_device text,
  p_duration_ms integer, p_scroll integer, p_sections jsonb,
  p_ip_hash text default null, p_member boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_link record;
  v_view public.dossier_view;
  v_sections jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_n int := 0;
  v_internal text;
begin
  select l.id as link_id, d.id as dossier_id, d.tenant_id, d.author_id, d.title, d.prospect_company, d.view_mode
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

  -- ¿Interna? Modo prueba → navegador con sesión de la consola → red del equipo (última semana).
  v_internal := case
    when v_link.view_mode = 'test' then 'test'
    when coalesce(p_member, false) then 'member'
    when p_ip_hash is not null and exists (
      select 1 from public.team_ip ti where ti.tenant_id = v_link.tenant_id and ti.ip_hash = p_ip_hash and ti.last_seen_at > now() - interval '7 days'
    ) then 'team'
  end;

  insert into public.dossier_view (id, tenant_id, dossier_id, link_id, visitor, device, duration_ms, max_scroll, sections, internal)
  values (p_view, v_link.tenant_id, v_link.dossier_id, v_link.link_id, p_visitor,
          case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end,
          least(greatest(coalesce(p_duration_ms, 0), 0), 14400000), least(greatest(coalesce(p_scroll, 0), 0), 100), v_sections, v_internal);

  -- Aviso al autor: solo visitas del cliente, como mucho uno por propuesta y día («Sala X ha abierto tu propuesta»).
  if v_internal is null and v_link.author_id is not null then
    insert into public.notification (tenant_id, user_id, kind, severity, entity_key, params)
    values (v_link.tenant_id, v_link.author_id, 'dossier_opened', 'info',
            v_link.dossier_id::text || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
            jsonb_build_object('dossierId', v_link.dossier_id, 'title', v_link.title, 'company', v_link.prospect_company))
    on conflict (user_id, tenant_id, kind, entity_key) do nothing;
  end if;
  return true;
end $$;
revoke all on function public.track_dossier_view(text, uuid, uuid, text, text, integer, integer, jsonb, text, boolean) from public;
grant execute on function public.track_dossier_view(text, uuid, uuid, text, text, integer, integer, jsonb, text, boolean) to anon, authenticated;
