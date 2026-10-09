-- Contenido en otros idiomas (docs/I18N.md §Contenido): idiomas del espacio, traducciones guardadas aparte y que solo leen
-- los miembros del espacio; nadie las escribe desde la consola (las escribe el script con el service role).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

select pg_temp.assert((select content_locales = '{ko}' from public.tenant where slug = 'oquea-demo'), 'el seed trae Oquea (demo) con coreano');
select pg_temp.assert((select content_locales = '{}' from public.tenant where slug = 'enjoy'), 'Enjoy sin traducción: por defecto, vacío');
select pg_temp.assert((select count(*) >= 2 from public.content_i18n where locale = 'ko'), 'el seed trae traducciones de ejemplo');

do $$ begin
  update public.tenant set content_locales = '{fr}' where slug = 'enjoy';
  raise exception 'ASSERT FAILED: idioma que la consola no tiene';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.content_i18n (tenant_id, locale, kind, ref, texts, source_hash) values ('00000000-0000-4000-8000-000000000e01', 'ko', 'dossier', 'x', '{}', 'abcdefgh');
  raise exception 'ASSERT FAILED: tipo de contenido desconocido';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.content_i18n (tenant_id, locale, kind, ref, texts, source_hash) values ('00000000-0000-4000-8000-000000000e01', 'ko', 'play', 'x', '[]', 'abcdefgh');
  raise exception 'ASSERT FAILED: textos que no son un objeto';
exception when check_violation then null; end $$;

-- Un comercial de Enjoy no ve las traducciones de otro espacio ni puede escribir ninguna.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) = 0 from public.content_i18n), 'otro espacio: no ve sus traducciones');
do $$ begin
  insert into public.content_i18n (tenant_id, locale, kind, ref, texts, source_hash) values ('00000000-0000-4000-8000-000000000e01', 'ko', 'play', 'x', '{}', 'abcdefgh');
  raise exception 'ASSERT FAILED: un comercial escribe traducciones';
exception when insufficient_privilege then null; end $$;
reset role;

set role anon;
select pg_temp.assert((select count(*) = 0 from public.content_i18n), 'anónimo: nada');
reset role;
