-- Consumo por empresa (docs/COSTES.md): cada llamada de pago (IA, audios, plantillas de WhatsApp, correos, medios de
-- redes) con su espacio, quién la hizo, para qué y lo que ha costado. Solo lo escribe el servidor (service role) y solo
-- lo lee el superadmin (platform_usage). Al borrar un espacio o una persona, el gasto se queda (sin a quién).
create table public.usage_event (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenant(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  at timestamptz not null default now(),
  feature text not null check (feature ~ '^[a-z0-9_.-]{1,40}$'),
  provider text not null check (provider in ('anthropic', 'openai', 'meta', 'email', 'media', 'other')),
  model text check (model is null or length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  web_searches integer not null default 0 check (web_searches >= 0),
  -- Segundos de audio, mensajes, correos o llamadas, según el proveedor.
  units numeric not null default 0 check (units >= 0),
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0)
);
create index usage_event_tenant_at on public.usage_event (tenant_id, at desc);
create index usage_event_at on public.usage_event (at desc);
alter table public.usage_event enable row level security;
revoke all on public.usage_event from anon, authenticated;

-- Lo del periodo, agrupado por día, espacio, función, proveedor, modelo y persona (para el panel de Plataforma).
create or replace function public.platform_usage(p_from timestamptz, p_to timestamptz)
returns table (
  tenant_id uuid, day date, feature text, provider text, model text, user_id uuid, user_name text,
  events bigint, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint, cache_write_tokens bigint,
  web_searches bigint, units numeric, cost_usd numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin' using errcode = '42501'; end if;
  if p_to - p_from > interval '400 days' then raise exception 'periodo demasiado largo' using errcode = '22023'; end if;
  return query
    select e.tenant_id, (e.at at time zone 'Europe/Madrid')::date, e.feature, e.provider, e.model, e.user_id,
      coalesce(nullif(max(u.display_name), ''), split_part(max(u.email), '@', 1)),
      count(*), sum(e.input_tokens)::bigint, sum(e.output_tokens)::bigint, sum(e.cache_read_tokens)::bigint, sum(e.cache_write_tokens)::bigint,
      sum(e.web_searches)::bigint, sum(e.units), sum(e.cost_usd)
    from public.usage_event e
    left join public.users u on u.id = e.user_id
    where e.at >= p_from and e.at < p_to
    group by 1, 2, 3, 4, 5, 6;
end $$;
revoke all on function public.platform_usage(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_usage(timestamptz, timestamptz) to authenticated;

-- Lo que ocupa cada espacio en el almacenamiento (fotos, vídeos y logos: tenant-assets/<espacio>/…).
create or replace function public.platform_storage()
returns table (tenant_id uuid, objects bigint, bytes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'permission denied: solo el superadmin' using errcode = '42501'; end if;
  return query
    select split_part(o.name, '/', 1)::uuid, count(*), coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    where o.bucket_id = 'tenant-assets' and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by 1;
end $$;
revoke all on function public.platform_storage() from public, anon;
grant execute on function public.platform_storage() to authenticated;
