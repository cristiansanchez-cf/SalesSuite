-- Qué ha pasado con los WhatsApp que manda el asistente (docs/ASSISTANT.md §Recordatorios): Meta acepta el envío al
-- momento, pero si luego no se entrega (sin método de pago en la cuenta, número que no puede recibirlo, plantilla
-- pausada…) lo dice después por el webhook. Aquí queda cada envío y su último estado, para decirlo en «Probarlo ahora».
create table if not exists public.wa_delivery (
  wamid      text primary key,
  tenant_id  uuid references public.tenant(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  kind       text not null check (kind in ('reminder', 'team_lead')),
  status     text not null default 'accepted' check (status in ('accepted', 'sent', 'delivered', 'read', 'failed')),
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wa_delivery_user_idx on public.wa_delivery (user_id, kind, created_at desc);
alter table public.wa_delivery enable row level security;
revoke all on public.wa_delivery from anon, authenticated;
-- Cada persona ve los suyos (Mi cuenta); escribe solo el servidor.
grant select on public.wa_delivery to authenticated;
create policy wa_delivery_own on public.wa_delivery for select to authenticated using (user_id = auth.uid() or public.is_superadmin());
