-- Traducción de lo que escribe el equipo (docs/I18N.md §Lo que escribe el equipo): la lee el equipo del espacio; solo
-- la escribe el servidor (service role), para que nadie cuele una «traducción» a sus compañeros.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into public.text_translation (tenant_id, locale, source_hash, text) values ('00000000-0000-4000-8000-000000000e01', 'es', 'abcdef0123456789abcdef0123456789', 'El dueño quiere que le llamemos');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select pg_temp.assert((select count(*) = 1 from public.text_translation), 'el equipo la lee');
do $$ begin
  insert into public.text_translation (tenant_id, locale, source_hash, text) values ('00000000-0000-4000-8000-000000000e01', 'es', '0000000000000000aaaaaaaaaaaaaaaa', 'trampa');
  raise exception 'ASSERT FAILED: un miembro escribe una traducción';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.text_translation set text = 'trampa';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert((select text from public.text_translation) = 'El dueño quiere que le llamemos', 'un miembro no cambia una traducción');
-- Alguien de otro espacio no la ve.
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
select pg_temp.assert((select count(*) = 0 from public.text_translation), 'otro espacio no la ve');
reset role;

set role anon;
do $$ begin
  perform 1 from public.text_translation limit 1;
  raise exception 'ASSERT FAILED: el anónimo lee traducciones';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.text_translation;
