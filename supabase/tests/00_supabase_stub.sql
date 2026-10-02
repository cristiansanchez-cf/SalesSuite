-- Stub mínimo de lo que Supabase provee (roles, auth.users, auth.uid(), schema extensions),
-- para validar migración + RLS en un Postgres pelado (CI / local). NO aplicar en Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
-- Misma definición que Supabase: acepta el claim suelto (tests SQL) o el JSON de PostgREST.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
