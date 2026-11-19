-- Clientes (docs/CLIENTS.md): cerrar con acuerdo. El comercial que la lleva lo propone (pendiente, aviso a gerentes);
-- un gerente o admin lo confirma (cliente) o lo rechaza; un cambio deja la versión anterior como sustituida.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('90909090-0000-4000-8000-000000000001', 'rep90@test'), ('90909090-0000-4000-8000-000000000002', 'otro90@test'), ('90909090-0000-4000-8000-000000000003', 'admin90@test');
insert into public.membership (user_id, tenant_id, role) values
  ('90909090-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('90909090-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('90909090-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', 'admin');
insert into public.account (id, tenant_id, name, owner_id) values ('90909090-aaaa-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Deep Delay 90', '90909090-0000-4000-8000-000000000001');
create temp table r90 (id uuid, status text);
grant all on r90 to authenticated;

set role authenticated;
-- Otro comercial (no la lleva): no.
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000002';
do $$ begin
  perform public.agreement_propose('90909090-aaaa-4000-8000-000000000001', '70/30', null, 30);
  raise exception 'ASSERT FAILED: otro comercial cierra';
exception when insufficient_privilege then null; end $$;
-- Quien la lleva: pendiente.
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000001';
insert into r90 select * from public.agreement_propose('90909090-aaaa-4000-8000-000000000001', '70/30 si conseguimos marcas', null, 30);
select pg_temp.assert((select status = 'pending' from r90), 'el comercial propone: pendiente');
select pg_temp.assert((select status = 'open' from public.account where id = '90909090-aaaa-4000-8000-000000000001'), 'sigue en el CRM hasta confirmar');
do $$ begin
  perform public.agreement_decide((select id from r90), true);
  raise exception 'ASSERT FAILED: el comercial se confirma solo';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.assert((select count(*) > 0 from public.notification where kind = 'agreement_pending' and user_id = '90909090-0000-4000-8000-000000000003' and resolved_at is null), 'aviso al admin');

-- El admin confirma: cliente.
set role authenticated;
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000003';
select public.agreement_decide((select id from r90), true);
reset role;
select pg_temp.assert((select status = 'customer' and won_at is not null and won_by = '90909090-0000-4000-8000-000000000001' from public.account where id = '90909090-aaaa-4000-8000-000000000001'), 'confirmado: cliente, ganada por quien la llevaba');
select pg_temp.assert((select count(*) = 0 from public.notification where kind = 'agreement_pending' and resolved_at is null and entity_key = (select id::text from r90)), 'el aviso se da por atendido');

-- El admin lo cambia: activo ya y el anterior, sustituido.
set role authenticated;
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000003';
select pg_temp.assert((select status = 'active' from public.agreement_propose('90909090-aaaa-4000-8000-000000000001', '60/40 desde enero', '2027-01-01', 60)), 'el admin lo cambia directamente');
select pg_temp.assert((select array_agg(status order by created_at) = '{replaced,active}' from public.account_agreement where account_id = '90909090-aaaa-4000-8000-000000000001'), 'versiones: sustituido y vigente');
-- Un comercial propone otro y el admin lo rechaza: se queda el vigente.
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000001';
truncate r90;
insert into r90 select * from public.agreement_propose('90909090-aaaa-4000-8000-000000000001', 'Gratis', null, null);
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000003';
select public.agreement_decide((select id from r90), false);
select pg_temp.assert((select terms = '60/40 desde enero' from public.account_agreement where account_id = '90909090-aaaa-4000-8000-000000000001' and status = 'active'), 'rechazado: se queda el vigente');
-- Leer: el equipo sí; escribir directo, nadie.
set request.jwt.claim.sub = '90909090-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 3 from public.account_agreement where account_id = '90909090-aaaa-4000-8000-000000000001'), 'el equipo ve los acuerdos');
do $$ begin
  update public.account_agreement set terms = 'x' where account_id = '90909090-aaaa-4000-8000-000000000001';
  if found then raise exception 'ASSERT FAILED: se edita directo'; end if;
exception when insufficient_privilege then null; end $$;
reset role;
