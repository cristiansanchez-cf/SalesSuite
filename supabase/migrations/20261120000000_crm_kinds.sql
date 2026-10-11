-- Tipos de cliente por espacio (docs/CRM_DINAMICO.md §21). Antes «Empresa / DJ» era igual para todos; ahora cada espacio
-- define los suyos (Enjoy: Empresas · DJs; Oquea: Centros de buceo · ONGs…). El principal tiene la clave «company»:
-- no se borra, solo se renombra, y es el que tienen las empresas nuevas.
--   kinds: [{ key, label, plural, icon }] (el primero es el principal).
alter table public.crm_settings
  add column kinds jsonb not null default '[]'::jsonb check (jsonb_typeof(kinds) = 'array' and jsonb_array_length(kinds) <= 12);

-- Lo de hoy, a cada espacio: «Empresa» y, donde ya hay DJs (Enjoy), «DJ o artista».
insert into public.crm_settings (tenant_id) select t.id from public.tenant t on conflict (tenant_id) do nothing;
update public.crm_settings s set kinds = jsonb_build_array(jsonb_build_object('key', 'company', 'label', 'Empresa', 'plural', 'Empresas', 'icon', 'building2'))
  || case when exists (select 1 from public.tenant t where t.id = s.tenant_id and t.slug = 'enjoy')
            or exists (select 1 from public.account a where a.tenant_id = s.tenant_id and a.kind = 'dj')
          then jsonb_build_array(jsonb_build_object('key', 'dj', 'label', 'DJ o artista', 'plural', 'DJs', 'icon', 'music'))
          else '[]'::jsonb end
  where s.kinds = '[]'::jsonb;

-- El tipo de cada empresa: cualquiera de los de su espacio (lo comprueban las funciones de abajo).
alter table public.account drop constraint if exists account_kind_check;
alter table public.account add constraint account_kind_format check (kind ~ '^[a-z0-9][a-z0-9-]{0,39}$');

create or replace function public.crm_kind_ok(p_tenant uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_kind = 'company' or exists (
    select 1 from public.crm_settings s, jsonb_array_elements(s.kinds) k where s.tenant_id = p_tenant and k ->> 'key' = p_kind);
$$;
revoke all on function public.crm_kind_ok(uuid, text) from public;
grant execute on function public.crm_kind_ok(uuid, text) to authenticated;

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
  if p_kind is not null and not public.crm_kind_ok(a.tenant_id, p_kind) then raise exception 'Tipo no válido' using errcode = 'check_violation'; end if;
  update public.account set
    kind = coalesce(p_kind, kind),
    discarded_at = case when p_reason is null then null when discarded_at is null then now() else discarded_at end,
    discard_reason = p_reason,
    discard_note = case when p_reason is null then null else left(nullif(btrim(p_note), ''), 500) end,
    discarded_by = case when p_reason is null then null else me end
  where id = p_account;
end $$;

create or replace function public.crm_classify_accounts(p_tenant uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; me uuid := auth.uid();
begin
  if not public.is_admin(p_tenant) then raise exception 'Solo un admin importa y ordena los datos del CRM' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'Datos no válidos' using errcode = 'check_violation'; end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as m(kind text) where m.kind is not null and not public.crm_kind_ok(p_tenant, m.kind)) then
    raise exception 'Tipo no válido' using errcode = 'check_violation';
  end if;
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
