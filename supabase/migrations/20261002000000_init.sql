-- =============================================================================
-- SalesSuite · esquema núcleo (MVP dossiers dinámicos, multi-tenant)
-- Todas las tablas con tenant_id (salvo users) y RLS por membership.
-- El renderer público NO toca tablas: solo los RPC security definer
-- public.resolve_tenant y public.get_public_dossier (únicas rutas que saltan RLS).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.tenant_status  as enum ('active', 'suspended');
create type public.member_role    as enum ('admin', 'rep');
create type public.version_status as enum ('draft', 'published', 'archived');
create type public.dossier_status as enum ('draft', 'published', 'archived');
create type public.price_mode     as enum ('none', 'total', 'per_module');
create type public.ssl_status     as enum ('pending', 'active', 'failed');

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- tenant / domain
create table public.tenant (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name           text not null,
  status         public.tenant_status not null default 'active',
  theme_tokens   jsonb not null default '{}'::jsonb check (jsonb_typeof(theme_tokens) = 'object'),
  default_locale text not null default 'es-ES',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.domain (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  hostname     text not null unique check (hostname = lower(hostname) and hostname ~ '^[a-z0-9.-]+$'),
  is_primary   boolean not null default false,
  ssl_status   public.ssl_status not null default 'pending',
  verification jsonb,
  created_at   timestamptz not null default now()
);
create unique index domain_one_primary_per_tenant on public.domain (tenant_id) where is_primary;

-- ---------------------------------------------------------------- users / membership
create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.membership (
  user_id    uuid not null references public.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  role       public.member_role not null default 'rep',
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index membership_tenant_idx on public.membership (tenant_id);

-- Alta automática en public.users al registrarse en Supabase Auth.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------- módulos
create table public.module (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  block_type  text not null check (block_type ~ '^[a-z0-9][a-z0-9-]{1,62}$'),  -- clave del REGISTRY
  name        text not null,
  description text,
  is_catalog  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)  -- destino de FKs compuestas (mismo tenant)
);

create table public.module_version (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  module_id        uuid not null,
  version          int  not null check (version > 0),
  default_props    jsonb not null default '{}'::jsonb check (jsonb_typeof(default_props) = 'object'),
  default_price    numeric(12,2) check (default_price is null or default_price >= 0),
  default_currency char(3) not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  status           public.version_status not null default 'draft',
  created_at       timestamptz not null default now(),
  unique (module_id, version),
  unique (tenant_id, id),
  foreign key (tenant_id, module_id) references public.module (tenant_id, id) on delete cascade
);

-- Inmutabilidad: una versión publicada no cambia de contenido (los dossiers la fijan).
create or replace function public.module_version_immutable() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and (
       new.default_props    is distinct from old.default_props
    or new.default_price    is distinct from old.default_price
    or new.default_currency is distinct from old.default_currency
    or new.version          is distinct from old.version
    or new.module_id        is distinct from old.module_id
    or (new.status = 'draft')
  ) then
    raise exception 'module_version % ya no es draft: crea una versión nueva', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger module_version_immutable
  before update on public.module_version
  for each row execute function public.module_version_immutable();

-- ---------------------------------------------------------------- dossiers
create table public.dossier (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant(id) on delete cascade,
  author_id        uuid references public.users(id) on delete set null,
  title            text not null,
  prospect_name    text,
  prospect_company text,
  prospect_meta    jsonb not null default '{}'::jsonb,  -- seam CRM (F4: contact_id)
  status           public.dossier_status not null default 'draft',
  locale           text not null default 'es-ES',
  price_mode       public.price_mode not null default 'none',
  total_price      numeric(12,2) check (total_price is null or total_price >= 0),
  currency         char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  theme_override   jsonb check (theme_override is null or jsonb_typeof(theme_override) = 'object'),
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id)
);
create index dossier_tenant_status_idx on public.dossier (tenant_id, status, updated_at desc);
create index dossier_author_idx on public.dossier (author_id);

create table public.dossier_item (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  dossier_id        uuid not null,
  module_version_id uuid not null,  -- versión fijada: el dossier no se rompe al editar el módulo
  position          numeric not null,  -- rank fraccional (src/lib/rank.ts)
  visible           boolean not null default true,
  price_override    numeric(12,2) check (price_override is null or price_override >= 0),
  prop_overrides    jsonb not null default '{}'::jsonb check (jsonb_typeof(prop_overrides) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- FKs compuestas: item, dossier y versión siempre del MISMO tenant.
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete cascade,
  foreign key (tenant_id, module_version_id) references public.module_version (tenant_id, id) on delete restrict
);
create index dossier_item_order_idx on public.dossier_item (dossier_id, position);

create table public.share_link (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  dossier_id    uuid not null,
  token         text not null unique default
                  rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '='),
  is_active     boolean not null default true,
  expires_at    timestamptz,
  password_hash text,  -- futuro
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check (length(token) >= 16),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete cascade
);
create index share_link_dossier_idx on public.share_link (dossier_id);

-- tenant_id de tablas hijas se deriva del padre (el cliente no puede falsearlo).
create or replace function public.set_tenant_from_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'module_version' then
    select m.tenant_id into new.tenant_id from public.module m where m.id = new.module_id;
  else
    select d.tenant_id into new.tenant_id from public.dossier d where d.id = new.dossier_id;
  end if;
  if new.tenant_id is null then
    raise exception 'padre inexistente para %', tg_table_name using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger module_version_tenant before insert or update of module_id on public.module_version
  for each row execute function public.set_tenant_from_parent();
create trigger dossier_item_tenant before insert or update of dossier_id on public.dossier_item
  for each row execute function public.set_tenant_from_parent();
