-- Tope de IA por empresa (docs/COSTES.md §Tope): lo fija el superadmin desde Plataforma → Coste por empresa.
--   ai_per_user_day: usos de IA (Apuntar e Investigar) por persona y día. Sin fila: 40, como hasta ahora.
--   ai_month_usd: gasto máximo del espacio al mes, en dólares (lo apuntado en usage_event). Sin valor: sin tope.
create table public.tenant_limits (
  tenant_id uuid primary key references public.tenant(id) on delete cascade,
  ai_per_user_day integer not null default 40 check (ai_per_user_day between 1 and 10000),
  ai_month_usd numeric(10, 2) check (ai_month_usd is null or ai_month_usd >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
alter table public.tenant_limits enable row level security;
revoke all on public.tenant_limits from anon, authenticated;

-- Lo que el servidor mira antes de gastar: el tope del espacio y lo que lleva gastado este mes (hora de Madrid).
create or replace function public.ai_limits(p_tenant uuid)
returns table (ai_per_user_day integer, ai_month_usd numeric, month_usd numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
begin
  if not (public.is_member(p_tenant) or public.is_superadmin()) then raise exception 'No es del equipo' using errcode = '42501'; end if;
  return query
    select coalesce(l.ai_per_user_day, 40), l.ai_month_usd,
      coalesce((select sum(e.cost_usd) from public.usage_event e where e.tenant_id = p_tenant and e.at >= v_from), 0)
    from (select 1) one left join public.tenant_limits l on l.tenant_id = p_tenant;
end $$;
revoke all on function public.ai_limits(uuid) from public, anon;
grant execute on function public.ai_limits(uuid) to authenticated;

-- Los topes de todos los espacios (para el panel) y cambiarlos: solo el superadmin.
create or replace function public.platform_limits()
returns table (tenant_id uuid, ai_per_user_day integer, ai_month_usd numeric, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin' using errcode = '42501'; end if;
  return query select l.tenant_id, l.ai_per_user_day, l.ai_month_usd, l.updated_at from public.tenant_limits l;
end $$;
revoke all on function public.platform_limits() from public, anon;
grant execute on function public.platform_limits() to authenticated;

create or replace function public.platform_set_limits(p_tenant uuid, p_per_user_day integer, p_month_usd numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin' using errcode = '42501'; end if;
  if not exists (select 1 from public.tenant t where t.id = p_tenant) then raise exception 'Espacio no encontrado' using errcode = 'P0002'; end if;
  insert into public.tenant_limits (tenant_id, ai_per_user_day, ai_month_usd, updated_at, updated_by)
  values (p_tenant, p_per_user_day, p_month_usd, now(), auth.uid())
  on conflict (tenant_id) do update set ai_per_user_day = excluded.ai_per_user_day, ai_month_usd = excluded.ai_month_usd,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end $$;
revoke all on function public.platform_set_limits(uuid, integer, numeric) from public, anon;
grant execute on function public.platform_set_limits(uuid, integer, numeric) to authenticated;
