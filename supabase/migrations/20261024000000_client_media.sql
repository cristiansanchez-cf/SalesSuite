-- Personalizar la propuesta (docs/PERSONALIZE.md): el logo, las fotos (de su local, de su Instagram) y un vídeo
-- con sus visuales. Los usa la pantalla en vivo: su logo arriba, sus fotos en «Foto», su vídeo de fondo.
alter table public.dossier
  add column client_media jsonb not null default '{}'::jsonb check (jsonb_typeof(client_media) = 'object');

-- Storage: vídeos cortos (mp4/webm) y hasta 30 MB por archivo (las imágenes de marca siguen limitadas a 5 MB en la app).
update storage.buckets
   set file_size_limit = 31457280,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
                                  'font/woff2', 'font/woff', 'application/font-woff2', 'video/mp4', 'video/webm']
 where id = 'tenant-assets';

-- Cualquiera del equipo sube los archivos de SUS propuestas: <tenant>/dossiers/<dossier>/… y solo si puede editarla.
create or replace function public.can_edit_dossier_media(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[2] = 'dossiers' and exists (
    select 1 from public.dossier d
     where d.id = public.try_uuid((storage.foldername(p_name))[3])
       and d.tenant_id = public.asset_tenant(p_name)
       and public.is_member(d.tenant_id)
       and (d.author_id = auth.uid() or public.my_role(d.tenant_id) in ('admin', 'lead'))
  );
$$;
revoke all on function public.can_edit_dossier_media(text) from public, anon;
grant execute on function public.can_edit_dossier_media(text) to authenticated;

create policy tenant_assets_insert_dossier on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-assets' and public.can_edit_dossier_media(name));

-- La propuesta pública devuelve también lo personalizado.
create or replace function public.get_public_dossier(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'tenant_id', d.tenant_id, 'title', d.title,
    'prospect_name', d.prospect_name, 'prospect_company', d.prospect_company,
    'locale', d.locale, 'price_mode', d.price_mode, 'total_price', d.total_price,
    'currency', d.currency, 'theme_override', d.theme_override, 'discount', d.discount,
    'media', d.client_media,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'block_type', m.block_type, 'module_key', m.key,
        'default_props', v.default_props, 'prop_overrides', i.prop_overrides,
        'default_price', v.default_price, 'price_override', i.price_override, 'currency', v.default_currency
      ) order by i.position)
      from public.dossier_item i
      join public.module_version v on v.id = i.module_version_id
      join public.module m on m.id = v.module_id
      where i.dossier_id = d.id and i.visible
    ), '[]'::jsonb)
  )
  from public.share_link l
  join public.dossier d on d.id = l.dossier_id
  join public.tenant t on t.id = d.tenant_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and d.status = 'published'
    and d.tenant_id = p_tenant_id
    and t.status = 'active';
$$;
