-- CRM dinámico, fase 2 (docs/CRM_DINAMICO.md): empresas con grupo, personas con su papel en cada empresa, listas
-- (etiquetas) para separar verticales, campos por destino (empresa o persona) y etapas, e importaciones que se deshacen.

-- ---------------------------------------------------------------- empresas: grupo y listas
alter table public.account
  add column parent_id uuid,
  add column tags      text[] not null default '{}' check (cardinality(tags) <= 20),
  add column import_id uuid;
alter table public.account
  add constraint account_parent_fk foreign key (tenant_id, parent_id) references public.account (tenant_id, id) on delete set null (parent_id);
create index account_parent_idx on public.account (tenant_id, parent_id) where parent_id is not null;
create index account_tags_gin on public.account using gin (tags);
create index account_import_idx on public.account (import_id) where import_id is not null;

-- Un solo nivel: un grupo no está dentro de otro, y un local no es grupo de nadie.
create or replace function public.account_parent_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'Una empresa no puede ser su propio grupo' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.account where id = new.parent_id and parent_id is not null) then
    raise exception 'Ese grupo ya está dentro de otro grupo' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.account where parent_id = new.id) then
    raise exception 'Esta empresa ya es grupo de otras' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger account_parent_check before insert or update of parent_id on public.account
  for each row execute function public.account_parent_check();

-- ---------------------------------------------------------------- campos: de empresa o de persona, por listas, etapas
alter table public.crm_field
  add column target   text not null default 'account' check (target in ('account', 'contact')),
  add column tags     text[] not null default '{}' check (cardinality(tags) <= 20),
  add column is_stage boolean not null default false;

-- El trigger de valores de la cuenta solo admite campos de empresa.
create or replace function public.account_fields_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare unknown text;
begin
  if new.fields is null or new.fields = '{}'::jsonb then return new; end if;
  if tg_op = 'UPDATE' and new.fields = old.fields then return new; end if;
  select k into unknown from jsonb_object_keys(new.fields) as k
   where not exists (select 1 from public.crm_field f where f.tenant_id = new.tenant_id and f.key = k and f.target = 'account')
   limit 1;
  if unknown is not null then raise exception 'Campo desconocido: %', unknown using errcode = 'check_violation'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- importaciones (antes que lo importado, que apunta aquí)
create table public.crm_import (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  created_by  uuid default auth.uid() references public.users(id) on delete set null,
  file_name   text not null check (length(file_name) between 1 and 200),
  -- Qué es cada fila: una empresa o una persona.
  target      text not null check (target in ('account', 'contact')),
  headers     text[] not null,
  rows        jsonb not null check (jsonb_typeof(rows) = 'array'),
  mapping     jsonb not null default '{}'::jsonb,
  status      text not null default 'draft' check (status in ('draft', 'done', 'undone')),
  stats       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  unique (tenant_id, id)
);
alter table public.crm_import enable row level security;
-- Importar es cosa de quien gestiona el territorio (admin o gerente).
create policy crm_import_manager on public.crm_import for all to authenticated
  using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));

-- ---------------------------------------------------------------- personas
create table public.crm_contact (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 160),
  email       text check (length(email) <= 200),
  phone       text check (length(phone) <= 40),
  instagram   text check (length(instagram) <= 300),
  linkedin    text check (length(linkedin) <= 300),
  city        text check (length(city) <= 80),
  notes       text check (length(notes) <= 4000),
  fields      jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 32000),
  tags        text[] not null default '{}' check (cardinality(tags) <= 20),
  owner_id    uuid references public.users(id) on delete set null,
  import_id   uuid,
  created_by  uuid default auth.uid() references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, import_id) references public.crm_import (tenant_id, id) on delete set null (import_id)
);
create index crm_contact_tenant_idx on public.crm_contact (tenant_id, name);
create index crm_contact_tags_gin on public.crm_contact using gin (tags);
create index crm_contact_fields_gin on public.crm_contact using gin (fields jsonb_path_ops);
create index crm_contact_import_idx on public.crm_contact (import_id) where import_id is not null;

alter table public.account
  add constraint account_import_fk foreign key (tenant_id, import_id) references public.crm_import (tenant_id, id) on delete set null (import_id);

create or replace function public.crm_contact_fields_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare unknown text;
begin
  new.updated_at := now();
  if new.fields is null or new.fields = '{}'::jsonb then return new; end if;
  if tg_op = 'UPDATE' and new.fields = old.fields then return new; end if;
  select k into unknown from jsonb_object_keys(new.fields) as k
   where not exists (select 1 from public.crm_field f where f.tenant_id = new.tenant_id and f.key = k and f.target = 'contact')
   limit 1;
  if unknown is not null then raise exception 'Campo desconocido: %', unknown using errcode = 'check_violation'; end if;
  return new;
end $$;
create trigger crm_contact_fields_check before insert or update on public.crm_contact
  for each row execute function public.crm_contact_fields_check();

alter table public.crm_contact enable row level security;
create policy crm_contact_select on public.crm_contact for select to authenticated using (public.is_member(tenant_id));
create policy crm_contact_insert on public.crm_contact for insert to authenticated with check (public.is_member(tenant_id));
create policy crm_contact_update on public.crm_contact for update to authenticated
  using (public.is_manager(tenant_id) or owner_id = auth.uid() or created_by = auth.uid() or owner_id is null)
  with check (public.is_member(tenant_id));
create policy crm_contact_delete on public.crm_contact for delete to authenticated using (public.is_manager(tenant_id));

-- Persona ↔ empresa, con su papel en cada una (Brother: fundador de la Bresh y DJ en otro club).
create table public.crm_contact_account (
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  contact_id  uuid not null,
  account_id  uuid not null,
  role        text check (length(role) <= 80),
  created_at  timestamptz not null default now(),
  primary key (contact_id, account_id),
  foreign key (tenant_id, contact_id) references public.crm_contact (tenant_id, id) on delete cascade,
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade
);
create index crm_contact_account_acc_idx on public.crm_contact_account (account_id);
alter table public.crm_contact_account enable row level security;
create policy crm_contact_account_select on public.crm_contact_account for select to authenticated using (public.is_member(tenant_id));
create policy crm_contact_account_write on public.crm_contact_account for all to authenticated
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
