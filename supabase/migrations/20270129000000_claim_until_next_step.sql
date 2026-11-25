-- La reserva llega hasta el próximo paso (criterio de Cristian, 25-nov-2026): si una empresa dice «hasta el 20 de enero,
-- nada» y el próximo paso es ese día, no tiene sentido que la reserva acabe a los 30 días y quede libre antes. Cuando
-- el próximo paso de una empresa con dueño cae después de su reserva, la reserva se alarga hasta una semana después de
-- ese día (como mucho 6 meses desde hoy). Va después de account_guard (los disparadores van por orden alfabético): lo
-- que ya ha pasado el control sigue igual; esto solo alarga.
create or replace function public.account_claim_to_next() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and new.status is distinct from 'customer' and new.next_step_at is not null
     and new.next_step_at is distinct from old.next_step_at
     and new.next_step_at + interval '7 days' > coalesce(new.claimed_until, now()) then
    new.claimed_until := least(new.next_step_at + interval '7 days', now() + interval '180 days');
  end if;
  return new;
end $$;
drop trigger if exists account_zz_claim_to_next on public.account;
create trigger account_zz_claim_to_next before update of next_step_at on public.account for each row execute function public.account_claim_to_next();

-- Las que ya tienen el próximo paso más allá de su reserva (Jumanji, Howl Crew, Bresh…).
update public.account
   set claimed_until = least(next_step_at + interval '7 days', now() + interval '180 days')
 where owner_id is not null and status is distinct from 'customer' and next_step_at is not null
   and claimed_until is not null and claimed_until > now()
   and next_step_at + interval '7 days' > claimed_until;

-- Quitar a una persona de una empresa (la X de «Personas»): si ya no está en ninguna otra, se borra del todo (criterio
-- de Cristian: no dejar morralla). Solo borrar personas lo puede hacer quien gestiona (RLS); con esto, también quien la
-- dio de alta, y solo si ha quedado suelta. Su historial queda sin persona (on delete set null).
create or replace function public.crm_contact_drop_orphan(p_contact uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c public.crm_contact;
begin
  select * into c from public.crm_contact where id = p_contact;
  if c.id is null or not public.is_member(c.tenant_id) then return false; end if;
  if exists (select 1 from public.crm_contact_account l where l.contact_id = c.id) then return false; end if;
  if not (c.owner_id = auth.uid() or c.created_by = auth.uid() or public.is_manager(c.tenant_id)) then return false; end if;
  delete from public.crm_contact where id = c.id;
  return true;
end $$;
revoke all on function public.crm_contact_drop_orphan(uuid) from public, anon;
grant execute on function public.crm_contact_drop_orphan(uuid) to authenticated;
