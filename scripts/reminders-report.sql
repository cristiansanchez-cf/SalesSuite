-- ¿Por qué no llega el recordatorio de la mañana por WhatsApp? (docs/ASSISTANT.md §Recordatorios). Solo lectura. Lo
-- lanza el workflow «Producción» → recordatorios. Enseña:
--  · las tareas programadas de Supabase (pg_cron): si existe la que llama a /api/cron/leads (la que lanza los
--    recordatorios), si está activa y cómo han ido sus últimas pasadas. De cada tarea, solo su dirección: nunca la orden
--    entera (lleva el CRON_SECRET);
--  · lo que contestó la app a esas llamadas (pg_net guarda unas horas): «reminders» y «whatsapp»;
--  · cuántas personas lo tienen activado y si tienen móvil (números, nunca teléfonos ni nombres);
--  · el registro de envíos de los últimos 10 días.
--   psql "$SUPABASE_DB_URL" -v slug=enjoy -f scripts/reminders-report.sql
\set ON_ERROR_STOP on
\pset pager off
\pset footer off
begin read only;

\echo '== Tareas programadas (pg_cron): nombre · cada cuánto · activa · adónde llama'
select coalesce(to_regclass('cron.job')::text, 'NO HAY pg_cron (Supabase → Database → Extensions)') as pg_cron;
select to_regclass('cron.job') is not null as hay_cron \gset
\if :hay_cron
select jobid, jobname, schedule, active, (regexp_match(command, 'url\s*:=\s*''([^'']+)'''))[1] as url
from cron.job order by jobid;
select exists (select 1 from cron.job where command ~ '/api/cron/leads' and active) as hay_leads \gset
\if :hay_leads
\echo 'OK: hay una tarea activa que llama a /api/cron/leads (la de los recordatorios).'
\else
\echo 'FALTA: ninguna tarea activa llama a /api/cron/leads. Sin ella no sale ningún recordatorio (docs/LEADS.md §7, paso 3).'
\endif
\echo '== Últimas pasadas de cada tarea (las 3 más recientes de cada una)'
select j.jobname, d.status, d.start_time, left(d.return_message, 120) as mensaje
from cron.job j
join lateral (select * from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 3) d on true
order by j.jobid, d.start_time desc;
\endif

\echo '== Lo que contestó la app (pg_net, últimas horas): código · cuándo · respuesta'
select to_regclass('net._http_response') is not null as hay_net \gset
\if :hay_net
select status_code, created, left(content, 220) as respuesta
from net._http_response where content like '%"reminders"%' or status_code <> 200
order by created desc limit 8;
select count(*) filter (where content like '%"reminders":%' and content not like '%"reminders":0%') as pasadas_con_envios,
       count(*) filter (where status_code = 401) as no_autorizado_401,
       count(*) filter (where status_code >= 500) as errores_5xx
from net._http_response;
\else
\echo 'NO HAY pg_net (Supabase → Database → Extensions).'
\endif

\echo '== Quién lo tiene activado (todas las empresas): personas · con móvil · en el equipo de este espacio'
select id as tid from public.tenant where slug = :'slug' \gset
select count(*) as activado,
       count(*) filter (where u.phone is not null and length(regexp_replace(u.phone, '\D', '', 'g')) >= 9) as con_movil,
       count(*) filter (where exists (select 1 from public.membership m where m.user_id = u.id and m.tenant_id = :'tid' and m.role in ('admin', 'lead', 'rep'))) as en_este_espacio,
       string_agg(distinct coalesce(u.timezone, 'Europe/Madrid'), ', ') as zonas_horarias
from public.users u where u.wa_reminders;

\echo '== Plantilla del recordatorio en Leads → Ajustes → WhatsApp (este espacio; con el número del asistente va en Vercel)'
select (s.whatsapp_phone_id is not null) as numero_de_leads, coalesce(s.whatsapp_templates -> 'reminder', 'null'::jsonb) as plantilla_recordatorio
from public.lead_settings s where s.tenant_id = :'tid';

\echo '== Envíos de los últimos 10 días: día · espacio · personas · con algo (items > 0)'
select l.day, t.slug, count(*) as personas, count(*) filter (where l.items > 0) as con_algo, max(l.sent_at) as ultimo
from public.wa_reminder_log l join public.tenant t on t.id = l.tenant_id
where l.day >= current_date - 10 group by l.day, t.slug order by l.day desc, t.slug;
commit;
