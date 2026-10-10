-- Limpiar el CRM (docs/CRM_DINAMICO.md §17): empresas de verdad y DJs por separado, y descartar sin perder nada.
--  - kind: 'company' (empresa: local, promotora…) o 'dj' (DJ o artista que trabaja por su cuenta).
--  - Descartada: no sale en la lista ni en el mapa, pero se guarda con su motivo (no es del sector, posible alianza,
--    duplicada, cerrada u otro) y una nota, y se puede recuperar.
--  - Limpiar con IA en bloque (solo admin o gerente) con su deshacer en crm_fix (kind 'classify').

alter table public.account
  add column kind text not null default 'company' check (kind in ('company', 'dj')),
  add column discarded_at timestamptz,
  add column discard_reason text check (discard_reason in ('not_sector', 'partner', 'duplicate', 'closed', 'other')),
  add column discard_note text check (length(discard_note) <= 500),
  add column discarded_by uuid,
  add constraint account_discard_ck check ((discarded_at is null) = (discard_reason is null));

alter table public.crm_fix drop constraint if exists crm_fix_kind_check;
alter table public.crm_fix add constraint crm_fix_kind_check check (kind in ('zones', 'classify'));

-- Una empresa: tipo y descartar/recuperar (p_reason null = recuperar). Quien puede editarla: libre, suya o gerente.
create or replace function public.account_classify(p_account uuid, p_kind text, p_reason text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.account; me uuid := auth.uid(); r text;
begin
  select * into a from public.account where id = p_account;
  if a.id is null then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  select role into r from public.membership where tenant_id = a.tenant_id and user_id = me;
  if r is null or r = 'partner' then raise exception 'Cuenta no encontrada' using errcode = 'insufficient_privilege'; end if;
  if not (public.is_manager(a.tenant_id) or a.owner_id is null or a.owner_id = me) then
    raise exception 'Solo quien la trabaja o un/a gerente puede editarla' using errcode = 'insufficient_privilege';
  end if;
  update public.account set
    kind = coalesce(p_kind, kind),
    discarded_at = case when p_reason is null then null when discarded_at is null then now() else discarded_at end,
    discard_reason = p_reason,
    discard_note = case when p_reason is null then null else left(nullif(btrim(p_note), ''), 500) end,
    discarded_by = case when p_reason is null then null else me end
  where id = p_account;
end $$;
revoke all on function public.account_classify(uuid, text, text, text) from public;
grant execute on function public.account_classify(uuid, text, text, text) to authenticated;

-- En bloque (Limpiar con IA): [{id, kind, reason, note}] (reason null = no descartada). Solo admin o gerente, su espacio.
create or replace function public.crm_classify_accounts(p_tenant uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; me uuid := auth.uid();
begin
  if not public.is_manager(p_tenant) then raise exception 'Solo un/a admin o gerente' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  update public.account a set
    kind = coalesce(m.kind, a.kind),
    discarded_at = case when m.reason is null then null when a.discarded_at is null then now() else a.discarded_at end,
    discard_reason = m.reason,
    discard_note = case when m.reason is null then null else left(nullif(btrim(m.note), ''), 500) end,
    discarded_by = case when m.reason is null then null else me end
    from jsonb_to_recordset(p_rows) as m(id uuid, kind text, reason text, note text)
    where a.id = m.id and a.tenant_id = p_tenant;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.crm_classify_accounts(uuid, jsonb) from public;
grant execute on function public.crm_classify_accounts(uuid, jsonb) to authenticated;
