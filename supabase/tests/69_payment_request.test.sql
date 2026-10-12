-- Migración 20261130: «Generar pago» desde la ficha. El importe sale de la tarifa (no del navegador); a medida, solo admin;
-- solo se anula; otro espacio no lo ve.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.account (id, tenant_id, name) values ('69000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Cobro 69');
insert into public.price_option (id, tenant_id, label, amount, period, payment_link, size) values
  ('69000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'Local 69', 249, 'month', 'https://buy.stripe.com/test_69', 'medium'),
  ('69000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000e01', 'Sin enlace 69', 99, 'month', null, null);
insert into public.coupon (id, tenant_id, code, label, kind, value) values
  ('69000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000e01', 'VEINTE69', '20 %', 'percent', 2000);
do $$ begin
  update public.price_option set size = 'gigante' where id = '69000000-0000-4000-8000-0000000000b1';
  raise exception 'ASSERT FAILED: tamaño inventado';
exception when check_violation then null; end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- comercial de Enjoy
-- Con tarifa: lo que mande el navegador no cuenta; se copia la tarifa y el cupón.
insert into public.payment_request (id, tenant_id, account_id, price_option_id, coupon_id, label, amount, payment_link) values
  ('69000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000e01', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-0000000000b1',
   '69000000-0000-4000-8000-0000000000c1', 'Gratis', 1, 'https://evil.example/x');
select pg_temp.assert((select label = 'Local 69' and amount = 249 and period = 'month' and payment_link = 'https://buy.stripe.com/test_69'
  and coupon_code = 'VEINTE69' and discount ->> 'value' = '2000' and status = 'sent' and created_by = '11111111-1111-4111-8111-111111111111'
  from public.payment_request where id = '69000000-0000-4000-8000-0000000000d1'), 'importe, enlace y cupón: los de la tarifa');
do $$ begin
  insert into public.payment_request (tenant_id, account_id, label, amount, payment_link) values
    ('00000000-0000-4000-8000-000000000e01', '69000000-0000-4000-8000-0000000000a1', 'A medida', 1, 'https://buy.stripe.com/test_x');
  raise exception 'ASSERT FAILED: el comercial pone un precio a medida';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.payment_request (tenant_id, account_id, price_option_id, label, amount, payment_link) values
    ('00000000-0000-4000-8000-000000000e01', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-0000000000b2', '-', 0, 'https://-');
  raise exception 'ASSERT FAILED: tarifa sin enlace de pago';
exception when check_violation then null; end $$;
-- Solo se anula: ni el importe ni marcarlo pagado.
do $$ begin
  update public.payment_request set amount = 1 where id = '69000000-0000-4000-8000-0000000000d1';
  raise exception 'ASSERT FAILED: cambia el importe';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.payment_request set status = 'paid' where id = '69000000-0000-4000-8000-0000000000d1';
  raise exception 'ASSERT FAILED: lo marca pagado';
exception when insufficient_privilege then null; end $$;
update public.payment_request set status = 'cancelled' where id = '69000000-0000-4000-8000-0000000000d1';
select pg_temp.assert((select status = 'cancelled' and cancelled_at is not null from public.payment_request where id = '69000000-0000-4000-8000-0000000000d1'), 'anulado');

-- El admin sí pone un precio a medida, con su enlace.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.payment_request (id, tenant_id, account_id, label, amount, payment_link) values
  ('69000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000e01', '69000000-0000-4000-8000-0000000000a1', 'Especial', 180, 'https://buy.stripe.com/test_especial');
select pg_temp.assert((select amount = 180 and created_by = '22222222-2222-4222-8222-222222222222' from public.payment_request where id = '69000000-0000-4000-8000-0000000000d2'), 'a medida (admin)');

-- Otro espacio: ni lo ve ni lo anula.
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- otro espacio
select pg_temp.assert((select count(*) = 0 from public.payment_request), 'otro espacio no lo ve');
with u as (update public.payment_request set status = 'cancelled' returning 1) select pg_temp.assert((select count(*) = 0 from u), 'ni lo anula');

reset role;
delete from public.account where id = '69000000-0000-4000-8000-0000000000a1';
select pg_temp.assert((select count(*) = 0 from public.payment_request where account_id = '69000000-0000-4000-8000-0000000000a1'), 'se borra con la empresa');
delete from public.price_option where id in ('69000000-0000-4000-8000-0000000000b1', '69000000-0000-4000-8000-0000000000b2');
delete from public.coupon where id = '69000000-0000-4000-8000-0000000000c1';
\echo '69_payment_request OK'
