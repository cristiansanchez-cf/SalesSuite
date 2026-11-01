-- =============================================================================
-- El superadmin cuenta como admin también en las fichas del CRM (docs/ORG.md).
-- account_research («Es este» de Google), account_ai_research (Investigar), account_qualify y account_classify leían
-- el rol directamente de membership, así que el superadmin (que entra en cualquier espacio como admin sin ser miembro)
-- recibía «Sin permiso para esta operación». Ahora usan my_role(), como el resto de reglas. Nada más cambia.
-- =============================================================================

create or replace function public.account_research(p_account uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; b public.account; n public.account; me uuid := auth.uid(); r text; z uuid; f jsonb;
  redo boolean := coalesce(p_data->>'replace', '') = 'true'; filled jsonb;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  r := public.my_role(a.tenant_id);  -- el superadmin cuenta como admin (docs/ORG.md)
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  b := a;
  if redo then
    f := coalesce(a.place_filled, '{}');
    update public.account set
      phone     = case when phone = f->>'phone' then null else phone end,
      website   = case when website = f->>'website' then null else website end,
      address   = case when address = f->>'address' then null else address end,
      maps_url  = case when maps_url = f->>'maps_url' then null else maps_url end,
      email     = case when email = f->>'email' then null else email end,
      instagram = case when instagram = f->>'instagram' then null else instagram end,
      facebook  = case when facebook = f->>'facebook' then null else facebook end,
      linkedin  = case when linkedin = f->>'linkedin' then null else linkedin end,
      zone_id   = case when zone_id::text = f->>'zone_id' then null else zone_id end,
      place_id = null, hours = null, lat = null, lng = null, place_status = null, place_rating = null, place_reviews = null,
      place_photo = null, place_at = null, place_filled = null
    where id = p_account returning * into b;
  end if;
  -- Solo quitar.
  if coalesce(p_data->>'placeId', '') = '' and redo then return; end if;
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
  where id = p_account returning * into n;
  -- Qué ha puesto esta ficha (lo que estaba vacío y ahora no).
  filled := jsonb_strip_nulls(jsonb_build_object(
    'phone',     case when nullif(b.phone, '') is null then n.phone end,
    'website',   case when nullif(b.website, '') is null then n.website end,
    'address',   case when nullif(b.address, '') is null then n.address end,
    'maps_url',  case when nullif(b.maps_url, '') is null then n.maps_url end,
    'email',     case when nullif(b.email, '') is null then n.email end,
    'instagram', case when nullif(b.instagram, '') is null then n.instagram end,
    'facebook',  case when nullif(b.facebook, '') is null then n.facebook end,
    'linkedin',  case when nullif(b.linkedin, '') is null then n.linkedin end,
    'zone_id',   case when b.zone_id is null then n.zone_id::text end));
  update public.account set place_filled = coalesce(b.place_filled, '{}') || filled where id = p_account;
end $$;

create or replace function public.account_ai_research(p_account uuid, p_data jsonb, p_fill jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  r := public.my_role(a.tenant_id);  -- el superadmin cuenta como admin (docs/ORG.md)
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  if p_data is not null and (jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 100000) then
    raise exception 'Datos no válidos' using errcode = 'check_violation';
  end if;
  update public.account set ai_research = p_data, ai_research_at = case when p_data is null then null else now() end,
    phone     = coalesce(nullif(phone, ''), left(p_fill->>'phone', 40)),
    email     = coalesce(nullif(email, ''), lower(left(p_fill->>'email', 200))),
    instagram = coalesce(nullif(instagram, ''), left(p_fill->>'instagram', 300)),
    linkedin  = coalesce(nullif(linkedin, ''), left(p_fill->>'linkedin', 300)),
    website   = coalesce(nullif(website, ''), left(p_fill->>'website', 300))
  where id = p_account;
end $$;

create or replace function public.account_qualify(p_account uuid, p_qualification jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  r := public.my_role(a.tenant_id);  -- el superadmin cuenta como admin (docs/ORG.md)
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_qualification) <> 'object' then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  update public.account set qualification = p_qualification where id = p_account;
end $$;

create or replace function public.account_classify(p_account uuid, p_kind text, p_reason text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  r := public.my_role(a.tenant_id);  -- el superadmin cuenta como admin (docs/ORG.md)
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  if p_kind is not null and not public.crm_kind_ok(a.tenant_id, p_kind) then raise exception 'Tipo no válido' using errcode = 'check_violation'; end if;
  update public.account set
    kind = coalesce(p_kind, kind),
    discarded_at = case when p_reason is null then null when discarded_at is null then now() else discarded_at end,
    discard_reason = p_reason,
    discard_note = case when p_reason is null then null else left(nullif(btrim(p_note), ''), 500) end,
    discarded_by = case when p_reason is null then null else me end
  where id = p_account;
end $$;
