-- Comisiones (docs/COMMISSIONS.md). El cálculo lo hace el motor (src/lib/commissions/engine.ts); aquí se
-- garantiza lo que no puede depender del código: importes enteros, eventos y líneas únicos, lo aprobado
-- inmutable, liquidaciones congeladas y que cada uno vea solo lo suyo.
create type public.revenue_kind as enum ('sale', 'recurring', 'volume', 'metric', 'refund');
create type public.revenue_status as enum ('pending', 'confirmed', 'void');
create type public.entry_kind as enum ('commission', 'referral', 'bounty', 'refund', 'adjustment');
create type public.entry_status as enum ('pending', 'approved', 'paid', 'void', 'ineligible');

-- ---------------------------------------------------------------- eventos de ingreso
create table public.revenue_event (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant(id) on delete cascade,
  source           text not null check (source ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  external_id      text not null check (length(external_id) between 1 and 200),
  kind             public.revenue_kind not null,
  status           public.revenue_status not null default 'confirmed',
  occurred_at      timestamptz not null,
  amount_cents     bigint not null default 0 check (amount_cents >= 0),
  revenue_cents    bigint not null default 0 check (revenue_cents >= 0),
  currency         text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  account_id       uuid,
  dossier_id       uuid,
  seller_id        uuid references public.users(id) on delete set null,
  offer            text check (length(offer) <= 80),
  metric           text check (metric ~ '^[a-z0-9_]{1,60}$'),
  quantity         numeric check (quantity >= 0),
  refunds_event_id uuid,
  note             text check (length(note) <= 500),
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  confirmed_by     uuid references public.users(id) on delete set null,
  confirmed_at     timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, source, external_id),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete set null (account_id),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete set null (dossier_id),
  foreign key (tenant_id, refunds_event_id) references public.revenue_event (tenant_id, id),
  check (kind <> 'refund' or refunds_event_id is not null),
  check (kind <> 'metric' or (metric is not null and quantity is not null))
);
create index revenue_event_tenant_idx on public.revenue_event (tenant_id, status, occurred_at);

