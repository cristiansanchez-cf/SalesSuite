-- Privacidad de los leads (docs/LEADS.md §Privacidad): lo que dice la política de cada espacio, configurable en
-- Leads → Ajustes → Privacidad.
--  · Plazos de conservación por espacio: leads que no contratan (meses desde el último contacto), spam y cuarentena,
--    pruebas (días, nunca más de 6 meses) y la prueba legal del consentimiento (años, bloqueada).
--  · Borrado diario (lo hace /api/cron/leads una vez al día por espacio): las pruebas y el spam se borran; los leads que
--    no contratan se anonimizan (sin nombre, email, teléfono, mensajes ni atribución identificable) para que las métricas
--    sigan cuadrando. Lo validado (ya en el CRM principal) no se toca aquí.
--  · lead_consent_proof: la prueba del consentimiento de lo borrado, bloqueada (solo el servidor la ve) hasta su plazo.
--  · lead_purge_log: cuántos se borraron cada día. privacy_request: quién exportó o suprimió los datos de alguien y cuándo.
--  · Lista de supresión: el valor pasa a ser un hash (HMAC con el secreto del servidor). Las filas antiguas en claro las
--    convierte el borrado diario (la base de datos no conoce el secreto).
--  · WhatsApp 2 se puede apagar por espacio (si Meta la pasa a Marketing), sin tocar el 1.

alter table public.lead_settings
  add column retention_lead_months  smallint not null default 24 check (retention_lead_months between 1 and 120),
  add column retention_spam_months  smallint not null default 6  check (retention_spam_months between 1 and 60),
  add column retention_test_days    smallint not null default 30 check (retention_test_days between 1 and 183),
  add column retention_proof_years  smallint not null default 5  check (retention_proof_years between 1 and 10),
  add column whatsapp_wa2_enabled   boolean  not null default true,
  add column last_purge_at          timestamptz;
-- La fecha del último borrado la escribe solo el servidor (con sesión se conserva la que hubiera).
create or replace function public.lead_settings_keep_purge() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Solo quien se salta la RLS (service role, el servidor) la cambia.
  if not exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    new.last_purge_at := case when tg_op = 'UPDATE' then old.last_purge_at else null end;
  end if;
  return new;
end $$;
create trigger lead_settings_keep_purge before insert or update on public.lead_settings
  for each row execute function public.lead_settings_keep_purge();

alter table public.lead add column anonymized_at timestamptz;
create index lead_purge_idx on public.lead (tenant_id, is_test, last_submission_at) where anonymized_at is null and validated_at is null;

create table public.lead_consent_proof (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenant(id) on delete cascade,
  -- HMAC del email (con el secreto del servidor): permite demostrar el consentimiento de alguien concreto, no leerlo.
  subject_hash       text not null check (subject_hash ~ '^h1:[0-9a-f]{64}$'),
  received_at        timestamptz not null,
  schema             text check (length(schema) <= 40),
  consent            jsonb not null default '{}',
  origin             text check (length(origin) <= 300),
  page_path          text check (length(page_path) <= 500),
  reason             text not null check (reason in ('purge', 'erase')),
  blocked_at         timestamptz not null default now(),
  delete_after       timestamptz not null
);
create index lead_consent_proof_subject_idx on public.lead_consent_proof (tenant_id, subject_hash);
create index lead_consent_proof_expiry_idx on public.lead_consent_proof (tenant_id, delete_after);
-- Bloqueada: sin políticas, nadie con sesión la lee ni la toca (solo el servidor, con service role).
alter table public.lead_consent_proof enable row level security;
revoke all on public.lead_consent_proof from authenticated, anon;

create table public.lead_purge_log (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenant(id) on delete cascade,
  ran_at         timestamptz not null default now(),
  anonymized     integer not null default 0,
  deleted        integer not null default 0,
  tests          integer not null default 0,
  proofs_deleted integer not null default 0,
  hashed         integer not null default 0
);
create index lead_purge_log_idx on public.lead_purge_log (tenant_id, ran_at desc);
alter table public.lead_purge_log enable row level security;
create policy lead_purge_log_read on public.lead_purge_log for select to authenticated using (public.is_admin(tenant_id));
revoke insert, update, delete on public.lead_purge_log from authenticated, anon;

create table public.privacy_request (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  at           timestamptz not null default now(),
  kind         text not null check (kind in ('export', 'erase')),
  subject_hash text not null check (subject_hash ~ '^h1:[0-9a-f]{64}$'),
  by_user      uuid references public.users(id) on delete set null,
  summary      jsonb not null default '{}'
);
create index privacy_request_idx on public.privacy_request (tenant_id, at desc);
alter table public.privacy_request enable row level security;
create policy privacy_request_read on public.privacy_request for select to authenticated using (public.is_admin(tenant_id));
revoke insert, update, delete on public.privacy_request from authenticated, anon;

-- Los leads que ya han cumplido su plazo (solo el servidor). Último contacto = el más reciente de: último envío, última
-- respuesta suya y último cambio de etapa. Lo validado, lo ganado y lo ya anonimizado no entra.
create or replace function public.lead_purge_candidates(p_tenant uuid, p_lead_before timestamptz, p_spam_before timestamptz,
  p_test_before timestamptz, p_limit integer default 200)
returns table (id uuid, kind text)
language sql stable security definer set search_path = public as $$
  select l.id, case when l.is_test then 'test' when l.stage = 'spam' or l.quarantined then 'spam' else 'lead' end
    from public.lead l
   where l.tenant_id = p_tenant and l.anonymized_at is null and l.validated_at is null
     and ((l.is_test and l.created_at < p_test_before)
       or (not l.is_test and l.stage <> 'won'
           and greatest(l.last_submission_at, coalesce(l.last_inbound_at, l.created_at), l.stage_at)
               < case when l.stage = 'spam' or l.quarantined then p_spam_before else p_lead_before end))
   order by l.last_submission_at
   limit least(greatest(p_limit, 1), 1000);
$$;
revoke all on function public.lead_purge_candidates(uuid, timestamptz, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.lead_purge_candidates(uuid, timestamptz, timestamptz, timestamptz, integer) to service_role;