create trigger share_link_tenant before insert or update of dossier_id on public.share_link
  for each row execute function public.set_tenant_from_parent();

create trigger tenant_touch  before update on public.tenant       for each row execute function public.touch_updated_at();
create trigger module_touch  before update on public.module       for each row execute function public.touch_updated_at();
create trigger dossier_touch before update on public.dossier      for each row execute function public.touch_updated_at();
create trigger item_touch    before update on public.dossier_item for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS helpers
-- security definer + search_path vacío: evitan recursión de RLS sobre membership.
create or replace function public.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid());
$$;

create or replace function public.is_admin(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membership m
                 where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role = 'admin');
$$;

-- Un rep gestiona sus dossiers; un admin, todos los del tenant.
create or replace function public.can_edit_dossier(p_dossier uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dossier d
    join public.membership m on m.tenant_id = d.tenant_id and m.user_id = auth.uid()
    where d.id = p_dossier and (m.role = 'admin' or d.author_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------- RLS
alter table public.tenant         enable row level security;
alter table public.domain         enable row level security;
alter table public.users          enable row level security;
alter table public.membership     enable row level security;
alter table public.module         enable row level security;
alter table public.module_version enable row level security;
alter table public.dossier        enable row level security;
alter table public.dossier_item   enable row level security;
alter table public.share_link     enable row level security;

-- tenant: miembros leen; admins actualizan (tema). Alta/baja de tenants = plataforma (service role).
create policy tenant_select on public.tenant for select to authenticated using (public.is_member(id));
create policy tenant_update on public.tenant for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

create policy domain_select on public.domain for select to authenticated using (public.is_member(tenant_id));

-- users: uno mismo + compañeros de tenant (para mostrar autor).
create policy users_select on public.users for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.membership mine join public.membership theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and theirs.user_id = users.id)
);
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy membership_select on public.membership for select to authenticated using (public.is_member(tenant_id));
create policy membership_admin_write on public.membership for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- catálogo: miembros leen, admins escriben.
create policy module_select on public.module for select to authenticated using (public.is_member(tenant_id));
create policy module_admin_write on public.module for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
create policy module_version_select on public.module_version for select to authenticated using (public.is_member(tenant_id));
create policy module_version_admin_write on public.module_version for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- dossiers: miembros leen todos los del tenant; rep crea/edita los suyos; admin todos.
create policy dossier_select on public.dossier for select to authenticated using (public.is_member(tenant_id));
create policy dossier_insert on public.dossier for insert to authenticated
  with check (public.is_member(tenant_id) and author_id = auth.uid());
create policy dossier_update on public.dossier for update to authenticated
  using (public.is_admin(tenant_id) or (public.is_member(tenant_id) and author_id = auth.uid()))
  with check (public.is_admin(tenant_id) or (public.is_member(tenant_id) and author_id = auth.uid()));
create policy dossier_delete on public.dossier for delete to authenticated
  using (public.is_admin(tenant_id) or (public.is_member(tenant_id) and author_id = auth.uid()));

create policy dossier_item_select on public.dossier_item for select to authenticated using (public.is_member(tenant_id));
create policy dossier_item_write on public.dossier_item for all to authenticated
  using (public.can_edit_dossier(dossier_id)) with check (public.can_edit_dossier(dossier_id));

create policy share_link_select on public.share_link for select to authenticated using (public.is_member(tenant_id));
create policy share_link_write on public.share_link for all to authenticated
  using (public.can_edit_dossier(dossier_id)) with check (public.can_edit_dossier(dossier_id));

-- anon: ningún acceso a tablas.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- RPC públicos (únicas rutas sin RLS)

-- Host o slug → datos de marca del tenant (públicos por naturaleza: es su web).
create or replace function public.resolve_tenant(p_host text default null, p_slug text default null)
returns table (id uuid, slug text, name text, default_locale text, theme_tokens jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.name, t.default_locale, t.theme_tokens
  from public.tenant t
  where t.status = 'active'
    and (
      (p_host is not null and t.id = (select d.tenant_id from public.domain d where d.hostname = lower(p_host)))
      or (p_host is null and p_slug is not null and t.slug = p_slug)
    )
  limit 1;
$$;

-- token (+ tenant del Host) → payload de render. Devuelve NULL ante cualquier gate fallido
-- (no distingue causas → no filtra existencia). Solo campos seguros para render público.
create or replace function public.get_public_dossier(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'tenant_id', d.tenant_id, 'title', d.title,
    'prospect_name', d.prospect_name, 'prospect_company', d.prospect_company,
    'locale', d.locale, 'price_mode', d.price_mode, 'total_price', d.total_price,
    'currency', d.currency, 'theme_override', d.theme_override,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'block_type', m.block_type, 'module_key', m.key,
        'default_props', v.default_props, 'prop_overrides', i.prop_overrides,
        'default_price', v.default_price, 'price_override', i.price_override, 'currency', v.default_currency
      ) order by i.position)
      from public.dossier_item i
      join public.module_version v on v.id = i.module_version_id
      join public.module m on m.id = v.module_id
      where i.dossier_id = d.id and i.visible
    ), '[]'::jsonb)
  )
  from public.share_link l
  join public.dossier d on d.id = l.dossier_id
  join public.tenant t on t.id = d.tenant_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and d.status = 'published'
    and d.tenant_id = p_tenant_id
    and t.status = 'active';
$$;

revoke all on function public.resolve_tenant(text, text) from public;
revoke all on function public.get_public_dossier(text, uuid) from public;
grant execute on function public.resolve_tenant(text, text) to anon, authenticated;
grant execute on function public.get_public_dossier(text, uuid) to anon, authenticated;

-- Funciones internas: no invocables vía PostgREST por anon.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.set_tenant_from_parent() from public, anon, authenticated;
