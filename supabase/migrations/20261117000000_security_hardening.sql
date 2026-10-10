-- Checkpoint de seguridad (docs/SECURITY_REVIEW.md, 11-oct-2026).

-- 1. El contacto de cada comercial en sus propuestas va POR ESPACIO (en su membresía), no en su perfil global.
--    Antes, el admin de otro espacio podía invitar a un comercial y cambiarle el WhatsApp que ven los clientes de
--    este espacio. Cada uno pone el suyo (set_my_contact) y un admin el de su equipo, solo en su espacio.
alter table public.membership
  add column contact_channel text check (contact_channel is null or contact_channel in ('whatsapp', 'kakao', 'line', 'telegram', 'instagram', 'phone', 'email')),
  add column contact_value text check (contact_value is null or length(contact_value) <= 200);
-- Lo que ya había: a cada espacio de esa persona (era lo que se veía hasta hoy).
update public.membership m set contact_channel = u.contact_channel, contact_value = u.contact_value
  from public.users u where u.id = m.user_id and u.contact_channel is not null;

create or replace function public.set_my_contact(p_tenant uuid, p_channel text, p_value text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid()) then
    raise exception 'No es del equipo' using errcode = '42501';
  end if;
  update public.membership
     set contact_channel = nullif(p_channel, ''),
         contact_value = case when nullif(p_channel, '') is null then null else nullif(btrim(left(p_value, 200)), '') end
   where tenant_id = p_tenant and user_id = auth.uid();
end $$;
revoke all on function public.set_my_contact(uuid, text, text) from public;
grant execute on function public.set_my_contact(uuid, text, text) to authenticated;

create or replace function public.set_member_contact(p_tenant uuid, p_user uuid, p_channel text, p_value text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_tenant) then raise exception 'Solo un admin del espacio' using errcode = '42501'; end if;
  if not exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = p_user) then
    raise exception 'No es del equipo' using errcode = '42501';
  end if;
  update public.membership
     set contact_channel = nullif(p_channel, ''),
         contact_value = case when nullif(p_channel, '') is null then null else nullif(btrim(left(p_value, 200)), '') end
   where tenant_id = p_tenant and user_id = p_user;
end $$;

create or replace function public.get_public_contact(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', coalesce(u.display_name, ''), 'channel', m.contact_channel, 'value', m.contact_value)
  from public.share_link l
  join public.dossier d on d.id = l.dossier_id
  join public.tenant t on t.id = d.tenant_id
  join public.users u on u.id = d.author_id
  join public.membership m on m.user_id = d.author_id and m.tenant_id = d.tenant_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and d.status = 'published'
    and d.tenant_id = p_tenant_id
    and t.status = 'active'
    and m.contact_channel is not null
    and nullif(btrim(m.contact_value), '') is not null;
$$;

-- 2. Enlaces: solo web (http/https). Evita «javascript:…» guardado directamente por la API y pintado como enlace.
--    NOT VALID: vale para todo lo nuevo sin bloquear por datos antiguos (la pantalla además filtra con safeHref).
alter table public.account
  add constraint account_website_http check (website is null or website ~* '^https?://') not valid,
  add constraint account_maps_http check (maps_url is null or maps_url ~* '^https?://') not valid,
  add constraint account_instagram_http check (instagram is null or instagram ~* '^https?://') not valid,
  add constraint account_facebook_http check (facebook is null or facebook ~* '^https?://') not valid,
  add constraint account_linkedin_http check (linkedin is null or linkedin ~* '^https?://') not valid;
alter table public.crm_contact
  add constraint crm_contact_instagram_http check (instagram is null or instagram ~* '^https?://') not valid,
  add constraint crm_contact_linkedin_http check (linkedin is null or linkedin ~* '^https?://') not valid;

-- 3. Arreglos de datos en bloque: solo admin (como en la app: Configurar → Datos del CRM).
drop policy if exists crm_fix_manager on public.crm_fix;
drop policy if exists crm_fix_admin on public.crm_fix;
create policy crm_fix_admin on public.crm_fix for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create or replace function public.crm_move_accounts(p_tenant uuid, p_moves jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin(p_tenant) then raise exception 'Solo un admin importa y ordena los datos del CRM' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) > 5000 then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  if exists (select 1 from jsonb_to_recordset(p_moves) as m(id uuid, zone uuid, notes text, tags text[])
             where m.zone is not null and not exists (select 1 from public.zone z where z.id = m.zone and z.tenant_id = p_tenant)) then
    raise exception 'Zona no encontrada' using errcode = 'check_violation';
  end if;
  update public.account a set zone_id = m.zone, notes = left(m.notes, 2000), tags = coalesce(m.tags, a.tags)
    from jsonb_to_recordset(p_moves) as m(id uuid, zone uuid, notes text, tags text[])
    where a.id = m.id and a.tenant_id = p_tenant;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.crm_classify_accounts(p_tenant uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; me uuid := auth.uid();
begin
  if not public.is_admin(p_tenant) then raise exception 'Solo un admin importa y ordena los datos del CRM' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  update public.account a set
    kind = coalesce(m.kind, a.kind),
    discarded_at = case when m.reason is null then null when a.discarded_at is null then now() else a.discarded_at end,
    discard_reason = m.reason,
    discard_note = case when m.reason is null then null else left(nullif(btrim(m.note), ''), 500) end,
    discarded_by = case when m.reason is null then null else me end
    from jsonb_to_recordset(p_rows) as m(id uuid, kind text, reason text, note text)
    where a.id = m.id and a.tenant_id = p_tenant;
  get diagnostics n = row_count;
  return n;
end $$;

-- 4. Topes de uso por persona y día (Google y la IA cuestan dinero): bump_usage suma 1 y dice si aún cabe.
create table if not exists public.usage_counter (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  user_id   uuid not null,
  kind      text not null check (kind in ('google', 'ai')),
  day       date not null default current_date,
  n         int not null default 0,
  primary key (tenant_id, user_id, kind, day)
);
alter table public.usage_counter enable row level security;
create policy usage_counter_select on public.usage_counter for select to authenticated using (public.is_admin(tenant_id) or user_id = auth.uid());

create or replace function public.bump_usage(p_tenant uuid, p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if not public.is_member(p_tenant) then raise exception 'No es del equipo' using errcode = '42501'; end if;
  insert into public.usage_counter (tenant_id, user_id, kind, day, n) values (p_tenant, auth.uid(), p_kind, current_date, 1)
  on conflict (tenant_id, user_id, kind, day) do update set n = public.usage_counter.n + 1
  returning n into v;
  return v <= greatest(p_limit, 1);
end $$;
revoke all on function public.bump_usage(uuid, text, int) from public;
grant execute on function public.bump_usage(uuid, text, int) to authenticated;
