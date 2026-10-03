-- Comisiones: el libro no se puede tocar por error y cada uno ve lo suyo.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create or replace function pg_temp.fails(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ASSERT FAILED: %', msg;
exception when insufficient_privilege or check_violation or unique_violation or foreign_key_violation or not_null_violation then null;
end $$;

insert into auth.users (id, email) values ('cdcdcdcd-0000-4000-8000-000000000001', 'jefa-c@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values ('cdcdcdcd-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'lead');
delete from public.notification;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin
insert into public.commission_plan (tenant_id, name, is_default, rules)
values ('00000000-0000-4000-8000-000000000e01', 'General', true, '[{"id":"all","label":"Todo igual: 30 %","when":{},"pay":{"type":"percent","bps":3000}}]');
select pg_temp.fails($$insert into public.commission_plan (tenant_id, name, is_default) values ('00000000-0000-4000-8000-000000000e01', 'Otro', true)$$, 'dos planes por defecto');
insert into public.revenue_event (id, tenant_id, source, external_id, kind, occurred_at, amount_cents, revenue_cents, seller_id)
values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'api', 'inv-1', 'sale', now(), 100000, 100000, '11111111-1111-4111-8111-111111111111');
select pg_temp.fails($$insert into public.revenue_event (tenant_id, source, external_id, kind, occurred_at, amount_cents, revenue_cents)
  values ('00000000-0000-4000-8000-000000000e01', 'api', 'inv-1', 'sale', now(), 1, 1)$$, 'mismo ingreso dos veces');
select pg_temp.fails($$insert into public.revenue_event (tenant_id, source, external_id, kind, occurred_at, amount_cents, revenue_cents)
  values ('00000000-0000-4000-8000-000000000e01', 'api', 'neg', 'sale', now(), -1, -1)$$, 'importe negativo');
select pg_temp.fails($$update public.revenue_event set amount_cents = 1 where external_id = 'inv-1'$$, 'cambiar el importe de un ingreso confirmado');
select pg_temp.fails($$delete from public.revenue_event where external_id = 'inv-1'$$, 'borrar un ingreso');

insert into public.commission_entry (id, tenant_id, user_id, event_id, dedupe_key, kind, rule_id, rule_label, base_cents, amount_cents, period)
values ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', '50000000-0000-4000-8000-000000000001',
        'ev:50000000-0000-4000-8000-000000000001:commission:11111111-1111-4111-8111-111111111111', 'commission', 'all', 'Todo igual: 30 %', 100000, 30000, to_char(now(), 'YYYY-MM'));
select pg_temp.fails($$insert into public.commission_entry (tenant_id, user_id, dedupe_key, kind, amount_cents, period)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'ev:50000000-0000-4000-8000-000000000001:commission:11111111-1111-4111-8111-111111111111', 'commission', 30000, '2026-10')$$, 'misma línea dos veces');
select pg_temp.fails($$insert into public.commission_entry (tenant_id, user_id, dedupe_key, kind, amount_cents, period, status)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'x', 'commission', 1, '2026-10', 'approved')$$, 'línea que nace aprobada');
select pg_temp.fails($$insert into public.commission_entry (tenant_id, user_id, dedupe_key, kind, amount_cents, period)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'adj', 'adjustment', -500, '2026-10')$$, 'ajuste sin motivo');
update public.commission_entry set status = 'approved' where id = '60000000-0000-4000-8000-000000000001';
select pg_temp.assert((select approved_by = '22222222-2222-4222-8222-222222222222' from public.commission_entry where id = '60000000-0000-4000-8000-000000000001'), 'aprobada por el admin');
select pg_temp.fails($$update public.commission_entry set amount_cents = 99999 where id = '60000000-0000-4000-8000-000000000001'$$, 'editar una línea aprobada');
select pg_temp.fails($$delete from public.commission_entry where id = '60000000-0000-4000-8000-000000000001'$$, 'borrar una línea aprobada');
select pg_temp.fails($$update public.commission_entry set status = 'pending' where id = '60000000-0000-4000-8000-000000000001'$$, 'desaprobar');
select pg_temp.fails($$update public.revenue_event set status = 'void' where external_id = 'inv-1'$$, 'anular un ingreso con comisión aprobada');
-- Ajuste: la corrección se hace con otra línea, con motivo.
insert into public.commission_entry (tenant_id, user_id, dedupe_key, kind, amount_cents, period, reason)
values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'adj:1', 'adjustment', -5000, to_char(now(), 'YYYY-MM'), 'Descuento acordado con el cliente');
update public.commission_entry set status = 'approved' where dedupe_key = 'adj:1';

