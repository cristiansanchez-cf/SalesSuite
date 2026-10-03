-- Personalizar: el autor de la propuesta (o admin/lead) sube sus archivos en su carpeta; nadie más. La pública los devuelve.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('66666666-6666-4666-8666-666666666666', 'rep2@enjoy.test') on conflict do nothing;
insert into public.membership (user_id, tenant_id, role) values ('66666666-6666-4666-8666-666666666666', '00000000-0000-4000-8000-000000000e01', 'rep') on conflict do nothing;
update public.dossier set author_id = '11111111-1111-4111-8111-111111111111', client_media = '{}' where id = '00000000-0000-4000-8000-000000d05501';

set role authenticated;
-- El autor sube a la carpeta de SU propuesta.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/dossiers/00000000-0000-4000-8000-000000d05501/logo-a.png');
-- Fuera de la carpeta de propuestas (la marca), no.
do $$ begin
  insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/brand/logo.png');
  raise exception 'ASSERT FAILED: un comercial sube a la marca';
exception when insufficient_privilege then null; end $$;
-- Otro comercial, en una propuesta que no es suya, no.
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/dossiers/00000000-0000-4000-8000-000000d05501/foto.png');
  raise exception 'ASSERT FAILED: otro comercial sube a una propuesta ajena';
exception when insufficient_privilege then null; end $$;
-- Un comercial de otro espacio, tampoco (aunque ponga la carpeta).
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/dossiers/00000000-0000-4000-8000-000000d05501/x.png');
  raise exception 'ASSERT FAILED: otro espacio sube a mi propuesta';
exception when insufficient_privilege then null; end $$;
-- El admin sí (puede editar todas).
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/dossiers/00000000-0000-4000-8000-000000d05501/video-b.mp4');
reset role;

-- La propuesta pública devuelve lo personalizado.
update public.dossier set client_media = '{"logo": "https://x.test/logo.png", "photos": ["https://x.test/1.webp"]}' where id = '00000000-0000-4000-8000-000000d05501';
set role anon;
select pg_temp.assert((public.get_public_dossier('demo-sala-x-7Qm2', '00000000-0000-4000-8000-000000000e01') -> 'media' ->> 'logo') = 'https://x.test/logo.png', 'la pública lleva el logo del cliente');
reset role;
update public.dossier set client_media = '{}' where id = '00000000-0000-4000-8000-000000d05501';
do $$ begin
  update public.dossier set client_media = '[]' where id = '00000000-0000-4000-8000-000000d05501';
  raise exception 'ASSERT FAILED: client_media no objeto';
exception when check_violation then null; end $$;
