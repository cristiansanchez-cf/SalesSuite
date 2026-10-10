-- Google bien hecho en la ficha de la empresa (docs/CRM_DINAMICO.md §15).
--  - Facebook de la empresa (como Instagram y LinkedIn).
--  - De Google: valoración, número de reseñas y la foto (su nombre en Places; la imagen se pide al verla).
--  - «Es este»: además de teléfono, web, dirección y Maps, rellena la ciudad si no tiene (una zona del espacio que el
--    servidor ha buscado por la dirección de Google) y lo que encuentre en su web (Instagram, Facebook, LinkedIn,
--    email). Como siempre, solo rellena huecos: nunca pisa lo escrito a mano.

alter table public.account
  add column facebook      text check (length(facebook) <= 300),
  add column place_rating  numeric(2, 1) check (place_rating between 0 and 5),
  add column place_reviews integer check (place_reviews >= 0),
  add column place_photo   text check (length(place_photo) <= 500);

create or replace function public.account_research(p_account uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text; z uuid;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  select role into r from public.membership where tenant_id = a.tenant_id and user_id = me;
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  -- La ciudad, solo si es una zona de este espacio.
  if coalesce(p_data->>'zoneId', '') ~ '^[0-9a-f-]{36}$' then
    select id into z from public.zone where id = (p_data->>'zoneId')::uuid and tenant_id = a.tenant_id;
  end if;
  update public.account set
    phone         = coalesce(nullif(phone, ''), left(p_data->>'phone', 40)),
    website       = coalesce(nullif(website, ''), left(p_data->>'website', 300)),
    address       = coalesce(nullif(address, ''), left(p_data->>'address', 300)),
    maps_url      = coalesce(nullif(maps_url, ''), left(p_data->>'mapsUrl', 500)),
    email         = coalesce(nullif(email, ''), lower(left(p_data->>'email', 200))),
    instagram     = coalesce(nullif(instagram, ''), left(p_data->>'instagram', 300)),
    facebook      = coalesce(nullif(facebook, ''), left(p_data->>'facebook', 300)),
    linkedin      = coalesce(nullif(linkedin, ''), left(p_data->>'linkedin', 300)),
    zone_id       = coalesce(zone_id, z),
    place_id      = left(p_data->>'placeId', 300),
    hours         = case when jsonb_typeof(p_data->'hours') = 'array' then array(select left(x, 200) from jsonb_array_elements_text(p_data->'hours') x limit 14) else hours end,
    lat           = coalesce((p_data->>'lat')::double precision, lat),
    lng           = coalesce((p_data->>'lng')::double precision, lng),
    place_status  = left(p_data->>'status', 40),
    place_rating  = case when jsonb_typeof(p_data->'rating') = 'number' and (p_data->>'rating')::numeric between 0 and 5 then round((p_data->>'rating')::numeric, 1) else place_rating end,
    place_reviews = case when jsonb_typeof(p_data->'reviews') = 'number' and (p_data->>'reviews')::numeric >= 0 then least((p_data->>'reviews')::numeric, 2000000000)::integer else place_reviews end,
    place_photo   = coalesce(left(p_data->>'photo', 500), place_photo),
    place_at      = now()
  where id = p_account;
end $$;
revoke all on function public.account_research(uuid, jsonb) from public;
grant execute on function public.account_research(uuid, jsonb) to authenticated;
