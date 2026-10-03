-- =============================================================================
-- Colaboradores (partners) — docs/PARTNERS.md
-- Un partner es un vendedor puntual e invitado: solo ve los módulos que el admin le permite,
-- solo trabaja las cuentas (locales, centros…) que el admin le asigna, nunca ve la tarifa
-- y no puede cambiar precios: el precio de cada cuenta lo decide el admin (oculto, tarifa o ajustado).
-- No ve dossiers, aportes ni datos de otros vendedores. Su acceso puede caducar.
--
-- Principio: is_member() pasa a significar "equipo interno" (admin/rep), así TODAS las políticas
-- existentes siguen cerrando la puerta al partner; lo que puede ver se abre aquí, política a política.
-- =============================================================================

create type public.price_policy  as enum ('hidden', 'list', 'adjusted');
create type public.play_audience as enum ('all', 'team', 'partners');

-- ---------------------------------------------------------------- tablas
create table public.partner_profile (
  tenant_id     uuid not null,
  user_id       uuid not null,
  module_ids    uuid[] not null default '{}',           -- módulos que puede ver y vender
  see_team_tips boolean not null default false,         -- ¿ve los trucos del equipo interno?
  welcome_note  text check (length(welcome_note) <= 4000),  -- guía solo para él (markdown)
  expires_at    timestamptz,                            -- null = sin caducidad
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade
);

create table public.partner_account (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  user_id          uuid not null,
  name             text not null check (length(name) between 1 and 120),   -- "Sala X", "Centro de buceo Azul"
  segment_id       uuid,
  price_policy     public.price_policy not null default 'hidden',
  price_adjust_pct numeric(5,2) not null default 0 check (price_adjust_pct between -90 and 200),
  notes            text check (length(notes) <= 2000),  -- indicaciones del admin para esta cuenta (solo las ve él)
  position         numeric not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, user_id) references public.partner_profile (tenant_id, user_id) on delete cascade,
  foreign key (tenant_id, segment_id) references public.segment (tenant_id, id) on delete set null (segment_id)
);
create index partner_account_user_idx on public.partner_account (tenant_id, user_id);

alter table public.dossier
  add column partner_account_id uuid,
  add foreign key (tenant_id, partner_account_id) references public.partner_account (tenant_id, id) on delete set null (partner_account_id);
create index dossier_partner_account_idx on public.dossier (partner_account_id) where partner_account_id is not null;

-- Jugadas: para todos, solo equipo interno, o solo colaboradores.
alter table public.play add column audience public.play_audience not null default 'all';

create trigger partner_profile_touch before update on public.partner_profile for each row execute function public.touch_updated_at();
create trigger partner_account_touch before update on public.partner_account for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- helpers
create or replace function public.my_role(p_tenant uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid();
$$;

-- Equipo interno. Las políticas existentes usan is_member: al excluir al partner quedan cerradas para él.
create or replace function public.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membership m
                 where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role in ('admin', 'rep'));
$$;

-- Partner con perfil y acceso vigente.
create or replace function public.is_partner(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    join public.partner_profile p on p.tenant_id = m.tenant_id and p.user_id = m.user_id
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role = 'partner'
      and (p.expires_at is null or p.expires_at > now()));
$$;

create or replace function public.partner_module_ok(p_tenant uuid, p_module uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partner_profile p
                 where p.tenant_id = p_tenant and p.user_id = auth.uid() and p_module = any (p.module_ids));
$$;

create or replace function public.partner_segment_ok(p_tenant uuid, p_segment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partner_account a
                 where a.tenant_id = p_tenant and a.user_id = auth.uid() and a.segment_id = p_segment);
$$;

create or replace function public.partner_sees_tips(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.see_team_tips from public.partner_profile p
                   where p.tenant_id = p_tenant and p.user_id = auth.uid()), false);
$$;

