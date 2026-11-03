-- Asistente de WhatsApp (docs/ASSISTANT.md): la persona del equipo escribe, manda un audio o reenvía mensajes al número
-- del espacio y el asistente lo apunta en su empresa (preguntando cuál si duda y siempre con su «Guardar»).
--  · Se le reconoce por el teléfono de Mi cuenta (users.phone) y su membresía en el espacio del número.
--  · wa_assistant_state: por dónde va la conversación de cada persona (qué falta elegir, qué falta confirmar) y los
--    últimos mensajes ya procesados (Meta reintenta). Solo el servidor (service role).

create table public.wa_assistant_state (
  tenant_id  uuid not null,
  user_id    uuid not null,
  state      jsonb not null default '{"step":"idle"}' check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 200000),
  seen       text[] not null default '{}',
  version    integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (user_id, tenant_id) references public.membership (user_id, tenant_id) on delete cascade
);
alter table public.wa_assistant_state enable row level security;
revoke all on public.wa_assistant_state from authenticated, anon;

-- Quién del equipo escribe desde este teléfono (solo dígitos, con prefijo: «34699000111»). Vale también si en Mi cuenta
-- se guardó sin prefijo («699 00 01 11»): coinciden los últimos 9 dígitos o más.
create or replace function public.assistant_member_by_phone(p_digits text)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  with u as (
    select id, regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') as d from public.users where phone is not null
  )
  select m.tenant_id, m.user_id
    from u join public.membership m on m.user_id = u.id
   where m.role in ('admin', 'lead', 'rep') and length(u.d) >= 9 and p_digits ~ '^[0-9]{9,15}$'
     and (u.d = p_digits or (length(p_digits) > length(u.d) and right(p_digits, length(u.d)) = u.d) or regexp_replace(u.d, '^00', '') = p_digits);
$$;
revoke all on function public.assistant_member_by_phone(text) from public, anon, authenticated;
grant execute on function public.assistant_member_by_phone(text) to service_role;
