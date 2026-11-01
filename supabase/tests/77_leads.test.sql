-- Migración 20261215: leads de las webs. La entrada la escribe solo el servidor (service role); el equipo que gestiona
-- (admin, gerente, superadmin) los ve y cambia su etapa; un comercial no los ve; otro espacio tampoco.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('77777777-0000-4000-8000-000000000001', 'admin77@enjoy.test'),
  ('77777777-0000-4000-8000-000000000002', 'rep77@enjoy.test'),
  ('77777777-0000-4000-8000-000000000003', 'admin77@otro.test');
insert into public.membership (user_id, tenant_id, role) values
  ('77777777-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'admin'),
  ('77777777-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('77777777-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000a01', 'admin');

-- La migración deja preparados los ajustes de Enjoy (apagados, con su web en la lista). En local las migraciones van antes
-- que el seed: se crean igual que en la migración.
insert into public.lead_settings (tenant_id, brand, allowed_origins)
values ('00000000-0000-4000-8000-000000000e01', 'enjoy', array['https://enjoytheclub.es', 'https://corporativeweb-b0ce4--*.web.app'])
on conflict do nothing;
select pg_temp.assert((select not enabled and brand = 'enjoy' and 'https://enjoytheclub.es' = any(allowed_origins)
  from public.lead_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'ajustes de Enjoy creados y apagados');

-- El servidor (service role) escribe la entrada.
set role service_role;
insert into public.lead (id, tenant_id, email, email_kind, domain, name, type, attribution_first) values
  ('77000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'laura@salax.es', 'business', 'salax.es', 'Laura', 'venue', '{"utm_source":"google"}');
insert into public.lead_submission (tenant_id, lead_id, idempotency_key, schema, type, fields) values
  ('00000000-0000-4000-8000-000000000e01', '77000000-0000-4000-8000-0000000000a1', 'k77-1', 'enjoy.lead.v2', 'venue', '{"venue_name":"Sala X"}');
insert into public.lead_message (id, tenant_id, lead_id, channel, step, to_addr, send_at) values
  ('77000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', '77000000-0000-4000-8000-0000000000a1', 'whatsapp', 'wa2', '+34600123123', now() + interval '1 day');
do $$ begin
  insert into public.lead_submission (tenant_id, lead_id, idempotency_key, schema, type) values
    ('00000000-0000-4000-8000-000000000e01', '77000000-0000-4000-8000-0000000000a1', 'k77-1', 'enjoy.lead.v2', 'venue');
  raise exception 'ASSERT FAILED: misma clave de idempotencia dos veces';
exception when unique_violation then null; end $$;
do $$ begin
  insert into public.lead (tenant_id, email, email_kind, name, type) values ('00000000-0000-4000-8000-000000000e01', 'Laura@SalaX.es', 'business', 'L', 'venue');
  raise exception 'ASSERT FAILED: email con mayúsculas';
exception when check_violation then null; end $$;
reset role;

set role authenticated;
-- Admin de Enjoy: ve, cambia la etapa, apunta notas y cancela lo pendiente.
set request.jwt.claim.sub = '77777777-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.lead where id = '77000000-0000-4000-8000-0000000000a1') = 1, 'el admin ve el lead');
select pg_temp.assert((select count(*) from public.lead_submission where lead_id = '77000000-0000-4000-8000-0000000000a1') = 1, 'y su envío');
update public.lead set stage = 'contacted', stage_at = now(), validated_at = now(), validated_by = auth.uid() where id = '77000000-0000-4000-8000-0000000000a1';
insert into public.lead_event (tenant_id, lead_id, kind, from_stage, to_stage, by_user) values
  ('00000000-0000-4000-8000-000000000e01', '77000000-0000-4000-8000-0000000000a1', 'stage', 'new', 'contacted', auth.uid());
update public.lead_message set status = 'cancelled' where id = '77000000-0000-4000-8000-0000000000b1';
do $$ begin
  update public.lead set email = 'otro@x.es' where id = '77000000-0000-4000-8000-0000000000a1';
  raise exception 'ASSERT FAILED: el equipo cambia el email que llegó de la web';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.lead set attribution_first = '{}' where id = '77000000-0000-4000-8000-0000000000a1';
  raise exception 'ASSERT FAILED: el equipo pisa la primera atribución';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.lead (tenant_id, email, email_kind, name, type) values ('00000000-0000-4000-8000-000000000e01', 'x@y.es', 'business', 'X', 'venue');
  raise exception 'ASSERT FAILED: el equipo inserta leads';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.lead_event (tenant_id, lead_id, kind, by_user) values
    ('00000000-0000-4000-8000-000000000e01', '77000000-0000-4000-8000-0000000000a1', 'message_in', auth.uid());
  raise exception 'ASSERT FAILED: el equipo se inventa un mensaje recibido';
exception when insufficient_privilege then null; end $$;
do $$ declare n int; begin
  update public.lead_message set status = 'sent' where lead_id = '77000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'el equipo marca un mensaje como enviado');
end $$;

-- Un comercial de Enjoy: no ve los leads (los valida quien gestiona).
set request.jwt.claim.sub = '77777777-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.lead) = 0, 'un comercial no ve leads');
select pg_temp.assert((select count(*) from public.lead_settings) = 0, 'ni los ajustes');

-- El admin de otro espacio: nada de Enjoy.
set request.jwt.claim.sub = '77777777-0000-4000-8000-000000000003';
select pg_temp.assert((select count(*) from public.lead where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro espacio no ve leads');
do $$ declare n int; begin
  update public.lead set stage = 'spam' where id = '77000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count; perform pg_temp.assert(n = 0, 'otro espacio cambia la etapa');
end $$;
do $$ begin
  insert into public.lead_settings (tenant_id, brand) values ('00000000-0000-4000-8000-000000000e01', 'robada');
  raise exception 'ASSERT FAILED: otro espacio crea ajustes en Enjoy';
exception when insufficient_privilege then null; end $$;
reset role;

select pg_temp.assert((select stage = 'contacted' and validated_at is not null from public.lead where id = '77000000-0000-4000-8000-0000000000a1'), 'la etapa la cambió el admin');
select pg_temp.assert((select status = 'cancelled' from public.lead_message where id = '77000000-0000-4000-8000-0000000000b1'), 'el envío pendiente se canceló');
delete from public.lead where id = '77000000-0000-4000-8000-0000000000a1';
delete from public.membership where user_id in ('77777777-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000003');

-- Claves de Resend (20261216): las escribe y lee solo el servidor; un admin no las ve ni las toca.
set role service_role;
insert into public.lead_secret (tenant_id, resend_key_enc) values ('00000000-0000-4000-8000-000000000e01', 'v1:cifrada');
reset role;
insert into public.membership (user_id, tenant_id, role) values ('77777777-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'admin');
set role authenticated;
set request.jwt.claim.sub = '77777777-0000-4000-8000-000000000001';
do $$ begin
  perform 1 from public.lead_secret;
  raise exception 'ASSERT FAILED: un admin lee las claves cifradas';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.lead_secret set resend_key_enc = 'x';
  raise exception 'ASSERT FAILED: un admin cambia la clave sin pasar por el servidor';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.lead_secret where tenant_id = '00000000-0000-4000-8000-000000000e01';
delete from public.membership where user_id = '77777777-0000-4000-8000-000000000001';