-- Admin: todos; rep: los suyos; partner: los suyos mientras su acceso esté vigente.
create or replace function public.can_edit_dossier(p_dossier uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dossier d
    join public.membership m on m.tenant_id = d.tenant_id and m.user_id = auth.uid()
    where d.id = p_dossier
      and (m.role = 'admin' or (d.author_id = auth.uid() and (m.role = 'rep' or public.is_partner(d.tenant_id))))
  );
$$;

-- Precio que ve el cliente según la política de la cuenta.
create or replace function public.partner_price(p_policy public.price_policy, p_pct numeric, p_default numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_policy = 'list' then p_default
    when p_policy = 'adjusted' and p_default is not null then round(p_default * (1 + coalesce(p_pct, 0) / 100), 2)
    else null end;
$$;

-- ---------------------------------------------------------------- guardias de precio y módulos
-- El partner no elige precios: al crear el dossier se fijan por la política de la cuenta y no los puede cambiar.
create or replace function public.partner_dossier_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare acc public.partner_account;
begin
  if public.my_role(new.tenant_id) is distinct from 'partner' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.partner_account_id is distinct from old.partner_account_id or new.author_id is distinct from old.author_id then
      raise exception 'Un colaborador no puede cambiar la cuenta ni el autor del dossier' using errcode = 'insufficient_privilege';
    end if;
    new.price_mode := old.price_mode;
    new.total_price := old.total_price;
    new.currency := old.currency;
    return new;
  end if;
  select * into acc from public.partner_account a
  where a.id = new.partner_account_id and a.tenant_id = new.tenant_id and a.user_id = auth.uid();
  if acc.id is null then
    raise exception 'El dossier de un colaborador debe ser de una de sus cuentas' using errcode = 'insufficient_privilege';
  end if;
  new.price_mode := case when acc.price_policy = 'hidden' then 'none' else 'per_module' end::public.price_mode;
  new.total_price := null;
  return new;
end $$;

create trigger zz_partner_dossier_guard before insert or update on public.dossier
  for each row execute function public.partner_dossier_guard();

-- Items: solo módulos permitidos y publicados; el precio lo pone la política (nunca el partner).
-- (prefijo zz: se ejecuta después de dossier_item_tenant, que deriva tenant_id)
create or replace function public.partner_item_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d   public.dossier;
  acc public.partner_account;
  v   public.module_version;
begin
  select * into d from public.dossier x where x.id = new.dossier_id;
  if d.id is null or public.my_role(d.tenant_id) is distinct from 'partner' then return new; end if;
  if tg_op = 'UPDATE' and new.module_version_id = old.module_version_id then
    new.price_override := old.price_override;
    return new;
  end if;
  select * into v from public.module_version x where x.id = new.module_version_id;
  if v.status is distinct from 'published' or not public.partner_module_ok(d.tenant_id, v.module_id) then
    raise exception 'Ese módulo no está disponible para este colaborador' using errcode = 'insufficient_privilege';
  end if;
  select * into acc from public.partner_account a where a.id = d.partner_account_id;
  new.price_override := public.partner_price(acc.price_policy, acc.price_adjust_pct, v.default_price);
  return new;
end $$;

create trigger zz_partner_item_guard before insert or update on public.dossier_item
  for each row execute function public.partner_item_guard();

-- Si el admin cambia la política de una cuenta, se aplica a sus dossiers (también a los publicados).
create or replace function public.partner_account_reprice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.dossier d
     set price_mode = case when new.price_policy = 'hidden' then 'none' else 'per_module' end::public.price_mode,
         total_price = null
   where d.partner_account_id = new.id;
  update public.dossier_item i
     set price_override = public.partner_price(new.price_policy, new.price_adjust_pct, v.default_price)
    from public.dossier d, public.module_version v
   where d.id = i.dossier_id and d.partner_account_id = new.id and v.id = i.module_version_id;
  return null;
end $$;

create trigger partner_account_reprice after update of price_policy, price_adjust_pct on public.partner_account
  for each row when (old.price_policy is distinct from new.price_policy or old.price_adjust_pct is distinct from new.price_adjust_pct)
  execute function public.partner_account_reprice();

-- Un perfil de partner solo para memberships con rol partner.
create or replace function public.partner_profile_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membership m
                 where m.tenant_id = new.tenant_id and m.user_id = new.user_id and m.role = 'partner') then
    raise exception 'El perfil de colaborador requiere rol partner' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger partner_profile_check before insert or update of tenant_id, user_id on public.partner_profile
  for each row execute function public.partner_profile_check();

