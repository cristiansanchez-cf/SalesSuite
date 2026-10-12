-- Pagado = Cerrada (docs/CRM_DINAMICO.md §36).
--  · Stripe avisa del pago de un enlace generado en la ficha (client_reference_id = pay_<id>): el servidor llama a
--    payment_request_paid → cobro pagado, empresa ganada para quien generó el enlace, el ingreso atribuido a ella y a esa
--    persona, y aviso «X ha pagado» (con email) a quien lo vendió y a admins y gerentes.
--  · Sin Stripe (o un pago por transferencia): un gerente o admin lo marca pagado a mano (payment_request_mark_paid) o
--    da la empresa por ganada sin enlace (account_mark_won). Mismo efecto y mismo aviso.

create or replace function public.payment_paid_effects(p_tenant uuid, p_account uuid, p_seller uuid, p_entity text, p_label text, p_amount numeric, p_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.account; params jsonb;
begin
  perform set_config('app.account_rpc', '1', true);
  update public.account set status = 'customer', won_at = coalesce(won_at, now()), won_by = coalesce(won_by, p_seller),
         owner_id = coalesce(owner_id, p_seller), claimed_until = null, last_touch_at = now(), last_touch_by = coalesce(p_seller, last_touch_by)
   where id = p_account and tenant_id = p_tenant
   returning * into a;
  perform set_config('app.account_rpc', '0', true);
  if a.id is null then return; end if;
  insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (p_tenant, a.id, p_seller, 'won', p_label);
  params := jsonb_build_object('account', a.name, 'accountId', a.id, 'seller', public.user_label(p_seller), 'sellerId', p_seller,
                               'label', p_label, 'amount', round(coalesce(p_amount, 0) * 100), 'currency', coalesce(p_currency, 'EUR'));
  perform public.notify_roles(p_tenant, array['admin', 'lead']::public.member_role[], 'payment_paid', 'action', p_entity, params, p_seller);
  if p_seller is not null and exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = p_seller) then
    insert into public.notification (tenant_id, user_id, kind, severity, entity_key, params)
    values (p_tenant, p_seller, 'payment_paid', 'action', p_entity, params)
    on conflict (user_id, tenant_id, kind, entity_key) do nothing;
  end if;
end $$;
revoke all on function public.payment_paid_effects(uuid, uuid, uuid, text, text, numeric, text) from public, anon, authenticated;

-- La guardia deja pasar a payment_request_paid (marcar pagado lo hace solo esa función).
create or replace function public.payment_request_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.price_option; c public.coupon;
begin
  -- Sin sesión de usuario (servidor: webhook de Stripe) o desde payment_request_paid, sin guardia.
  if auth.uid() is null or coalesce(current_setting('app.payment_rpc', true), '') = '1' then return new; end if;
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

-- Servidor (webhook de Stripe, service role). p_refs: los ids del cobro en Stripe (payment_intent, factura), para atribuir el ingreso.
create or replace function public.payment_request_paid(p_tenant uuid, p_request uuid, p_ref text, p_refs text[] default '{}')
returns text language plpgsql security definer set search_path = '' as $$
declare r public.payment_request;
begin
  select * into r from public.payment_request x where x.id = p_request and x.tenant_id = p_tenant for update;
  if r.id is null then return 'missing'; end if;
  if r.status = 'paid' then return 'already'; end if;
  perform set_config('app.payment_rpc', '1', true);
  update public.payment_request set status = 'paid', paid_at = now(), paid_ref = left(p_ref, 200), cancelled_at = null where id = r.id;
  perform set_config('app.payment_rpc', '0', true);
  update public.revenue_event e set account_id = coalesce(e.account_id, r.account_id), seller_id = coalesce(e.seller_id, r.created_by)
   where e.tenant_id = p_tenant and e.source = 'stripe' and e.external_id = any (p_refs);
  perform public.payment_paid_effects(p_tenant, r.account_id, r.created_by, r.id::text, r.label, r.amount, r.currency);
  return 'paid';
end $$;
revoke all on function public.payment_request_paid(uuid, uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.payment_request_paid(uuid, uuid, text, text[]) to service_role;

-- A mano (gerente o admin): un enlace enviado que se pagó por otra vía.
create or replace function public.payment_request_mark_paid(p_request uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  select x.tenant_id into t from public.payment_request x where x.id = p_request;
  if t is null or not public.is_manager(t) then raise exception 'Solo un gerente o admin lo marca pagado' using errcode = 'insufficient_privilege'; end if;
  return public.payment_request_paid(t, p_request, 'manual', '{}');
end $$;
revoke all on function public.payment_request_mark_paid(uuid) from public, anon;
grant execute on function public.payment_request_mark_paid(uuid) to authenticated;

-- Sin enlace (espacios sin Stripe): la empresa, ganada para quien la lleva.
create or replace function public.account_mark_won(p_account uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.account;
begin
  select * into a from public.account x where x.id = p_account;
  if a.id is null or not public.is_manager(a.tenant_id) then raise exception 'Solo un gerente o admin la da por ganada' using errcode = 'insufficient_privilege'; end if;
  if a.won_at is not null then return; end if;
  perform public.payment_paid_effects(a.tenant_id, a.id, coalesce(a.owner_id, auth.uid()), 'account:' || a.id::text, null, null, null);
end $$;
revoke all on function public.account_mark_won(uuid) from public, anon;
grant execute on function public.account_mark_won(uuid) to authenticated;
