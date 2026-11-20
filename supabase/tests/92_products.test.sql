-- Paquetes (docs/PAQUETES.md): el equipo los lee, solo el admin los cambia; cerrar guarda paquetes y precio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('92929292-0000-4000-8000-000000000001', 'rep92@test'), ('92929292-0000-4000-8000-000000000003', 'admin92@test');
insert into public.membership (user_id, tenant_id, role) values
  ('92929292-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('92929292-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', 'admin');
insert into public.account (id, tenant_id, name, owner_id) values ('92929292-aaaa-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Sala 92', '92929292-0000-4000-8000-000000000001');

set role authenticated;
set request.jwt.claim.sub = '92929292-0000-4000-8000-000000000003';
insert into public.product (tenant_id, key, name, price_small, price_medium, price_large, free_allowed)
values ('00000000-0000-4000-8000-000000000e01', 'canciones92', 'Canciones', 25, 25, 50, true);
set request.jwt.claim.sub = '92929292-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 1 from public.product where key = 'canciones92'), 'el equipo ve los paquetes');
do $$ begin
  update public.product set price_small = 1 where key = 'canciones92';
  if found then raise exception 'ASSERT FAILED: el comercial cambia un paquete'; end if;
exception when insufficient_privilege then null; end $$;
-- Cerrar con paquetes (pendiente: es un comercial).
select pg_temp.assert((select status = 'pending' from public.agreement_propose('92929292-aaaa-4000-8000-000000000001', 'Canciones (gratis)', null, 30, array['canciones92:free'], 0, 0)), 'propone con paquetes');
-- Y como antes, sin paquetes (4 argumentos).
select pg_temp.assert((select status = 'pending' from public.agreement_propose('92929292-aaaa-4000-8000-000000000001', '70/30', null, 30)), 'sin paquetes, igual que antes');
reset role;
select pg_temp.assert((select packages = '{canciones92:free}' and price = 0 from public.account_agreement where account_id = '92929292-aaaa-4000-8000-000000000001' and terms = 'Canciones (gratis)'), 'guarda paquetes y precio');
