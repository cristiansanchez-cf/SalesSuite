-- Checkpoint de seguridad (docs/SECURITY_REVIEW.md): enlaces solo web y topes de uso por persona y día.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
-- Un enlace «javascript:…» no entra (ni en la empresa ni en la persona); uno web, sí.
do $$ begin
  insert into public.account (tenant_id, name, website) values ('00000000-0000-4000-8000-000000000e01', 'XSS 59', 'javascript:alert(1)');
  raise exception 'ASSERT FAILED: web javascript:';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.account (tenant_id, name, instagram) values ('00000000-0000-4000-8000-000000000e01', 'XSS 59', ' data:text/html,x');
  raise exception 'ASSERT FAILED: instagram data:';
exception when check_violation then null; end $$;
insert into public.account (id, tenant_id, name, website) values ('59000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Web 59', 'https://club59.es');
do $$ begin
  update public.account set maps_url = 'javascript:x' where id = '59000000-0000-4000-8000-0000000000a1';
  raise exception 'ASSERT FAILED: maps javascript:';
exception when check_violation then null; end $$;

-- Topes: el 3.º con tope 2 ya no cabe; cuenta por persona.
select pg_temp.assert(public.bump_usage('00000000-0000-4000-8000-000000000e01', 'google', 2), '1.º cabe');
select pg_temp.assert(public.bump_usage('00000000-0000-4000-8000-000000000e01', 'google', 2), '2.º cabe');
select pg_temp.assert(not public.bump_usage('00000000-0000-4000-8000-000000000e01', 'google', 2), '3.º no cabe');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep: el suyo empieza de cero
select pg_temp.assert(public.bump_usage('00000000-0000-4000-8000-000000000e01', 'google', 2), 'otra persona, su propio tope');
select pg_temp.assert((select count(*) from public.usage_counter) = 1, 'un comercial solo ve su uso');
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- de otro espacio
do $$ begin
  perform public.bump_usage('00000000-0000-4000-8000-000000000e01', 'ai', 5);
  raise exception 'ASSERT FAILED: suma en un espacio que no es suyo';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.usage_counter where tenant_id = '00000000-0000-4000-8000-000000000e01';
delete from public.account where id = '59000000-0000-4000-8000-0000000000a1';
