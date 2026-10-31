-- Migración 20261212: el superadmin da de alta un espacio (dirección, ajustes del CRM) y nombra a su admin; nadie más.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('a7a7a7a7-0000-4000-8000-000000000001', 'super@cofundo.test'),
  ('a7a7a7a7-0000-4000-8000-000000000002', 'ana@oceandive.test');
insert into public.platform_admin (user_id) values ('a7a7a7a7-0000-4000-8000-000000000001');

set role authenticated;
-- Un admin de Enjoy no crea espacios ni se hace admin de otro.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  perform public.platform_create_tenant('intruso', 'Intruso', 'es-ES', 'intruso.ventas.cofundo.io');
  raise exception 'ASSERT FAILED: un admin crea espacios';
exception when raise_exception then if sqlerrm like 'ASSERT FAILED%' then raise; end if; end $$;
do $$ begin
  perform public.platform_add_admin('00000000-0000-4000-8000-000000000a01', '22222222-2222-4222-8222-222222222222');
  raise exception 'ASSERT FAILED: un admin se mete en otro espacio';
exception when raise_exception then if sqlerrm like 'ASSERT FAILED%' then raise; end if; end $$;

-- El superadmin: crea el espacio con su dirección y sus ajustes, y nombra a su admin (dos veces: no duplica).
set request.jwt.claim.sub = 'a7a7a7a7-0000-4000-8000-000000000001';
select set_config('t74.id', public.platform_create_tenant('ocean-dive-lab', ' Ocean Dive Lab ', 'en-GB', 'ocean-dive-lab.ventas.cofundo.io')::text, false);
select public.platform_add_admin(current_setting('t74.id')::uuid, 'a7a7a7a7-0000-4000-8000-000000000002');
select public.platform_add_admin(current_setting('t74.id')::uuid, 'a7a7a7a7-0000-4000-8000-000000000002');
do $$ begin
  perform public.platform_create_tenant('ocean-dive-lab', 'Otra', 'es-ES', 'otra.ventas.cofundo.io');
  raise exception 'ASSERT FAILED: misma dirección dos veces';
exception when raise_exception then if sqlerrm not like 'duplicate:%' then raise; end if; end $$;
do $$ begin
  perform public.platform_create_tenant('otra', 'Otra', 'es-ES', 'ocean-dive-lab.ventas.cofundo.io');
  raise exception 'ASSERT FAILED: mismo dominio dos veces';
exception when raise_exception then if sqlerrm not like 'duplicate:%' then raise; end if; end $$;
select pg_temp.assert((select (x->'setup'->>'admins')::int = 1 and (x->'setup'->>'segments')::int = 0 and (x->'setup'->>'logo')::boolean = false
  from jsonb_array_elements(public.platform_overview()) x where x->>'slug' = 'ocean-dive-lab'), 'Plataforma: estado del alta (solo su admin)');
select pg_temp.assert((select (x->'setup'->>'segments')::int > 0 from jsonb_array_elements(public.platform_overview()) x where x->>'slug' = 'enjoy'), 'Enjoy, con sus sectores');
do $$ begin
  perform public.platform_create_tenant('Mal Slug', 'Otra', 'es-ES', 'mal.ventas.cofundo.io');
  raise exception 'ASSERT FAILED: dirección no válida';
exception when raise_exception then if sqlerrm like 'ASSERT FAILED%' then raise; end if; end $$;
reset role;

select pg_temp.assert((select name = 'Ocean Dive Lab' and default_locale = 'en-GB' from public.tenant where slug = 'ocean-dive-lab'), 'el espacio, con su nombre e idioma');
select pg_temp.assert((select count(*) = 1 from public.domain d join public.tenant t on t.id = d.tenant_id
  where t.slug = 'ocean-dive-lab' and d.hostname = 'ocean-dive-lab.ventas.cofundo.io' and d.is_primary), 'su dirección principal');
select pg_temp.assert((select qualification is null from public.crm_settings where tenant_id = current_setting('t74.id')::uuid), 'sus ajustes del CRM, sin cualificación');
select pg_temp.assert((select count(*) = 1 from public.membership where tenant_id = current_setting('t74.id')::uuid
  and user_id = 'a7a7a7a7-0000-4000-8000-000000000002' and role = 'admin'), 'su admin, una vez');
select pg_temp.assert(not exists (select 1 from public.tenant where slug in ('intruso', 'otra', 'Mal Slug')), 'nada más creado');

-- Su admin ve su espacio y no los demás.
set role authenticated;
set request.jwt.claim.sub = 'a7a7a7a7-0000-4000-8000-000000000002';
select pg_temp.assert(public.is_admin(current_setting('t74.id')::uuid), 'su admin es admin');
select pg_temp.assert(not public.is_member('00000000-0000-4000-8000-000000000e01'), 'y no entra en Enjoy');
reset role;

-- Borrar el espacio arrastra su dirección, sus ajustes y su admin (el aviso de «al menos un admin» no salta en cascada).
delete from public.tenant where id = current_setting('t74.id')::uuid;
delete from public.platform_admin;
delete from auth.users where id in ('a7a7a7a7-0000-4000-8000-000000000001', 'a7a7a7a7-0000-4000-8000-000000000002');
\echo '74_platform_create_tenant OK'
