-- En prueba (docs/CLIENTS.md §En prueba). Criterio de Cristian: «hay una etapa que es la de prueba… seria genial que
-- saliera bien claro… Tnsi se va a pasar en prueba 2 meses por un trato que hemos hecho. Otras están 10 o 15 días o un
-- mes». Una prueba tiene inicio y fin; mientras dura, la empresa sale «En prueba hasta…» en la ficha, la lista, el
-- tablero y Clientes, y sigue reservada para quien la lleva (la reserva no caduca a mitad de la prueba). Al acabar:
-- «Se queda» o «No sigue». Si paga o se cierra con acuerdo después de empezarla, la app la da por convertida sola.
-- Solo se escribe por estas funciones: quien la lleva (o puede quedársela) o un gerente o admin.

create table public.account_trial (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  account_id  uuid not null,
  starts_on   date not null default current_date,
  ends_on     date not null,
  -- Lo acordado para la prueba («2 meses gratis por el trato con su grupo; luego 249 €/mes»).
  note        text check (note is null or length(note) <= 2000),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    uuid references public.users(id) on delete set null,
  outcome     text check (outcome in ('stays', 'leaves')),
  check (ends_on >= starts_on and ends_on <= starts_on + 366),
  check ((ended_at is null) = (outcome is null)),
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade
);
create index account_trial_account_idx on public.account_trial (account_id, created_at desc);
-- Una prueba en marcha por empresa.
create unique index account_trial_one_open on public.account_trial (account_id) where ended_at is null;
create index account_trial_open_idx on public.account_trial (tenant_id) where ended_at is null;
alter table public.account_trial enable row level security;
create policy account_trial_select on public.account_trial for select to authenticated using (public.is_member(tenant_id));
grant select on public.account_trial to authenticated;

-- Empezarla (o cambiar las fechas de la que está en marcha). Devuelve su id.
create or replace function public.trial_start(p_account uuid, p_starts date, p_ends date, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); mgr boolean; tid uuid; s date := coalesce(p_starts, current_date);
begin
  select * into a from public.account x where x.id = p_account;
  if a.id is null or not public.is_member(a.tenant_id) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  mgr := public.is_manager(a.tenant_id);
  if not mgr and a.owner_id is distinct from me and public.account_eligibility_for(a.tenant_id, a.id, me) <> 'eligible' then
    raise exception 'Solo quien la lleva (o un gerente) la pone en prueba' using errcode = 'insufficient_privilege';
  end if;
  if a.status = 'blocked' then raise exception 'Está bloqueada' using errcode = 'check_violation'; end if;
  if p_ends is null or p_ends < s or p_ends > s + 366 then raise exception 'La prueba acaba entre el día que empieza y un año después' using errcode = 'check_violation'; end if;

  select t.id into tid from public.account_trial t where t.account_id = a.id and t.ended_at is null;
  if tid is null then
    insert into public.account_trial (tenant_id, account_id, starts_on, ends_on, note, created_by)
    values (a.tenant_id, a.id, s, p_ends, nullif(btrim(coalesce(p_note, '')), ''), me) returning id into tid;
  else
    update public.account_trial set starts_on = s, ends_on = p_ends, note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note) where id = tid;
  end if;

  -- Sigue siendo de quien la lleva hasta que acabe la prueba (y el plazo normal de reserva después).
  if a.status <> 'customer' then
    perform set_config('app.account_rpc', '1', true);
    update public.account set
      owner_id = coalesce(owner_id, me),
      claimed_until = greatest(coalesce(claimed_until, now()), (p_ends + public.claim_days(a.tenant_id))::timestamptz),
      last_touch_at = now(), last_touch_by = me
     where id = a.id;
    perform set_config('app.account_rpc', '0', true);
  end if;
  return tid;
end $$;
revoke all on function public.trial_start(uuid, date, date, text) from public, anon;
grant execute on function public.trial_start(uuid, date, date, text) to authenticated;

-- Acabarla: «Se queda» (stays) o «No sigue» (leaves).
create or replace function public.trial_end(p_trial uuid, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.account_trial; a public.account; me uuid := auth.uid();
begin
  select * into t from public.account_trial x where x.id = p_trial;
  if t.id is null or not public.is_member(t.tenant_id) then raise exception 'Prueba no encontrada' using errcode = 'insufficient_privilege'; end if;
  select * into a from public.account x where x.id = t.account_id;
  if not public.is_manager(t.tenant_id) and a.owner_id is distinct from me then
    raise exception 'Solo quien la lleva (o un gerente) acaba la prueba' using errcode = 'insufficient_privilege';
  end if;
  if p_outcome not in ('stays', 'leaves') then raise exception 'Resultado no válido' using errcode = 'check_violation'; end if;
  if t.ended_at is not null then return; end if;
  update public.account_trial set ended_at = now(), ended_by = me, outcome = p_outcome where id = t.id;
end $$;
revoke all on function public.trial_end(uuid, text) from public, anon;
grant execute on function public.trial_end(uuid, text) to authenticated;