-- ---------------------------------------------------------------- planes
create table public.commission_plan (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  is_default  boolean not null default false,
  rules       jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  referral    jsonb check (referral is null or jsonb_typeof(referral) = 'object'),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index commission_plan_default_uidx on public.commission_plan (tenant_id) where is_default;
create trigger commission_plan_touch before update on public.commission_plan for each row execute function public.touch_updated_at();

create table public.commission_plan_member (
  tenant_id uuid not null,
  user_id   uuid not null,
  plan_id   uuid not null,
  primary key (tenant_id, user_id),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade,
  foreign key (tenant_id, plan_id) references public.commission_plan (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------- libro
create table public.payout (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete restrict,
  period       text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  total_cents  bigint not null,
  currency     text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status       text not null default 'open' check (status in ('open', 'paid')),
  paid_at      timestamptz,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id, period, currency)
);

create table public.commission_entry (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete restrict,
  event_id     uuid,
  dedupe_key   text not null check (length(dedupe_key) between 1 and 300),
  kind         public.entry_kind not null,
  rule_id      text,
  rule_label   text check (length(rule_label) <= 200),
  base_cents   bigint not null default 0,
  amount_cents bigint not null,
  currency     text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  period       text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status       public.entry_status not null default 'pending',
  reason       text check (length(reason) <= 300),
  account_id   uuid,
  payout_id    uuid,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  approved_by  uuid references public.users(id) on delete set null,
  approved_at  timestamptz,
  unique (tenant_id, dedupe_key),
  foreign key (tenant_id, event_id) references public.revenue_event (tenant_id, id),
  foreign key (tenant_id, payout_id) references public.payout (tenant_id, id),
  check (kind in ('refund', 'adjustment') or amount_cents >= 0),
  check (kind <> 'adjustment' or length(coalesce(reason, '')) > 0)
);
create index commission_entry_user_idx on public.commission_entry (tenant_id, user_id, period);
create index commission_entry_event_idx on public.commission_entry (event_id);

-- Un ingreso confirmado no cambia de importe; anularlo exige que no haya nada aprobado o pagado de él.
create or replace function public.revenue_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los ingresos no se borran: se anulan' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.status = 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now()); new.confirmed_by := coalesce(auth.uid(), new.confirmed_by); end if;
    return new;
  end if;
  if (new.tenant_id, new.source, new.external_id, new.kind, new.occurred_at, new.amount_cents, new.revenue_cents, new.currency, new.quantity, new.refunds_event_id)
     is distinct from (old.tenant_id, old.source, old.external_id, old.kind, old.occurred_at, old.amount_cents, old.revenue_cents, old.currency, old.quantity, old.refunds_event_id)
     and old.status <> 'pending' then
    raise exception 'Un ingreso confirmado no se modifica: anúlalo y crea otro' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'void' then raise exception 'Un ingreso anulado no se recupera' using errcode = 'check_violation'; end if;
    if new.status = 'confirmed' then new.confirmed_at := now(); new.confirmed_by := auth.uid(); end if;
    if new.status = 'void' and exists (select 1 from public.commission_entry e where e.event_id = old.id and e.status in ('approved', 'paid')) then
      raise exception 'Tiene comisiones aprobadas o pagadas: corrígelo con una devolución' using errcode = 'check_violation';
    end if;
    if new.status = 'void' then delete from public.commission_entry e where e.event_id = old.id and e.status in ('pending', 'ineligible'); end if;
    update public.notification set resolved_at = now()
     where tenant_id = new.tenant_id and kind = 'sale_to_confirm' and entity_key = new.id::text and resolved_at is null;
  end if;
  return new;
end $$;
create trigger revenue_event_guard before insert or update or delete on public.revenue_event for each row execute function public.revenue_event_guard();

-- Lo aprobado no se toca. Transiciones válidas: pendiente → aprobada | anulada; no elegible → aprobada | anulada;
-- aprobada → pagada (solo al liquidar). Importe, persona, clave y periodo nunca cambian.
create or replace function public.commission_entry_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'ineligible') or new.payout_id is not null then
      raise exception 'Una línea nace pendiente o no elegible' using errcode = 'check_violation';
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status not in ('pending', 'ineligible', 'void') then
      raise exception 'Una línea aprobada o pagada no se borra: crea un ajuste' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if (new.tenant_id, new.user_id, new.event_id, new.dedupe_key, new.kind, new.rule_id, new.base_cents, new.amount_cents, new.currency, new.period, new.account_id)
     is distinct from (old.tenant_id, old.user_id, old.event_id, old.dedupe_key, old.kind, old.rule_id, old.base_cents, old.amount_cents, old.currency, old.period, old.account_id) then
    raise exception 'Una línea del libro no se edita: crea un ajuste' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status in ('pending', 'ineligible') and new.status in ('approved', 'void'))
         or (old.status = 'approved' and new.status = 'paid' and new.payout_id is not null)) then
      raise exception 'Cambio de estado no permitido (% → %)', old.status, new.status using errcode = 'check_violation';
    end if;
    if new.status = 'approved' then new.approved_at := now(); new.approved_by := auth.uid(); end if;
  end if;
  if new.payout_id is distinct from old.payout_id and coalesce(current_setting('app.payout_release', true), '') = '1' and new.payout_id is null and old.status = 'approved' then
    return new;  -- se borra una liquidación abierta: sus líneas vuelven a estar por liquidar
  end if;
  if new.payout_id is distinct from old.payout_id and (old.payout_id is not null or old.status <> 'approved') then
    raise exception 'Solo se liquida lo aprobado, una vez' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger commission_entry_guard before insert or update or delete on public.commission_entry for each row execute function public.commission_entry_guard();

-- Liquidación: total congelado; pagarla marca sus líneas como pagadas.
create or replace function public.payout_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then raise exception 'Una liquidación pagada no se borra' using errcode = 'insufficient_privilege'; end if;
    perform set_config('app.payout_release', '1', true);
    update public.commission_entry set payout_id = null where payout_id = old.id;
    perform set_config('app.payout_release', '0', true);
    return old;
  end if;
  if tg_op = 'INSERT' then new.status := 'open'; new.paid_at := null; new.created_by := coalesce(auth.uid(), new.created_by); return new; end if;
  if (new.total_cents, new.user_id, new.period, new.currency) is distinct from (old.total_cents, old.user_id, old.period, old.currency) then
    raise exception 'El total de una liquidación está congelado' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    if not (old.status = 'open' and new.status = 'paid') then raise exception 'Una liquidación pagada no vuelve atrás' using errcode = 'check_violation'; end if;
    if (select coalesce(sum(amount_cents), 0) from public.commission_entry where payout_id = new.id) <> new.total_cents then
      raise exception 'Las líneas no cuadran con el total de la liquidación' using errcode = 'check_violation';
    end if;
    new.paid_at := now();
    update public.commission_entry set status = 'paid' where payout_id = new.id and status = 'approved';
  end if;
  return new;
