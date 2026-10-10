-- Informe del CRM de un espacio (solo lectura): ciudades (zonas) con cuántas empresas tienen, posibles duplicados,
-- nombres sospechosos y empresas sin ciudad. Lo lanza el workflow «Producción» → informe-crm. Solo nombres de ciudad
-- y números: nada de datos de personas ni de empresas.
--   psql "$SUPABASE_DB_URL" -v slug=enjoy -f scripts/crm-report.sql
\set ON_ERROR_STOP on
\pset pager off
\pset footer off
begin read only;
select id as tid from public.tenant where slug = :'slug' \gset

\echo '== Totales'
select (select count(*) from public.account a where a.tenant_id = :'tid') as empresas,
       (select count(*) from public.account a where a.tenant_id = :'tid' and a.zone_id is null) as sin_ciudad,
       (select count(*) from public.account a where a.tenant_id = :'tid' and 'revisar-ciudad' = any(a.tags)) as revisar_ciudad,
       (select count(*) from public.zone z where z.tenant_id = :'tid') as zonas;

\echo '== Árbol: ruta · empresas directas · con lo de dentro · tipo'
with recursive tree as (
  select z.id, z.parent_id, z.name, z.kind, z.name::text as path, 0 as depth
  from public.zone z where z.tenant_id = :'tid' and z.parent_id is null
  union all
  select z.id, z.parent_id, z.name, z.kind, tree.path || ' › ' || z.name, tree.depth + 1
  from public.zone z join tree on z.parent_id = tree.id
),
direct as (select zone_id, count(*) n from public.account where tenant_id = :'tid' and zone_id is not null group by zone_id)
select repeat('  ', t1.depth) || t1.name as zona, t1.kind as tipo, coalesce(d.n, 0) as directas,
       (select coalesce(sum(d2.n), 0) from tree t2 left join direct d2 on d2.zone_id = t2.id where t2.path = t1.path or t2.path like t1.path || ' › %') as total
from tree t1 left join direct d on d.zone_id = t1.id
order by t1.path;

\echo '== Posibles duplicados (mismo nombre sin tildes ni mayúsculas, en sitios distintos)'
with recursive tree as (
  select z.id, z.name, z.name::text as path from public.zone z where z.tenant_id = :'tid' and z.parent_id is null
  union all select z.id, z.name, tree.path || ' › ' || z.name from public.zone z join tree on z.parent_id = tree.id
)
select translate(lower(name), 'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc') as nombre, count(*) as veces, string_agg(path, '  |  ' order by path) as rutas
from tree group by 1 having count(*) > 1 order by 2 desc, 1;

\echo '== Nombres raros (números, paréntesis, barras, comas, interrogaciones o muy largos)'
select z.name as zona, z.kind as tipo, (select count(*) from public.account a where a.zone_id = z.id) as empresas
from public.zone z where z.tenant_id = :'tid'
  and (z.name ~ '[0-9(),/?•]' or z.name ~ ' - ' or length(z.name) > 30 or z.name = upper(z.name))
order by 3 desc, 1;

\echo '== Arriba del todo sin ser un país'
select z.name as zona, z.kind as tipo from public.zone z where z.tenant_id = :'tid' and z.parent_id is null and z.kind <> 'country' order by 1;

\echo '== Últimos arreglos de ciudades'
select created_at, summary, undone_at is not null as deshecho from public.crm_fix where tenant_id = :'tid' order by created_at desc limit 5;
rollback;