-- Liquidación: total congelado, pagarla marca las líneas.
insert into public.payout (id, tenant_id, user_id, period, total_cents)
values ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', to_char(now(), 'YYYY-MM'), 25000);
update public.commission_entry set payout_id = '70000000-0000-4000-8000-000000000001' where user_id = '11111111-1111-4111-8111-111111111111' and status = 'approved';
select pg_temp.fails($$update public.payout set total_cents = 1 where id = '70000000-0000-4000-8000-000000000001'$$, 'cambiar el total congelado');
-- Borrarla abierta suelta sus líneas; se vuelve a crear.
delete from public.payout where id = '70000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.commission_entry where payout_id is not null) = 0, 'liquidación abierta borrada: líneas por liquidar');
insert into public.payout (id, tenant_id, user_id, period, total_cents)
values ('70000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', to_char(now(), 'YYYY-MM'), 25000);
update public.commission_entry set payout_id = '70000000-0000-4000-8000-000000000002' where user_id = '11111111-1111-4111-8111-111111111111' and status = 'approved';
update public.payout set status = 'paid' where id = '70000000-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.commission_entry where status = 'paid') = 2, 'líneas pagadas');
select pg_temp.fails($$update public.payout set status = 'open' where id = '70000000-0000-4000-8000-000000000002'$$, 'deshacer un pago');
select pg_temp.fails($$delete from public.payout where id = '70000000-0000-4000-8000-000000000002'$$, 'borrar una liquidación pagada');
reset role;
select pg_temp.assert((select count(*) from public.notification where kind in ('payout_ready', 'payout_paid') and user_id = '11111111-1111-4111-8111-111111111111') = 3, 'el comercial recibe aviso de liquidación y de pago');

-- ---- el comercial ve lo suyo y declara ventas de sus propuestas
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select sum(amount_cents) from public.commission_entry) = 25000, 've sus líneas');
select pg_temp.fails($$insert into public.commission_entry (tenant_id, user_id, dedupe_key, kind, amount_cents, period)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'me', 'commission', 100000, '2026-10')$$, 'el comercial se apunta una comisión');
insert into public.dossier (id, tenant_id, author_id, title) values ('40000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Sala C');
insert into public.revenue_event (id, tenant_id, source, external_id, kind, status, occurred_at, amount_cents, revenue_cents, seller_id, dossier_id, offer)
values ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'manual', 'dossier:40000000-0000-4000-8000-0000000000c1', 'sale', 'pending', now(), 100000, 100000,
        '11111111-1111-4111-8111-111111111111', '40000000-0000-4000-8000-0000000000c1', 'pack-1000');
select pg_temp.fails($$insert into public.revenue_event (tenant_id, source, external_id, kind, status, occurred_at, amount_cents, revenue_cents, seller_id, dossier_id)
  values ('00000000-0000-4000-8000-000000000e01', 'manual', 'x2', 'sale', 'confirmed', now(), 1, 1, '11111111-1111-4111-8111-111111111111', '40000000-0000-4000-8000-0000000000c1')$$, 'el comercial confirma su propia venta');
select pg_temp.fails($$insert into public.revenue_event (tenant_id, source, external_id, kind, status, occurred_at, amount_cents, revenue_cents, seller_id, dossier_id)
  values ('00000000-0000-4000-8000-000000000e01', 'manual', 'x3', 'sale', 'pending', now(), 1, 1, '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000d05501')$$, 'declarar sobre una propuesta ajena');
update public.revenue_event set status = 'confirmed' where external_id like 'dossier:%';  -- RLS: 0 filas
reset role;
select pg_temp.assert((select status = 'pending' from public.revenue_event where id = '50000000-0000-4000-8000-000000000002'), 'sigue pendiente');
select pg_temp.assert((select count(*) from public.notification where kind = 'sale_to_confirm' and user_id = '22222222-2222-4222-8222-222222222222') = 1, 'el admin recibe la venta por confirmar');

-- ---- la jefa lee todo, no escribe
set role authenticated;
set request.jwt.claim.sub = 'cdcdcdcd-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.commission_entry) = 2, 'la jefa ve las líneas del equipo');
select pg_temp.fails($$insert into public.commission_plan (tenant_id, name) values ('00000000-0000-4000-8000-000000000e01', 'Mío')$$, 'la jefa crea planes');
update public.commission_entry set status = 'void' where status = 'paid';
reset role;
select pg_temp.assert((select count(*) from public.commission_entry where status = 'paid') = 2, 'la jefa no toca el libro');

-- ---- el admin confirma → aviso resuelto
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.revenue_event set status = 'confirmed' where id = '50000000-0000-4000-8000-000000000002';
reset role;
select pg_temp.assert((select confirmed_by = '22222222-2222-4222-8222-222222222222' from public.revenue_event where id = '50000000-0000-4000-8000-000000000002'), 'confirmada por el admin');
select pg_temp.assert((select resolved_at is not null from public.notification where kind = 'sale_to_confirm'), 'aviso resuelto');

-- ---- el colaborador no ve lo de otros
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select pg_temp.assert((select count(*) from public.commission_entry) = 0, 'colaborador: solo lo suyo');
select pg_temp.assert((select count(*) from public.revenue_event) = 0, 'colaborador: sin ingresos ajenos');
reset role;

-- Limpieza (como superusuario; los triggers no dejan borrar lo pagado, se desactivan solo aquí).
reset request.jwt.claim.sub;
alter table public.commission_entry disable trigger commission_entry_guard;
alter table public.payout disable trigger payout_guard;
alter table public.revenue_event disable trigger revenue_event_guard;
delete from public.commission_entry; delete from public.payout; delete from public.revenue_event; delete from public.commission_plan;
alter table public.commission_entry enable trigger commission_entry_guard;
alter table public.payout enable trigger payout_guard;
alter table public.revenue_event enable trigger revenue_event_guard;
delete from public.dossier where id = '40000000-0000-4000-8000-0000000000c1';
delete from auth.users where email = 'jefa-c@enjoy.test';
delete from public.notification;
