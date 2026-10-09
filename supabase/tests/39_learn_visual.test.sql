-- Aprende visual: recorrido del producto (tenant.tour), foto de sector (segment.image) y progreso de «tour» / «sector:<clave>».
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

select pg_temp.assert((select jsonb_array_length(tour) >= 4 from public.tenant where slug = 'enjoy'), 'el seed trae el recorrido de Enjoy');
select pg_temp.assert((select count(*) = 4 from public.segment where tenant_id = '00000000-0000-4000-8000-000000000e01' and image is not null), 'cada sector de Enjoy con foto');

-- Con temas de Aprende: { steps, topics } (20261109000000).
select pg_temp.assert((select tour ? 'topics' from public.tenant where slug = 'oquea-demo'), 'el recorrido con temas (objeto) entra');
do $$ begin
  update public.tenant set tour = '{}' where slug = 'enjoy';
  raise exception 'ASSERT FAILED: tour que no es lista';
exception when check_violation then null; end $$;
do $$ begin
  update public.tenant set tour = (select jsonb_agg(x) from generate_series(1, 9) x) where slug = 'enjoy';
  raise exception 'ASSERT FAILED: más de 8 pasos';
exception when check_violation then null; end $$;
do $$ begin
  update public.segment set image = 'javascript:alert(1)' where key = 'bodas';
  raise exception 'ASSERT FAILED: imagen sin https ni ruta';
exception when check_violation then null; end $$;
do $$ begin
  update public.segment set image = 'https://x.test/a.webp") ; background:url(' where key = 'bodas';
  raise exception 'ASSERT FAILED: imagen con comillas/paréntesis';
exception when check_violation then null; end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.learning_progress (tenant_id, user_id, topic) values
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'tour'),
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'sector:bodas');
do $$ begin
  insert into public.learning_progress (tenant_id, user_id, topic) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'sector:Bodas; drop');
  raise exception 'ASSERT FAILED: tema de sector mal formado';
exception when check_violation then null; end $$;
reset role;

select pg_temp.assert((select count(*) = 2 from public.learning_progress where user_id = '11111111-1111-4111-8111-111111111111' and topic in ('tour', 'sector:bodas')), 'recorrido y sector marcados');
delete from public.learning_progress where user_id = '11111111-1111-4111-8111-111111111111' and topic in ('tour', 'sector:bodas');
