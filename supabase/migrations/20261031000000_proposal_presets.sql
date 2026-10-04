-- Propuesta por sector (docs/PROPOSAL_PRESETS.md): qué módulos lleva, en qué modo y qué cambia según unas preguntas.
-- segment.proposal: la receta (bloques, modos y preguntas). La pone el alta del espacio.
-- dossier.preset: lo que eligió el comercial (modo y respuestas). Privado: get_public_dossier no lo devuelve.
alter table public.segment add column proposal jsonb check (proposal is null or jsonb_typeof(proposal) = 'object');
alter table public.dossier add column preset jsonb not null default '{}'::jsonb check (jsonb_typeof(preset) = 'object');

-- La tarjeta de precio necesita el periodo de la tarifa («/ mes», «/ evento»): antes ponía «/ evento» a una cuota mensual.
create or replace function public.get_public_dossier(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'tenant_id', d.tenant_id, 'title', d.title,
    'prospect_name', d.prospect_name, 'prospect_company', d.prospect_company,
    'locale', d.locale, 'price_mode', d.price_mode, 'total_price', d.total_price,
    'currency', d.currency, 'theme_override', d.theme_override, 'discount', d.discount,
    'media', d.client_media,
    'payment_link', (select o.payment_link from public.price_option o where o.id = d.price_option_id and o.tenant_id = d.tenant_id and o.active),
    'price_period', (select o.period from public.price_option o where o.id = d.price_option_id and o.tenant_id = d.tenant_id),
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
grant execute on function public.get_public_dossier(text, uuid) to anon, authenticated;
