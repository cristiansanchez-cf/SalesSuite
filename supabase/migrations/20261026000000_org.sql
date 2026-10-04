-- =============================================================================
-- Organigrama (docs/ORG.md): delegaciones (equipos comerciales con su gerente y sus zonas), gerente global y
-- superadmin de la plataforma.
--  · Delegación: un grupo de zonas con su gerente. Cada persona pertenece (o no) a una delegación.
--  · Gerente (rol «lead»): CON delegación ve y gestiona solo a su equipo (propuestas, comisiones, condiciones,
--    zonas de su gente); SIN delegación es gerente global: todo el espacio, como hasta ahora.
--  · Superadmin (platform_admin): fuera de los espacios; ve y gestiona todos, como un admin de cada uno.
-- =============================================================================

-- ---------------------------------------------------------------- superadmin
create table public.platform_admin (
  user_id    uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admin enable row level security;
revoke all on public.platform_admin from anon, authenticated;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admin p where p.user_id = auth.uid());
$$;
grant execute on function public.is_superadmin() to authenticated;

-- ---------------------------------------------------------------- delegaciones
create table public.delegation (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  manager_id uuid references public.users(id) on delete set null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);
alter table public.membership add column delegation_id uuid;
alter table public.membership add foreign key (tenant_id, delegation_id) references public.delegation (tenant_id, id) on delete set null (delegation_id);
alter table public.zone add column delegation_id uuid;
alter table public.zone add foreign key (tenant_id, delegation_id) references public.delegation (tenant_id, id) on delete set null (delegation_id);
create index membership_delegation_idx on public.membership (tenant_id, delegation_id);

-- ---------------------------------------------------------------- helpers (el superadmin cuenta como admin en todas partes)
create or replace function public.my_role(p_tenant uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.role from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid()),
    case when public.is_superadmin() then 'admin'::public.member_role end);
$$;

create or replace function public.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_superadmin() or exists (select 1 from public.membership m
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role in ('admin', 'lead', 'rep'));
$$;

create or replace function public.is_manager(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_superadmin() or exists (select 1 from public.membership m
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role in ('admin', 'lead'));
$$;

create or replace function public.is_admin(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_superadmin() or exists (select 1 from public.membership m
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role = 'admin');
$$;

-- Mi delegación (null = sin delegación).
create or replace function public.my_delegation(p_tenant uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.delegation_id from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid();
$$;

-- Ve todo el espacio: superadmin, admin o gerente sin delegación (gerente global).
create or replace function public.is_global_manager(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_superadmin() or exists (select 1 from public.membership m
    where m.tenant_id = p_tenant and m.user_id = auth.uid()
      and (m.role = 'admin' or (m.role = 'lead' and m.delegation_id is null)));
$$;

-- ¿Gestiono a esta persona? Yo mismo; el global, a todos; el gerente de delegación, a los de su delegación.
create or replace function public.manages_user(p_tenant uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or public.is_global_manager(p_tenant) or exists (
    select 1 from public.membership me join public.membership them on them.tenant_id = me.tenant_id
    where me.tenant_id = p_tenant and me.user_id = auth.uid() and me.role = 'lead' and me.delegation_id is not null
      and them.user_id = p_user and them.delegation_id = me.delegation_id);
$$;
grant execute on function public.my_delegation(uuid), public.is_global_manager(uuid), public.manages_user(uuid, uuid) to authenticated;

create or replace function public.can_edit_dossier(p_dossier uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dossier d where d.id = p_dossier and (
    public.is_global_manager(d.tenant_id)
    or (public.my_role(d.tenant_id) = 'lead' and d.author_id is not null and public.manages_user(d.tenant_id, d.author_id))
    or (d.author_id = auth.uid() and (public.my_role(d.tenant_id) = 'rep' or public.is_partner(d.tenant_id)))));
$$;

-- ---------------------------------------------------------------- políticas: el gerente de delegación, solo lo suyo
alter table public.delegation enable row level security;
create policy delegation_select on public.delegation for select to authenticated using (public.is_member(tenant_id));
create policy delegation_write on public.delegation for all to authenticated
  using (public.is_global_manager(tenant_id)) with check (public.is_global_manager(tenant_id));

-- Propuestas: los comerciales siguen viendo las del espacio (cuentas y conflictos); el gerente de delegación, las de su equipo.
drop policy dossier_select on public.dossier;
create policy dossier_select on public.dossier for select to authenticated using (
  public.is_member(tenant_id) and (public.my_role(tenant_id) is distinct from 'lead' or public.is_global_manager(tenant_id)
    or author_id is null or public.manages_user(tenant_id, author_id)));
drop policy dossier_manager_update on public.dossier;
drop policy dossier_manager_delete on public.dossier;
create policy dossier_manager_update on public.dossier for update to authenticated
  using (public.is_manager(tenant_id) and (public.is_global_manager(tenant_id) or public.manages_user(tenant_id, author_id)))
  with check (public.is_manager(tenant_id) and (public.is_global_manager(tenant_id) or public.manages_user(tenant_id, author_id)));
create policy dossier_manager_delete on public.dossier for delete to authenticated
  using (public.is_manager(tenant_id) and (public.is_global_manager(tenant_id) or public.manages_user(tenant_id, author_id)));

-- Comisiones y condiciones: cada gerente, las de su gente.
drop policy commission_entry_select on public.commission_entry;
create policy commission_entry_select on public.commission_entry for select to authenticated using (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id) or user_id = auth.uid());
drop policy payout_select on public.payout;
create policy payout_select on public.payout for select to authenticated using (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id) or user_id = auth.uid());
drop policy commission_plan_member_select on public.commission_plan_member;
create policy commission_plan_member_select on public.commission_plan_member for select to authenticated using (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id) or user_id = auth.uid());
drop policy revenue_event_select on public.revenue_event;
create policy revenue_event_select on public.revenue_event for select to authenticated using (
  public.is_global_manager(tenant_id) or seller_id = auth.uid() or created_by = auth.uid()
  or (public.is_manager(tenant_id) and seller_id is not null and public.manages_user(tenant_id, seller_id)));
drop policy member_conditions_select on public.member_conditions;
create policy member_conditions_select on public.member_conditions for select to authenticated
  using (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id) or user_id = auth.uid());
drop policy member_conditions_history_select on public.member_conditions_history;
create policy member_conditions_history_select on public.member_conditions_history for select to authenticated
  using (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id) or user_id = auth.uid());

