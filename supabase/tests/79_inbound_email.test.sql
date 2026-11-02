-- Migración 20261221: cada persona tiene su dirección por espacio (solo la ve ella) y ve sus correos recibidos.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('79797979-0000-4000-8000-000000000001', 'rep79@enjoy.test'),
  ('79797979-0000-4000-8000-000000000002', 'otro79@enjoy.test'),
  ('79797979-0000-4000-8000-000000000003', 'fuera79@otro.test');
insert into public.membership (user_id, tenant_id, role) values
  ('79797979-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('79797979-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('79797979-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000a01', 'rep');

set role authenticated;
set request.jwt.claim.sub = '79797979-0000-4000-8000-000000000001';
select pg_temp.assert(public.inbound_address_get('00000000-0000-4000-8000-000000000e01') ~ '^[a-z0-9]{24}$', 'dirección creada');
select pg_temp.assert(public.inbound_address_get('00000000-0000-4000-8000-000000000e01') = (select token from public.inbound_address), 'la misma la segunda vez y la ve');
do $$ declare old text; neu text; begin
  select token into old from public.inbound_address;
  neu := public.inbound_address_rotate('00000000-0000-4000-8000-000000000e01');
  if neu = old or (select count(*) from public.inbound_address) <> 1 then raise exception 'ASSERT FAILED: cambiar la dirección'; end if;
end $$;
do $$ begin
  perform public.inbound_address_get('00000000-0000-4000-8000-000000000a01');
  raise exception 'ASSERT FAILED: dirección en un espacio ajeno';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.inbound_address (token, tenant_id, user_id) values ('abcdefghijabcdefghijabcd', '00000000-0000-4000-8000-000000000e01', '79797979-0000-4000-8000-000000000001');
  raise exception 'ASSERT FAILED: insertar a mano';
exception when insufficient_privilege then null; end $$;

-- Otra persona no ve mi dirección.
set request.jwt.claim.sub = '79797979-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.inbound_address) = 0, 'no ve la dirección de otro');
reset role;

-- Lo recibido lo escribe el servidor; cada uno ve lo suyo y solo cambia estado y empresa.
insert into public.inbound_email (tenant_id, user_id, provider_id, message_id, status, subject)
values ('00000000-0000-4000-8000-000000000e01', '79797979-0000-4000-8000-000000000001', 'p1', '<m1@x>', 'unmatched', 'Hola');
set role authenticated;
set request.jwt.claim.sub = '79797979-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.inbound_email) = 0, 'un comercial no ve los correos de otro');
set request.jwt.claim.sub = '79797979-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.inbound_email) = 1, 've los suyos');
update public.inbound_email set status = 'ignored' where provider_id = 'p1';
select pg_temp.assert((select status from public.inbound_email) = 'ignored', 'lo marca');
do $$ begin
  update public.inbound_email set subject = 'otro' where provider_id = 'p1';
  raise exception 'ASSERT FAILED: cambiar el asunto';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.inbound_email (tenant_id, user_id, provider_id, message_id, status) values ('00000000-0000-4000-8000-000000000e01', '79797979-0000-4000-8000-000000000001', 'p2', '<m2@x>', 'logged');
  raise exception 'ASSERT FAILED: insertar desde el navegador';
exception when insufficient_privilege then null; end $$;
reset role;

delete from auth.users where email in ('rep79@enjoy.test', 'otro79@enjoy.test', 'fuera79@otro.test');
delete from public.users where email in ('rep79@enjoy.test', 'otro79@enjoy.test', 'fuera79@otro.test');

-- Buscar empresa por email o dominio (con la RLS de quien busca).
reset request.jwt.claim.sub;
insert into auth.users (id, email) values ('79797979-0000-4000-8000-000000000009', 'rep79b@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values ('79797979-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000e01', 'admin');
insert into public.account (id, tenant_id, name, email, website) values
  ('79797979-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Grupo Salamandra 79', null, 'https://www.grupo-salamandra79.com/'),
  ('79797979-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Sala X 79', 'Info@SalaX79.es', null);
insert into public.crm_contact (id, tenant_id, name, email) values ('79797979-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000e01', 'Marta 79', 'Marta@Grupo-Salamandra79.com');
insert into public.crm_contact_account (tenant_id, contact_id, account_id) values ('00000000-0000-4000-8000-000000000e01', '79797979-0000-4000-8000-0000000000c1', '79797979-0000-4000-8000-0000000000a1');
set role authenticated;
set request.jwt.claim.sub = '79797979-0000-4000-8000-000000000009';
select pg_temp.assert((select account_id from public.crm_find_by_email('00000000-0000-4000-8000-000000000e01', array['marta@grupo-salamandra79.com']) where kind = 'contact') = '79797979-0000-4000-8000-0000000000a1', 'persona → su empresa');
select pg_temp.assert((select account_id from public.crm_find_by_email('00000000-0000-4000-8000-000000000e01', array['info@salax79.es'])) = '79797979-0000-4000-8000-0000000000a2', 'email de la empresa, sin mayúsculas');
select pg_temp.assert((select account_id from public.crm_find_by_email('00000000-0000-4000-8000-000000000e01', array['otro@grupo-salamandra79.com'], array['grupo-salamandra79.com']) where kind = 'domain') = '79797979-0000-4000-8000-0000000000a1', 'por el dominio de la web');
select pg_temp.assert((select count(*) from public.crm_find_by_email('00000000-0000-4000-8000-000000000e01', array['nadie@nada.es'], array['nada.es'])) = 0, 'nada');
-- Desde otro espacio, nada.
set request.jwt.claim.sub = '79797979-0000-4000-8000-000000000003';
select pg_temp.assert((select count(*) from public.crm_find_by_email('00000000-0000-4000-8000-000000000e01', array['info@salax79.es'])) = 0, 'otro espacio no ve nada');
reset role;
delete from public.account where id in ('79797979-0000-4000-8000-0000000000a1', '79797979-0000-4000-8000-0000000000a2');
delete from public.crm_contact where id = '79797979-0000-4000-8000-0000000000c1';
delete from auth.users where email = 'rep79b@enjoy.test';
delete from public.users where email = 'rep79b@enjoy.test';