revoke all on function public.partner_dossier_guard() from public, anon, authenticated;
revoke all on function public.partner_item_guard() from public, anon, authenticated;
revoke all on function public.partner_account_reprice() from public, anon, authenticated;
revoke all on function public.partner_profile_check() from public, anon, authenticated;

-- ---------------------------------------------------------------- catálogo sin precios (RPC)
-- El partner NO lee module_version (tiene la tarifa). Estas dos funciones le dan lo necesario
-- para construir y previsualizar, sin default_price.
create or replace function public.partner_catalog(p_tenant uuid)
returns table (module_id uuid, module_key text, module_name text, description text, block_type text,
               version_id uuid, version int, default_props jsonb, currency text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.key, m.name, m.description, m.block_type, v.id, v.version, v.default_props, v.default_currency::text
  from public.module m
  join public.module_version v on v.module_id = m.id
  where m.tenant_id = p_tenant and m.is_catalog and v.status = 'published'
    and public.is_partner(p_tenant) and public.partner_module_ok(p_tenant, m.id);
$$;

-- Items de SUS dossiers: price_override es el precio que ve el cliente (lo fijó la política).
create or replace function public.partner_items(p_dossier_ids uuid[])
returns table (id uuid, dossier_id uuid, "position" numeric, visible boolean, price_override numeric, prop_overrides jsonb,
               module_version_id uuid, version int, default_props jsonb, currency text,
               module_id uuid, module_key text, module_name text, block_type text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.dossier_id, i.position, i.visible, i.price_override, i.prop_overrides,
         v.id, v.version, v.default_props, v.default_currency::text, m.id, m.key, m.name, m.block_type
  from public.dossier_item i
  join public.dossier d on d.id = i.dossier_id
  join public.module_version v on v.id = i.module_version_id
  join public.module m on m.id = v.module_id
  where i.dossier_id = any (p_dossier_ids) and d.author_id = auth.uid() and public.is_partner(d.tenant_id);
$$;

revoke all on function public.partner_catalog(uuid) from public, anon;
revoke all on function public.partner_items(uuid[]) from public, anon;
grant execute on function public.partner_catalog(uuid) to authenticated;
grant execute on function public.partner_items(uuid[]) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.partner_profile enable row level security;
alter table public.partner_account enable row level security;

create policy partner_profile_admin on public.partner_profile for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
-- El propio partner lee su perfil (también caducado: para explicarle por qué no entra).
create policy partner_profile_self on public.partner_profile for select to authenticated using (user_id = auth.uid());

create policy partner_account_admin on public.partner_account for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy partner_account_self on public.partner_account for select to authenticated
  using (user_id = auth.uid() and public.is_partner(tenant_id));

-- tenant / membership / users
drop policy tenant_select on public.tenant;
create policy tenant_select on public.tenant for select to authenticated
  using (public.is_member(id) or public.is_partner(id));

drop policy membership_select on public.membership;
create policy membership_select on public.membership for select to authenticated
  using (public.is_member(tenant_id) or user_id = auth.uid());

-- El partner solo se ve a sí mismo; el equipo interno ve a sus compañeros (también a los partners).
drop policy users_select on public.users;
create policy users_select on public.users for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.membership mine join public.membership theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and mine.role in ('admin', 'rep') and theirs.user_id = users.id)
);

