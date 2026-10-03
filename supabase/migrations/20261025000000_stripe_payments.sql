-- Pagar desde la propuesta y comisiones automáticas con Stripe (docs/COMMISSIONS.md §Stripe).
--  1. La propuesta pública devuelve el enlace de pago de su tarifa (la app le añade la propuesta y el cupón).
--  2. Cada espacio guarda el secreto de firma de SU webhook de Stripe. Solo lo escribe un admin (función) y solo lo lee
--     el servidor (service role): ni siquiera el admin puede volver a verlo.
--  3. Suscripción de Stripe → propuesta: las renovaciones no traen la propuesta, así que se recuerda en el primer pago.

-- 2 · secretos por espacio (sin políticas: nadie con sesión de usuario los lee)
create table public.tenant_secret (
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  kind       text not null check (kind in ('stripe_webhook')),
  secret     text not null check (length(secret) between 10 and 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  primary key (tenant_id, kind)
);
alter table public.tenant_secret enable row level security;
revoke all on public.tenant_secret from anon, authenticated;

create or replace function public.set_stripe_webhook_secret(p_tenant uuid, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_tenant) then raise exception 'Solo un admin del espacio' using errcode = '42501'; end if;
  if p_secret is null or p_secret = '' then
    delete from public.tenant_secret where tenant_id = p_tenant and kind = 'stripe_webhook';
    return;
  end if;
  if p_secret !~ '^whsec_[A-Za-z0-9]{10,190}$' then raise exception 'El secreto de Stripe empieza por whsec_' using errcode = '22023'; end if;
  insert into public.tenant_secret (tenant_id, kind, secret, updated_by) values (p_tenant, 'stripe_webhook', p_secret, auth.uid())
  on conflict (tenant_id, kind) do update set secret = excluded.secret, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.set_stripe_webhook_secret(uuid, text) from public, anon;
grant execute on function public.set_stripe_webhook_secret(uuid, text) to authenticated;

-- Solo «¿está conectado y desde cuándo?», nunca el secreto.
create or replace function public.stripe_webhook_status(p_tenant uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select s.updated_at from public.tenant_secret s where s.tenant_id = p_tenant and s.kind = 'stripe_webhook' and public.is_admin(p_tenant);
$$;
revoke all on function public.stripe_webhook_status(uuid) from public, anon;
grant execute on function public.stripe_webhook_status(uuid) to authenticated;

-- 3 · suscripción → propuesta (lo escribe solo el webhook, con service role)
create table public.stripe_subscription (
  tenant_id       uuid not null references public.tenant(id) on delete cascade,
  subscription_id text not null check (subscription_id ~ '^sub_[A-Za-z0-9]{6,200}$'),
  dossier_id      uuid not null,
  created_at      timestamptz not null default now(),
  primary key (tenant_id, subscription_id),
  foreign key (tenant_id, dossier_id) references public.dossier (tenant_id, id) on delete cascade
);
alter table public.stripe_subscription enable row level security;
revoke all on public.stripe_subscription from anon, authenticated;

-- 1 · la propuesta pública, con el enlace de pago de su tarifa (si la tarifa sigue activa)
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
