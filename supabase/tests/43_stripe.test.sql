-- Stripe → comisiones: el secreto del webhook solo lo escribe un admin y no lo lee nadie con sesión;
-- la propuesta pública lleva el enlace de pago de su tarifa (si está activa).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
-- Un comercial no puede conectar Stripe.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  perform public.set_stripe_webhook_secret('00000000-0000-4000-8000-000000000e01', 'whsec_abcdefghijklmnop');
  raise exception 'ASSERT FAILED: un comercial conecta Stripe';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert(public.stripe_webhook_status('00000000-0000-4000-8000-000000000e01') is null, 'un comercial no ve el estado');
-- El admin sí; con formato raro, no.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  perform public.set_stripe_webhook_secret('00000000-0000-4000-8000-000000000e01', 'sk_live_no_es_un_secreto');
  raise exception 'ASSERT FAILED: secreto sin whsec_';
exception when invalid_parameter_value then null; end $$;
select public.set_stripe_webhook_secret('00000000-0000-4000-8000-000000000e01', 'whsec_abcdefghijklmnop');
select pg_temp.assert(public.stripe_webhook_status('00000000-0000-4000-8000-000000000e01') is not null, 'el admin ve que está conectado');
-- …pero ni el admin lee el secreto (RLS sin políticas: no ve ninguna fila, o no tiene permiso).
create or replace function pg_temp.visible(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q into n; return n; exception when insufficient_privilege then return 0; end $$;
select pg_temp.assert(pg_temp.visible('select count(*) from public.tenant_secret') = 0, 'nadie con sesión lee tenant_secret');
select pg_temp.assert(pg_temp.visible('select count(*) from public.stripe_subscription') = 0, 'nadie con sesión lee stripe_subscription');
-- Un admin de otro espacio no toca el mío.
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  perform public.set_stripe_webhook_secret('00000000-0000-4000-8000-000000000e01', '');
  raise exception 'ASSERT FAILED: otro espacio desconecta mi Stripe';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.assert((select secret from public.tenant_secret where tenant_id = '00000000-0000-4000-8000-000000000e01') = 'whsec_abcdefghijklmnop', 'guardado');

-- La pública lleva el enlace de pago de la tarifa elegida, solo mientras está activa.
insert into public.price_option (id, tenant_id, label, amount, period, payment_link)
  values ('00000000-0000-4000-8000-0000000ff001', '00000000-0000-4000-8000-000000000e01', 'Test', 99, 'month', 'https://buy.stripe.com/test_123');
update public.dossier set price_option_id = '00000000-0000-4000-8000-0000000ff001' where id = '00000000-0000-4000-8000-000000d05501';
set role anon;
select pg_temp.assert((public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'payment_link') = 'https://buy.stripe.com/test_123', 'la pública lleva el enlace de pago');
reset role;
update public.price_option set active = false where id = '00000000-0000-4000-8000-0000000ff001';
set role anon;
select pg_temp.assert((public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') ->> 'payment_link') is null, 'tarifa desactivada: sin enlace');
reset role;
update public.dossier set price_option_id = null where id = '00000000-0000-4000-8000-000000d05501';
delete from public.price_option where id = '00000000-0000-4000-8000-0000000ff001';
delete from public.tenant_secret;
