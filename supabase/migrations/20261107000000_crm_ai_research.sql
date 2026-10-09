-- Investigación con IA (docs/CRM_DINAMICO.md §13): la última investigación de cada empresa, con sus propuestas
-- (cualificación, contacto, personas), cada una con su fuente y su estado (pendiente, aceptada, descartada).
alter table public.account add column if not exists ai_research jsonb;
alter table public.account add column if not exists ai_research_at timestamptz;

-- p_fill: al aceptar un dato de contacto, rellena ese hueco (nunca pisa lo escrito).
-- Como «Completar con Google»: lo puede guardar quien investiga (empresa libre o suya, o un/a gerente). No la reserva.
create or replace function public.account_ai_research(p_account uuid, p_data jsonb, p_fill jsonb default null) returns void
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
  if p_data is not null and (jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 100000) then
    raise exception 'Datos no válidos' using errcode = 'check_violation';
  end if;
  update public.account set ai_research = p_data, ai_research_at = case when p_data is null then null else now() end,
    phone     = coalesce(nullif(phone, ''), left(p_fill->>'phone', 40)),
    email     = coalesce(nullif(email, ''), lower(left(p_fill->>'email', 200))),
    instagram = coalesce(nullif(instagram, ''), left(p_fill->>'instagram', 300)),
    linkedin  = coalesce(nullif(linkedin, ''), left(p_fill->>'linkedin', 300)),
    website   = coalesce(nullif(website, ''), left(p_fill->>'website', 300))
  where id = p_account;
end $$;
revoke all on function public.account_ai_research(uuid, jsonb, jsonb) from public;
grant execute on function public.account_ai_research(uuid, jsonb, jsonb) to authenticated;
