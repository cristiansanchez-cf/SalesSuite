-- Tarifas (docs/COMMISSIONS.md §Tarifas): el precio lo fija la empresa, no el comercial.
-- El admin crea las opciones («Mediano · 249 €/mes», «Evento 5.000–20.000 · 2.500 €») con su enlace de pago de Stripe;
-- en la propuesta el comercial elige una (y, si toca, un cupón). Sin campos de precio libres.
create table public.price_option (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  label        text not null check (length(label) between 1 and 80),
  amount       numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  currency     text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- once: pago único · event: por evento · month / year: suscripción
  period       text not null default 'once' check (period in ('once', 'event', 'month', 'year')),
  -- Enlace de pago de Stripe (Payment Link). La consola le añade client_reference_id (la propuesta → el vendedor)
  -- y prefilled_promo_code (el cupón elegido).
  payment_link text check (payment_link is null or (payment_link ~ '^https://[^\s"''<>]+$' and length(payment_link) <= 500)),
  -- Sector al que se ofrece primero (opcional): en la propuesta salen antes las de su sector.
  segment_id   uuid references public.segment(id) on delete set null,
  position     integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id)
);

alter table public.price_option enable row level security;
create policy price_option_select on public.price_option for select to authenticated using (public.is_member(tenant_id));
create policy price_option_admin on public.price_option for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

alter table public.dossier
  add column price_option_id uuid,
  add foreign key (tenant_id, price_option_id) references public.price_option (tenant_id, id) on delete set null (price_option_id);

-- Guardia (también fuera de la consola): para comercial y jefe/a de ventas el precio sale de una tarifa.
-- · Elegir tarifa rellena el precio (para cualquiera): modo total, importe y moneda de la tarifa.
-- · rep/lead no escriben un total ni precios por módulo a mano (al crear desde una plantilla, se descartan).
-- Los colaboradores ya tienen su propia guardia (precio de su cuenta).
create or replace function public.dossier_price_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.price_option; r text := public.my_role(new.tenant_id);
begin
  if new.price_option_id is not null and (tg_op = 'INSERT' or new.price_option_id is distinct from old.price_option_id) then
    select * into o from public.price_option x where x.id = new.price_option_id and x.tenant_id = new.tenant_id;
    if o.id is null or not o.active then raise exception 'Tarifa no disponible' using errcode = 'check_violation'; end if;
    new.price_mode := 'total'; new.total_price := o.amount; new.currency := o.currency;
    return new;
  end if;
  if r in ('rep', 'lead') and new.price_mode = 'total' then
    if tg_op = 'INSERT' then
      if new.price_option_id is null then new.price_mode := 'none'; new.total_price := null; end if;
    elsif new.price_option_id is null or new.total_price is distinct from old.total_price or new.currency is distinct from old.currency then
      raise exception 'El precio lo fija tu empresa: elige una tarifa' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger dossier_price_guard before insert or update of price_mode, total_price, currency, price_option_id on public.dossier
  for each row execute function public.dossier_price_guard();
revoke all on function public.dossier_price_guard() from public, anon, authenticated;

create or replace function public.dossier_item_price_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  select d.tenant_id into t from public.dossier d where d.id = new.dossier_id;
  if public.my_role(t) in ('rep', 'lead') and new.price_override is not null then
    if tg_op = 'INSERT' then new.price_override := null;
    elsif new.price_override is distinct from old.price_override then
      raise exception 'El precio lo fija tu empresa: elige una tarifa' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger dossier_item_price_guard before insert or update of price_override on public.dossier_item
  for each row execute function public.dossier_item_price_guard();
revoke all on function public.dossier_item_price_guard() from public, anon, authenticated;
