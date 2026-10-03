-- Zonas y cuentas (docs/ACCOUNTS.md): territorio de cada vendedor, cuentas (locales, centros…) con
-- quién las trabaja, reglas para no «bombardear» un local y elegibilidad de cada venta para comisión.
create type public.account_status as enum ('open', 'customer', 'blocked');
create type public.account_eligibility as enum ('eligible', 'claimed_by_other', 'blocked', 'out_of_zone', 'no_account');
create type public.account_decision as enum ('approved', 'rejected');

alter table public.users add column phone text check (phone is null or length(phone) <= 40);

-- ---------------------------------------------------------------- zonas
create table public.zone (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  parent_id  uuid,
  name       text not null check (length(name) between 1 and 80),
  kind       text not null default 'city' check (kind in ('country', 'region', 'province', 'city', 'area')),
  position   int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, parent_id) references public.zone (tenant_id, id) on delete cascade
);
create unique index zone_name_uidx on public.zone (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.membership_zone (
  tenant_id uuid not null,
  user_id   uuid not null,
  zone_id   uuid not null,
  primary key (tenant_id, user_id, zone_id),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade,
  foreign key (tenant_id, zone_id) references public.zone (tenant_id, id) on delete cascade
);

-- La zona `p_zone` contiene a `p_target` (es ella o un antepasado suyo).
create or replace function public.zone_covers(p_zone uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select z.id, z.parent_id from public.zone z where z.id = p_target
    union all
    select z.id, z.parent_id from public.zone z join up on z.id = up.parent_id
  )
  select exists (select 1 from up where up.id = p_zone);
$$;

-- ---------------------------------------------------------------- reglas
create table public.account_rules (
  tenant_id        uuid primary key references public.tenant(id) on delete cascade,
  -- Días que una cuenta queda reservada para quien la trabaja (cada contacto los renueva).
  claim_days       int not null default 30 check (claim_days between 1 and 365),
  -- Vender fuera de tus zonas no genera comisión.
  strict_zones     boolean not null default false,
  -- Una venta sin cuenta del CRM no genera comisión.
  require_account  boolean not null default false,
  updated_at       timestamptz not null default now()
);

create or replace function public.claim_days(p_tenant uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.claim_days from public.account_rules r where r.tenant_id = p_tenant), 30);
$$;

-- ---------------------------------------------------------------- cuentas
create table public.account (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant(id) on delete cascade,
  name            text not null check (length(name) between 1 and 160),
  zone_id         uuid,
  segment_id      uuid,
  address         text check (length(address) <= 300),
  external_ref    text check (length(external_ref) <= 120),
  notes           text check (length(notes) <= 2000),
  status          public.account_status not null default 'open',
  blocked_reason  text check (length(blocked_reason) <= 300),
  owner_id        uuid references public.users(id) on delete set null,
  claimed_until   timestamptz,
  last_touch_at   timestamptz,
  last_touch_by   uuid references public.users(id) on delete set null,
  won_at          timestamptz,
  won_by          uuid references public.users(id) on delete set null,
  won_dossier_id  uuid,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, zone_id) references public.zone (tenant_id, id) on delete set null (zone_id),
  foreign key (tenant_id, segment_id) references public.segment (tenant_id, id) on delete set null (segment_id)
);
create unique index account_ext_uidx on public.account (tenant_id, external_ref) where external_ref is not null;
create index account_zone_idx on public.account (tenant_id, zone_id);
create index account_owner_idx on public.account (tenant_id, owner_id);
create trigger account_touch_updated before update on public.account for each row execute function public.touch_updated_at();

create table public.account_touch (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  account_id uuid not null,
  user_id    uuid references public.users(id) on delete set null,
  kind       text not null check (kind in ('created', 'contact', 'dossier', 'won', 'lost', 'claim', 'release', 'block', 'unblock', 'assign')),
  note       text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade
);
create index account_touch_idx on public.account_touch (account_id, created_at desc);

alter table public.dossier
  add column account_id uuid,
  add column account_eligibility public.account_eligibility,
  add column account_decision public.account_decision,
  add column account_decided_by uuid references public.users(id) on delete set null,
  add column account_decided_at timestamptz,
  add foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete set null (account_id);
create index dossier_account_idx on public.dossier (account_id) where account_id is not null;

