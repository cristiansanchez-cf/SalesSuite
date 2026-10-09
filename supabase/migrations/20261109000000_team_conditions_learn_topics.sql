-- Aprende por temas de producto (src/lib/playbook/service.ts · learnTopicsOf): tenant.tour admite, además de la lista
-- de pasos de siempre, { steps, topics }. Y cada tema se marca como aprendido («topic:<clave>»).
alter table public.tenant drop constraint if exists tenant_tour_check;
alter table public.tenant add constraint tenant_tour_check check (
  (jsonb_typeof(tour) = 'array' and jsonb_array_length(tour) <= 8)
  or (jsonb_typeof(tour) = 'object' and coalesce(jsonb_typeof(tour->'steps'), '') = 'array' and jsonb_array_length(tour->'steps') <= 8
      and jsonb_typeof(coalesce(tour->'topics', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(tour->'topics', '[]'::jsonb)) <= 16
      and pg_column_size(tour) <= 200000)
);
alter table public.learning_progress drop constraint if exists learning_progress_topic_check;
alter table public.learning_progress add constraint learning_progress_topic_check
  check (topic in ('general', 'tour', 'empresa') or topic ~ '^[0-9a-f-]{36}$' or topic ~ '^sector:[a-z0-9][a-z0-9-]{0,60}$'
         or topic ~ '^topic:[a-z0-9][a-z0-9-]{0,62}$');

-- Condiciones del equipo (Cristian, 9-oct-2026: «si no están seteadas, que vean las condiciones»). Opcional por espacio:
-- el plan por defecto con show_to_team = true se enseña a quien aún no tiene condiciones propias, con su nota. Sin
-- marcarlo, todo sigue como antes (docs/FOUNDATIONS.md §9: invisibles hasta que el admin las acuerda). Si el admin ya
-- decidió algo para esa persona (fila en member_conditions), manda lo suyo, también si las ocultó.

alter table public.commission_plan
  add column show_to_team boolean not null default false,
  add column team_note text check (team_note is null or length(team_note) <= 1500);

create or replace function public.my_conditions(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.member_conditions;
  p public.commission_plan;
begin
  if not exists (select 1 from public.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid()) then
    raise exception 'Sin acceso' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.member_conditions x where x.tenant_id = p_tenant and x.user_id = auth.uid();
  if c.user_id is null then
    -- Sin condiciones propias: las del equipo, si el espacio las enseña.
    select pl.* into p from public.commission_plan pl where pl.tenant_id = p_tenant and pl.is_default and pl.show_to_team;
    if p.id is null then return jsonb_build_object('visible', false); end if;
    return jsonb_build_object('visible', true, 'team', true, 'note', p.team_note, 'agreedAt', null,
      'plan', jsonb_build_object('name', p.name, 'rules', p.rules, 'referral', p.referral));
  end if;
  if not coalesce(c.visible, false) then return jsonb_build_object('visible', false); end if;
  select pl.* into p from public.commission_plan pl
   where pl.tenant_id = p_tenant
     and pl.id = coalesce((select pm.plan_id from public.commission_plan_member pm where pm.tenant_id = p_tenant and pm.user_id = auth.uid()),
                          (select d.id from public.commission_plan d where d.tenant_id = p_tenant and d.is_default));
  return jsonb_build_object('visible', true, 'note', c.note, 'agreedAt', c.agreed_at,
    'plan', case when p.id is null then null else jsonb_build_object('name', p.name, 'rules', p.rules, 'referral', p.referral) end);
end $$;
revoke all on function public.my_conditions(uuid) from public, anon;
grant execute on function public.my_conditions(uuid) to authenticated;
