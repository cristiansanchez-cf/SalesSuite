-- Clientes, fase 1 (docs/CLIENTS.md).
--  Acuerdos: cerrar una empresa con un acuerdo (sin cobro de por medio: «70/30 si conseguimos marcas…»). Cada cambio
--     es una versión nueva y la anterior queda como «sustituido», con su fecha. Un gerente o admin lo cierra directamente;
--     un comercial lo propone y un gerente o admin lo confirma (lo que cierra no es el «ya casi está» de quien vende).
--     Al activarse, la empresa pasa a cliente (status customer, won_at), igual que al cobrar.


create table public.account_agreement (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant(id) on delete cascade,
  account_id    uuid not null,
  terms         text not null check (length(btrim(terms)) between 1 and 4000),
  starts_on     date not null default current_date,
  -- Escribirle cada N días (contacto periódico): el próximo paso de la empresa se pone solo.
  checkin_days  int check (checkin_days between 7 and 365),
  status        text not null check (status in ('pending', 'active', 'replaced', 'rejected')),
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_by    uuid references public.users(id) on delete set null,
  decided_at    timestamptz,
  foreign key (tenant_id, account_id) references public.account (tenant_id, id) on delete cascade
);
create index account_agreement_account_idx on public.account_agreement (account_id, created_at desc);
create unique index account_agreement_one_active on public.account_agreement (account_id) where status = 'active';
alter table public.account_agreement enable row level security;
create policy account_agreement_select on public.account_agreement for select to authenticated using (public.is_member(tenant_id));
grant select on public.account_agreement to authenticated;

-- Activar: la anterior pasa a sustituida y la empresa, a cliente (una vez).
create or replace function public.agreement_activate(p_id uuid, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.account_agreement; a public.account;
begin
  select * into g from public.account_agreement where id = p_id;
  update public.account_agreement set status = 'replaced' where account_id = g.account_id and status = 'active' and id <> g.id;
  update public.account_agreement set status = 'active', decided_by = p_by, decided_at = now() where id = g.id;
  perform set_config('app.account_rpc', '1', true);
  update public.account set status = 'customer', won_at = coalesce(won_at, now()), won_by = coalesce(won_by, g.created_by),
         owner_id = coalesce(owner_id, g.created_by), claimed_until = null, last_touch_at = now(), last_touch_by = coalesce(p_by, last_touch_by)
   where id = g.account_id and tenant_id = g.tenant_id
   returning * into a;
  perform set_config('app.account_rpc', '0', true);
  insert into public.account_touch (tenant_id, account_id, user_id, kind, note) values (g.tenant_id, g.account_id, coalesce(g.created_by, p_by), 'won', left(g.terms, 500));
  update public.notification set resolved_at = now()
   where tenant_id = g.tenant_id and kind = 'agreement_pending' and entity_key = g.id::text and resolved_at is null;
  perform public.notify_roles(g.tenant_id, array['admin', 'lead']::public.member_role[], 'agreement_closed', 'info', g.id::text,
    jsonb_build_object('account', a.name, 'accountId', a.id, 'seller', public.user_label(g.created_by)), p_by);
end $$;
revoke all on function public.agreement_activate(uuid, uuid) from public, anon, authenticated;

-- Cerrar con acuerdo (o cambiarlo): gerente o admin, activo ya; comercial (el que la lleva), pendiente de confirmar.
create or replace function public.agreement_propose(p_account uuid, p_terms text, p_starts date, p_checkin int)
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); g public.account_agreement; mgr boolean;
begin
  select * into a from public.account x where x.id = p_account;
  if a.id is null or not public.is_member(a.tenant_id) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  mgr := public.is_manager(a.tenant_id);
  if not mgr and a.owner_id is distinct from me then raise exception 'Solo quien la lleva (o un gerente) cierra el acuerdo' using errcode = 'insufficient_privilege'; end if;
  -- Una propuesta pendiente a la vez: la nueva sustituye a la anterior sin confirmar.
  update public.account_agreement x set status = 'rejected', decided_by = me, decided_at = now() where x.account_id = a.id and x.status = 'pending';
  insert into public.account_agreement (tenant_id, account_id, terms, starts_on, checkin_days, status, created_by)
  values (a.tenant_id, a.id, btrim(p_terms), coalesce(p_starts, current_date), p_checkin, 'pending', me)
  returning * into g;
  if mgr then
    perform public.agreement_activate(g.id, me);
    return query select g.id, 'active'::text;
  else
    perform public.notify_roles(a.tenant_id, array['admin', 'lead']::public.member_role[], 'agreement_pending', 'action', g.id::text,
      jsonb_build_object('account', a.name, 'accountId', a.id, 'seller', public.user_label(me)), me);
    return query select g.id, 'pending'::text;
  end if;
end $$;
revoke all on function public.agreement_propose(uuid, text, date, int) from public, anon;
grant execute on function public.agreement_propose(uuid, text, date, int) to authenticated;

create or replace function public.agreement_decide(p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.account_agreement;
begin
  select * into g from public.account_agreement where id = p_id;
  if g.id is null or not public.is_manager(g.tenant_id) then raise exception 'Solo un gerente o admin confirma el acuerdo' using errcode = 'insufficient_privilege'; end if;
  if g.status <> 'pending' then return; end if;
  if p_ok then perform public.agreement_activate(g.id, auth.uid());
  else
    update public.account_agreement set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = g.id;
    update public.notification set resolved_at = now() where tenant_id = g.tenant_id and kind = 'agreement_pending' and entity_key = g.id::text and resolved_at is null;
  end if;
end $$;
revoke all on function public.agreement_decide(uuid, boolean) from public, anon;
grant execute on function public.agreement_decide(uuid, boolean) to authenticated;
