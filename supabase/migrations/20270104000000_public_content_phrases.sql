-- Propuesta pública en otro idioma: los textos que la receta del sector escribe en la propia propuesta (p. ej. el
-- ángulo «Abrir mercado» de Oquea cambia el título de la portada) salían en el original, porque get_public_content_i18n
-- solo traduce los textos del catálogo. Esta función devuelve «original → traducción» de la receta traducida del
-- espacio, pero SOLO las frases que ya están en los cambios de esa propuesta (prop_overrides): no enseña nada de la
-- receta (pistas internas, otros ángulos) que el cliente no vea ya. Misma puerta que get_public_dossier.
create or replace function public.get_public_content_phrases(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with dz as (
    select d.id, d.tenant_id, left(d.locale, 2) as lang
    from public.share_link l
    join public.dossier d on d.id = l.dossier_id
    join public.tenant t on t.id = d.tenant_id
    where l.token = p_token
      and l.is_active
      and (l.expires_at is null or l.expires_at > now())
      and d.status = 'published'
      and d.tenant_id = p_tenant_id
      and t.status = 'active'
      and left(d.locale, 2) = any(t.content_locales)
  ),
  ov as (
    select coalesce(string_agg(i.prop_overrides::text, ' '), '') as txt
    from public.dossier_item i join dz on i.dossier_id = dz.id
  ),
  pairs as (
    select s.proposal #>> string_to_array(substr(e.key, length('proposal/') + 1), '/') as orig, e.value as tr
    from dz
    join public.content_i18n c on c.tenant_id = dz.tenant_id and c.kind = 'segment' and c.locale = dz.lang
    join public.segment s on s.id::text = c.ref and s.tenant_id = dz.tenant_id
    cross join lateral jsonb_each_text(c.texts) e
    where e.key like 'proposal/%' and s.proposal is not null
  )
  select coalesce(jsonb_object_agg(p.orig, p.tr), '{}'::jsonb)
  from pairs p, ov
  where p.orig is not null and length(p.tr) > 0 and p.orig <> p.tr
    and strpos(ov.txt, to_jsonb(p.orig)::text) > 0;
$$;
revoke all on function public.get_public_content_phrases(text, uuid) from public;
grant execute on function public.get_public_content_phrases(text, uuid) to anon, authenticated;
