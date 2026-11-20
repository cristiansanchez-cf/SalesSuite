-- Pago por evento (docs/PAQUETES.md §Promotoras y festivales). Criterio de Cristian: «en cierre para promotoras o
-- festivales, cuando no es un acuerdo, es pago por evento: festivales suele ser 500 € por evento; promotoras, de 50 a
-- 150 €». Lo acordado guarda cada cuánto es el precio (al mes o por evento).
alter table public.account_agreement
  add column price_period text check (price_period is null or price_period in ('month', 'year', 'event', 'once'));
update public.account_agreement set price_period = 'month' where price is not null and price_period is null;

drop function public.agreement_propose(uuid, text, date, int, text[], numeric, numeric);
create or replace function public.agreement_propose(p_account uuid, p_terms text, p_starts date, p_checkin int,
  p_packages text[] default null, p_price numeric default null, p_list_price numeric default null, p_period text default null)
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); g public.account_agreement; mgr boolean;
begin
  select * into a from public.account x where x.id = p_account;
  if a.id is null or not public.is_member(a.tenant_id) then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  mgr := public.is_manager(a.tenant_id);
  if not mgr and a.owner_id is distinct from me then raise exception 'Solo quien la lleva (o un gerente) cierra el acuerdo' using errcode = 'insufficient_privilege'; end if;
  if p_period is not null and p_period not in ('month', 'year', 'event', 'once') then raise exception 'Periodo no válido' using errcode = 'check_violation'; end if;
  update public.account_agreement x set status = 'rejected', decided_by = me, decided_at = now() where x.account_id = a.id and x.status = 'pending';
  insert into public.account_agreement (tenant_id, account_id, terms, starts_on, checkin_days, status, created_by, packages, price, list_price, price_period)
  values (a.tenant_id, a.id, btrim(p_terms), coalesce(p_starts, current_date), p_checkin, 'pending', me,
          nullif(p_packages, '{}'), p_price, p_list_price, case when p_price is null then null else coalesce(p_period, 'month') end)
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
revoke all on function public.agreement_propose(uuid, text, date, int, text[], numeric, numeric, text) from public, anon;
grant execute on function public.agreement_propose(uuid, text, date, int, text[], numeric, numeric, text) to authenticated;

-- Enjoy: lo normal por evento, como tarifas (salen como atajos en «Pago por evento»; se cambian en Tarifas).
do $$
declare t uuid;
begin
  select id into t from public.tenant where slug = 'enjoy';
  if t is null then return; end if;
  insert into public.price_option (tenant_id, label, amount, currency, period, position, active, kind, note)
  select t, 'Festival · por evento', 500, 'EUR', 'event', 90, true, 'Festival', 'Lo normal en un festival'
   where not exists (select 1 from public.price_option where tenant_id = t and label = 'Festival · por evento');
  insert into public.price_option (tenant_id, label, amount, currency, period, position, active, kind, note)
  select t, 'Promotora · por evento', 100, 'EUR', 'event', 91, true, 'Promotora', 'De 50 a 150 € por evento'
   where not exists (select 1 from public.price_option where tenant_id = t and label = 'Promotora · por evento');
end $$;
