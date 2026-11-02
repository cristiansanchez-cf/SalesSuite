-- Migración 20261222: plazos por espacio, prueba de consentimiento bloqueada, registros y candidatos del borrado diario.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- Por defecto (Enjoy): 24 meses, 6 meses, 30 días, 5 años y el WhatsApp 2 encendido.
select pg_temp.assert((select (retention_lead_months, retention_spam_months, retention_test_days, retention_proof_years, whatsapp_wa2_enabled)
  = (24::smallint, 6::smallint, 30::smallint, 5::smallint, true) from public.lead_settings where brand = 'enjoy'), 'valores por defecto');
do $$ begin
  update public.lead_settings set retention_test_days = 200 where brand = 'enjoy';
  raise exception 'ASSERT FAILED: pruebas más de 183 días';
exception when check_violation then null; end $$;

insert into auth.users (id, email) values ('80808080-0000-4000-8000-000000000001', 'admin80@enjoy.test'), ('80808080-0000-4000-8000-000000000002', 'rep80@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values
  ('80808080-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'admin'),
  ('80808080-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep');

-- Leads: uno antiguo sin contratar, uno antiguo pero que volvió a escribir, spam, una prueba vieja, uno validado y uno ganado.
insert into public.lead (id, tenant_id, email, email_kind, name, type, created_at, stage_at, last_submission_at, last_inbound_at, is_test, quarantined, stage, validated_at) values
  ('80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'viejo@x.es', 'business', 'Viejo', 'venue', now() - interval '30 months', now() - interval '30 months', now() - interval '30 months', null, false, false, 'contacted', null),
  ('80000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'volvio@x.es', 'business', 'Volvió', 'venue', now() - interval '30 months', now() - interval '30 months', now() - interval '30 months', now() - interval '2 months', false, false, 'replied', null),
  ('80000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', 'spam@x.es', 'business', 'Spam', 'venue', now() - interval '7 months', now() - interval '7 months', now() - interval '7 months', null, false, true, 'new', null),
  ('80000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000e01', 'test@x.es', 'business', 'Test', 'venue', now() - interval '40 days', now() - interval '1 day', now() - interval '1 day', null, true, false, 'new', null),
  ('80000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000e01', 'valid@x.es', 'business', 'Val', 'venue', now() - interval '30 months', now() - interval '30 months', now() - interval '30 months', null, false, false, 'contacted', now() - interval '30 months'),
  ('80000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000e01', 'gano@x.es', 'business', 'Ganó', 'venue', now() - interval '30 months', now() - interval '30 months', now() - interval '30 months', null, false, false, 'won', null);

select pg_temp.assert((select array_agg(id::text || ':' || kind order by id) from public.lead_purge_candidates('00000000-0000-4000-8000-000000000e01', now() - interval '24 months', now() - interval '6 months', now() - interval '30 days'))
  = array['80000000-0000-4000-8000-000000000001:lead', '80000000-0000-4000-8000-000000000003:spam', '80000000-0000-4000-8000-000000000004:test'], 'candidatos: viejo, spam y prueba (no lo que volvió, ni lo validado, ni lo ganado)');

-- El servidor anota la purga; con sesión no se puede cambiar la fecha ni leer la prueba bloqueada.
update public.lead_settings set last_purge_at = '2026-11-01T00:00:00Z' where brand = 'enjoy';
insert into public.lead_purge_log (tenant_id, anonymized, deleted, tests) values ('00000000-0000-4000-8000-000000000e01', 1, 1, 1);
insert into public.lead_consent_proof (tenant_id, subject_hash, received_at, consent, reason, delete_after)
values ('00000000-0000-4000-8000-000000000e01', 'h1:' || repeat('a', 64), now(), '{"legal_text_version":"x"}', 'purge', now() + interval '5 years');
insert into public.privacy_request (tenant_id, kind, subject_hash, by_user) values ('00000000-0000-4000-8000-000000000e01', 'erase', 'h1:' || repeat('a', 64), '80808080-0000-4000-8000-000000000001');

set role authenticated;
set request.jwt.claim.sub = '80808080-0000-4000-8000-000000000001';
update public.lead_settings set retention_lead_months = 18, last_purge_at = '2030-01-01T00:00:00Z' where brand = 'enjoy';
reset role;
select pg_temp.assert((select retention_lead_months = 18 and last_purge_at = '2026-11-01T00:00:00Z' from public.lead_settings where brand = 'enjoy'), 'el admin cambia los plazos, no la fecha del último borrado');
set role authenticated;
set request.jwt.claim.sub = '80808080-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.lead_purge_log) = 1, 'el admin ve el registro de borrados');
select pg_temp.assert((select count(*) from public.privacy_request) = 1, 'el admin ve el registro de peticiones');
do $$ begin
  perform 1 from public.lead_consent_proof;
  raise exception 'ASSERT FAILED: la prueba bloqueada no se lee con sesión';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.lead_purge_candidates('00000000-0000-4000-8000-000000000e01', now(), now(), now());
  raise exception 'ASSERT FAILED: candidatos con sesión';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.privacy_request (tenant_id, kind, subject_hash) values ('00000000-0000-4000-8000-000000000e01', 'export', 'h1:' || repeat('b', 64));
  raise exception 'ASSERT FAILED: registrar peticiones a mano';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.lead set anonymized_at = now() where id = '80000000-0000-4000-8000-000000000001';
  raise exception 'ASSERT FAILED: anonimizar con sesión';
exception when insufficient_privilege then null; end $$;
set request.jwt.claim.sub = '80808080-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.lead_purge_log) = 0 and (select count(*) from public.privacy_request) = 0, 'un comercial no ve los registros');
reset role;
reset request.jwt.claim.sub;
update public.lead_settings set retention_lead_months = 24 where brand = 'enjoy';
delete from public.lead where id::text like '80000000-%';
delete from public.lead_purge_log; delete from public.lead_consent_proof; delete from public.privacy_request;
