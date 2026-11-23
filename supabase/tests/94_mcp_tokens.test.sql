-- Conecta tu IA (migración 20270117): cada uno ve, crea y revoca sus claves; el hash no se cambia.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('94949494-0000-4000-8000-000000000001', 'a94@test'), ('94949494-0000-4000-8000-000000000002', 'b94@test'), ('94949494-0000-4000-8000-000000000003', 'x94@test');
insert into public.membership (user_id, tenant_id, role) values
  ('94949494-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('94949494-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep');

set role authenticated;
set request.jwt.claim.sub = '94949494-0000-4000-8000-000000000001';
insert into public.mcp_token (tenant_id, user_id, name, token_hash, prefix) values ('00000000-0000-4000-8000-000000000e01', '94949494-0000-4000-8000-000000000001', 'Claude', repeat('a', 64), 'ss_mcp_aaaa');
do $$ begin
  insert into public.mcp_token (tenant_id, user_id, name, token_hash, prefix) values ('00000000-0000-4000-8000-000000000e01', '94949494-0000-4000-8000-000000000002', 'De otro', repeat('b', 64), 'ss_mcp_bbbb');
  raise exception 'ASSERT FAILED: crea una clave a nombre de otro';
exception when insufficient_privilege or check_violation then null; when others then if sqlstate = '42501' then null; else raise; end if; end $$;
do $$ begin
  update public.mcp_token set token_hash = repeat('c', 64) where user_id = '94949494-0000-4000-8000-000000000001';
  raise exception 'ASSERT FAILED: cambia el hash';
exception when insufficient_privilege then null; end $$;
update public.mcp_token set revoked_at = now() where user_id = '94949494-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 1 and bool_and(revoked_at is not null) from public.mcp_token), 've y revoca la suya');

set request.jwt.claim.sub = '94949494-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 0 from public.mcp_token), 'no ve las de otro');
update public.mcp_token set revoked_at = null;
set request.jwt.claim.sub = '94949494-0000-4000-8000-000000000003';
do $$ begin
  insert into public.mcp_token (tenant_id, user_id, name, token_hash, prefix) values ('00000000-0000-4000-8000-000000000e01', '94949494-0000-4000-8000-000000000003', 'Sin ser del equipo', repeat('d', 64), 'ss_mcp_dddd');
  raise exception 'ASSERT FAILED: sin ser del espacio';
exception when others then if sqlstate in ('42501') then null; else raise; end if; end $$;
reset role;
select pg_temp.assert((select revoked_at is not null from public.mcp_token where token_hash = repeat('a', 64)), 'otro no la des-revoca');
