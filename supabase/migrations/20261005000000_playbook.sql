-- =============================================================================
-- Playbook de ventas (docs/PLAYBOOK.md): jugadas oficiales por módulo, capa de equipo,
-- evidencia ("me funcionó"), formación y resultado de dossiers.
-- Taxonomía de etapa/objeción alineada con el Cerebro de Ventas.
-- =============================================================================

create type public.play_kind as enum ('pitch', 'fit', 'discovery', 'objection', 'proof', 'monetization', 'script', 'tip');
create type public.sales_stage as enum (
  'prospeccion', 'primer_contacto', 'descubrimiento', 'pitch_demo', 'objeciones', 'negociacion', 'cierre', 'seguimiento', 'mentalidad');
create type public.objection_type as enum (
  'precio', 'tiempo', 'desconfianza', 'no_lo_necesito', 'no_decido_yo', 'comparar', 'ya_tengo_proveedor');
create type public.play_status as enum ('draft', 'official', 'archived');
create type public.contribution_type as enum ('tip', 'change');
create type public.contribution_status as enum ('shared', 'pending', 'accepted', 'rejected', 'hidden');
create type public.feedback_verdict as enum ('worked', 'didnt');
create type public.dossier_outcome as enum ('open', 'won', 'lost');

-- ---------------------------------------------------------------- jugadas
create table public.play (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenant(id) on delete cascade,
  module_id      uuid,                       -- null = jugada general de la empresa
  key            text check (key is null or key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),  -- estable para importar
  kind           public.play_kind not null,
  stage          public.sales_stage,
  objection      public.objection_type,
  segments       text[] not null default '{}',
  title          text not null check (length(title) between 1 and 200),
  body           text not null default '' check (length(body) <= 8000),
  when_to_use    text check (length(when_to_use) <= 1000),
  why_it_works   text check (length(why_it_works) <= 2000),
  technique_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(technique_refs) = 'array'),
  position       numeric not null default 0,
  status         public.play_status not null default 'official',
  version        int not null default 1,
  author_id      uuid references public.users(id) on delete set null,
  updated_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, key),
  foreign key (tenant_id, module_id) references public.module (tenant_id, id) on delete cascade
);
create index play_tenant_module_idx on public.play (tenant_id, module_id, status, position);

create table public.play_revision (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  play_id         uuid not null,
  version         int not null,
  snapshot        jsonb not null,
  change_note     text check (length(change_note) <= 500),
  changed_by      uuid references public.users(id) on delete set null,
  contribution_id uuid,
  created_at      timestamptz not null default now(),
  unique (play_id, version),
  foreign key (tenant_id, play_id) references public.play (tenant_id, id) on delete cascade
);
create index play_revision_tenant_idx on public.play_revision (tenant_id, created_at desc);

-- ---------------------------------------------------------------- capa de equipo
create table public.play_contribution (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  type        public.contribution_type not null,
  play_id     uuid,              -- 'change': jugada a mejorar; 'tip': opcional (truco sobre una jugada)
  module_id   uuid,              -- 'tip': módulo al que aplica (null = general)
  kind        public.play_kind not null default 'tip',
  title       text not null check (length(title) between 1 and 200),
  body        text not null check (length(body) between 1 and 4000),
  status      public.contribution_status not null,
  author_id   uuid not null references public.users(id) on delete cascade,
  review_note text check (length(review_note) <= 500),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  check (type <> 'change' or play_id is not null),
  foreign key (tenant_id, play_id) references public.play (tenant_id, id) on delete cascade,
  foreign key (tenant_id, module_id) references public.module (tenant_id, id) on delete cascade
);
create index play_contribution_tenant_idx on public.play_contribution (tenant_id, status, created_at desc);

alter table public.play_revision
  add foreign key (tenant_id, contribution_id) references public.play_contribution (tenant_id, id) on delete set null (contribution_id);

-- ---------------------------------------------------------------- evidencia
create table public.play_feedback (
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  target_type text not null check (target_type in ('play', 'contribution')),
  target_id   uuid not null,
  verdict     public.feedback_verdict not null,
  note        text check (length(note) <= 500),
  dossier_id  uuid,
  updated_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete set null (dossier_id)
);
create index play_feedback_tenant_idx on public.play_feedback (tenant_id, target_type, target_id);

