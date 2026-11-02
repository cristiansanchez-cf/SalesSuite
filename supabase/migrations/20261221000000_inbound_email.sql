-- Correos al CRM (docs/CRM_DINAMICO.md §47): cada persona tiene una dirección propia por espacio
-- («apuntar-<token>@<dominio de entrada>»). Lo que reenvía o pone en copia se apunta solo como interacción en la empresa
-- del otro lado; lo que no encaja queda en su lista para asignarlo.
--  · inbound_address: la dirección de cada persona en cada espacio (solo la ve ella; el token no se adivina).
--  · inbound_email: lo que ha llegado y qué se hizo (apuntado en tal empresa, sin empresa, ignorado). Lo escribe solo el
--    servidor (service role); la persona lo ve y lo asigna.

create table public.inbound_address (
  token      text primary key check (token ~ '^[a-z0-9]{24}$'),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade
);
alter table public.inbound_address enable row level security;
create policy inbound_address_own on public.inbound_address for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.inbound_address from authenticated, anon;

create or replace function public.inbound_new_token() returns text language sql volatile as $$
  select substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24);
$$;

-- Mi dirección en este espacio (la crea la primera vez). Solo el equipo (no colaboradores).
create or replace function public.inbound_address_get(p_tenant uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null or not public.is_member(p_tenant)
     or not exists (select 1 from public.membership where tenant_id = p_tenant and user_id = auth.uid()) then
    raise exception 'Sin permiso para esta operación' using errcode = '42501';
  end if;
  select token into t from public.inbound_address where tenant_id = p_tenant and user_id = auth.uid();
  if t is null then
    insert into public.inbound_address (token, tenant_id, user_id) values (public.inbound_new_token(), p_tenant, auth.uid())
    returning token into t;
  end if;
  return t;
end $$;

-- Cambiar la dirección (si se ha filtrado): la vieja deja de funcionar.
create or replace function public.inbound_address_rotate(p_tenant uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null or not exists (select 1 from public.membership where tenant_id = p_tenant and user_id = auth.uid()) then
    raise exception 'Sin permiso para esta operación' using errcode = '42501';
  end if;
  delete from public.inbound_address where tenant_id = p_tenant and user_id = auth.uid();
  insert into public.inbound_address (token, tenant_id, user_id) values (public.inbound_new_token(), p_tenant, auth.uid())
  returning token into t;
  return t;
end $$;
revoke all on function public.inbound_address_get(uuid), public.inbound_address_rotate(uuid), public.inbound_new_token() from public, anon;
grant execute on function public.inbound_address_get(uuid), public.inbound_address_rotate(uuid) to authenticated;

create table public.inbound_email (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  provider_id  text not null check (length(provider_id) <= 200),
  message_id   text not null check (length(message_id) <= 500),
  received_at  timestamptz not null default now(),
  from_addr    text check (length(from_addr) <= 320),
  counterpart  text check (length(counterpart) <= 320),
  subject      text check (length(subject) <= 500),
  snippet      text check (length(snippet) <= 2000),
  direction    text not null default 'in' check (direction in ('in', 'out')),
  status       text not null check (status in ('logged', 'unmatched', 'ignored', 'error')),
  detail       text check (length(detail) <= 500),
  account_id   uuid,
  activity_id  uuid,
  created_at   timestamptz not null default now(),
  unique (tenant_id, user_id, message_id),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete set null (account_id)
);
create index inbound_email_user_idx on public.inbound_email (tenant_id, user_id, received_at desc);
alter table public.inbound_email enable row level security;
create policy inbound_email_read on public.inbound_email for select to authenticated
  using (user_id = auth.uid() or public.is_manager(tenant_id));
-- Asignar a mano lo que llegó sin empresa: solo la persona y solo el estado y la empresa.
create policy inbound_email_assign on public.inbound_email for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.inbound_email from authenticated, anon;
revoke update on public.inbound_email from authenticated;
grant update (status, account_id, activity_id, detail) on public.inbound_email to authenticated;

-- A qué empresa va un correo: la persona del CRM con ese email (y sus empresas), la empresa con ese email o, si no,
-- la empresa cuya web o email es de ese dominio. Con la RLS de quien lo pide (security invoker).
create or replace function public.crm_find_by_email(p_tenant uuid, p_emails text[], p_domains text[] default '{}')
returns table (kind text, contact_id uuid, account_id uuid, matched text)
language sql stable security invoker set search_path = public as $$
  with e as (select distinct lower(trim(x)) as v from unnest(coalesce(p_emails, '{}')) x where x like '%@%'),
       d as (select distinct lower(trim(x)) as v from unnest(coalesce(p_domains, '{}')) x where x ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
  select 'contact'::text, c.id, l.account_id, lower(c.email)
    from public.crm_contact c left join public.crm_contact_account l on l.contact_id = c.id
   where c.tenant_id = p_tenant and lower(c.email) in (select v from e)
  union all
  select 'account'::text, null::uuid, a.id, lower(a.email)
    from public.account a
   where a.tenant_id = p_tenant and lower(a.email) in (select v from e)
  union all
  select 'domain'::text, null::uuid, a.id, d.v
    from public.account a join d on (lower(a.email) like '%@' || d.v
      or lower(a.website) ~ ('^(https?://)?(www\.)?' || replace(d.v, '.', '\.') || '(/|$)'))
   where a.tenant_id = p_tenant
  limit 50;
$$;
revoke all on function public.crm_find_by_email(uuid, text[], text[]) from public, anon;
grant execute on function public.crm_find_by_email(uuid, text[], text[]) to authenticated;
