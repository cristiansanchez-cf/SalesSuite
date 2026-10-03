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
