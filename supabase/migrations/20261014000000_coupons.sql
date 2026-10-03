-- Cupones (docs/COMMISSIONS.md §6): palancas de negociación que crea el admin (30 %, 10 %, mes gratis…).
-- La propuesta guarda una COPIA del descuento: editar o desactivar el cupón no cambia lo ya enviado.
create table public.coupon (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  label       text not null check (length(label) between 1 and 80),
  kind        text not null check (kind in ('percent', 'fixed', 'free_months')),
  -- percent: puntos básicos (1–10000) · fixed: céntimos · free_months: meses (1–24)
  value       integer not null check (value > 0),
  max_uses    integer check (max_uses is null or max_uses > 0),
  valid_until date,
  active      boolean not null default true,
  note        text check (length(note) <= 300),
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code),
  check (kind <> 'percent' or value <= 10000),
  check (kind <> 'free_months' or value <= 24)
);

alter table public.dossier
  add column coupon_id uuid,
  add column discount jsonb check (discount is null or jsonb_typeof(discount) = 'object'),
  add foreign key (tenant_id, coupon_id) references public.coupon (tenant_id, id) on delete set null (coupon_id);

create or replace function public.dossier_coupon_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.coupon;
begin
  -- La copia la pone la base de datos, nunca el cliente.
  if tg_op = 'UPDATE' and new.coupon_id is not distinct from old.coupon_id then
    new.discount := old.discount;
    return new;
  end if;
  if new.coupon_id is null then new.discount := null; return new; end if;
  if public.my_role(new.tenant_id) = 'partner' then
    raise exception 'Los cupones los aplica el equipo interno' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.coupon x where x.id = new.coupon_id and x.tenant_id = new.tenant_id;
  if c.id is null or not c.active then raise exception 'Cupón no disponible' using errcode = 'check_violation'; end if;
  if c.valid_until is not null and c.valid_until < current_date then raise exception 'El cupón ha caducado' using errcode = 'check_violation'; end if;
  if c.max_uses is not null and (select count(*) from public.dossier d where d.coupon_id = c.id and d.id <> new.id) >= c.max_uses then
    raise exception 'El cupón ya no tiene usos disponibles' using errcode = 'check_violation';
  end if;
  new.discount := jsonb_build_object('code', c.code, 'label', c.label, 'kind', c.kind, 'value', c.value);
  return new;
end $$;
create trigger dossier_coupon_apply before insert or update of coupon_id, discount on public.dossier
  for each row execute function public.dossier_coupon_apply();
revoke all on function public.dossier_coupon_apply() from public, anon, authenticated;

alter table public.coupon enable row level security;
create policy coupon_select on public.coupon for select to authenticated using (public.is_member(tenant_id));
create policy coupon_admin on public.coupon for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- El dossier público muestra el descuento aplicado.
create or replace function public.get_public_dossier(p_token text, p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'tenant_id', d.tenant_id, 'title', d.title,
    'prospect_name', d.prospect_name, 'prospect_company', d.prospect_company,
    'locale', d.locale, 'price_mode', d.price_mode, 'total_price', d.total_price,
    'currency', d.currency, 'theme_override', d.theme_override, 'discount', d.discount,
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
revoke all on function public.get_public_dossier(text, uuid) from public;
grant execute on function public.get_public_dossier(text, uuid) to anon, authenticated;