-- Zonas de cada persona: el gerente de delegación asigna las de su gente.
drop policy membership_zone_manager on public.membership_zone;
create policy membership_zone_manager on public.membership_zone for all to authenticated
  using (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id))
  with check (public.is_manager(tenant_id) and public.manages_user(tenant_id, user_id));

-- Equipo: el gerente de delegación invita a su delegación (lo que entra, entra en la suya) y solo quita a los suyos.
drop policy membership_lead_insert on public.membership;
drop policy membership_lead_delete on public.membership;
create policy membership_lead_insert on public.membership for insert to authenticated
  with check (public.my_role(tenant_id) = 'lead' and role in ('rep', 'partner')
    and (public.is_global_manager(tenant_id) or delegation_id = public.my_delegation(tenant_id)));
create policy membership_lead_delete on public.membership for delete to authenticated
  using (public.my_role(tenant_id) = 'lead' and role in ('rep', 'partner') and public.manages_user(tenant_id, user_id));

-- Mover a alguien de delegación o nombrar gerente: admin o gerente global (el admin ya escribe membership).
create or replace function public.set_member_delegation(p_tenant uuid, p_user uuid, p_delegation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_global_manager(p_tenant) then raise exception 'Solo el admin o un gerente global' using errcode = '42501'; end if;
  if p_delegation is not null and not exists (select 1 from public.delegation d where d.id = p_delegation and d.tenant_id = p_tenant) then
    raise exception 'Delegación no encontrada' using errcode = 'P0002';
  end if;
  update public.membership set delegation_id = p_delegation where tenant_id = p_tenant and user_id = p_user;
  if not found then raise exception 'Esa persona no está en el equipo' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.set_member_delegation(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_member_delegation(uuid, uuid, uuid) to authenticated;

-- El gerente de una delegación pertenece a ella (si no, no vería a su equipo).
create or replace function public.delegation_manager_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.manager_id is not null then
    update public.membership set delegation_id = new.id, role = case when role = 'rep' then 'lead'::public.member_role else role end
    where tenant_id = new.tenant_id and user_id = new.manager_id and role in ('rep', 'lead');
  end if;
  return new;
end $$;
revoke all on function public.delegation_manager_sync() from public, anon, authenticated;
create trigger delegation_manager_sync after insert or update of manager_id on public.delegation
  for each row execute function public.delegation_manager_sync();

-- ---------------------------------------------------------------- tenant / usuarios: el superadmin los ve todos
drop policy tenant_select on public.tenant;
create policy tenant_select on public.tenant for select to authenticated
  using (public.is_member(id) or public.is_partner(id));
drop policy users_select on public.users;
create policy users_select on public.users for select to authenticated using (
  id = auth.uid() or public.is_superadmin() or exists (
    select 1 from public.membership mine join public.membership theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and mine.role in ('admin', 'lead', 'rep') and theirs.user_id = users.id)
);

-- Vista de plataforma (solo superadmin): cada espacio con sus cifras.
create or replace function public.platform_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_superadmin() then null else coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'created_at', t.created_at,
    'domain', (select d.hostname from public.domain d where d.tenant_id = t.id order by d.is_primary desc, d.hostname limit 1),
    'members', (select count(*) from public.membership m where m.tenant_id = t.id),
    'delegations', (select count(*) from public.delegation g where g.tenant_id = t.id),
    'dossiers', (select count(*) from public.dossier x where x.tenant_id = t.id),
    'published', (select count(*) from public.dossier x where x.tenant_id = t.id and x.status = 'published'),
    'revenue_cents', (select coalesce(sum(case when e.kind = 'refund' then -e.revenue_cents else e.revenue_cents end), 0)
                      from public.revenue_event e where e.tenant_id = t.id and e.status = 'confirmed')
  ) order by t.created_at), '[]'::jsonb) end
  from public.tenant t;
$$;
revoke all on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;
