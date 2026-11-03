-- Importar desde Notion (docs/CRM_DINAMICO.md §48): el cuerpo de cada página, tal cual, y su bitácora como interacciones.

-- ---------------------------------------------------------------- el cuerpo de la página de origen
-- Bloques normalizados (encabezados, listas, tablas, desplegables, citas… con su texto y formato), para enseñarlo igual
-- que en Notion. `text_hash` es la huella del texto: la verificación la compara con la de Notion.
create table public.account_doc (
  account_id  uuid primary key,
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  source_url  text check (source_url is null or length(source_url) <= 300),
  title       text check (title is null or length(title) <= 300),
  blocks      jsonb not null check (jsonb_typeof(blocks) = 'array' and pg_column_size(blocks) <= 2000000),
  chars       integer not null default 0 check (chars >= 0),
  text_hash   text check (text_hash is null or length(text_hash) <= 100),
  import_id   uuid,
  imported_at timestamptz not null default now(),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade
);
alter table public.account_doc enable row level security;
create policy account_doc_select on public.account_doc for select to authenticated using (public.is_member(tenant_id));
create policy account_doc_write on public.account_doc for all to authenticated using (public.is_admin(tenant_id)) with check (public.is_admin(tenant_id));
revoke all on public.account_doc from anon;

-- ---------------------------------------------------------------- interacciones importadas
-- `date_only`: de la entrada solo se sabe el día (se enseña sin hora). `import_id`: para deshacer la importación.
alter table public.crm_activity
  add column date_only boolean not null default false,
  add column import_id uuid;
create index crm_activity_import_idx on public.crm_activity (import_id) where import_id is not null;

-- ---------------------------------------------------------------- próximo paso más largo (había de 504 caracteres)
alter table public.account drop constraint if exists account_next_step_check;
alter table public.account add constraint account_next_step_check check (length(next_step) <= 1000);
