-- Tope de IA de un espacio (docs/COSTES.md §Tope), sin entrar en Plataforma. Lo lanza el workflow «Producción» → tope-ia.
--   psql "$SUPABASE_DB_URL" -v slug=oquea -v usd=10 -v per_day= -v dry=true -f scripts/ai-limit.sql
-- usd: gasto máximo al mes en dólares («sin» lo quita, «keep» lo deja como está). per_day: usos de IA por persona al día (vacío: el que tenga, o 40).
-- dry=true: solo enseña cómo está y cómo quedaría.
\set ON_ERROR_STOP on
\pset pager off
\pset footer off
begin;
select exists (select 1 from public.tenant where slug = :'slug') as found \gset
\if :found
\else
  do $$ begin raise exception 'No existe ese espacio'; end $$;
\endif
select id as tid, name as tname from public.tenant where slug = :'slug' \gset
-- Sin gasto máximo: cadena vacía (un NULL no se guarda en la variable).
select coalesce(case when lower(:'usd') in ('sin', 'ninguno', 'no') then null
    when :'usd' = 'keep' then (select l.ai_month_usd from public.tenant_limits l where l.tenant_id = :'tid')
    else nullif(replace(:'usd', ',', '.'), '')::numeric(10, 2) end::text, '') as new_usd,
       coalesce(nullif(:'per_day', '')::int, (select l.ai_per_user_day from public.tenant_limits l where l.tenant_id = :'tid'), 40) as new_day \gset
-- (Sin convertir a número: Postgres evalúa la conversión de una constante aunque esté en un CASE.)
select :'new_day'::int between 1 and 10000 and :'new_usd' !~ '^-' as ok \gset
\if :ok
\else
  do $$ begin raise exception 'Tope no válido (usos al día entre 1 y 10000; gasto en dólares, 0 o más)'; end $$;
\endif

\echo '== Antes'
select :'tname' as espacio, coalesce(l.ai_per_user_day, 40) as usos_por_persona_y_dia, l.ai_month_usd as gasto_max_mes_usd,
  (select round(coalesce(sum(e.cost_usd), 0), 2) from public.usage_event e
    where e.tenant_id = :'tid' and e.at >= date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') as gastado_este_mes_usd
from (select 1) one left join public.tenant_limits l on l.tenant_id = :'tid';

insert into public.tenant_limits (tenant_id, ai_per_user_day, ai_month_usd, updated_at)
values (:'tid', :'new_day'::int, nullif(:'new_usd', '')::numeric(10, 2), now())
on conflict (tenant_id) do update set ai_per_user_day = excluded.ai_per_user_day, ai_month_usd = excluded.ai_month_usd, updated_at = excluded.updated_at;

\echo '== Después'
select :'tname' as espacio, l.ai_per_user_day as usos_por_persona_y_dia, l.ai_month_usd as gasto_max_mes_usd
from public.tenant_limits l where l.tenant_id = :'tid';

\if :dry
  \echo '(prueba: no se guarda nada)'
  rollback;
\else
  commit;
\endif