end $$;
-- La liquidación se borra antes de soltar sus líneas: el trigger de líneas permite payout_id → null solo así.
create trigger payout_guard before insert or update or delete on public.payout for each row execute function public.payout_guard();

-- ---------------------------------------------------------------- API
create table public.api_key (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  prefix       text not null check (length(prefix) between 4 and 16),
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create table public.connector (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name       text not null check (length(name) between 1 and 80),
  mapping    jsonb not null check (jsonb_typeof(mapping) = 'object'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

-- ---------------------------------------------------------------- avisos
create or replace function public.notify_revenue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    perform public.notify_roles(new.tenant_id, array['admin']::public.member_role[], 'sale_to_confirm', 'action', new.id::text,
      jsonb_build_object('seller', public.user_label(coalesce(new.seller_id, new.created_by)), 'amount', new.amount_cents, 'currency', new.currency, 'offer', new.offer), new.created_by);
  end if;
  return null;
end $$;
create trigger notify_revenue after insert on public.revenue_event for each row execute function public.notify_revenue();

create or replace function public.notify_payout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification (tenant_id, user_id, kind, severity, entity_key, params)
  values (new.tenant_id, new.user_id, case when tg_op = 'INSERT' then 'payout_ready' else 'payout_paid' end, 'info', new.id::text,
          jsonb_build_object('period', new.period, 'amount', new.total_cents, 'currency', new.currency))
  on conflict (user_id, tenant_id, kind, entity_key) do nothing;
  return null;
end $$;
create trigger notify_payout_new after insert on public.payout for each row execute function public.notify_payout();
create trigger notify_payout_paid after update of status on public.payout for each row when (new.status = 'paid' and old.status <> 'paid') execute function public.notify_payout();

-- ---------------------------------------------------------------- RLS
alter table public.revenue_event enable row level security;
alter table public.commission_plan enable row level security;
alter table public.commission_plan_member enable row level security;
alter table public.commission_entry enable row level security;
alter table public.payout enable row level security;
alter table public.api_key enable row level security;
alter table public.connector enable row level security;

-- Eventos: admin todo; jefe/a lee; cada uno lee los suyos y declara ventas de SUS propuestas (pendientes).
create policy revenue_event_select on public.revenue_event for select to authenticated using (
  public.is_manager(tenant_id) or seller_id = auth.uid() or created_by = auth.uid());
create policy revenue_event_admin on public.revenue_event for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy revenue_event_declare on public.revenue_event for insert to authenticated with check (
  (public.is_member(tenant_id) or public.is_partner(tenant_id))
  and source = 'manual' and status = 'pending' and kind in ('sale', 'recurring') and seller_id = auth.uid()
  and dossier_id is not null and exists (select 1 from public.dossier d where d.id = dossier_id and d.author_id = auth.uid()));

create policy commission_plan_select on public.commission_plan for select to authenticated using (public.is_member(tenant_id));
create policy commission_plan_admin on public.commission_plan for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy commission_plan_member_select on public.commission_plan_member for select to authenticated using (public.is_manager(tenant_id) or user_id = auth.uid());
create policy commission_plan_member_admin on public.commission_plan_member for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy commission_entry_select on public.commission_entry for select to authenticated using (public.is_manager(tenant_id) or user_id = auth.uid());
create policy commission_entry_admin on public.commission_entry for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy payout_select on public.payout for select to authenticated using (public.is_manager(tenant_id) or user_id = auth.uid());
create policy payout_admin on public.payout for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy api_key_admin on public.api_key for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy connector_admin on public.connector for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

revoke all on function public.revenue_event_guard() from public, anon, authenticated;
revoke all on function public.commission_entry_guard() from public, anon, authenticated;
revoke all on function public.payout_guard() from public, anon, authenticated;
revoke all on function public.notify_revenue() from public, anon, authenticated;
revoke all on function public.notify_payout() from public, anon, authenticated;
