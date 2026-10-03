-- Colaboradores (partners): ven solo lo permitido, nunca la tarifa, y no tocan precios.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- Alta (como plataforma): DJ con Tabs·Experiencias (450 €) y Tabs·Locales (300 €); 3 locales con políticas distintas.
insert into auth.users (id, email) values ('55555555-5555-4555-8555-555555555555', 'dj@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values ('55555555-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000e01', 'partner');
insert into public.partner_profile (tenant_id, user_id, module_ids, welcome_note) values
  ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555',
   '{00000000-0000-4000-8000-00000000e102,00000000-0000-4000-8000-00000000e103}', 'Hola Dani');
insert into public.partner_account (id, tenant_id, user_id, name, segment_id, price_policy, price_adjust_pct) values
  ('99999999-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Sala Oculta', '00000000-0000-4000-8000-0000005e0002', 'hidden', 0),
  ('99999999-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Club Neón', '00000000-0000-4000-8000-0000005e0002', 'adjusted', -10),
  ('99999999-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Terraza Sur', '00000000-0000-4000-8000-0000005e0002', 'list', 0);
-- Un truco del equipo sobre un módulo permitido.
insert into public.play_contribution (tenant_id, type, module_id, kind, title, body, status, author_id) values
  ('00000000-0000-4000-8000-000000000e01', 'tip', '00000000-0000-4000-8000-00000000e102', 'tip', 'Truco interno', 'x', 'shared', '11111111-1111-4111-8111-111111111111');

-- Perfil de partner solo con rol partner.
do $$ begin
  insert into public.partner_profile (tenant_id, user_id) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111');
  raise exception 'ASSERT FAILED: perfil de partner para un rep';
exception when check_violation then null; end $$;

-- Jugadas que debería ver: oficiales, no 'team', sin monetización, generales o de sus módulos.
select count(*) as expected_plays from public.play
where tenant_id = '00000000-0000-4000-8000-000000000e01' and status = 'official' and audience <> 'team' and kind <> 'monetization'
  and (module_id is null or module_id in ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-00000000e103')) \gset
update public.play set audience = 'team' where key = 'empresa-pitch';  -- reservada al equipo: no la ve

-- ---------------------------------------------------------------- como partner
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select pg_temp.assert((select count(*) from public.tenant) = 1, 'partner ve su tenant');
select pg_temp.assert((select count(*) from public.membership) = 1, 'partner solo ve su membership');
select pg_temp.assert((select count(*) from public.users) = 1, 'partner solo se ve a sí mismo');
select pg_temp.assert((select count(*) from public.dossier) = 0, 'partner no ve dossiers del equipo');
select pg_temp.assert((select count(*) from public.dossier_item) = 0, 'partner no ve items del equipo');
select pg_temp.assert((select count(*) from public.share_link) = 0, 'partner no ve enlaces del equipo');
select pg_temp.assert((select count(*) from public.dossier_contact) = 0, 'partner no ve contactos del equipo');
select pg_temp.assert((select count(*) from public.module) = 2, 'partner ve solo sus 2 módulos');
select pg_temp.assert((select count(*) from public.module_version) = 0, 'partner no lee module_version (tarifa)');
select pg_temp.assert((select count(*) from public.partner_catalog('00000000-0000-4000-8000-000000000e01')) = 2, 'catálogo del partner: 2 versiones');
select pg_temp.assert(not (select bool_or(to_jsonb(c) ? 'default_price') from public.partner_catalog('00000000-0000-4000-8000-000000000e01') c), 'catálogo sin precios');
select pg_temp.assert((select count(*) from public.partner_account) = 3, 'partner ve sus 3 cuentas');
select pg_temp.assert((select count(*) from public.partner_profile) = 1, 'partner ve su perfil');
select pg_temp.assert((select count(*) from public.play) = :expected_plays - 1, 'partner ve solo jugadas permitidas');
select pg_temp.assert((select count(*) from public.play where kind = 'monetization') = 0, 'partner no ve monetización');
select pg_temp.assert((select count(*) from public.play_contribution) = 0, 'partner no ve trucos del equipo (por defecto)');
select pg_temp.assert((select count(*) from public.segment) = 1, 'partner ve solo el sector de sus cuentas');
select pg_temp.assert((select count(*) from public.persona) = (select count(*) from public.persona where segment_id = '00000000-0000-4000-8000-0000005e0002'), 'partner ve actores de ese sector');
select pg_temp.assert((select count(*) from public.play_feedback) = 0, 'partner no ve votos del equipo');

-- No puede tocar su perfil ni sus cuentas.
update public.partner_profile set module_ids = '{00000000-0000-4000-8000-00000000e101}';
select pg_temp.assert((select cardinality(module_ids) from public.partner_profile) = 2, 'partner no se amplía módulos');
update public.partner_account set price_policy = 'list' where id = '99999999-0000-4000-8000-000000000001';
select pg_temp.assert((select price_policy::text from public.partner_account where id = '99999999-0000-4000-8000-000000000001') = 'hidden', 'partner no cambia la política de precio');

-- Dossier sin cuenta → no.
do $$ begin
  insert into public.dossier (tenant_id, author_id, title) values ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'x');
  raise exception 'ASSERT FAILED: dossier de partner sin cuenta';
