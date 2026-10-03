-- Aperturas internas: modo prueba, sesión de la consola y red del equipo se guardan marcadas y no avisan al autor.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

update public.dossier set author_id = '11111111-1111-4111-8111-111111111111' where id = '00000000-0000-4000-8000-000000d05501';
delete from public.notification where kind = 'dossier_opened';
select pg_temp.assert((select view_mode from public.dossier where id = '00000000-0000-4000-8000-000000d05501') = 'live', 'lo que ya existía sigue en real');

-- La consola anota la red de un miembro; un no miembro no puede.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.note_team_ip('00000000-0000-4000-8000-000000000e01', repeat('a', 64));
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.note_team_ip('00000000-0000-4000-8000-000000000e01', repeat('b', 64));
select pg_temp.assert((select count(*) from public.team_ip) = 0, 'nadie lee las redes del equipo');
reset role;
select pg_temp.assert((select count(*) = 1 from public.team_ip where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'solo se anota la red de un miembro');

set role anon;
-- Red del equipo → team; sesión de la consola → member; cliente desde otra red → cuenta.
select public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'b0000000-0000-4000-8000-000000000001', 'visitor-team01', 'desktop', 1000, 10, '{}', repeat('a', 64), false);
select public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'b0000000-0000-4000-8000-000000000002', 'visitor-memb01', 'desktop', 1000, 10, '{}', null, true);
reset role;
select pg_temp.assert((select internal from public.dossier_view where id = 'b0000000-0000-4000-8000-000000000001') = 'team', 'red del equipo');
select pg_temp.assert((select internal from public.dossier_view where id = 'b0000000-0000-4000-8000-000000000002') = 'member', 'tu navegador');
select pg_temp.assert(not exists (select 1 from public.notification where kind = 'dossier_opened'), 'las internas no avisan');

-- Modo prueba: aunque llegue de otra red, es interna.
update public.dossier set view_mode = 'test' where id = '00000000-0000-4000-8000-000000d05501';
set role anon;
select public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'b0000000-0000-4000-8000-000000000003', 'visitor-test01', 'mobile', 1000, 10, '{}', repeat('c', 64), false);
reset role;
select pg_temp.assert((select internal from public.dossier_view where id = 'b0000000-0000-4000-8000-000000000003') = 'test', 'modo prueba');

-- En real y desde otra red: cuenta y avisa.
update public.dossier set view_mode = 'live' where id = '00000000-0000-4000-8000-000000d05501';
set role anon;
select public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'b0000000-0000-4000-8000-000000000004', 'visitor-real01', 'mobile', 1000, 10, '{}', repeat('d', 64), false);
reset role;
select pg_temp.assert((select internal is null from public.dossier_view where id = 'b0000000-0000-4000-8000-000000000004'), 'el cliente cuenta');
select pg_temp.assert(exists (select 1 from public.notification where kind = 'dossier_opened'), 'y avisa al autor');
do $$ begin
  update public.dossier set view_mode = 'quizá' where id = '00000000-0000-4000-8000-000000d05501';
  raise exception 'ASSERT FAILED: view_mode inválido';
exception when check_violation then null; end $$;

delete from public.dossier_view where id::text like 'b0000000-%';
delete from public.team_ip;
delete from public.notification where kind = 'dossier_opened';
