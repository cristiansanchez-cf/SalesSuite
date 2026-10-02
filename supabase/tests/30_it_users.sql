-- Usuarios/membresías de los tests de integración (mismos ids que DEMO_USERS y service.contract.ts).
-- Borra usuarios creados por tests anteriores (invitaciones).
delete from auth.users where id not in (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'rep@enjoy.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin@enjoy.test'),
  ('33333333-3333-4333-8333-333333333333', 'rep@retheme.test')
on conflict do nothing;
insert into public.membership (user_id, tenant_id, role) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000e01', 'admin'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000a01', 'rep')
on conflict do nothing;
