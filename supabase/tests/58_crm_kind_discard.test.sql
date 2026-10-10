-- Limpiar el CRM (docs/CRM_DINAMICO.md §17): tipo (empresa/DJ) y descartar con motivo; en bloque solo admin o gerente.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.account (id, tenant_id, name) values
  ('58000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'DJ 58'),
  ('58000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Tienda 58');
select pg_temp.assert((select kind = 'company' and discarded_at is null from public.account where id = '58000000-0000-4000-8000-0000000000a1'), 'por defecto, empresa y no descartada');

-- Un comercial: en una libre, puede marcarla DJ y descartarla con motivo; y recuperarla.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.account_classify('58000000-0000-4000-8000-0000000000a1', 'dj', null, null);
select public.account_classify('58000000-0000-4000-8000-0000000000a2', null, 'partner', '  Tienda online: posible alianza  ');
select pg_temp.assert((select kind = 'dj' and discarded_at is null from public.account where id = '58000000-0000-4000-8000-0000000000a1'), 'DJ');
select pg_temp.assert((select discard_reason = 'partner' and discard_note = 'Tienda online: posible alianza' and discarded_at is not null and kind = 'company'
  from public.account where id = '58000000-0000-4000-8000-0000000000a2'), 'descartada con motivo y nota');
select public.account_classify('58000000-0000-4000-8000-0000000000a2', null, null, null);
select pg_temp.assert((select discarded_at is null and discard_reason is null and discard_note is null from public.account where id = '58000000-0000-4000-8000-0000000000a2'), 'recuperada');
do $$ begin
  perform public.account_classify('58000000-0000-4000-8000-0000000000a2', 'otro', null, null);
  raise exception 'ASSERT FAILED: tipo desconocido';
exception when check_violation then null; end $$;
-- En bloque, un comercial no.
do $$ begin
  perform public.crm_classify_accounts('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: un comercial limpia en bloque';
exception when insufficient_privilege then null; end $$;

-- Ni un/a gerente (en bloque es de admin: Configurar → Datos del CRM).
reset role;
insert into public.membership (user_id, tenant_id, role) values ('66666666-6666-4666-8666-666666666666', '00000000-0000-4000-8000-000000000e01', 'lead')
  on conflict (tenant_id, user_id) do update set role = 'lead';
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  perform public.crm_classify_accounts('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: un/a gerente limpia en bloque';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.crm_move_accounts('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: un/a gerente mueve en bloque';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert(public.crm_classify_accounts('00000000-0000-4000-8000-000000000e01',
  '[{"id":"58000000-0000-4000-8000-0000000000a1","kind":"company","reason":null},{"id":"58000000-0000-4000-8000-0000000000a2","kind":"company","reason":"not_sector","note":"Tienda online"}]') = 2, 'el admin limpia en bloque');
select pg_temp.assert((select discard_reason = 'not_sector' from public.account where id = '58000000-0000-4000-8000-0000000000a2'), 'en bloque: descartada');
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- admin de otro espacio
do $$ begin
  perform public.crm_classify_accounts('00000000-0000-4000-8000-000000000e01', '[]');
  raise exception 'ASSERT FAILED: otro espacio';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.account where id in ('58000000-0000-4000-8000-0000000000a1', '58000000-0000-4000-8000-0000000000a2');
