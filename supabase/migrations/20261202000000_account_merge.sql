-- Unir dos empresas duplicadas (docs/CRM_DINAMICO.md §41): una se queda (p_keep) y la otra (p_drop) se borra. Los datos
-- elegidos (nombre, contacto, campos, lo que sabemos, listas, cualificación) los escribe antes el servidor en la que se
-- queda; aquí se mueve lo demás, en una sola transacción:
--  · personas elegidas (p_contacts) y «trabaja con» elegidos (p_links: las otras empresas), sin repetir;
--  · todo el historial: interacciones, toques, propuestas, cobros e ingresos;
--  · sus locales (si era un grupo), su ficha de Google si se elige (p_place) y su próximo paso si la que se queda no tiene;
--  · si la que se borra estaba ganada y la otra no, la ganada pasa a la que se queda.
-- Quién: un gerente o admin; o un comercial si las dos son suyas.
create or replace function public.account_merge(p_keep uuid, p_drop uuid, p_contacts uuid[] default '{}', p_links uuid[] default '{}', p_place boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare k public.account; d public.account;
begin
  select * into k from public.account x where x.id = p_keep for update;
  select * into d from public.account x where x.id = p_drop for update;
  if k.id is null or d.id is null or k.tenant_id <> d.tenant_id or k.id = d.id then
    raise exception 'Empresas no válidas' using errcode = 'check_violation';
  end if;
  if not public.is_member(k.tenant_id) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not public.is_manager(k.tenant_id)
     and (k.owner_id is distinct from auth.uid() or d.owner_id is distinct from auth.uid()) then
    raise exception 'Solo quien las lleva o un/a gerente puede unirlas' using errcode = 'insufficient_privilege';
  end if;

  -- Personas: las elegidas pasan (con su papel); si ya estaban en la que se queda, no se repiten.
  insert into public.crm_contact_account (tenant_id, contact_id, account_id, role)
  select c.tenant_id, c.contact_id, p_keep, c.role from public.crm_contact_account c
   where c.account_id = p_drop and c.contact_id = any (p_contacts)
  on conflict (contact_id, account_id) do update set role = coalesce(public.crm_contact_account.role, excluded.role);

  -- «Trabaja con»: los elegidos pasan, salvo los que ya tiene o el enlace entre las dos.
  update public.account_link l set a_id = case when l.a_id = p_drop then p_keep else l.a_id end, b_id = case when l.b_id = p_drop then p_keep else l.b_id end
   where l.tenant_id = k.tenant_id and (l.a_id = p_drop or l.b_id = p_drop)
     and (case when l.a_id = p_drop then l.b_id else l.a_id end) = any (p_links)
     and (case when l.a_id = p_drop then l.b_id else l.a_id end) <> p_keep
     and not exists (select 1 from public.account_link y where y.tenant_id = l.tenant_id
       and least(y.a_id, y.b_id) = least(p_keep, case when l.a_id = p_drop then l.b_id else l.a_id end)
       and greatest(y.a_id, y.b_id) = greatest(p_keep, case when l.a_id = p_drop then l.b_id else l.a_id end));

  -- El historial entero.
  update public.crm_activity set account_id = p_keep where account_id = p_drop;
  update public.account_touch set account_id = p_keep where account_id = p_drop;
  update public.dossier set account_id = p_keep where account_id = p_drop;
  perform set_config('app.payment_rpc', '1', true);
  update public.payment_request set account_id = p_keep where account_id = p_drop;
  perform set_config('app.payment_rpc', '0', true);
  update public.revenue_event set account_id = p_keep where account_id = p_drop;
  -- El libro de comisiones no se edita (es historia): sus líneas siguen apuntando a la que había.

  perform set_config('app.account_rpc', '1', true);
  -- Sus locales (un solo nivel de grupo: si la que se queda está en un grupo, al mismo grupo).
  update public.account set parent_id = coalesce(nullif(k.parent_id, p_drop), p_keep) where parent_id = p_drop and id <> p_keep;
  update public.account set
    place_id = case when p_place then d.place_id else coalesce(k.place_id, d.place_id) end,
    hours = case when p_place then d.hours else coalesce(k.hours, d.hours) end,
    lat = case when p_place then d.lat else coalesce(k.lat, d.lat) end,
    lng = case when p_place then d.lng else coalesce(k.lng, d.lng) end,
    place_status = case when p_place then d.place_status else coalesce(k.place_status, d.place_status) end,
    place_at = case when p_place then d.place_at else coalesce(k.place_at, d.place_at) end,
    place_rating = case when p_place then d.place_rating else coalesce(k.place_rating, d.place_rating) end,
    place_reviews = case when p_place then d.place_reviews else coalesce(k.place_reviews, d.place_reviews) end,
    place_photo = case when p_place then d.place_photo else coalesce(k.place_photo, d.place_photo) end,
    place_filled = case when p_place then d.place_filled else coalesce(k.place_filled, d.place_filled) end,
    ai_research = coalesce(k.ai_research, d.ai_research), ai_research_at = coalesce(k.ai_research_at, d.ai_research_at),
    next_step = coalesce(k.next_step, d.next_step), next_step_at = coalesce(k.next_step_at, d.next_step_at),
    next_contact_id = case when k.next_step_at is null and k.next_step is null and d.next_contact_id = any (p_contacts) then d.next_contact_id else k.next_contact_id end,
    next_channel = coalesce(k.next_channel, d.next_channel),
    -- Quien la trabajaba: la que se queda manda; si estaba libre, la reserva de la otra.
    owner_id = coalesce(k.owner_id, d.owner_id), claimed_until = case when k.owner_id is null then d.claimed_until else k.claimed_until end,
    last_touch_at = greatest(k.last_touch_at, d.last_touch_at),
    status = case when k.won_at is null and d.won_at is not null then 'customer' else k.status end,
    won_at = coalesce(k.won_at, d.won_at), won_by = case when k.won_at is null then d.won_by else k.won_by end,
    won_dossier_id = case when k.won_at is null then d.won_dossier_id else k.won_dossier_id end
   where id = p_keep;
  delete from public.account where id = p_drop;
  perform set_config('app.account_rpc', '0', true);
end $$;
revoke all on function public.account_merge(uuid, uuid, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.account_merge(uuid, uuid, uuid[], uuid[], boolean) to authenticated;
