-- Recordatorios por WhatsApp (docs/ASSISTANT.md §Recordatorios): cada mañana, a quien lo active en Mi cuenta, el
-- asistente le escribe con lo que toca hoy (lo que se enfría, lo vencido y lo de hoy) y, si dice que sí, una propuesta
-- de mensaje por empresa con «Hecho» y «Mañana».
alter table public.users add column wa_reminders boolean not null default false;

-- Uno por persona, espacio y día (en su zona horaria). Solo el servidor.
create table public.wa_reminder_log (
  user_id   uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  day       date not null,
  items     integer not null default 0,
  sent_at   timestamptz not null default now(),
  primary key (user_id, tenant_id, day)
);
alter table public.wa_reminder_log enable row level security;
revoke all on public.wa_reminder_log from anon, authenticated;
