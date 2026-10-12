-- Migración 20261201: pagado = Cerrada. El webhook (service role) marca el cobro pagado, la empresa ganada para quien
-- generó el enlace, el ingreso atribuido y avisa; a mano solo gerente o admin; el comercial no puede marcarlo pagado.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.account (id, tenant_id, name) values
  ('70000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Pagada 70'),
  ('70000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Transferencia 70'),
  ('70000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000e01', 'Sin Stripe 70');
update public.account set owner_id = '11111111-1111-4111-8111-111111111111' where id = '70000000-0000-4000-8000-0000000000a3';
insert into public.price_option (id, tenant_id, label, amount, period, payment_link) values
  ('70000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'Local 70', 249, 'month', 'https://buy.stripe.com/test_70');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- comercial de Enjoy
insert into public.payment_request (id, tenant_id, account_id, price_option_id, label, amount, payment_link) values
  ('70000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000e01', '70000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000b1', '-', 0, 'https://-'),
  ('70000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000e01', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000b1', '-', 0, 'https://-');
do $$ begin
  perform public.payment_request_mark_paid('70000000-0000-4000-8000-0000000000d1');
  raise exception 'ASSERT FAILED: el comercial lo marca pagado';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.payment_request_paid('00000000-0000-4000-8000-000000000e01', '70000000-0000-4000-8000-0000000000d1', 'pi_x', '{}');
  raise exception 'ASSERT FAILED: el comercial llama a la función del servidor';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.account_mark_won('70000000-0000-4000-8000-0000000000a3');
  raise exception 'ASSERT FAILED: el comercial la da por ganada';
exception when insufficient_privilege then null; end $$;

-- Webhook de Stripe (servidor): el ingreso llega y luego el cobro se marca pagado.
reset role;
insert into public.revenue_event (tenant_id, source, external_id, kind, occurred_at, amount_cents, revenue_cents) values
  ('00000000-0000-4000-8000-000000000e01', 'stripe', 'pi_70', 'sale', now(), 24900, 24900);
select pg_temp.assert(public.payment_request_paid('00000000-0000-4000-8000-000000000e01', '70000000-0000-4000-8000-0000000000d1', 'cs_70', array['pi_70']) = 'paid', 'pagado');
select pg_temp.assert(public.payment_request_paid('00000000-0000-4000-8000-000000000e01', '70000000-0000-4000-8000-0000000000d1', 'cs_70', array['pi_70']) = 'already', 'Stripe repite el aviso: no pasa nada');
select pg_temp.assert((select status = 'paid' and paid_ref = 'cs_70' from public.payment_request where id = '70000000-0000-4000-8000-0000000000d1'), 'cobro pagado');
select pg_temp.assert((select status = 'customer' and won_by = '11111111-1111-4111-8111-111111111111' and owner_id = '11111111-1111-4111-8111-111111111111' and won_at is not null
  from public.account where id = '70000000-0000-4000-8000-0000000000a1'), 'empresa ganada para quien generó el enlace');
select pg_temp.assert((select account_id = '70000000-0000-4000-8000-0000000000a1' and seller_id = '11111111-1111-4111-8111-111111111111'
  from public.revenue_event where external_id = 'pi_70'), 'el ingreso, atribuido a la empresa y al comercial');
select pg_temp.assert((select count(*) = 1 from public.notification where kind = 'payment_paid' and user_id = '11111111-1111-4111-8111-111111111111'
  and entity_key = '70000000-0000-4000-8000-0000000000d1' and params ->> 'account' = 'Pagada 70'), 'aviso a quien lo vendió');
select pg_temp.assert((select count(*) >= 1 from public.notification where kind = 'payment_paid' and user_id = '22222222-2222-4222-8222-222222222222'
  and entity_key = '70000000-0000-4000-8000-0000000000d1'), 'y al admin');
select pg_temp.assert((select count(*) = 1 from public.account_touch where account_id = '70000000-0000-4000-8000-0000000000a1' and kind = 'won'), 'en el historial de la empresa');

-- A mano (admin): un enlace pagado por transferencia, y una empresa sin enlace (espacio sin Stripe).
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
select pg_temp.assert(public.payment_request_mark_paid('70000000-0000-4000-8000-0000000000d2') = 'paid', 'admin: marcado pagado a mano');
select public.account_mark_won('70000000-0000-4000-8000-0000000000a3');
reset role;
select pg_temp.assert((select status = 'customer' from public.account where id = '70000000-0000-4000-8000-0000000000a2'), 'a mano: ganada');
select pg_temp.assert((select status = 'customer' and won_by = '11111111-1111-4111-8111-111111111111' from public.account where id = '70000000-0000-4000-8000-0000000000a3'), 'sin enlace: ganada para quien la lleva');
select pg_temp.assert((select count(*) = 1 from public.notification where kind = 'payment_paid' and user_id = '11111111-1111-4111-8111-111111111111'
  and entity_key = 'account:70000000-0000-4000-8000-0000000000a3'), 'sin enlace: aviso al comercial');

delete from public.notification where kind = 'payment_paid' and params ->> 'account' like '% 70';
delete from public.account where id in ('70000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000a3');
delete from public.price_option where id = '70000000-0000-4000-8000-0000000000b1';
\echo '70_payment_paid OK'