exception when insufficient_privilege then null; end $$;
-- Cuenta de otro → no (la cuenta no es suya: el admin no la creó para él).
do $$ begin
  insert into public.dossier (tenant_id, author_id, title, partner_account_id)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'x', '99999999-0000-4000-8000-000000000002');
  raise exception 'ASSERT FAILED: dossier a nombre de otro';
exception when insufficient_privilege then null; end $$;

-- Club Neón (−10 %): el precio lo pone la política aunque intente otro.
insert into public.dossier (id, tenant_id, author_id, title, partner_account_id, price_mode, total_price)
values ('99999999-1111-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Neón', '99999999-0000-4000-8000-000000000002', 'total', 1);
select pg_temp.assert((select price_mode::text from public.dossier where id = '99999999-1111-4000-8000-000000000002') = 'per_module', 'política ajustada → precio por módulo');
select pg_temp.assert((select total_price from public.dossier where id = '99999999-1111-4000-8000-000000000002') is null, 'partner no fija total');
insert into public.dossier_item (id, dossier_id, module_version_id, position, price_override)
values ('99999999-2222-4000-8000-000000000001', '99999999-1111-4000-8000-000000000002', '00000000-0000-4000-8000-0000000e1021', 1024, 1);
select pg_temp.assert((select price_override from public.dossier_item where id = '99999999-2222-4000-8000-000000000001') = 405.00, '450 € −10 % = 405 €');
update public.dossier_item set price_override = 1, visible = false where id = '99999999-2222-4000-8000-000000000001';
select pg_temp.assert((select price_override from public.dossier_item where id = '99999999-2222-4000-8000-000000000001') = 405.00, 'partner no cambia el precio del item');
select pg_temp.assert((select not visible from public.dossier_item where id = '99999999-2222-4000-8000-000000000001'), 'pero sí la visibilidad');
update public.dossier set price_mode = 'none', title = 'Neón 2027' where id = '99999999-1111-4000-8000-000000000002';
select pg_temp.assert((select price_mode::text || title from public.dossier where id = '99999999-1111-4000-8000-000000000002') = 'per_moduleNeón 2027', 'partner no cambia el modo de precio (sí el título)');
do $$ begin
  update public.dossier set partner_account_id = '99999999-0000-4000-8000-000000000001' where id = '99999999-1111-4000-8000-000000000002';
  raise exception 'ASSERT FAILED: partner cambió la cuenta';
exception when insufficient_privilege then null; end $$;
-- Módulo no permitido (Portada para bodas) → no.
do $$ begin
  insert into public.dossier_item (dossier_id, module_version_id, position) values ('99999999-1111-4000-8000-000000000002', '00000000-0000-4000-8000-0000000e1011', 2048);
  raise exception 'ASSERT FAILED: módulo no permitido';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert((select price_override from public.partner_items('{99999999-1111-4000-8000-000000000002}')) = 405.00, 'partner_items: precio de la cuenta');
select pg_temp.assert(not (select bool_or(to_jsonb(i) ? 'default_price') from public.partner_items('{99999999-1111-4000-8000-000000000002}') i), 'partner_items sin tarifa');
select pg_temp.assert((select count(*) from public.partner_items('{00000000-0000-4000-8000-000000d05501}')) = 0, 'partner_items: no lee dossiers ajenos');

