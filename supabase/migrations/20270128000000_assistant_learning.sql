-- Aprender de las conversaciones (docs/APRENDIZAJE.md). Durante la beta, quien usa el CRM ha aceptado que veamos sus
-- conversaciones con el asistente para mejorarlo. Aquí queda cada mensaje (lo que manda y lo que le contesta el
-- asistente de WhatsApp, y cada herramienta que usa su IA por el MCP) y, cada pocos días, el informe que saca la IA:
-- qué problemas tienen y qué proponemos. Solo lo ve el superadmin; escribe solo el servidor. Se borra a los 90 días.
create table if not exists public.assistant_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenant(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  at         timestamptz not null default now(),
  -- in: lo que manda la persona; out: lo que contesta el asistente; mcp: una herramienta usada desde su IA; error: algo falló.
  dir        text not null check (dir in ('in', 'out', 'mcp', 'error')),
  -- text, audio, image, contact, button, forwarded… (en mcp, el nombre de la herramienta).
  kind       text not null default 'text' check (length(kind) <= 60),
  text       text not null default '' check (length(text) <= 12000),
  -- Por dónde iba la conversación (idle, confirm, forward…) antes y después, y lo demás que ayude a entenderla.
  step       text check (length(step) <= 60),
  meta       jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 20000)
);
create index if not exists assistant_log_at_idx on public.assistant_log (at desc);
create index if not exists assistant_log_user_idx on public.assistant_log (user_id, at desc);
alter table public.assistant_log enable row level security;
revoke all on public.assistant_log from anon, authenticated;
grant select on public.assistant_log to authenticated;
create policy assistant_log_superadmin on public.assistant_log for select to authenticated using (public.is_superadmin());

create table if not exists public.assistant_review (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  period_from   timestamptz not null,
  period_to     timestamptz not null,
  conversations integer not null default 0,
  messages      integer not null default 0,
  -- Las cifras (calculadas sin IA) y lo que ve la IA: resumen, problemas con ejemplos y propuestas.
  metrics       jsonb not null default '{}'::jsonb,
  report        jsonb not null default '{}'::jsonb check (pg_column_size(report) <= 200000),
  model         text,
  error         text
);
create index if not exists assistant_review_created_idx on public.assistant_review (created_at desc);
alter table public.assistant_review enable row level security;
revoke all on public.assistant_review from anon, authenticated;
grant select on public.assistant_review to authenticated;
create policy assistant_review_superadmin on public.assistant_review for select to authenticated using (public.is_superadmin());
