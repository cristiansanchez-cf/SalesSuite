-- CRM dinámico, fase 1 (docs/CRM_DINAMICO.md): cada espacio define los campos de sus cuentas, como las propiedades de
-- una base de datos de Notion. La definición vive en crm_field; los valores, en account.fields (jsonb clave → valor).
-- El núcleo de la cuenta (nombre, zona, sector, dueño, reserva) no cambia: territorio y comisiones dependen de él.

create table public.crm_field (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  -- Clave estable: renombrar la etiqueta no toca los datos.
  key         text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  label       text not null check (length(btrim(label)) between 1 and 60),
  type        text not null check (type in ('text', 'long_text', 'number', 'money', 'checkbox', 'select', 'multi_select', 'date', 'url', 'email', 'phone', 'rating')),
  -- select / multi_select: [{ "key": "si", "label": "Sí" }, …]. Se guarda la clave de la opción, no la etiqueta.
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 60),
  grp         text check (length(grp) <= 40),
  position    integer not null default 0,
  help        text check (length(help) <= 200),
  required    boolean not null default false,
  in_list     boolean not null default false,
  filterable  boolean not null default false,
  -- Sectores en los que aplica (claves de segment). Vacío = todos.
  segments    text[] not null default '{}' check (cardinality(segments) <= 20),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);
create index crm_field_tenant_idx on public.crm_field (tenant_id, position);

alter table public.crm_field enable row level security;
create policy crm_field_select on public.crm_field for select to authenticated using (public.is_member(tenant_id));
-- Los campos los define el admin (la forma del CRM es de la empresa).
create policy crm_field_admin on public.crm_field for all to authenticated
  using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));

-- Valores de los campos en la cuenta.
alter table public.account add column fields jsonb not null default '{}'::jsonb
  check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 32000);
create index account_fields_gin on public.account using gin (fields jsonb_path_ops);

-- Defensa en profundidad: solo se guardan claves de campos que existen en el espacio (el servidor valida los tipos).
create or replace function public.account_fields_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare unknown text;
begin
  if new.fields is null or new.fields = '{}'::jsonb then return new; end if;
  if tg_op = 'UPDATE' and new.fields = old.fields then return new; end if;
  select k into unknown from jsonb_object_keys(new.fields) as k
   where not exists (select 1 from public.crm_field f where f.tenant_id = new.tenant_id and f.key = k)
   limit 1;
  if unknown is not null then
    raise exception 'Campo desconocido: %', unknown using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger account_fields_check before insert or update of fields on public.account
  for each row execute function public.account_fields_check();