-- El objetivo del feedback debe ser del mismo tenant (FK polimórfica → trigger).
create or replace function public.play_feedback_target_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.target_type = 'play' and not exists (select 1 from public.play p where p.id = new.target_id and p.tenant_id = new.tenant_id))
     or (new.target_type = 'contribution' and not exists (select 1 from public.play_contribution c where c.id = new.target_id and c.tenant_id = new.tenant_id)) then
    raise exception 'objetivo de feedback inexistente en este tenant' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
revoke all on function public.play_feedback_target_check() from public, anon, authenticated;
create trigger play_feedback_target before insert or update on public.play_feedback
  for each row execute function public.play_feedback_target_check();

-- ---------------------------------------------------------------- formación
create table public.learning_progress (
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  topic        text not null check (topic = 'general' or topic ~ '^[0-9a-f-]{36}$'),  -- 'general' o module_id
  completed_at timestamptz not null default now(),
  primary key (tenant_id, user_id, topic)
);

create table public.playbook_seen (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- ---------------------------------------------------------------- resultado del dossier
alter table public.dossier
  add column outcome public.dossier_outcome not null default 'open',
  add column outcome_note text check (length(outcome_note) <= 500),
  add column outcome_at timestamptz;

-- ---------------------------------------------------------------- triggers
create trigger play_touch before update on public.play for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.play              enable row level security;
alter table public.play_revision     enable row level security;
alter table public.play_contribution enable row level security;
alter table public.play_feedback     enable row level security;
alter table public.learning_progress enable row level security;
alter table public.playbook_seen     enable row level security;

-- Jugadas: los miembros leen las oficiales; los admins todo y escriben.
create policy play_select on public.play for select to authenticated
  using (public.is_admin(tenant_id) or (public.is_member(tenant_id) and status = 'official'));
create policy play_admin_write on public.play for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

create policy play_revision_select on public.play_revision for select to authenticated
  using (public.is_member(tenant_id));
create policy play_revision_admin_insert on public.play_revision for insert to authenticated
  with check (public.is_admin(tenant_id));

-- Aportes: visibles los compartidos/aceptados; los propios y todo para admins.
create policy contribution_select on public.play_contribution for select to authenticated
  using (public.is_member(tenant_id) and (status in ('shared', 'accepted') or author_id = auth.uid() or public.is_admin(tenant_id)));
-- Cualquier miembro aporta a su nombre: un truco nace compartido; una mejora, pendiente.
create policy contribution_insert on public.play_contribution for insert to authenticated
  with check (public.is_member(tenant_id) and author_id = auth.uid()
    and reviewed_by is null and reviewed_at is null and review_note is null
    and ((type = 'tip' and status = 'shared') or (type = 'change' and status = 'pending')));
-- Solo admins revisan (cambian estado).
create policy contribution_admin_update on public.play_contribution for update to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
-- El autor puede retirar lo suyo mientras no se haya revisado; el admin, cualquiera.
create policy contribution_delete on public.play_contribution for delete to authenticated
  using (public.is_admin(tenant_id) or (author_id = auth.uid() and status in ('shared', 'pending')));

-- Feedback: todos ven los votos del tenant; cada uno escribe los suyos.
create policy feedback_select on public.play_feedback for select to authenticated using (public.is_member(tenant_id));
create policy feedback_write on public.play_feedback for all to authenticated
  using (user_id = auth.uid() and public.is_member(tenant_id))
  with check (user_id = auth.uid() and public.is_member(tenant_id));

-- Progreso y "visto": propios; los admins leen el del equipo.
create policy progress_select on public.learning_progress for select to authenticated
  using (user_id = auth.uid() or public.is_admin(tenant_id));
create policy progress_write on public.learning_progress for all to authenticated
  using (user_id = auth.uid() and public.is_member(tenant_id))
  with check (user_id = auth.uid() and public.is_member(tenant_id));
create policy seen_all on public.playbook_seen for all to authenticated
  using (user_id = auth.uid() and public.is_member(tenant_id))
  with check (user_id = auth.uid() and public.is_member(tenant_id));
