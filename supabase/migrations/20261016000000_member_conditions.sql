-- Condiciones de cada vendedor (docs/FOUNDATIONS.md §4.1): son OPCIONALES. Solo se le enseñan cuando el admin
-- las marca como acordadas; hasta entonces puede vender igual («primero valida que se vende, luego hablamos»).
create table public.member_conditions (
  tenant_id  uuid not null,
  user_id    uuid not null,
  visible    boolean not null default false,
  note       text check (length(note) <= 1000),
  agreed_at  timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade
);
create trigger member_conditions_touch before update on public.member_conditions for each row execute function public.touch_updated_at();

alter table public.member_conditions enable row level security;
create policy member_conditions_select on public.member_conditions for select to authenticated
  using (public.is_manager(tenant_id) or user_id = auth.uid());
create policy member_conditions_admin on public.member_conditions for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- Mis condiciones: el plan que me aplica (propio o el general), solo si están acordadas. Sirve también a
-- colaboradores, que no leen la tabla de planes.
create or replace function public.my_conditions(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.member_conditions;
  p public.commission_plan;
begin
  if not exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid()) then
    raise exception 'Sin acceso' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.member_conditions x where x.tenant_id = p_tenant and x.user_id = auth.uid();
  if not coalesce(c.visible, false) then return jsonb_build_object('visible', false); end if;
  select pl.* into p from public.commission_plan pl
   where pl.tenant_id = p_tenant
     and pl.id = coalesce((select pm.plan_id from public.commission_plan_member pm where pm.tenant_id = p_tenant and pm.user_id = auth.uid()),
                          (select d.id from public.commission_plan d where d.tenant_id = p_tenant and d.is_default));
  return jsonb_build_object('visible', true, 'note', c.note, 'agreedAt', c.agreed_at,
    'plan', case when p.id is null then null else jsonb_build_object('name', p.name, 'rules', p.rules, 'referral', p.referral) end);
end $$;
revoke all on function public.my_conditions(uuid) from public, anon;
grant execute on function public.my_conditions(uuid) to authenticated;

-- Historial (docs/FOUNDATIONS.md §9): cada cambio de las condiciones o del plan asignado queda registrado, con
-- una foto del plan que aplicaba en ese momento. No se edita ni se borra.
create table public.member_conditions_history (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  user_id    uuid not null,
  visible    boolean not null,
  note       text,
  plan       jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade
);
create index member_conditions_history_idx on public.member_conditions_history (tenant_id, user_id, changed_at desc);
alter table public.member_conditions_history enable row level security;
create policy member_conditions_history_select on public.member_conditions_history for select to authenticated
  using (public.is_manager(tenant_id) or user_id = auth.uid());
revoke insert, update, delete on public.member_conditions_history from anon, authenticated;

create or replace function public.effective_plan_snapshot(p_tenant uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', pl.name, 'rules', pl.rules, 'referral', pl.referral)
    from public.commission_plan pl
   where pl.tenant_id = p_tenant
     and pl.id = coalesce((select pm.plan_id from public.commission_plan_member pm where pm.tenant_id = p_tenant and pm.user_id = p_user),
                          (select d.id from public.commission_plan d where d.tenant_id = p_tenant and d.is_default));
$$;
revoke all on function public.effective_plan_snapshot(uuid, uuid) from public, anon, authenticated;

-- Añade una foto al historial solo si cambia algo respecto a la anterior.
create or replace function public.append_conditions_history(p_tenant uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.member_conditions;
  v_plan jsonb;
  last public.member_conditions_history;
begin
  select * into c from public.member_conditions where tenant_id = p_tenant and user_id = p_user;
  if not found then return; end if;
  v_plan := public.effective_plan_snapshot(p_tenant, p_user);
  select * into last from public.member_conditions_history
   where tenant_id = p_tenant and user_id = p_user order by changed_at desc, id desc limit 1;
  if found and last.visible = c.visible and last.note is not distinct from c.note and last.plan is not distinct from v_plan then return; end if;
  insert into public.member_conditions_history (tenant_id, user_id, visible, note, plan, changed_by)
  values (p_tenant, p_user, c.visible, c.note, v_plan, auth.uid());
end $$;
revoke all on function public.append_conditions_history(uuid, uuid) from public, anon, authenticated;

create or replace function public.log_member_conditions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.append_conditions_history(new.tenant_id, new.user_id);
  return null;
end $$;
create trigger member_conditions_log after insert or update on public.member_conditions
  for each row execute function public.log_member_conditions();

-- Cambio de plan de alguien que ya tiene condiciones registradas: también queda en su historial.
create or replace function public.log_plan_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform public.append_conditions_history(old.tenant_id, old.user_id);
  else perform public.append_conditions_history(new.tenant_id, new.user_id); end if;
  return null;
end $$;
create trigger commission_plan_member_log after insert or update or delete on public.commission_plan_member
  for each row execute function public.log_plan_assignment();
revoke all on function public.log_member_conditions() from public, anon, authenticated;
revoke all on function public.log_plan_assignment() from public, anon, authenticated;
