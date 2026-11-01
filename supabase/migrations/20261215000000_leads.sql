-- =============================================================================
-- Leads de las webs (docs/LEADS.md). La web solo recoge y envía; el CRM guarda, deduplica, filtra, puntúa y contacta.
--  · lead_settings: la configuración de cada espacio (marca, orígenes, remitente, enlace de reserva, WhatsApp…).
--  · lead: una persona por email y espacio, con su ciclo de vida. Entra «por validar», fuera del CRM principal.
--  · lead_submission: cada envío del formulario, tal cual llegó (prueba legal: consent + URL + hora del servidor).
--  · lead_event: el historial (envíos, cambios de etapa con fecha y hora, mensajes, notas).
--  · lead_message: la cola de envíos en segundo plano (email y WhatsApp) que procesa /api/cron/leads.
--  · lead_suppression: las bajas, que respetan todos los envíos.
-- Escribe la entrada el servidor con service role (el endpoint es público); el equipo lee y gestiona con RLS.
-- =============================================================================

create table public.lead_settings (
  tenant_id          uuid primary key references public.tenant(id) on delete cascade,
  enabled            boolean not null default false,
  brand              text not null unique check (brand ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  -- Orígenes exactos («https://enjoytheclub.es») o con un comodín al principio del subdominio («https://site--*.web.app»).
  allowed_origins    text[] not null default '{}',
  from_email         text check (from_email is null or from_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  from_name          text check (length(from_name) <= 80),
  reply_to           text check (reply_to is null or reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  signer_name        text check (length(signer_name) <= 80),
  notify_emails      text[] not null default '{}',
  booking_url        text check (booking_url is null or booking_url ~ '^https://'),
  video_url          text check (video_url is null or video_url ~ '^https://'),
  -- WhatsApp Cloud API: el número de la empresa (phone_number_id de Meta) y los nombres de las plantillas aprobadas.
  whatsapp_phone_id  text check (whatsapp_phone_id is null or whatsapp_phone_id ~ '^[0-9]{5,30}$'),
  whatsapp_enabled   boolean not null default false,
  whatsapp_templates jsonb not null default '{}' check (jsonb_typeof(whatsapp_templates) = 'object'),
  timezone           text not null default 'Europe/Madrid',
  send_from_hour     smallint not null default 8 check (send_from_hour between 0 and 23),
  send_to_hour       smallint not null default 22 check (send_to_hour between 1 and 24),
  holidays           date[] not null default '{}',
  updated_at         timestamptz not null default now()
);

create table public.lead (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenant(id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  is_test              boolean not null default false,
  email                text not null check (email = lower(email) and length(email) <= 254),
  email_kind           text not null check (email_kind in ('business', 'free_webmail', 'disposable', 'role')),
  domain               text check (length(domain) <= 253),
  name                 text not null check (length(btrim(name)) between 1 and 160),
  phone_raw            text check (length(phone_raw) <= 40),
  phone_e164           text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  type                 text not null check (type ~ '^[a-z_]{2,40}$'),
  locale               text not null default 'es' check (locale ~ '^[a-z]{2}$'),
  stage                text not null default 'new' check (stage in ('new', 'contacted', 'replied', 'booked', 'meeting', 'opportunity', 'won', 'lost', 'nurture', 'discarded', 'spam')),
  stage_at             timestamptz not null default now(),
  discard_reason       text check (length(discard_reason) <= 300),
  quarantined          boolean not null default false,
  quarantine_reasons   text[] not null default '{}',
  validated_at         timestamptz,
  validated_by         uuid references public.users(id) on delete set null,
  score                integer,
  score_detail         jsonb,
  -- Lo que se sabe en estructurado (para un modelo algún día): tipo, campos del último envío, tamaño, fecha…
  facts                jsonb not null default '{}',
  attribution_first    jsonb,
  attribution_last     jsonb,
  consent_marketing    boolean not null default false,
  consent_ads          boolean not null default false,
  whatsapp_ok          boolean not null default false,
  first_response_at    timestamptz,
  first_response_mins  integer,
  last_inbound_at      timestamptz,
  sequence_stopped_at  timestamptz,
  sequence_stop_reason text check (length(sequence_stop_reason) <= 80),
  submissions          integer not null default 1,
  last_submission_at   timestamptz not null default now(),
  account_id           uuid references public.account(id) on delete set null,
  contact_id           uuid references public.crm_contact(id) on delete set null,
  unique (tenant_id, is_test, email),
  check ((stage = 'discarded') = (discard_reason is not null))
);
create index lead_inbox_idx on public.lead (tenant_id, validated_at, last_submission_at desc);
create index lead_phone_idx on public.lead (phone_e164) where phone_e164 is not null;

create table public.lead_submission (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant(id) on delete cascade,
  lead_id         uuid not null references public.lead(id) on delete cascade,
  received_at     timestamptz not null default now(),
  idempotency_key text not null check (length(idempotency_key) between 1 and 100),
  schema          text not null check (length(schema) <= 40),
  is_test         boolean not null default false,
  type            text not null check (type ~ '^[a-z_]{2,40}$'),
  fields          jsonb not null default '{}',
  message         text check (length(message) <= 5000),
  consent         jsonb not null default '{}',
  context         jsonb not null default '{}',
  origin          text check (length(origin) <= 300),
  ip_hash         text check (length(ip_hash) <= 64),
  spam_reasons    text[] not null default '{}',
  -- Lo que se respondió (para devolver lo mismo si llega otra vez la misma clave).
  response        jsonb not null default '{}',
  unique (tenant_id, idempotency_key)
);
create index lead_submission_lead_idx on public.lead_submission (lead_id, received_at desc);
create index lead_submission_ip_idx on public.lead_submission (tenant_id, ip_hash, received_at desc);

create table public.lead_event (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  lead_id   uuid not null references public.lead(id) on delete cascade,
  at        timestamptz not null default now(),
  kind      text not null check (kind in ('submission', 'stage', 'message_out', 'message_in', 'note', 'validated', 'quarantine', 'suppressed')),
  from_stage text,
  to_stage   text,
  by_user    uuid references public.users(id) on delete set null,
  data       jsonb not null default '{}'
);
create index lead_event_lead_idx on public.lead_event (lead_id, at);

create table public.lead_message (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  lead_id     uuid not null references public.lead(id) on delete cascade,
  created_at  timestamptz not null default now(),
  channel     text not null check (channel in ('email', 'whatsapp')),
  step        text not null check (step in ('autoreply', 'notify', 'wa1', 'wa2')),
  to_addr     text not null check (length(to_addr) <= 254),
  send_at     timestamptz not null,
  status      text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled', 'skipped')),
  attempts    integer not null default 0,
  sent_at     timestamptz,
  provider_id text check (length(provider_id) <= 200),
  error       text check (length(error) <= 500),
  payload     jsonb not null default '{}'
);
create index lead_message_due_idx on public.lead_message (send_at) where status = 'pending';
create index lead_message_lead_idx on public.lead_message (lead_id, created_at);

create table public.lead_suppression (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  channel   text not null check (channel in ('email', 'whatsapp', 'all')),
  value     text not null check (length(value) between 3 and 254),
  reason    text check (length(reason) <= 200),
  at        timestamptz not null default now(),
  primary key (tenant_id, channel, value)
);

-- ---------------------------------------------------------------- RLS: el equipo que gestiona (admin, gerente o superadmin)
alter table public.lead_settings enable row level security;
alter table public.lead enable row level security;
alter table public.lead_submission enable row level security;
alter table public.lead_event enable row level security;
alter table public.lead_message enable row level security;
alter table public.lead_suppression enable row level security;

create policy lead_settings_read on public.lead_settings for select to authenticated using (public.is_manager(tenant_id));
create policy lead_settings_ins on public.lead_settings for insert to authenticated with check (public.is_admin(tenant_id));
create policy lead_settings_upd on public.lead_settings for update to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy lead_read on public.lead for select to authenticated using (public.is_manager(tenant_id));
create policy lead_upd on public.lead for update to authenticated using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));
create policy lead_submission_read on public.lead_submission for select to authenticated using (public.is_manager(tenant_id));
create policy lead_event_read on public.lead_event for select to authenticated using (public.is_manager(tenant_id));
create policy lead_event_ins on public.lead_event for insert to authenticated
  with check (public.is_manager(tenant_id) and by_user = auth.uid() and kind in ('stage', 'note', 'validated', 'suppressed')
    and exists (select 1 from public.lead l where l.id = lead_id and l.tenant_id = lead_event.tenant_id));
create policy lead_message_read on public.lead_message for select to authenticated using (public.is_manager(tenant_id));
-- Solo cancelar lo pendiente (pararle la secuencia a mano).
create policy lead_message_cancel on public.lead_message for update to authenticated
  using (public.is_manager(tenant_id) and status = 'pending') with check (public.is_manager(tenant_id) and status = 'cancelled');
create policy lead_suppression_read on public.lead_suppression for select to authenticated using (public.is_manager(tenant_id));
create policy lead_suppression_ins on public.lead_suppression for insert to authenticated with check (public.is_manager(tenant_id));
create policy lead_suppression_del on public.lead_suppression for delete to authenticated using (public.is_admin(tenant_id));

-- Lo que llega de la web lo escribe solo el servidor: el equipo no inserta leads ni envíos, ni toca la cola salvo cancelar.
revoke insert, delete on public.lead from authenticated;
revoke insert, update, delete on public.lead_submission from authenticated;
revoke update, delete on public.lead_event from authenticated;
revoke insert, delete on public.lead_message from authenticated;
revoke update on public.lead_message from authenticated;
grant update (status) on public.lead_message to authenticated;
revoke delete on public.lead_settings from authenticated;
-- Del lead, el equipo solo cambia lo suyo: etapa, validación, cuarentena, primer contacto, secuencia y enlaces al CRM.
-- Lo que llegó de la web (email, atribución, consentimientos, envíos) no se toca.
revoke update on public.lead from authenticated;
grant update (stage, stage_at, discard_reason, quarantined, quarantine_reasons, validated_at, validated_by, first_response_at,
  first_response_mins, sequence_stopped_at, sequence_stop_reason, account_id, contact_id, facts, updated_at) on public.lead to authenticated;

create trigger lead_touch before update on public.lead for each row execute function public.touch_updated_at();
create trigger lead_settings_touch before update on public.lead_settings for each row execute function public.touch_updated_at();
do $$ declare t text; begin
  foreach t in array array['lead_settings', 'lead', 'lead_submission', 'lead_event', 'lead_message', 'lead_suppression'] loop
    execute format('create trigger keep_tenant_id before update of tenant_id on public.%I for each row execute function public.keep_tenant_id()', t);
  end loop;
end $$;

-- Enjoy: su marca y su web (los ajustes de envío los completa el admin en Leads → Ajustes; empieza apagado).
insert into public.lead_settings (tenant_id, brand, allowed_origins, timezone)
select id, 'enjoy', array['https://enjoytheclub.es', 'https://www.enjoytheclub.es', 'https://corporativeweb-b0ce4.web.app', 'https://corporativeweb-b0ce4--*.web.app'], 'Europe/Madrid'
from public.tenant where slug = 'enjoy'
on conflict do nothing;
