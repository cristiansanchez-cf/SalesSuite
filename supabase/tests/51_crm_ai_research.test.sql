-- Investigación con IA (docs/CRM_DINAMICO.md §13): se guarda sin reservar la empresa, solo libre o mía, y aceptar un
-- dato de contacto solo rellena huecos.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.account (id, tenant_id, name, website) values
  ('51000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Libre 51', 'https://a-mano.test'),
  ('51000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Ajena 51', null);
update public.account set owner_id = '22222222-2222-4222-8222-222222222222', claimed_until = now() + interval '10 days' where id = '51000000-0000-4000-8000-0000000000a2';

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
select public.account_ai_research('51000000-0000-4000-8000-0000000000a1', '{"at":"2026-10-09","suggestions":[]}');
select pg_temp.assert((select ai_research->>'at' = '2026-10-09' and ai_research_at is not null and owner_id is null from public.account where id = '51000000-0000-4000-8000-0000000000a1'), 'guarda la investigación sin reservar');
select public.account_ai_research('51000000-0000-4000-8000-0000000000a1', '{"at":"2026-10-09","suggestions":[]}', '{"email":"Hola@X.test","website":"https://ia.test"}');
select pg_temp.assert((select email = 'hola@x.test' and website = 'https://a-mano.test' from public.account where id = '51000000-0000-4000-8000-0000000000a1'), 'rellena huecos y no pisa lo escrito');
do $$ begin
  perform public.account_ai_research('51000000-0000-4000-8000-0000000000a2', '{"at":"x"}');
  raise exception 'ASSERT FAILED: investiga la de otro';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.account_ai_research('51000000-0000-4000-8000-0000000000a1', '[1,2]');
  raise exception 'ASSERT FAILED: guarda algo que no es un objeto';
exception when check_violation then null; end $$;

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- otro espacio
do $$ begin
  perform public.account_ai_research('51000000-0000-4000-8000-0000000000a1', '{"at":"x"}');
  raise exception 'ASSERT FAILED: otro espacio investiga';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.account where id in ('51000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-0000000000a2');