-- Sala Oculta: sin precios.
insert into public.dossier (id, tenant_id, author_id, title, partner_account_id)
values ('99999999-1111-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Oculta', '99999999-0000-4000-8000-000000000001');
insert into public.dossier_item (dossier_id, module_version_id, position) values ('99999999-1111-4000-8000-000000000001', '00000000-0000-4000-8000-0000000e1031', 1024);
select pg_temp.assert((select price_mode::text from public.dossier where id = '99999999-1111-4000-8000-000000000001') = 'none', 'política oculta → sin precio');
select pg_temp.assert((select price_override from public.dossier_item where dossier_id = '99999999-1111-4000-8000-000000000001') is null, 'oculta → item sin precio');
-- Enlace y publicación: sí.
insert into public.share_link (dossier_id) values ('99999999-1111-4000-8000-000000000001');
update public.dossier set status = 'published' where id = '99999999-1111-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.dossier) = 2, 'partner ve sus 2 dossiers');
delete from public.dossier where id = '99999999-1111-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.dossier) = 2, 'partner no borra un dossier publicado');
-- No aporta al playbook.
do $$ begin
  insert into public.play_contribution (tenant_id, type, kind, title, body, status, author_id)
  values ('00000000-0000-4000-8000-000000000e01', 'tip', 'tip', 't', 'b', 'shared', '55555555-5555-4555-8555-555555555555');
  raise exception 'ASSERT FAILED: partner aportó';
exception when insufficient_privilege then null; end $$;
-- Su progreso sí.
insert into public.learning_progress (tenant_id, user_id, topic) values ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'general');
reset role;

-- ---------------------------------------------------------------- equipo interno
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.partner_profile) = 0, 'rep no ve perfiles de partner');
select pg_temp.assert((select count(*) from public.partner_account) = 0, 'rep no ve cuentas de partner');
select pg_temp.assert((select count(*) from public.users where email = 'dj@enjoy.test') = 1, 'rep ve al partner como compañero (autor)');
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
-- Una propuesta de Club Neón ya enviada al cliente (a −10 %).
insert into public.dossier (id, tenant_id, author_id, title, partner_account_id, status, published_at)
values ('99999999-1111-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', '22222222-2222-4222-8222-222222222222', 'Neón enviado', '99999999-0000-4000-8000-000000000002', 'published', now());
insert into public.dossier_item (id, dossier_id, module_version_id, position, price_override)
values ('99999999-2222-4000-8000-000000000003', '99999999-1111-4000-8000-000000000003', '00000000-0000-4000-8000-0000000e1021', 1024, 405);
-- Admin cambia la política de Club Neón → se reprecian los borradores; lo enviado conserva su precio.
update public.partner_account set price_policy = 'list' where id = '99999999-0000-4000-8000-000000000002';
select pg_temp.assert((select price_override from public.dossier_item where id = '99999999-2222-4000-8000-000000000001') = 450.00, 'tarifa → 450 €');
select pg_temp.assert((select price_override from public.dossier_item where id = '99999999-2222-4000-8000-000000000003') = 405.00, 'lo ya enviado no se toca sin pedirlo');
update public.partner_account set price_policy = 'hidden' where id = '99999999-0000-4000-8000-000000000002';
select pg_temp.assert((select price_mode::text from public.dossier where id = '99999999-1111-4000-8000-000000000002') = 'none', 'oculta → dossier sin precio');
-- El admin sí puede fijar precios a mano en el dossier del partner.
update public.dossier_item set price_override = 399 where id = '99999999-2222-4000-8000-000000000001';
select pg_temp.assert((select price_override from public.dossier_item where id = '99999999-2222-4000-8000-000000000001') = 399, 'admin fija precio a mano');
update public.partner_profile set see_team_tips = true;
reset role;

set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select pg_temp.assert((select count(*) from public.play_contribution) = 1, 'con permiso, ve los trucos de sus módulos');
reset role;

-- Caducidad: fuera.
update public.partner_profile set expires_at = now() - interval '1 minute';
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select pg_temp.assert((select count(*) from public.dossier) = 0, 'caducado: no ve sus dossiers');
select pg_temp.assert((select count(*) from public.partner_catalog('00000000-0000-4000-8000-000000000e01')) = 0, 'caducado: sin catálogo');
select pg_temp.assert((select count(*) from public.play) = 0, 'caducado: sin playbook');
select pg_temp.assert((select count(*) from public.partner_profile) = 1, 'caducado: ve su perfil (para explicarle)');
update public.dossier set title = 'tarde' where id = '99999999-1111-4000-8000-000000000002';
reset role;
select pg_temp.assert((select title from public.dossier where id = '99999999-1111-4000-8000-000000000002') = 'Neón 2027', 'caducado: no edita');

-- Limpieza (los siguientes tests de integración no cuentan con él).
delete from public.dossier where author_id = '55555555-5555-4555-8555-555555555555';
delete from public.play_contribution where title = 'Truco interno';
update public.play set audience = 'all' where key = 'empresa-pitch';
delete from auth.users where id = '55555555-5555-4555-8555-555555555555';
