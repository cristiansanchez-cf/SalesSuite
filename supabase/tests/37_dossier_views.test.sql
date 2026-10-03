-- Analítica de dossiers: solo se registra con un enlace válido; lo ve quien ve el dossier; avisa al autor una vez al día.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

update public.dossier set author_id = '11111111-1111-4111-8111-111111111111' where id = '00000000-0000-4000-8000-000000d05501';

set role anon;
-- Enlace válido: primera llamada crea la visita; la segunda la amplía (nunca baja).
select pg_temp.assert(public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'a0000000-0000-4000-8000-000000000001',
  'visitor-abc123', 'mobile', 5000, 30, '{"00000000-0000-4000-8000-00000017e001": 2000, "no-es-un-item": 999}'::jsonb), 'registra con enlace válido');
select pg_temp.assert(public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'a0000000-0000-4000-8000-000000000001',
  'visitor-abc123', 'mobile', 3000, 80, '{"00000000-0000-4000-8000-00000017e002": 1500}'::jsonb), 'amplía la misma visita');
-- Enlaces que no valen: revocado, borrador, otro tenant, visitante distinto con el mismo id.
select pg_temp.assert(not public.track_dossier_view('demo-revoked-Zt4c', '00000000-0000-4000-8000-000000000e01', 'a0000000-0000-4000-8000-000000000002', 'visitor-abc123', 'desktop', 1, 1, '{}'), 'revocado');
select pg_temp.assert(not public.track_dossier_view('demo-draft-Kp9wQ1', '00000000-0000-4000-8000-000000000e01', 'a0000000-0000-4000-8000-000000000003', 'visitor-abc123', 'desktop', 1, 1, '{}'), 'borrador');
select pg_temp.assert(not public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000a01', 'a0000000-0000-4000-8000-000000000004', 'visitor-abc123', 'desktop', 1, 1, '{}'), 'otro tenant');
select pg_temp.assert(not public.track_dossier_view('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01', 'a0000000-0000-4000-8000-000000000001', 'otro-visitante', 'desktop', 1, 1, '{}'), 'secuestro de visita');
do $$ begin
  perform 1 from public.dossier_view;
  raise exception 'ASSERT FAILED: anon lee visitas';
exception when insufficient_privilege then null; end $$;
reset role;

select pg_temp.assert((select duration_ms from public.dossier_view where id = 'a0000000-0000-4000-8000-000000000001') = 5000, 'la duración no baja');
select pg_temp.assert((select max_scroll from public.dossier_view where id = 'a0000000-0000-4000-8000-000000000001') = 80, 'el scroll sube');
select pg_temp.assert((select sections from public.dossier_view where id = 'a0000000-0000-4000-8000-000000000001')
  = '{"00000000-0000-4000-8000-00000017e001": 2000, "00000000-0000-4000-8000-00000017e002": 1500}'::jsonb, 'solo secciones del dossier, fusionadas');
select pg_temp.assert((select count(*) from public.notification where kind = 'dossier_opened' and user_id = '11111111-1111-4111-8111-111111111111') = 1, 'aviso al autor, una vez');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.dossier_view) = 1, 'el miembro ve las visitas');
do $$ begin
  insert into public.dossier_view (id, tenant_id, dossier_id, visitor) values (gen_random_uuid(), '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000d05501', 'falsa-visita');
  raise exception 'ASSERT FAILED: un miembro inventa visitas';
exception when insufficient_privilege then null; end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- otra empresa
select pg_temp.assert((select count(*) from public.dossier_view) = 0, 'otra empresa no ve nada');
reset role;

delete from public.dossier_view;
delete from public.notification where kind = 'dossier_opened';
update public.dossier set author_id = null where id = '00000000-0000-4000-8000-000000d05501';
