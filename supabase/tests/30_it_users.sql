-- Usuarios/membresías de los tests de integración (mismos ids que DEMO_USERS y service.contract.ts).
-- Borra usuarios creados por tests anteriores (invitaciones).
delete from auth.users where id not in (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555');
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'rep@enjoy.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin@enjoy.test'),
  ('33333333-3333-4333-8333-333333333333', 'rep@retheme.test'),
  ('55555555-5555-4555-8555-555555555555', 'dj@enjoy.test')
on conflict do nothing;
insert into public.membership (user_id, tenant_id, role) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000e01', 'admin'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-4000-8000-000000000a01', 'rep')
on conflict do nothing;

-- Colaborador de demo (= DEMO_PARTNER en src/lib/data/store.ts): DJ con 2 módulos y 3 locales.
insert into public.membership (user_id, tenant_id, role) values
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000e01', 'partner')
on conflict do nothing;
insert into public.partner_profile (tenant_id, user_id, module_ids, see_team_tips, welcome_note) values
  ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555',
   '{00000000-0000-4000-8000-00000000e102,00000000-0000-4000-8000-00000000e103}', false, '¡Hola, Dani!')
on conflict do nothing;
insert into public.partner_account (id, tenant_id, user_id, name, segment_id, price_policy, price_adjust_pct, notes, position) values
  ('00000000-0000-4000-8000-0000009a0001', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Sala Luna', '00000000-0000-4000-8000-0000005e0002', 'hidden', 0, 'El dueño negocia con Enjoy.', 1024),
  ('00000000-0000-4000-8000-0000009a0002', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Club Neón', '00000000-0000-4000-8000-0000005e0002', 'adjusted', -10, 'Precio especial de lanzamiento.', 2048),
  ('00000000-0000-4000-8000-0000009a0003', '00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', 'Terraza Sur', '00000000-0000-4000-8000-0000005e0002', 'list', 0, null, 3072)
on conflict do nothing;
