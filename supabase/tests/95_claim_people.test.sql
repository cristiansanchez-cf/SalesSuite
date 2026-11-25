-- La reserva llega hasta el próximo paso, y la X de Personas borra a quien queda suelto (migración 20270129).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('95959595-0000-4000-8000-000000000001', 'rep95@test'), ('95959595-0000-4000-8000-000000000002', 'otro95@test');
insert into public.membership (user_id, tenant_id, role) values
  ('95959595-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('95959595-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep');
insert into public.account (id, tenant_id, name, owner_id, claimed_until) values
  ('95959595-aaaa-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Sala 95', '95959595-0000-4000-8000-000000000001', now() + interval '20 days'),
  ('95959595-aaaa-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'Otra 95', '95959595-0000-4000-8000-000000000001', now() + interval '20 days');

set role authenticated;
set request.jwt.claim.sub = '95959595-0000-4000-8000-000000000001';
-- «Hasta el 20 de enero, nada»: el próximo paso a 60 días alarga la reserva (y el comercial no puede tocarla a mano).
update public.account set next_step_at = now() + interval '60 days', next_step = 'Hablar en enero' where id = '95959595-aaaa-4000-8000-000000000001';
select pg_temp.assert((select claimed_until > now() + interval '66 days' from public.account where id = '95959595-aaaa-4000-8000-000000000001'), 'la reserva llega al próximo paso + 7 días');
do $$ begin
  update public.account set claimed_until = now() + interval '300 days' where id = '95959595-aaaa-4000-8000-000000000001';
  raise exception 'ASSERT FAILED: el comercial cambia la reserva a mano';
exception when insufficient_privilege then null; end $$;
-- Un próximo paso cercano no la acorta.
update public.account set next_step_at = now() + interval '2 days' where id = '95959595-aaaa-4000-8000-000000000001';
select pg_temp.assert((select claimed_until > now() + interval '66 days' from public.account where id = '95959595-aaaa-4000-8000-000000000001'), 'no se acorta');

-- Personas: en dos empresas, quitarla de una no la borra; de la última, sí. Otro comercial no borra la de otro.
insert into public.crm_contact (id, tenant_id, name, owner_id) values ('95959595-cccc-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Mireia 95', '95959595-0000-4000-8000-000000000001');
insert into public.crm_contact_account (tenant_id, contact_id, account_id) values
  ('00000000-0000-4000-8000-000000000e01', '95959595-cccc-4000-8000-000000000001', '95959595-aaaa-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e01', '95959595-cccc-4000-8000-000000000001', '95959595-aaaa-4000-8000-000000000002');
delete from public.crm_contact_account where contact_id = '95959595-cccc-4000-8000-000000000001' and account_id = '95959595-aaaa-4000-8000-000000000001';
select pg_temp.assert(not public.crm_contact_drop_orphan('95959595-cccc-4000-8000-000000000001'), 'sigue en otra empresa: no se borra');
delete from public.crm_contact_account where contact_id = '95959595-cccc-4000-8000-000000000001';
set request.jwt.claim.sub = '95959595-0000-4000-8000-000000000002';
select pg_temp.assert(not public.crm_contact_drop_orphan('95959595-cccc-4000-8000-000000000001'), 'otro comercial no la borra');
set request.jwt.claim.sub = '95959595-0000-4000-8000-000000000001';
select pg_temp.assert(public.crm_contact_drop_orphan('95959595-cccc-4000-8000-000000000001'), 'suelta: se borra');
reset role;
select pg_temp.assert(not exists (select 1 from public.crm_contact where id = '95959595-cccc-4000-8000-000000000001'), 'ya no está');
