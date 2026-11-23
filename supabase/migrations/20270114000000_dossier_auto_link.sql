-- Propuestas que se vinculan solas a su empresa por el nombre (docs/ORG.md §Propuestas vinculadas).
-- Criterio de Cristian: «desde la ficha deberíamos ver rápidamente las propuestas asociadas… que se vinculen solas por
-- el nombre, con un identificador en el background».
--
-- · company_key(texto): el nombre sin mayúsculas, tildes, signos ni «S.L.»/«S.A.» al final («Zafiro Zone, S.L.» →
--   «zafiro zone»). Igual que companyKey() en src/lib/accounts/company-key.ts.
-- · Al crear una propuesta sin empresa elegida (o al cambiar el nombre de la empresa en una sin vincular): si en el
--   espacio hay UNA empresa con ese nombre, queda vinculada (account_id). Al crearla, como elegirla del CRM: cuenta como
--   contacto y reserva si está libre (lo hace dossier_account_sync, que va después: los BEFORE van por orden alfabético).
--   Al cambiar solo el nombre, se vincula sin más (dossier_account_sync no salta: no se tocó account_id).
-- · Las propuestas que ya había: se vinculan una vez, sin efectos (ni contacto ni reserva: serían de otro momento).

create or replace function public.company_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(regexp_replace(
           trim(regexp_replace(translate(lower(coalesce(p, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñçý', 'aaaaaaeeeeiiiiooooouuuuncy'), '[^a-z0-9]+', ' ', 'g')),
           ' (s l u|s l|s a|slu|sl|sa)$', ''), '')
$$;

create index if not exists account_company_key_idx on public.account (tenant_id, public.company_key(name));

-- La empresa con ese nombre en el espacio, si hay una sola (con dos o más, mejor no adivinar).
create or replace function public.account_by_company(p_tenant uuid, p_company text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(a.id))[1] end
    from public.account a
   where a.tenant_id = p_tenant
     and length(coalesce(public.company_key(p_company), '')) >= 3
     and public.company_key(a.name) = public.company_key(p_company)
$$;
revoke all on function public.account_by_company(uuid, text) from public, anon, authenticated;

create or replace function public.dossier_auto_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is null and new.partner_account_id is null and new.prospect_company is not null
     and (tg_op = 'INSERT' or new.prospect_company is distinct from old.prospect_company) then
    new.account_id := public.account_by_company(new.tenant_id, new.prospect_company);
  end if;
  return new;
end $$;
revoke all on function public.dossier_auto_link() from public, anon, authenticated;

-- «dossier_a0…» va antes que «dossier_account_sync» (mismo momento, orden alfabético).
create trigger dossier_a0_auto_link before insert or update of prospect_company on public.dossier
  for each row execute function public.dossier_auto_link();

-- Las de antes: una vez y sin efectos.
alter table public.dossier disable trigger dossier_account_sync;
update public.dossier d
   set account_id = public.account_by_company(d.tenant_id, d.prospect_company)
 where d.account_id is null and d.partner_account_id is null and d.prospect_company is not null
   and public.account_by_company(d.tenant_id, d.prospect_company) is not null;
alter table public.dossier enable trigger dossier_account_sync;
