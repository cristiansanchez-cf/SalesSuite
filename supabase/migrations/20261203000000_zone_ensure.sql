-- Ciudad de cualquier sitio de España al dar de alta una empresa (docs/CRM_DINAMICO.md §44): quien trabaja empresas
-- (admin, jefe/a, comercial; no partners) elige una provincia o ciudad aunque aún no sea una zona, y se crea su ruta
-- (España › Comunidad › Provincia › Ciudad) reutilizando los tramos que ya existen (mismo nombre bajo el mismo padre).
-- La ruta la arma el servidor desde su catálogo de provincias; aquí solo se valida la forma. Devuelve la última zona.
create or replace function public.zone_ensure(p_tenant uuid, p_path jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare step jsonb; v_parent uuid := null; v_id uuid; v_name text; v_kind text;
begin
  if not public.is_member(p_tenant) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_path) <> 'array' or jsonb_array_length(p_path) not between 1 and 5 then
    raise exception 'Ruta de zona no válida' using errcode = 'check_violation';
  end if;
  for step in select value from jsonb_array_elements(p_path) loop
    v_name := btrim(coalesce(step->>'name', ''));
    v_kind := step->>'kind';
    if v_name = '' or length(v_name) > 80 or coalesce(v_kind, '') not in ('country', 'region', 'province', 'city', 'area') then
      raise exception 'Ruta de zona no válida' using errcode = 'check_violation';
    end if;
    select z.id into v_id from public.zone z
     where z.tenant_id = p_tenant and z.parent_id is not distinct from v_parent and lower(z.name) = lower(v_name);
    if v_id is null then
      insert into public.zone (tenant_id, parent_id, name, kind, position) values (p_tenant, v_parent, v_name, v_kind, 0)
      on conflict do nothing returning id into v_id;
      if v_id is null then
        select z.id into v_id from public.zone z
         where z.tenant_id = p_tenant and z.parent_id is not distinct from v_parent and lower(z.name) = lower(v_name);
      end if;
    end if;
    v_parent := v_id;
  end loop;
  return v_parent;
end $$;
revoke all on function public.zone_ensure(uuid, jsonb) from public, anon;
grant execute on function public.zone_ensure(uuid, jsonb) to authenticated;