-- ---------------------------------------------------------------- elegibilidad (misma regla que src/lib/accounts/rules.ts)
create or replace function public.account_eligibility_for(p_tenant uuid, p_account uuid, p_user uuid, p_at timestamptz default now())
returns public.account_eligibility language plpgsql stable security definer set search_path = '' as $$
declare
  a public.account;
  r public.account_rules;
begin
  select * into r from public.account_rules x where x.tenant_id = p_tenant;
  if p_account is null then
    return case when coalesce(r.require_account, false) then 'no_account' else 'eligible' end::public.account_eligibility;
  end if;
  select * into a from public.account x where x.id = p_account and x.tenant_id = p_tenant;
  if a.id is null then return 'no_account'; end if;
  if a.status = 'blocked' then return 'blocked'; end if;
  if a.status = 'customer' and a.won_by is distinct from p_user then return 'claimed_by_other'; end if;
  if a.owner_id is not null and a.owner_id is distinct from p_user and a.claimed_until > p_at then return 'claimed_by_other'; end if;
  if coalesce(r.strict_zones, false) and a.zone_id is not null
     and exists (select 1 from public.membership_zone mz where mz.tenant_id = p_tenant and mz.user_id = p_user)
     and not exists (select 1 from public.membership_zone mz where mz.tenant_id = p_tenant and mz.user_id = p_user and public.zone_covers(mz.zone_id, a.zone_id)) then
    return 'out_of_zone';
  end if;
  return 'eligible';
end $$;

-- Para la app: «¿si vendo esta cuenta, cuenta para mí?» (solo el equipo, sobre su tenant).
create or replace function public.account_eligibility_preview(p_account uuid)
returns public.account_eligibility language plpgsql stable security definer set search_path = '' as $$
declare t uuid;
begin
  select a.tenant_id into t from public.account a where a.id = p_account;
  if t is null or not public.is_member(t) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  return public.account_eligibility_for(t, p_account, auth.uid());
end $$;

-- ---------------------------------------------------------------- escrituras con reglas
-- Los campos de estado y reserva solo los cambian las funciones de abajo o un/a admin o jefe/a.
create or replace function public.account_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.account_rpc', true), '') = '1' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.won_at := null; new.won_by := null; new.won_dossier_id := null;
    if public.is_manager(new.tenant_id) then
      -- Alta o importación de un manager: la cuenta nace libre salvo que la asigne a alguien.
      if new.owner_id is not null then new.claimed_until := coalesce(new.claimed_until, now() + make_interval(days => public.claim_days(new.tenant_id))); end if;
    else
      -- Un comercial que da de alta una cuenta la está trabajando: queda reservada para él.
      new.status := 'open'; new.blocked_reason := null;
      new.owner_id := auth.uid();
      new.claimed_until := now() + make_interval(days => public.claim_days(new.tenant_id));
      new.last_touch_at := now(); new.last_touch_by := auth.uid();
    end if;
    return new;
  end if;
  if public.is_manager(new.tenant_id) then return new; end if;
  if (new.status, new.blocked_reason, new.owner_id, new.claimed_until, new.last_touch_at, new.last_touch_by, new.won_at, new.won_by, new.won_dossier_id, new.created_by)
     is distinct from (old.status, old.blocked_reason, old.owner_id, old.claimed_until, old.last_touch_at, old.last_touch_by, old.won_at, old.won_by, old.won_dossier_id, old.created_by) then
    raise exception 'Solo se puede cambiar la reserva de una cuenta desde sus acciones' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger account_guard before insert or update on public.account for each row execute function public.account_guard();

-- Historial de lo que cambia un/a admin o jefe/a (bloquear, asignar, liberar).
create or replace function public.account_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.account_touch (tenant_id, account_id, user_id, kind) values (new.tenant_id, new.id, auth.uid(), 'created');
    return null;
  end if;
  if coalesce(current_setting('app.account_rpc', true), '') = '1' then return null; end if;
  if new.status = 'blocked' and old.status <> 'blocked' then
    insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (new.tenant_id, new.id, auth.uid(), 'block', new.blocked_reason);
  elsif old.status = 'blocked' and new.status <> 'blocked' then
    insert into public.account_touch (tenant_id, account_id, user_id, kind) values (new.tenant_id, new.id, auth.uid(), 'unblock');
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into public.account_touch (tenant_id, account_id, user_id, kind, note)
    values (new.tenant_id, new.id, auth.uid(), case when new.owner_id is null then 'release' else 'assign' end, public.user_label(new.owner_id));
  end if;
  return null;
