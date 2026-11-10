-- Asistente de WhatsApp con un número de la plataforma (docs/ASSISTANT.md §Un número para todas las empresas).
--  · Cada persona del equipo escribe a un único número (ASSISTANT_WHATSAPP_PHONE_ID) desde su WhatsApp de trabajo.
--  · Si está en varias empresas, al empezar el día el asistente le pregunta para cuál trabaja hoy y se acuerda aquí.
--  · pending: lo que mandó antes de elegir, para apuntarlo después (como mucho 10 mensajes).
--  Solo el servidor (service role), como wa_assistant_state.

create table public.wa_assistant_session (
  user_id    uuid primary key references public.users (id) on delete cascade,
  tenant_id  uuid references public.tenant (id) on delete set null,
  chosen_at  timestamptz,
  asked_at   timestamptz,
  pending    jsonb not null default '[]' check (jsonb_typeof(pending) = 'array' and pg_column_size(pending) <= 200000),
  updated_at timestamptz not null default now()
);
alter table public.wa_assistant_session enable row level security;
revoke all on public.wa_assistant_session from authenticated, anon;
