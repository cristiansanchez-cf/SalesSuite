-- Migración 20261214: el superadmin (admin de cualquier espacio sin ser miembro, docs/ORG.md) puede usar la ficha del
-- CRM: «Es este» de Google, guardar lo investigado, cualificar y descartar. Quien no es del espacio, sigue sin poder.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('76767676-0000-4000-8000-000000000001', 'super@cofundo76.test'),
  ('76767676-0000-4000-8000-000000000002', 'fuera@otro76.test');
insert into public.platform_admin (user_id) values ('76767676-0000-4000-8000-000000000001');
-- Una empresa de Re-tema que trabaja otra persona (así solo pasa quien gestiona el espacio).
insert into public.account (id, tenant_id, name, owner_id) values
  ('76000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a01', 'Mayorista 76', '22222222-2222-4222-8222-222222222222');

set role authenticated;
-- Alguien de fuera: nada.
set request.jwt.claim.sub = '76767676-0000-4000-8000-000000000002';
do $$ begin
  perform public.account_research('76000000-0000-4000-8000-0000000000a1', '{"placeId":"p76","phone":"+34 600 000 000"}');
  raise exception 'ASSERT FAILED: alguien de fuera guarda la ficha de Google';
exception when insufficient_privilege then null; end $$;

-- El superadmin, sin ser miembro de Re-tema.
set request.jwt.claim.sub = '76767676-0000-4000-8000-000000000001';
select public.account_research('76000000-0000-4000-8000-0000000000a1', '{"placeId":"p76","phone":"+34 600 000 000","website":"https://mayorista76.test"}');
select public.account_ai_research('76000000-0000-4000-8000-0000000000a1', '{"summary":"x"}', null);
select public.account_qualify('76000000-0000-4000-8000-0000000000a1', '{}');
select public.account_classify('76000000-0000-4000-8000-0000000000a1', null, 'other', 'prueba');
reset role;
select pg_temp.assert((select place_id = 'p76' and phone = '+34 600 000 000' and ai_research_at is not null and discard_reason = 'other'
  from public.account where id = '76000000-0000-4000-8000-0000000000a1'), 'el superadmin guarda Google, investigación y descarte');
delete from public.account where id = '76000000-0000-4000-8000-0000000000a1';