end $$;
create trigger account_audit after insert or update on public.account for each row execute function public.account_audit();

-- Registrar un contacto (o quedarse / soltar una cuenta). Aplica la reserva y devuelve la elegibilidad.
create or replace function public.account_touch(p_account uuid, p_kind text, p_note text default null)
returns public.account_eligibility language plpgsql security definer set search_path = '' as $$
declare
  a public.account;
  me uuid := auth.uid();
  elig public.account_eligibility;
begin
  select * into a from public.account x where x.id = p_account for update;
  if a.id is null or not public.is_member(a.tenant_id) then
    raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('contact', 'claim', 'release') then raise exception 'Acción no válida' using errcode = 'check_violation'; end if;
  perform set_config('app.account_rpc', '1', true);
  if p_kind = 'release' then
    if a.owner_id is distinct from me then raise exception 'Solo quien la trabaja puede soltarla' using errcode = 'insufficient_privilege'; end if;
    update public.account set owner_id = null, claimed_until = null where id = a.id;
    insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (a.tenant_id, a.id, me, 'release', p_note);
    perform set_config('app.account_rpc', '0', true);
    return 'eligible';
  end if;
  elig := public.account_eligibility_for(a.tenant_id, a.id, me);
  insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (a.tenant_id, a.id, me, p_kind, p_note);
  if elig = 'eligible' then
    update public.account
       set owner_id = me,
           claimed_until = case when a.status = 'customer' then null else now() + make_interval(days => public.claim_days(a.tenant_id)) end,
           last_touch_at = now(), last_touch_by = me
     where id = a.id;
  end if;
  perform set_config('app.account_rpc', '0', true);
  return elig;
end $$;

-- ---------------------------------------------------------------- dossier ↔ cuenta
-- Vincular una propuesta a una cuenta cuenta como contacto; ganarla decide si genera comisión.
create or replace function public.dossier_account_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seller uuid := coalesce(new.author_id, auth.uid());
  a public.account;
  elig public.account_eligibility;
