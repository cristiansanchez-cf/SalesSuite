-- Migración 20261126: titular (razón social y CIF). Solo el CIF de una sociedad; el DNI/NIE de una persona, no.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when check_violation then return true; end $$;

insert into public.account (id, tenant_id, name, legal_name, tax_id) values
  ('65000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Titular 65', 'Ocio Cosmic, S.L.', 'B12345674');
select pg_temp.assert((select tax_id = 'B12345674' from public.account where id = '65000000-0000-4000-8000-0000000000a1'), 'CIF guardado');
select pg_temp.assert(pg_temp.fails($q$update public.account set tax_id = '12345678Z' where id = '65000000-0000-4000-8000-0000000000a1'$q$), 'DNI no');
select pg_temp.assert(pg_temp.fails($q$update public.account set tax_id = 'X1234567L' where id = '65000000-0000-4000-8000-0000000000a1'$q$), 'NIE no');
select pg_temp.assert(pg_temp.fails($q$update public.account set tax_id = 'b-12345674' where id = '65000000-0000-4000-8000-0000000000a1'$q$), 'sin limpiar no');
select pg_temp.assert(pg_temp.fails($q$update public.account set legal_name = repeat('x', 201) where id = '65000000-0000-4000-8000-0000000000a1'$q$), 'nombre largo no');
delete from public.account where id = '65000000-0000-4000-8000-0000000000a1';
\echo '65_account_legal OK'
