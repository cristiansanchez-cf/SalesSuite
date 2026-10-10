-- Ordenar ciudades (docs/CRM_DINAMICO.md §14): la importación del Notion creó una zona por cada texto del campo
-- «Ciudad» (notas, varias ciudades, basura). El arreglo mueve las empresas a su sitio (Comunidad › Provincia › Pueblo)
-- en bloque y se puede deshacer.

-- Arreglos de datos con su deshacer (lo que había antes de cada empresa tocada).
create table if not exists public.crm_fix (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  kind       text not null check (kind in ('zones')),
  summary    jsonb not null default '{}'::jsonb,
  undo       jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  undone_at  timestamptz
);
create index if not exists crm_fix_tenant_idx on public.crm_fix (tenant_id, created_at desc);
alter table public.crm_fix enable row level security;
drop policy if exists crm_fix_manager on public.crm_fix;
create policy crm_fix_manager on public.crm_fix for all to authenticated
  using (public.is_manager(tenant_id)) with check (public.is_manager(tenant_id));

-- Mover empresas en bloque: [{id, zone, notes, tags}] (zone null = sin zona). Solo admin o gerente, solo su espacio,
-- y la zona tiene que ser del mismo espacio. Devuelve cuántas se han movido.
create or replace function public.crm_move_accounts(p_tenant uuid, p_moves jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_manager(p_tenant) then raise exception 'Solo un/a admin o gerente' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) > 5000 then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  if exists (select 1 from jsonb_to_recordset(p_moves) as m(id uuid, zone uuid, notes text, tags text[])
             where m.zone is not null and not exists (select 1 from public.zone z where z.id = m.zone and z.tenant_id = p_tenant)) then
    raise exception 'Zona no encontrada' using errcode = 'check_violation';
  end if;
  update public.account a set zone_id = m.zone, notes = left(m.notes, 2000), tags = coalesce(m.tags, a.tags)
    from jsonb_to_recordset(p_moves) as m(id uuid, zone uuid, notes text, tags text[])
    where a.id = m.id and a.tenant_id = p_tenant;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.crm_move_accounts(uuid, jsonb) from public;
grant execute on function public.crm_move_accounts(uuid, jsonb) to authenticated;
