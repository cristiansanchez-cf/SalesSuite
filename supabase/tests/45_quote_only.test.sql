-- Tarifas a medida: se ven, con su aviso, pero no se eligen en una propuesta (ni siquiera el admin).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.price_option (id, tenant_id, label, amount, period, quote_only, note)
  values ('00000000-0000-4000-8000-0000000ff002', '00000000-0000-4000-8000-000000000e01', 'Festival +20.000', 0, 'event', true, 'A medida · no se cotiza sin prueba de carga');
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select note from public.price_option where id = '00000000-0000-4000-8000-0000000ff002') like 'A medida%', 'el equipo ve la tarifa y su aviso');
do $$ begin
  update public.dossier set price_option_id = '00000000-0000-4000-8000-0000000ff002' where id = '00000000-0000-4000-8000-000000d05501';
  raise exception 'ASSERT FAILED: se elige una tarifa a medida';
exception when check_violation then null; end $$;
reset role;
delete from public.price_option where id = '00000000-0000-4000-8000-0000000ff002';
