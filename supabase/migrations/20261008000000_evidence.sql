-- =============================================================================
-- Qué ha funcionado (docs/EVIDENCE.md): evidencia objetiva en lugar de «me gusta».
--  - situation_facet: dimensiones de la situación que configura cada tenant (tipo de personalidad,
--    región, rasgos de la cuenta…). Nada de esto está escrito para Enjoy: lo define el CEO/líder.
--  - dossier.situation / dossier_contact.traits: la situación concreta de cada cuenta y persona.
--  - win_story: cierre documentado (ganado o perdido): situación + qué se usó + qué funcionó.
--    Es la fuente del ranking y de las recomendaciones «en situaciones parecidas funcionó…».
-- Cuando exista el CRM, win_story se alimentará de la interacción registrada (WhatsApp/n8n).
-- =============================================================================

create type public.facet_scope as enum ('account', 'contact');
create type public.story_outcome as enum ('won', 'lost');
create type public.story_status as enum ('shared', 'hidden');

create table public.situation_facet (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  label      text not null check (length(label) between 1 and 60),       -- "Tipo de personalidad"
  question   text check (length(question) <= 200),                        -- "¿Cómo es la persona con la que hablas?"
  icon       text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  scope      public.facet_scope not null default 'account',               -- de la cuenta o de una persona
  multi      boolean not null default false,
  weight     smallint not null default 1 check (weight between 1 and 5),  -- cuánto pesa al comparar situaciones
  options    jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 40),
  position   numeric not null default 0,
  status     public.play_status not null default 'official',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);
create trigger situation_facet_touch before update on public.situation_facet for each row execute function public.touch_updated_at();

-- Icono de sector (asistente de configuración).
alter table public.segment add column icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');

-- Situación de la cuenta: { "<facet key>": ["<option key>", …] }
alter table public.dossier add column situation jsonb not null default '{}'::jsonb check (jsonb_typeof(situation) = 'object');
alter table public.dossier_contact add column traits jsonb not null default '{}'::jsonb check (jsonb_typeof(traits) = 'object');

create table public.win_story (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  dossier_id   uuid,
  author_id    uuid references public.users(id) on delete set null,
  outcome      public.story_outcome not null,
  segment_id   uuid,
  persona_ids  uuid[] not null default '{}',
  situation    jsonb not null default '{}'::jsonb check (jsonb_typeof(situation) = 'object'),
  play_ids     uuid[] not null default '{}',
  what_worked  text check (length(what_worked) <= 2000),
  what_failed  text check (length(what_failed) <= 2000),
  key_stage    public.sales_stage,
  objection    public.objection_type,
  title        text not null check (length(title) between 1 and 160),
  status       public.story_status not null default 'shared',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  check (outcome <> 'won' or length(coalesce(what_worked, '')) > 0),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete set null (dossier_id),
  foreign key (tenant_id, segment_id) references public.segment (tenant_id, id) on delete set null (segment_id)
);
create unique index win_story_dossier_uidx on public.win_story (dossier_id) where dossier_id is not null;
create index win_story_tenant_idx on public.win_story (tenant_id, status, created_at desc);
create trigger win_story_touch before update on public.win_story for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.situation_facet enable row level security;
alter table public.win_story enable row level security;

-- Facetas: todos los que trabajan en el tenant las leen; el admin las define.
create policy facet_select on public.situation_facet for select to authenticated
  using (public.is_member(tenant_id) or public.is_partner(tenant_id));
create policy facet_admin on public.situation_facet for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- Cierres: el equipo ve los compartidos y los propios; el admin, todos.
create policy story_select_team on public.win_story for select to authenticated
  using (public.is_member(tenant_id) and (status = 'shared' or author_id = auth.uid() or public.is_admin(tenant_id)));
-- El colaborador ve los suyos y, si el admin se lo permite, los compartidos del equipo.
create policy story_select_partner on public.win_story for select to authenticated
  using (public.is_partner(tenant_id) and (author_id = auth.uid() or (status = 'shared' and public.partner_sees_tips(tenant_id))));
-- Cualquiera documenta SUS cierres, de dossiers que puede editar (o sin dossier).
create policy story_insert on public.win_story for insert to authenticated
  with check ((public.is_member(tenant_id) or public.is_partner(tenant_id)) and author_id = auth.uid() and status = 'shared'
              and (dossier_id is null or public.can_edit_dossier(dossier_id)));
create policy story_update_own on public.win_story for update to authenticated
  using (author_id = auth.uid() and (public.is_member(tenant_id) or public.is_partner(tenant_id)))
  with check (author_id = auth.uid() and status = 'shared');
create policy story_admin on public.win_story for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
