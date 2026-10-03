-- =============================================================================
-- Mapa de mercado (docs/PLAYBOOK.md §Mercado): sectores con su cliente ideal, actores
-- (stakeholders) con necesidades y forma de abordarlos, encaje módulo↔sector y
-- ángulo módulo↔actor. Cuenta del dossier (mapa de poder) y próximo paso (seguimiento).
-- Semilla del CRM futuro: dossier_contact → contact/deal.
-- =============================================================================

create type public.persona_role as enum ('decisor', 'pagador', 'influenciador', 'campeon', 'usuario', 'guardian');
create type public.contact_stance as enum ('aliado', 'neutral', 'bloqueador', 'desconocido');

create table public.segment (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenant(id) on delete cascade,
  key            text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name           text not null check (length(name) between 1 and 80),
  description    text check (length(description) <= 1000),
  value_prop     text check (length(value_prop) <= 1000),   -- por qué nosotros en este sector
  icp            text check (length(icp) <= 2000),          -- cliente ideal: tamaño, señales
  disqualifiers  text check (length(disqualifiers) <= 1000),-- cuándo NO perder el tiempo
  buying_process text check (length(buying_process) <= 2000),
  deal_size      text check (length(deal_size) <= 200),
  sales_cycle    text check (length(sales_cycle) <= 200),
  position       numeric not null default 0,
  status         public.play_status not null default 'official',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);

create table public.persona (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  segment_id      uuid not null,
  key             text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name            text not null check (length(name) between 1 and 80),     -- cargo / papel: "DJ residente"
  role            public.persona_role not null,
  goals           text check (length(goals) <= 2000),          -- qué quiere conseguir
  pains           text check (length(pains) <= 2000),          -- qué le duele
  kpis            text check (length(kpis) <= 1000),           -- qué mide / le hace quedar bien
  objections      public.objection_type[] not null default '{}',
  how_to_approach text check (length(how_to_approach) <= 2000),-- canal, gancho, momento
  avoid           text check (length(avoid) <= 1000),
  can_help        text check (length(can_help) <= 1000),       -- cómo puede ayudar (aliado)
  can_block       text check (length(can_block) <= 1000),      -- cómo puede tumbarlo
  position        numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id),
  foreign key (tenant_id, segment_id) references public.segment (tenant_id, id) on delete cascade
);

-- Encaje de cada módulo en cada sector (ICP por módulo).
create table public.segment_module (
  tenant_id  uuid not null,
  segment_id uuid not null,
  module_id  uuid not null,
  fit        text check (length(fit) <= 1000),   -- por qué encaja aquí
  priority   smallint not null default 2 check (priority between 1 and 3),  -- 1 = estrella
  primary key (segment_id, module_id),
  foreign key (tenant_id, segment_id) references public.segment (tenant_id, id) on delete cascade,
  foreign key (tenant_id, module_id) references public.module (tenant_id, id) on delete cascade
);

-- Qué le resuelve cada módulo a cada actor (ángulo de venta).
create table public.persona_module (
  tenant_id  uuid not null,
  persona_id uuid not null,
  module_id  uuid not null,
  angle      text not null check (length(angle) between 1 and 1000),
  primary key (persona_id, module_id),
  foreign key (tenant_id, persona_id) references public.persona (tenant_id, id) on delete cascade,
  foreign key (tenant_id, module_id) references public.module (tenant_id, id) on delete cascade
);

-- Jugadas dirigidas a actores concretos (claves de persona).
alter table public.play add column personas text[] not null default '{}';

-- ---------------------------------------------------------------- cuenta del dossier
alter table public.dossier
  add column segment_id uuid,
  add column next_step text check (length(next_step) <= 300),
  add column next_step_at timestamptz,
  add foreign key (tenant_id, segment_id) references public.segment (tenant_id, id) on delete set null (segment_id);
create index dossier_next_step_idx on public.dossier (tenant_id, next_step_at) where next_step_at is not null;

-- Mapa de poder de la cuenta: personas reales del prospecto y su postura.
create table public.dossier_contact (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  dossier_id uuid not null,
  persona_id uuid,
  name       text not null check (length(name) between 1 and 120),
  stance     public.contact_stance not null default 'desconocido',
  email      text check (email is null or length(email) <= 200),
  phone      text check (phone is null or length(phone) <= 40),
  notes      text check (length(notes) <= 1000),
  position   numeric not null default 0,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete cascade,
  foreign key (tenant_id, persona_id) references public.persona (tenant_id, id) on delete set null (persona_id)
);
create index dossier_contact_dossier_idx on public.dossier_contact (dossier_id);

create trigger dossier_contact_tenant before insert or update of dossier_id on public.dossier_contact
  for each row execute function public.set_tenant_from_parent();
create trigger dossier_contact_touch_parent after insert or update or delete on public.dossier_contact
  for each row execute function public.touch_parent_dossier();
create trigger segment_touch before update on public.segment for each row execute function public.touch_updated_at();
create trigger persona_touch before update on public.persona for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------- RLS
alter table public.segment         enable row level security;
alter table public.persona         enable row level security;
alter table public.segment_module  enable row level security;
alter table public.persona_module  enable row level security;
alter table public.dossier_contact enable row level security;

create policy segment_select on public.segment for select to authenticated
  using (public.is_admin(tenant_id) or (public.is_member(tenant_id) and status = 'official'));
create policy segment_admin on public.segment for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy persona_select on public.persona for select to authenticated using (public.is_member(tenant_id));
create policy persona_admin on public.persona for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy segment_module_select on public.segment_module for select to authenticated using (public.is_member(tenant_id));
create policy segment_module_admin on public.segment_module for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy persona_module_select on public.persona_module for select to authenticated using (public.is_member(tenant_id));
create policy persona_module_admin on public.persona_module for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- Contactos: los ven los miembros del tenant; los edita quien puede editar el dossier.
create policy dossier_contact_select on public.dossier_contact for select to authenticated using (public.is_member(tenant_id));
create policy dossier_contact_write on public.dossier_contact for all to authenticated
  using (public.can_edit_dossier(dossier_id)) with check (public.can_edit_dossier(dossier_id));
