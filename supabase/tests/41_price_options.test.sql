-- Tarifas: el admin las crea; comercial y jefe/a de ventas eligen una y no escriben precios a mano.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

update public.dossier set author_id = '11111111-1111-4111-8111-111111111111', price_mode = 'none', total_price = null
 where id = '00000000-0000-4000-8000-000000d05501';

-- El admin crea una tarifa; el comercial no puede.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.price_option (id, tenant_id, label, amount, period, payment_link)
values ('00000000-0000-4000-8000-0000000f9001', '00000000-0000-4000-8000-000000000e01', 'Local mediano', 249, 'month', 'https://buy.stripe.com/test_x');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  insert into public.price_option (tenant_id, label, amount) values ('00000000-0000-4000-8000-000000000e01', 'Mi precio', 1);
  raise exception 'ASSERT FAILED: un comercial crea tarifas';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert((select count(*) = 1 from public.price_option where id = '00000000-0000-4000-8000-0000000f9001'), 'el comercial ve las tarifas');

-- Elegir tarifa rellena el precio.
update public.dossier set price_option_id = '00000000-0000-4000-8000-0000000f9001' where id = '00000000-0000-4000-8000-000000d05501';
select pg_temp.assert((select price_mode = 'total' and total_price = 249 and currency = 'EUR' from public.dossier where id = '00000000-0000-4000-8000-000000d05501'), 'la tarifa fija el total');

-- A mano, no.
do $$ begin
  update public.dossier set total_price = 1 where id = '00000000-0000-4000-8000-000000d05501';
  raise exception 'ASSERT FAILED: el comercial cambia el total a mano';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.dossier_item set price_override = 5 where dossier_id = '00000000-0000-4000-8000-000000d05501' and price_override is null;
  raise exception 'ASSERT FAILED: el comercial pone precio a un módulo';
exception when insufficient_privilege then null; end $$;
-- Quitar el precio sí puede.
update public.dossier set price_option_id = null, price_mode = 'none', total_price = null where id = '00000000-0000-4000-8000-000000d05501';
select pg_temp.assert((select price_mode = 'none' from public.dossier where id = '00000000-0000-4000-8000-000000d05501'), 'sin precio');
-- Una tarifa con enlace raro, no.
reset role;
do $$ begin
  insert into public.price_option (tenant_id, label, amount, payment_link) values ('00000000-0000-4000-8000-000000000e01', 'X', 1, 'javascript:alert(1)');
  raise exception 'ASSERT FAILED: enlace de pago no https';
exception when check_violation then null; end $$;

delete from public.price_option where id = '00000000-0000-4000-8000-0000000f9001';
update public.dossier set author_id = null where id = '00000000-0000-4000-8000-000000d05501';
