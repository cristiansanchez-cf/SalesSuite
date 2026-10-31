-- Alta de empresas desde Plataforma (docs/ORG.md §Alta de una empresa): el superadmin crea el espacio (nombre, dirección,
-- idioma) y nombra a su admin, sin scripts. Todo pasa por estas dos funciones: comprueban que quien llama es superadmin;
-- nadie más puede crear espacios ni darse de alta en uno ajeno.

-- Crea el espacio con su dirección principal y su fila de ajustes del CRM (sin cualificación: la eligen ellos).
create or replace function public.platform_create_tenant(p_slug text, p_name text, p_locale text, p_hostname text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin crea espacios'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'slug no válido'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 80 then raise exception 'nombre no válido'; end if;
  if p_hostname !~ '^[a-z0-9.-]+$' or p_hostname <> lower(p_hostname) then raise exception 'dirección no válida'; end if;
  if exists (select 1 from public.tenant where slug = p_slug) then raise exception 'duplicate: ya hay un espacio con esa dirección'; end if;
  if exists (select 1 from public.domain where hostname = p_hostname) then raise exception 'duplicate: esa dirección ya está en uso'; end if;
  insert into public.tenant (slug, name, default_locale) values (p_slug, trim(p_name), p_locale) returning id into v_id;
  insert into public.domain (tenant_id, hostname, is_primary) values (v_id, p_hostname, true);
  insert into public.crm_settings (tenant_id) values (v_id) on conflict (tenant_id) do nothing;
  return v_id;
end;
$$;
revoke all on function public.platform_create_tenant(text, text, text, text) from public, anon;
grant execute on function public.platform_create_tenant(text, text, text, text) to authenticated;

-- Hace admin de un espacio a un usuario (el que invita Plataforma). Idempotente.
create or replace function public.platform_add_admin(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin nombra admins de otro espacio'; end if;
  insert into public.membership (user_id, tenant_id, role) values (p_user, p_tenant, 'admin')
  on conflict (user_id, tenant_id) do update set role = 'admin';
end;
$$;
revoke all on function public.platform_add_admin(uuid, uuid) from public, anon;
grant execute on function public.platform_add_admin(uuid, uuid) to authenticated;

-- Estado del alta de cada espacio en Plataforma (docs/ORG.md §Alta de una empresa): lo mismo que antes más «setup», lo
-- que ya tiene montado (qué vende, clientes y actores, situaciones, cómo se vende, precios, logo, CRM y su admin).
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
                      from public.revenue_event e where e.tenant_id = t.id and e.status = 'confirmed'),
    'setup', jsonb_build_object(
      'admins', (select count(*) from public.membership m where m.tenant_id = t.id and m.role = 'admin'),
      'pitch', (select count(*) from public.play p where p.tenant_id = t.id and p.module_id is null and p.status = 'official' and p.kind = 'pitch'),
      'segments', (select count(*) from public.segment s where s.tenant_id = t.id),
      'personas', (select count(*) from public.persona p where p.tenant_id = t.id),
      'facets', (select count(*) from public.situation_facet f where f.tenant_id = t.id and f.status = 'official'),
      'plays', (select count(*) from public.play p where p.tenant_id = t.id and p.module_id is null and p.status = 'official'),
      'prices', (select count(*) from public.price_option o where o.tenant_id = t.id),
      'logo', coalesce(t.brand->>'logoUrl', '') <> '',
      'accounts', (select count(*) from public.account a where a.tenant_id = t.id)
    )
  ) order by t.created_at), '[]'::jsonb) end
  from public.tenant t;
$$;
revoke all on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;
