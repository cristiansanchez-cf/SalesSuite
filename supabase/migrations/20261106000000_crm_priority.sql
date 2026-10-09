-- Prioridad de los leads (docs/CRM_DINAMICO.md §11): cualificación de cada empresa (un clic por criterio) y pesos del espacio.

alter table public.account
  add column qualification jsonb not null default '{}'::jsonb check (jsonb_typeof(qualification) = 'object' and pg_column_size(qualification) <= 4000);

-- Pesos de la puntuación (los define el admin; los lee el equipo). Los tramos viven en el código (src/lib/crm/priority.ts).
create table public.crm_settings (
  tenant_id         uuid primary key references public.tenant(id) on delete cascade,
  priority_weights  jsonb not null default '{}'::jsonb check (jsonb_typeof(priority_weights) = 'object'),
  updated_at        timestamptz not null default now()
);
alter table public.crm_settings enable row level security;
create policy crm_settings_select on public.crm_settings for select to authenticated using (public.is_member(tenant_id));
create policy crm_settings_admin on public.crm_settings for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- Cualificar es investigar: cualquiera del equipo interno puede hacerlo en una empresa libre o suya (o un/a gerente
-- en cualquiera), sin quedársela. Solo toca la cualificación.
create or replace function public.account_qualify(p_account uuid, p_qualification jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  select role into r from public.membership where tenant_id = a.tenant_id and user_id = me;
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_qualification) <> 'object' then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  update public.account set qualification = p_qualification where id = p_account;
end $$;
revoke all on function public.account_qualify(uuid, jsonb) from public;
grant execute on function public.account_qualify(uuid, jsonb) to authenticated;

-- Datos de Google Places (horario y ubicación para la ruta del día). Solo rellenan huecos; nunca pisan lo escrito a mano.
alter table public.account
  add column place_id     text check (length(place_id) <= 300),
  add column hours        text[] check (cardinality(hours) <= 14),
  add column lat          double precision,
  add column lng          double precision,
  add column place_status text check (length(place_status) <= 40),
  add column place_at     timestamptz;

-- Completar con Google: como cualificar, lo puede hacer quien investiga (empresa libre o suya, o un/a gerente).
-- Solo rellena huecos: lo escrito a mano no se pisa.
create or replace function public.account_research(p_account uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  select role into r from public.membership where tenant_id = a.tenant_id and user_id = me;
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  update public.account set
    phone        = coalesce(nullif(phone, ''), left(p_data->>'phone', 40)),
    website      = coalesce(nullif(website, ''), left(p_data->>'website', 300)),
    address      = coalesce(nullif(address, ''), left(p_data->>'address', 300)),
    maps_url     = coalesce(nullif(maps_url, ''), left(p_data->>'mapsUrl', 500)),
    place_id     = left(p_data->>'placeId', 300),
    hours        = case when jsonb_typeof(p_data->'hours') = 'array' then array(select left(x, 200) from jsonb_array_elements_text(p_data->'hours') x limit 14) else hours end,
    lat          = coalesce((p_data->>'lat')::double precision, lat),
    lng          = coalesce((p_data->>'lng')::double precision, lng),
    place_status = left(p_data->>'status', 40),
    place_at     = now()
  where id = p_account;
end $$;
revoke all on function public.account_research(uuid, jsonb) from public;
grant execute on function public.account_research(uuid, jsonb) to authenticated;