-- catálogo: el módulo (sin precio) de lo permitido; module_version nunca (ver RPC).
create policy module_partner_select on public.module for select to authenticated
  using (public.is_partner(tenant_id) and public.partner_module_ok(tenant_id, id));

-- dossiers: solo los suyos
create policy dossier_partner_select on public.dossier for select to authenticated
  using (public.is_partner(tenant_id) and author_id = auth.uid());
create policy dossier_partner_insert on public.dossier for insert to authenticated
  with check (public.is_partner(tenant_id) and author_id = auth.uid() and partner_account_id is not null);
create policy dossier_partner_update on public.dossier for update to authenticated
  using (public.is_partner(tenant_id) and author_id = auth.uid())
  with check (public.is_partner(tenant_id) and author_id = auth.uid());
create policy dossier_partner_delete on public.dossier for delete to authenticated
  using (public.is_partner(tenant_id) and author_id = auth.uid() and status <> 'published');

create policy dossier_item_partner_select on public.dossier_item for select to authenticated
  using (public.is_partner(tenant_id) and public.can_edit_dossier(dossier_id));
create policy share_link_partner_select on public.share_link for select to authenticated
  using (public.is_partner(tenant_id) and public.can_edit_dossier(dossier_id));
create policy dossier_contact_partner_select on public.dossier_contact for select to authenticated
  using (public.is_partner(tenant_id) and public.can_edit_dossier(dossier_id));

-- playbook: oficial, no reservado al equipo, sin monetización, de sus módulos o general.
create policy play_partner_select on public.play for select to authenticated
  using (public.is_partner(tenant_id) and status = 'official' and audience <> 'team' and kind <> 'monetization'
         and (module_id is null or public.partner_module_ok(tenant_id, module_id)));
create policy play_revision_partner_select on public.play_revision for select to authenticated
  using (public.is_partner(tenant_id) and exists (select 1 from public.play p where p.id = play_id));
-- Trucos del equipo: solo si el admin se lo permite. No aporta (contribution_insert exige is_member).
create policy contribution_partner_select on public.play_contribution for select to authenticated
  using (public.is_partner(tenant_id) and public.partner_sees_tips(tenant_id) and type = 'tip'
         and status in ('shared', 'accepted') and kind <> 'monetization'
         and (module_id is null or public.partner_module_ok(tenant_id, module_id)));
-- Votos: solo los suyos (no ve los del equipo ni sus notas).
create policy feedback_partner on public.play_feedback for all to authenticated
  using (user_id = auth.uid() and public.is_partner(tenant_id))
  with check (user_id = auth.uid() and public.is_partner(tenant_id));
create policy progress_partner on public.learning_progress for all to authenticated
  using (user_id = auth.uid() and public.is_partner(tenant_id))
  with check (user_id = auth.uid() and public.is_partner(tenant_id));
create policy seen_partner on public.playbook_seen for all to authenticated
  using (user_id = auth.uid() and public.is_partner(tenant_id))
  with check (user_id = auth.uid() and public.is_partner(tenant_id));

-- mercado: solo los sectores de sus cuentas, y el encaje de sus módulos.
create policy segment_partner_select on public.segment for select to authenticated
  using (public.is_partner(tenant_id) and status = 'official' and public.partner_segment_ok(tenant_id, id));
create policy persona_partner_select on public.persona for select to authenticated
  using (public.is_partner(tenant_id) and public.partner_segment_ok(tenant_id, segment_id));
create policy segment_module_partner_select on public.segment_module for select to authenticated
  using (public.is_partner(tenant_id) and public.partner_segment_ok(tenant_id, segment_id) and public.partner_module_ok(tenant_id, module_id));
create policy persona_module_partner_select on public.persona_module for select to authenticated
  using (public.is_partner(tenant_id) and public.partner_module_ok(tenant_id, module_id)
         and exists (select 1 from public.persona p where p.id = persona_id));
