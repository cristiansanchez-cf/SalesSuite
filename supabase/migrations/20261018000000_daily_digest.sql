-- Resumen diario de seguimientos (docs/NOTIFICATIONS.md): cada mañana, a las 7:00 de su zona horaria, cada persona recibe
-- lo vencido, lo de hoy, las propuestas abiertas en las últimas 24 h y las que no tienen próximo paso. Solo si hay algo.
alter table public.users
  add column daily_digest boolean not null default true,
  add column timezone text not null default 'Europe/Madrid' check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$');

-- Un envío por persona, espacio y día (en su zona horaria). Lo escribe solo el cron (service role).
create table public.daily_digest_log (
  user_id   uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  day       date not null,
  sent_at   timestamptz not null default now(),
  emailed   boolean not null default false,
  primary key (user_id, tenant_id, day)
);
alter table public.daily_digest_log enable row level security;
revoke all on public.daily_digest_log from anon, authenticated;
