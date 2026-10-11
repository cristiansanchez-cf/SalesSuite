-- ¿Están en el CRM? (solo lectura). Para cada nombre de la lista (separados por comas; variantes con «|», p. ej.
-- «ghecko|gecko»), cuántas empresas del espacio lo contienen, cuántas tienen ficha de Google y cuántas están
-- descartadas. Solo enseña los nombres que se le pasan y números: nada de lo que hay guardado.
--   psql "$SUPABASE_DB_URL" -v slug=enjoy -v names='mclub,ghecko|gecko' -f scripts/crm-check-names.sql
\set ON_ERROR_STOP on
\pset pager off
\pset footer off
begin read only;
select id as tid from public.tenant where slug = :'slug' \gset

\echo '== ¿Están en el CRM? (nombre buscado · empresas · con ficha de Google · descartadas)'
with want as (
  select ord as pos, btrim(x) as raw from unnest(string_to_array(:'names', ',')) with ordinality as u(x, ord) where btrim(x) <> ''
), norm as (
  select pos, raw, array(select regexp_replace(translate(lower(btrim(v)), 'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc'), '[^a-z0-9]', '', 'g')
                         from unnest(string_to_array(raw, '|')) v where btrim(v) <> '') as keys
  from want
), acc as (
  select a.id, a.place_id, a.discarded_at,
         regexp_replace(translate(lower(a.name), 'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc'), '[^a-z0-9]', '', 'g') as k
  from public.account a where a.tenant_id = :'tid'
)
select n.raw as buscado,
       count(a.id) as empresas,
       count(a.id) filter (where a.place_id is not null) as con_google,
       count(a.id) filter (where a.discarded_at is not null) as descartadas,
       case when count(a.id) = 0 then '✗ NO ESTÁ' when count(a.id) > 1 then '¿duplicada?' else '✓' end as estado
from norm n left join acc a on exists (select 1 from unnest(n.keys) k where length(k) >= 3 and a.k like '%' || k || '%')
group by n.pos, n.raw order by n.pos;

\echo '== Búsquedas en Google Maps (qué · dónde · encontrados · importados o unidos)'
select created_at::date as dia, query as que, zone_label as donde, found as encontrados,
       (select count(*) from jsonb_object_keys(imported)) as importados
from public.crm_sweep where tenant_id = :'tid' order by created_at desc limit 20;
rollback;
