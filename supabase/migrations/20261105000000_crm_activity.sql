-- CRM fase 3 (docs/CRM_DINAMICO.md §10): contacto de la empresa, historial de interacciones y próximo paso.

-- ---------------------------------------------------------------- contacto de la empresa (de serie, como en la persona)
alter table public.account
  add column phone      text check (length(phone) <= 40),
  add column email      text check (length(email) <= 200),
  add column instagram  text check (length(instagram) <= 300),
  add column linkedin   text check (length(linkedin) <= 300),
  add column website    text check (length(website) <= 300),
  add column maps_url   text check (length(maps_url) <= 500);

-- ---------------------------------------------------------------- próximo paso (lo que sale en «Hoy»)
alter table public.account
  add column next_step       text check (length(next_step) <= 300),
  add column next_step_at    timestamptz,
  add column next_contact_id uuid,
  add column next_channel    text check (next_channel in ('instagram', 'linkedin', 'whatsapp', 'phone', 'email', 'visit', 'meeting', 'other'));
alter table public.account
  add constraint account_next_contact_fk foreign key (tenant_id, next_contact_id) references public.crm_contact (tenant_id, id) on delete set null (next_contact_id);
create index account_next_step_idx on public.account (tenant_id, next_step_at) where next_step_at is not null;

-- ---------------------------------------------------------------- interacciones
create table public.crm_activity (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  account_id  uuid not null,
  contact_id  uuid,
  user_id     uuid default auth.uid() references public.users(id) on delete set null,
  channel     text not null check (channel in ('instagram', 'linkedin', 'whatsapp', 'phone', 'email', 'visit', 'meeting', 'other')),
  -- Qué pasó: sin respuesta, contestó, interesado, no interesado, cita conseguida o solo una nota (investigación).
  outcome     text not null check (outcome in ('no_reply', 'replied', 'interested', 'not_interested', 'meeting', 'note')),
  note        text check (length(note) <= 4000),
  happened_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.crm_contact (tenant_id, id) on delete set null (contact_id)
);
create index crm_activity_account_idx on public.crm_activity (account_id, happened_at desc);
alter table public.crm_activity enable row level security;
create policy crm_activity_select on public.crm_activity for select to authenticated using (public.is_member(tenant_id));
-- Cada uno registra lo suyo; corrige o borra lo suyo (o un/a gerente).
create policy crm_activity_insert on public.crm_activity for insert to authenticated
  with check (public.is_member(tenant_id) and user_id = auth.uid());
create policy crm_activity_update on public.crm_activity for update to authenticated
  using (user_id = auth.uid() or public.is_manager(tenant_id)) with check (public.is_member(tenant_id));
create policy crm_activity_delete on public.crm_activity for delete to authenticated
  using (user_id = auth.uid() or public.is_manager(tenant_id));
