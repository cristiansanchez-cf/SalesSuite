-- Calendario (docs/CALENDAR.md): cada persona tiene un enlace secreto de calendario (.ics) al que se suscribe desde
-- Outlook o Google una vez; sus próximos pasos aparecen solos. Solo ve, crea, cambia o borra el suyo.
create table public.calendar_feed (
  user_id    uuid primary key references public.users(id) on delete cascade,
  token      text not null unique check (length(token) between 32 and 128),
  created_at timestamptz not null default now()
);
alter table public.calendar_feed enable row level security;
create policy calendar_feed_own on public.calendar_feed for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.calendar_feed to authenticated;

-- El enlace de quien lo pide: lo crea si no tiene; con p_rotate, uno nuevo (el anterior deja de funcionar).
create or replace function public.my_calendar_token(p_rotate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); tok text;
begin
  if me is null then raise exception 'no autenticado' using errcode = '42501'; end if;
  select token into tok from public.calendar_feed where user_id = me;
  if tok is null or p_rotate then
    tok := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.calendar_feed (user_id, token) values (me, tok)
      on conflict (user_id) do update set token = excluded.token, created_at = now();
  end if;
  return tok;
end $$;
revoke all on function public.my_calendar_token(boolean) from public, anon;
grant execute on function public.my_calendar_token(boolean) to authenticated;

create or replace function public.drop_my_calendar() returns void
language sql security definer set search_path = '' as $$
  delete from public.calendar_feed where user_id = auth.uid();
$$;
revoke all on function public.drop_my_calendar() from public, anon;
grant execute on function public.drop_my_calendar() to authenticated;
