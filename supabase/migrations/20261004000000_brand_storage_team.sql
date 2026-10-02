-- =============================================================================
-- Fase 1.5: marca del tenant, Storage de assets, permisos finos y equipo.
-- =============================================================================

-- ---------------------------------------------------------------- marca
alter table public.tenant
  add column brand jsonb not null default '{}'::jsonb check (jsonb_typeof(brand) = 'object');

-- Un admin de tenant edita nombre, idioma, tema y marca; NO slug/status/id (eso es de plataforma).
revoke update on public.tenant from authenticated;
grant update (name, default_locale, theme_tokens, brand) on public.tenant to authenticated;

-- resolve_tenant devuelve también la marca (cambia el tipo de retorno → drop + create).
drop function if exists public.resolve_tenant(text, text);
create function public.resolve_tenant(p_host text default null, p_slug text default null)
returns table (id uuid, slug text, name text, default_locale text, theme_tokens jsonb, brand jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.name, t.default_locale, t.theme_tokens, t.brand
  from public.tenant t
  where t.status = 'active'
    and (
      (p_host is not null and t.id = (select d.tenant_id from public.domain d where d.hostname = lower(p_host)))
      or (p_host is null and p_slug is not null and t.slug = p_slug)
    )
  limit 1;
$$;
revoke all on function public.resolve_tenant(text, text) from public;
grant execute on function public.resolve_tenant(text, text) to anon, authenticated;

-- ---------------------------------------------------------------- equipo
-- Nunca dejar un tenant sin admin (salvo borrado en cascada del tenant o del usuario).
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role <> 'admin' or (tg_op = 'UPDATE' and new.role = 'admin') then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.tenant t where t.id = old.tenant_id)
     or not exists (select 1 from public.users u where u.id = old.user_id) then
    return coalesce(new, old);  -- cascada
  end if;
  if not exists (
    select 1 from public.membership m
    where m.tenant_id = old.tenant_id and m.role = 'admin' and m.user_id <> old.user_id
  ) then
    raise exception 'El tenant debe conservar al menos un admin' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.keep_one_admin() from public, anon, authenticated;

create trigger membership_keep_one_admin
  before update of role or delete on public.membership
  for each row execute function public.keep_one_admin();

-- ---------------------------------------------------------------- storage
-- Bucket público de lectura (logos, fuentes, imágenes de módulos). Escritura: admins del tenant,
-- solo bajo la carpeta <tenant_id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-assets', 'tenant-assets', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
              'font/woff2', 'font/woff', 'application/font-woff2'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.asset_tenant(p_name text) returns uuid
language sql immutable as $$
  select public.try_uuid((storage.foldername(p_name))[1]);
$$;

create policy tenant_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'tenant-assets' and public.is_member(public.asset_tenant(name)));
create policy tenant_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-assets' and public.is_admin(public.asset_tenant(name)));
create policy tenant_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'tenant-assets' and public.is_admin(public.asset_tenant(name)))
  with check (bucket_id = 'tenant-assets' and public.is_admin(public.asset_tenant(name)));
create policy tenant_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-assets' and public.is_admin(public.asset_tenant(name)));
