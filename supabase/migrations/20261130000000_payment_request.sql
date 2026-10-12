-- «Generar pago» desde la ficha de una empresa (docs/CRM_DINAMICO.md §35).
--  1. Cada tarifa puede decir a qué tamaño de cliente corresponde: el asistente marca la de su tamaño.
--  2. Cada enlace de pago que se manda queda apuntado (payment_request): con él la empresa pasa a «Cierre» en el
--     tablero y, cuando Stripe avisa del pago (client_reference_id = pay_<id>), a «Cerrada».
-- El precio lo fija la empresa: con tarifa, el importe y el enlace salen de la tarifa (lo copia la base de datos, no
-- el navegador); un precio a medida (sin tarifa, con su propio enlace de Stripe) solo lo pone un admin.

alter table public.price_option
  add column if not exists size text check (size is null or size in ('small', 'medium', 'large', 'huge'));

-- Enjoy: las tarifas de local ya dicen su tamaño en el nombre.
update public.price_option o
   set size = case when o.label ilike 'Local pequeño%' then 'small' when o.label ilike 'Local mediano%' then 'medium' else 'large' end
 where o.size is null and o.label ~* '^Local (pequeño|mediano|grande)'
   and o.tenant_id in (select t.id from public.tenant t where t.slug = 'enjoy');

create table public.payment_request (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant(id) on delete cascade,
  account_id      uuid not null,
  price_option_id uuid,
  coupon_id       uuid,
  -- Copia de la tarifa y del cupón al generarlo: cambiar la tarifa después no cambia lo ya enviado.
  label           text not null check (length(label) between 1 and 80),
  amount          numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  currency        text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  period          text not null default 'once' check (period in ('once', 'event', 'month', 'year')),
  payment_link    text not null check (payment_link ~ '^https://[^\s"''<>]+$' and length(payment_link) <= 500),
  coupon_code     text check (coupon_code is null or coupon_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  discount        jsonb check (discount is null or jsonb_typeof(discount) = 'object'),
  status          text not null default 'sent' check (status in ('sent', 'paid', 'cancelled')),
  created_by      uuid default auth.uid() references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  paid_ref        text check (paid_ref is null or length(paid_ref) <= 200),
  cancelled_at    timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade,
  foreign key (tenant_id, price_option_id) references public.price_option (tenant_id, id) on delete set null (price_option_id),
  foreign key (tenant_id, coupon_id) references public.coupon (tenant_id, id) on delete set null (coupon_id)
);
create index payment_request_account on public.payment_request (tenant_id, account_id, created_at desc);

alter table public.payment_request enable row level security;
create policy payment_request_select on public.payment_request for select to authenticated using (public.is_member(tenant_id));
create policy payment_request_insert on public.payment_request for insert to authenticated
  with check (public.is_member(tenant_id) and created_by = auth.uid());
-- Anular: quien lo generó o un gerente/admin (la guardia de abajo solo deja pasar de «enviado» a «anulado»).
create policy payment_request_update on public.payment_request for update to authenticated
  using (public.is_member(tenant_id) and (created_by = auth.uid() or public.is_manager(tenant_id)))
  with check (public.is_member(tenant_id));

create or replace function public.payment_request_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.price_option; c public.coupon;
begin
  -- Sin sesión de usuario (servidor: webhook de Stripe), sin guardia.
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status = 'sent'
       and (new.tenant_id, new.account_id, new.price_option_id, new.coupon_id, new.label, new.amount, new.currency, new.period, new.payment_link, new.coupon_code, new.discount, new.created_by, new.created_at, new.paid_at, new.paid_ref)
           is not distinct from (old.tenant_id, old.account_id, old.price_option_id, old.coupon_id, old.label, old.amount, old.currency, old.period, old.payment_link, old.coupon_code, old.discount, old.created_by, old.created_at, old.paid_at, old.paid_ref) then
      new.cancelled_at := now();
      return new;
    end if;
    raise exception 'Un enlace de pago enviado solo se puede anular' using errcode = 'insufficient_privilege';
  end if;
  new.created_by := auth.uid(); new.created_at := now(); new.status := 'sent';
  new.paid_at := null; new.paid_ref := null; new.cancelled_at := null;
  if new.price_option_id is not null then
    select * into o from public.price_option x where x.id = new.price_option_id and x.tenant_id = new.tenant_id;
    if o.id is null or not o.active then raise exception 'Tarifa no disponible' using errcode = 'check_violation'; end if;
    if o.quote_only then raise exception 'Esta tarifa es a medida: no se cobra con un enlace' using errcode = 'check_violation'; end if;
    if o.payment_link is null then raise exception 'Esta tarifa no tiene enlace de pago de Stripe' using errcode = 'check_violation'; end if;
    new.label := o.label; new.amount := o.amount; new.currency := o.currency; new.period := o.period; new.payment_link := o.payment_link;
  elsif not public.is_admin(new.tenant_id) then
    raise exception 'El precio lo fija tu empresa: elige una tarifa' using errcode = 'insufficient_privilege';
  end if;
  if new.coupon_id is not null then
    select * into c from public.coupon x where x.id = new.coupon_id and x.tenant_id = new.tenant_id;
    if c.id is null or not c.active or (c.valid_until is not null and c.valid_until < current_date) then
      raise exception 'Cupón no disponible' using errcode = 'check_violation';
    end if;
    new.coupon_code := c.code; new.discount := jsonb_build_object('kind', c.kind, 'value', c.value, 'label', c.label);
  else
    new.coupon_code := null; new.discount := null;
  end if;
  return new;
end $$;
create trigger payment_request_guard before insert or update on public.payment_request
  for each row execute function public.payment_request_guard();
revoke all on function public.payment_request_guard() from public, anon, authenticated;
