-- Paquetes (docs/PAQUETES.md). Criterio de Cristian: Enjoy pasa a vender por paquetes (Canciones, Pantalla, Álbum,
-- Fidelización) a 25 € (pequeño y mediano) o 50 € (grande) al mes cada uno; lo normal, 75–100 € al mes. «Hay que
-- incluirlo en muchos sitios»: un catálogo por espacio que leen el cierre, la IA, Aprende y las propuestas.
--  · product: cada paquete, con lo que incluye y su precio por tamaño. Alguno puede ir gratis (Canciones: «nos quedamos
--    con las propinas; si se pasa a suscripción, las propinas son para el local»).
--  · Cerrar (account_agreement) guarda qué paquetes (clave o «clave:free») y a qué precio al mes: el normal o uno menor
--    (descuento), y el normal de ese momento para ver el descuento. «Ha pagado X paquetes» es lo normal; el enlace de
--    pago de Stripe pasa a ser lo raro (payment_request también recuerda los paquetes).

create table public.product (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name         text not null check (length(btrim(name)) between 1 and 60),
  summary      text check (summary is null or length(summary) <= 400),
  -- Lo que incluye, una cosa por línea (para el cierre, Aprende, la IA y las propuestas).
  includes     text[] not null default '{}' check (cardinality(includes) <= 15),
  -- Precio por tamaño del local (priority.ts SIZES; «grande» vale también para masivo). null = no se ofrece a ese tamaño.
  price_small  numeric(10, 2) check (price_small is null or price_small between 0 and 100000),
  price_medium numeric(10, 2) check (price_medium is null or price_medium between 0 and 100000),
  price_large  numeric(10, 2) check (price_large is null or price_large between 0 and 100000),
  currency     text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  period       text not null default 'month' check (period in ('once', 'event', 'month', 'year')),
  -- Se puede dar gratis, y en qué condiciones («las propinas son para Enjoy»).
  free_allowed boolean not null default false,
  free_note    text check (free_note is null or length(free_note) <= 400),
  position     integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);
alter table public.product enable row level security;
create policy product_select on public.product for select to authenticated using (public.is_member(tenant_id));
create policy product_admin on public.product for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
grant select, insert, update, delete on public.product to authenticated;

-- Qué paquetes y a qué precio, en lo acordado y en el enlace de pago.
alter table public.account_agreement
  add column packages   text[] check (packages is null or cardinality(packages) <= 15),
  add column price      numeric(10, 2) check (price is null or price between 0 and 1000000),
  add column list_price numeric(10, 2) check (list_price is null or list_price between 0 and 1000000);
alter table public.payment_request
  add column packages text[] check (packages is null or cardinality(packages) <= 15);

-- Cerrar con paquetes y precio (las condiciones, opcionales: si no hay, las escribe la app con los paquetes). Misma
-- regla que antes: gerente o admin, activo ya; quien la lleva, pendiente de confirmar.
drop function public.agreement_propose(uuid, text, date, int);
create or replace function public.agreement_propose(p_account uuid, p_terms text, p_starts date, p_checkin int,
  p_packages text[] default null, p_price numeric default null, p_list_price numeric default null)
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); g public.account_agreement; mgr boolean;
begin
  select * into a from public.account x where x.id = p_account;
  if a.id is null or not public.is_member(a.tenant_id) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  mgr := public.is_manager(a.tenant_id);
  if not mgr and a.owner_id is distinct from me then raise exception 'Solo quien la lleva (o un gerente) cierra el acuerdo' using errcode = 'insufficient_privilege'; end if;
  update public.account_agreement x set status = 'rejected', decided_by = me, decided_at = now() where x.account_id = a.id and x.status = 'pending';
  insert into public.account_agreement (tenant_id, account_id, terms, starts_on, checkin_days, status, created_by, packages, price, list_price)
  values (a.tenant_id, a.id, btrim(p_terms), coalesce(p_starts, current_date), p_checkin, 'pending', me,
          nullif(p_packages, '{}'), p_price, p_list_price)
  returning * into g;
  if mgr then
    perform public.agreement_activate(g.id, me);
    return query select g.id, 'active'::text;
  else
    perform public.notify_roles(a.tenant_id, array['admin', 'lead']::public.member_role[], 'agreement_pending', 'action', g.id::text,
      jsonb_build_object('account', a.name, 'accountId', a.id, 'seller', public.user_label(me)), me);
    return query select g.id, 'pending'::text;
  end if;
end $$;
revoke all on function public.agreement_propose(uuid, text, date, int, text[], numeric, numeric) from public, anon;
grant execute on function public.agreement_propose(uuid, text, date, int, text[], numeric, numeric) to authenticated;

-- Enjoy: sus cuatro paquetes (se editan en Configurar → Tarifas → Paquetes).
do $$
declare t uuid;
begin
  select id into t from public.tenant where slug = 'enjoy';
  if t is null then return; end if;
  insert into public.product (tenant_id, key, name, summary, includes, price_small, price_medium, price_large, free_allowed, free_note, position) values
  (t, 'canciones', 'Canciones', 'El público pide canciones desde el móvil y deja propina.',
     array['Peticiones de canciones desde el móvil', 'Propinas del público'], 25, 25, 50, true,
     'Gratis: las propinas son para Enjoy. Con suscripción, las propinas son para el local.', 1),
  (t, 'pantalla', 'Mensajes y fotos en pantalla', 'Mensajes y fotos del público en las pantallas del local.',
     array['Software de pantallas', 'Mensajes y fotos del público en pantalla', 'Controlar las peticiones desde el móvil', 'Lanzar promociones en pantalla'], 25, 25, 50, false, null, 2),
  (t, 'album', 'Álbum', 'Las fotos de la noche, para el local y para el público.',
     array['Consentimiento para usarlas en redes sociales', 'Dinámicas independientes de la pantalla (p. ej. «sube 3 fotos al álbum y llévate X»)', 'Álbum después del evento para que el público descargue sus fotos'], 25, 25, 50, false, null, 3),
  (t, 'fidelizacion', 'Fidelización', 'Pases con sellos y un RRPP virtual en el móvil de sus clientes.',
     array['Pases con sellos que se validan en el local', 'Beneficios para el cliente (p. ej. 5.º chupito gratis, 5.ª entrada al 50 %)', 'Aviso «vuelve» cada vez que el cliente pasa cerca del local', 'Hasta 3 notificaciones push al mes, como un RRPP virtual'], 25, 25, 50, false, null, 4)
  on conflict (tenant_id, key) do nothing;
end $$;
