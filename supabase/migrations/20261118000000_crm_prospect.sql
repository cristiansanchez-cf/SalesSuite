-- Buscar clientes por zona en Google Maps (docs/CRM_DINAMICO.md §19). Cada búsqueda («discotecas» en «Valencia») se
-- guarda con lo que devolvió Google, para revisarla, importar lo marcado sin volver a pagar a Google y saber qué zonas
-- y tipos se han barrido ya. `imported`: id de Google → empresa creada (o la que ya estaba).
create table public.crm_sweep (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  query       text not null check (length(btrim(query)) between 1 and 120),
  zone_id     uuid references public.zone(id) on delete set null,
  zone_label  text not null default '' check (length(zone_label) <= 300),
  segment_id  uuid,
  results     jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 60 and pg_column_size(results) <= 600000),
  found       int generated always as (jsonb_array_length(results)) stored,
  imported    jsonb not null default '{}'::jsonb check (jsonb_typeof(imported) = 'object' and pg_column_size(imported) <= 20000),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index crm_sweep_tenant_idx on public.crm_sweep (tenant_id, created_at desc);
alter table public.crm_sweep enable row level security;

-- El equipo interno ve las búsquedas del espacio (para no repetir zonas); un partner, no.
create policy crm_sweep_select on public.crm_sweep for select to authenticated
  using (public.is_member(tenant_id) and not public.is_partner(tenant_id));
create policy crm_sweep_insert on public.crm_sweep for insert to authenticated
  with check (public.is_member(tenant_id) and not public.is_partner(tenant_id) and created_by = auth.uid());
-- Apuntar lo importado: quien buscó o un/a gerente.
create policy crm_sweep_update on public.crm_sweep for update to authenticated
  using (public.is_member(tenant_id) and (created_by = auth.uid() or public.is_manager(tenant_id)))
  with check (public.is_member(tenant_id) and (created_by = auth.uid() or public.is_manager(tenant_id)));
create policy crm_sweep_delete on public.crm_sweep for delete to authenticated using (public.is_admin(tenant_id));

-- Buscar por id de Google rápido (¿ya la tengo?).
create index if not exists account_place_idx on public.account (tenant_id, place_id) where place_id is not null;
