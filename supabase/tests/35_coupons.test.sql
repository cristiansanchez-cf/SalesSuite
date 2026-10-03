-- Cupones: el admin los crea, el equipo los aplica, la propuesta guarda una copia y el público la ve.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.coupon (id, tenant_id, code, label, kind, value, max_uses) values
  ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'LANZA30', '30 % de lanzamiento', 'percent', 3000, 1),
  ('80000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'MESGRATIS', 'Primer mes gratis', 'free_months', 1, null);
insert into public.coupon (tenant_id, code, label, kind, value, valid_until) values ('00000000-0000-4000-8000-000000000e01', 'VIEJO', 'Caducado', 'percent', 1000, current_date - 1);
reset role;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep
do $$ begin
  insert into public.coupon (tenant_id, code, label, kind, value) values ('00000000-0000-4000-8000-000000000e01', 'MIO', 'x', 'percent', 9000);
  raise exception 'ASSERT FAILED: el comercial crea cupones';
exception when insufficient_privilege then null; end $$;
insert into public.dossier (id, tenant_id, author_id, title) values
  ('40000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Una'),
  ('40000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Otra');
update public.dossier set coupon_id = '80000000-0000-4000-8000-000000000001', discount = '{"kind":"percent","value":10000}' where id = '40000000-0000-4000-8000-0000000000d1';
select pg_temp.assert((select discount->>'code' = 'LANZA30' and (discount->>'value')::int = 3000 from public.dossier where id = '40000000-0000-4000-8000-0000000000d1'), 'copia del cupón (no la del cliente)');
update public.dossier set discount = '{"kind":"percent","value":10000}' where id = '40000000-0000-4000-8000-0000000000d1';
select pg_temp.assert((select (discount->>'value')::int = 3000 from public.dossier where id = '40000000-0000-4000-8000-0000000000d1'), 'no se cambia el descuento a mano');
do $$ begin
  update public.dossier set coupon_id = '80000000-0000-4000-8000-000000000001' where id = '40000000-0000-4000-8000-0000000000d2';
  raise exception 'ASSERT FAILED: superó los usos';
exception when check_violation then null; end $$;
do $$ begin
  update public.dossier set coupon_id = (select id from public.coupon where code = 'VIEJO') where id = '40000000-0000-4000-8000-0000000000d2';
  raise exception 'ASSERT FAILED: cupón caducado';
exception when check_violation then null; end $$;
reset role;

-- Editar el cupón no cambia lo enviado; el público lo ve.
update public.coupon set value = 5000 where code = 'LANZA30';
select pg_temp.assert((select (discount->>'value')::int = 3000 from public.dossier where id = '40000000-0000-4000-8000-0000000000d1'), 'lo enviado conserva su descuento');
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.dossier set coupon_id = '80000000-0000-4000-8000-000000000002' where id = '00000000-0000-4000-8000-000000d05501';
reset role;
select pg_temp.assert((select public.get_public_dossier(l.token, '00000000-0000-4000-8000-000000000e01')->'discount'->>'code' from public.share_link l
  where l.dossier_id = '00000000-0000-4000-8000-000000d05501' and l.is_active limit 1) = 'MESGRATIS', 'el dossier público trae el descuento');

-- El colaborador no aplica cupones.
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select pg_temp.assert((select count(*) from public.coupon) = 0, 'el colaborador no ve los cupones');
reset role;

update public.dossier set coupon_id = null where id = '00000000-0000-4000-8000-000000d05501';
select pg_temp.assert((select discount is null from public.dossier where id = '00000000-0000-4000-8000-000000d05501'), 'quitar el cupón quita el descuento');
delete from public.dossier where id in ('40000000-0000-4000-8000-0000000000d1', '40000000-0000-4000-8000-0000000000d2');
delete from public.coupon;
