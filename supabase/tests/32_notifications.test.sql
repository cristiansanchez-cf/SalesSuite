-- Avisos: los crean triggers a partir de hechos; cada uno ve y marca solo los suyos.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('66666666-6666-4666-8666-666666666661', 'jefa-n@enjoy.test'),
  ('77777777-7777-4777-8777-777777777771', 'dj-n@enjoy.test'),
  ('88888888-8888-4888-8888-888888888881', 'rep-n@enjoy.test'),
  ('99999999-9999-4999-8999-999999999991', 'dj-n2@enjoy.test');
update public.users set display_name = 'DJ Antonio' where id = '77777777-7777-4777-8777-777777777771';
update public.users set display_name = 'DJ Sebastián' where id = '99999999-9999-4999-8999-999999999991';
insert into public.membership (user_id, tenant_id, role) values ('66666666-6666-4666-8666-666666666661', '00000000-0000-4000-8000-000000000e01', 'lead');
insert into public.membership (user_id, tenant_id, role) values ('77777777-7777-4777-8777-777777777771', '00000000-0000-4000-8000-000000000e01', 'partner');
insert into public.partner_profile (tenant_id, user_id, module_ids, can_invite) values ('00000000-0000-4000-8000-000000000e01', '77777777-7777-4777-8777-777777777771', '{00000000-0000-4000-8000-00000000e102}', true);
delete from public.notification;  -- los tests anteriores también generan avisos
select pg_temp.assert((select count(*) from public.notification) = 0, 'altas hechas por la plataforma: sin avisos');

-- La jefa suma a un comercial → aviso informativo a los admins.
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666661';
insert into public.membership (user_id, tenant_id, role) values ('88888888-8888-4888-8888-888888888881', '00000000-0000-4000-8000-000000000e01', 'rep');
reset role;
select pg_temp.assert((select count(*) from public.notification where kind = 'member_added' and severity = 'info'
  and user_id = '22222222-2222-4222-8222-222222222222' and params->>'inviter' = 'jefa-n@enjoy.test') = 1, 'admin: la jefa ha añadido a alguien');
select pg_temp.assert((select count(*) from public.notification where kind = 'member_added' and user_id = '66666666-6666-4666-8666-666666666661') = 0, 'quien invita no se avisa a sí misma');

-- Un DJ trae a otro (referido) → aviso de acción a los admins, con quién invitó a quién.
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777771';
select public.partner_invite_partner('00000000-0000-4000-8000-000000000e01', '99999999-9999-4999-8999-999999999991');
-- Y propone un truco → pendiente de revisión.
insert into public.play_contribution (id, tenant_id, type, module_id, kind, title, body, status, author_id)
values ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'tip', '00000000-0000-4000-8000-00000000e102', 'tip', 'Truco de cabina', 'x', 'pending', '77777777-7777-4777-8777-777777777771');
-- No ve avisos ajenos ni puede crearlos.
select pg_temp.assert((select count(*) from public.notification) = 0, 'el colaborador no ve avisos de otros');
do $$ begin
  insert into public.notification (tenant_id, user_id, kind, severity, entity_key)
  values ('00000000-0000-4000-8000-000000000e01', '22222222-2222-4222-8222-222222222222', 'fake_kind', 'action', 'x');
  raise exception 'ASSERT FAILED: un cliente fabricó un aviso';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.assert((select params->>'inviter' || ' → ' || (params->>'name') from public.notification
  where kind = 'partner_referred' and user_id = '22222222-2222-4222-8222-222222222222') = 'DJ Antonio → DJ Sebastián', 'admin sabe quién invitó a quién');
select pg_temp.assert((select count(*) from public.notification where kind = 'partner_referred' and user_id = '66666666-6666-4666-8666-666666666661') = 0, 'referidos: solo admins');
select pg_temp.assert((select count(*) from public.notification where kind = 'contribution_pending' and entity_key = 'cccccccc-0000-4000-8000-000000000001') = 2, 'aporte pendiente: admin y jefa');

-- El admin ve los suyos, los marca como leídos y no puede tocar nada más.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select count(*) from public.notification) = 3, 'admin ve sus 3 avisos');
update public.notification set read_at = now() where kind = 'partner_referred';
select pg_temp.assert((select read_at is not null from public.notification where kind = 'partner_referred'), 'marcado como leído');
do $$ begin
  update public.notification set params = '{}'::jsonb;
  raise exception 'ASSERT FAILED: cambió el contenido de un aviso';
exception when insufficient_privilege then null; end $$;
-- Revisa el aporte → el aviso queda resuelto para todos.
update public.play_contribution set status = 'accepted', reviewed_by = '22222222-2222-4222-8222-222222222222', reviewed_at = now()
 where id = 'cccccccc-0000-4000-8000-000000000001';
reset role;
select pg_temp.assert((select count(*) from public.notification where kind = 'contribution_pending' and resolved_at is not null) = 2, 'aporte revisado → resuelto para admin y jefa');

-- La jefa no ve los del admin.
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666661';
select pg_temp.assert((select count(*) from public.notification) = 1, 'la jefa ve solo el suyo');
-- Documenta un cierre → aviso informativo al admin (no a ella).
insert into public.win_story (tenant_id, author_id, outcome, title, what_worked)
values ('00000000-0000-4000-8000-000000000e01', '66666666-6666-4666-8666-666666666661', 'won', 'Club Norte', 'La demo con el DJ');
reset role;
select pg_temp.assert((select count(*) from public.notification where kind = 'story_shared' and user_id = '22222222-2222-4222-8222-222222222222') = 1, 'cierre documentado → admin');
select pg_temp.assert((select count(*) from public.notification where kind = 'story_shared' and user_id = '66666666-6666-4666-8666-666666666661') = 0, 'la autora no se avisa');

delete from public.win_story where title = 'Club Norte';
delete from public.play_contribution where id = 'cccccccc-0000-4000-8000-000000000001';
delete from auth.users where email in ('jefa-n@enjoy.test', 'dj-n@enjoy.test', 'rep-n@enjoy.test', 'dj-n2@enjoy.test');
delete from public.notification;