begin
  -- La decisión del manager solo la toma un manager.
  if tg_op = 'UPDATE' and (new.account_decision, new.account_decided_by, new.account_decided_at) is distinct from (old.account_decision, old.account_decided_by, old.account_decided_at) then
    if auth.uid() is not null and not public.is_manager(new.tenant_id) then
      raise exception 'Solo un/a admin o jefe/a decide sobre la comisión' using errcode = 'insufficient_privilege';
    end if;
    new.account_decided_by := auth.uid(); new.account_decided_at := now();
    update public.notification set resolved_at = now()
     where tenant_id = new.tenant_id and kind = 'account_conflict' and entity_key = new.id::text and resolved_at is null;
  end if;
  if tg_op = 'UPDATE' and new.account_eligibility is distinct from old.account_eligibility and coalesce(current_setting('app.account_rpc', true), '') <> '1' then
    new.account_eligibility := old.account_eligibility;  -- la calcula la base de datos, nunca el cliente
  end if;
  if tg_op = 'INSERT' then new.account_eligibility := null; new.account_decision := null; new.account_decided_by := null; new.account_decided_at := null; end if;
  -- Los colaboradores venden en sus cuentas asignadas, no en el CRM del equipo.
  if public.my_role(new.tenant_id) = 'partner' then new.account_id := case when tg_op = 'UPDATE' then old.account_id else null end; end if;

  -- Vinculada a una cuenta (nueva o distinta) → contacto.
  if new.account_id is not null and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id) then
    select * into a from public.account x where x.id = new.account_id;
    elig := public.account_eligibility_for(new.tenant_id, new.account_id, seller);
    perform set_config('app.account_rpc', '1', true);
    insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (new.tenant_id, new.account_id, seller, 'dossier', new.title);
    if elig = 'eligible' and a.status <> 'customer' then
      update public.account set owner_id = seller, claimed_until = now() + make_interval(days => public.claim_days(new.tenant_id)),
             last_touch_at = now(), last_touch_by = seller where id = new.account_id;
    end if;
    perform set_config('app.account_rpc', '0', true);
  end if;

  -- Resultado.
  if tg_op = 'UPDATE' and new.outcome is distinct from old.outcome then
    perform set_config('app.account_rpc', '1', true);
    if new.outcome = 'won' then
      -- Las cuentas de un colaborador las asigna el admin: su venta siempre cuenta.
      elig := case when new.partner_account_id is not null and new.account_id is null then 'eligible'::public.account_eligibility
                   else public.account_eligibility_for(new.tenant_id, new.account_id, seller) end;
      new.account_eligibility := elig;
      if new.account_id is not null then
        insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (new.tenant_id, new.account_id, seller, 'won', new.title);
        if elig = 'eligible' then
          update public.account set status = 'customer', won_at = now(), won_by = seller, won_dossier_id = new.id,
                 owner_id = seller, claimed_until = null, last_touch_at = now(), last_touch_by = seller where id = new.account_id;
        end if;
      end if;
      if elig <> 'eligible' then
        select * into a from public.account x where x.id = new.account_id;
        perform public.notify_roles(new.tenant_id, array['admin', 'lead']::public.member_role[], 'account_conflict', 'action', new.id::text,
          jsonb_build_object('dossier', new.title, 'account', a.name, 'seller', public.user_label(seller), 'reason', elig,
                             'holder', public.user_label(coalesce(a.won_by, a.owner_id)), 'blockedReason', a.blocked_reason), null);
      end if;
    else
      new.account_eligibility := null; new.account_decision := null; new.account_decided_by := null; new.account_decided_at := null;
      update public.notification set resolved_at = now()
       where tenant_id = new.tenant_id and kind = 'account_conflict' and entity_key = new.id::text and resolved_at is null;
      if old.outcome = 'won' and new.account_id is not null then
        -- Deshacer una venta: la cuenta vuelve a estar en trabajo de quien la tenía.
        update public.account set status = 'open', won_at = null, won_by = null, won_dossier_id = null,
               claimed_until = now() + make_interval(days => public.claim_days(new.tenant_id))
         where id = new.account_id and won_dossier_id = new.id;
      end if;
      if new.outcome = 'lost' and new.account_id is not null then
        insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (new.tenant_id, new.account_id, seller, 'lost', new.title);
      end if;
    end if;
    perform set_config('app.account_rpc', '0', true);
  end if;
  return new;
end $$;
create trigger dossier_account_sync before insert or update of account_id, outcome, account_eligibility, account_decision, account_decided_by, account_decided_at
  on public.dossier for each row execute function public.dossier_account_sync();

-- ---------------------------------------------------------------- RLS
alter table public.zone enable row level security;
alter table public.membership_zone enable row level security;
alter table public.account_rules enable row level security;
alter table public.account enable row level security;
alter table public.account_touch enable row level security;

create policy zone_select on public.zone for select to authenticated using (public.is_member(tenant_id));
create policy zone_admin on public.zone for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy membership_zone_select on public.membership_zone for select to authenticated using (public.is_member(tenant_id));
create policy membership_zone_manager on public.membership_zone for all to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy account_rules_select on public.account_rules for select to authenticated using (public.is_member(tenant_id));
create policy account_rules_admin on public.account_rules for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy account_select on public.account for select to authenticated using (public.is_member(tenant_id));
create policy account_insert on public.account for insert to authenticated with check (public.is_member(tenant_id));
create policy account_update on public.account for update to authenticated
  using (public.is_manager(tenant_id) or owner_id = auth.uid()) with check (public.is_member(tenant_id));
create policy account_delete on public.account for delete to authenticated using (public.is_manager(tenant_id));
create policy account_touch_select on public.account_touch for select to authenticated using (public.is_member(tenant_id));
-- account_touch: sin escritura directa (la hacen las funciones y triggers de arriba).

revoke all on function public.zone_covers(uuid, uuid) from public, anon;
revoke all on function public.claim_days(uuid) from public, anon;
revoke all on function public.account_eligibility_for(uuid, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.account_guard() from public, anon, authenticated;
revoke all on function public.account_audit() from public, anon, authenticated;
revoke all on function public.dossier_account_sync() from public, anon, authenticated;
revoke all on function public.account_touch(uuid, text, text) from public, anon;
grant execute on function public.account_touch(uuid, text, text) to authenticated;
revoke all on function public.account_eligibility_preview(uuid) from public, anon;
grant execute on function public.account_eligibility_preview(uuid) to authenticated;
