-- Supabase concede por defecto DML a authenticated (RLS decide). Replicamos eso en el stub.
grant select, insert, update, delete on all tables in schema public to authenticated;
-- service_role (scripts de plataforma) lo puede todo, como en Supabase.
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- Tras la migración de marca, authenticated solo puede actualizar ciertas columnas de tenant.
revoke update on public.tenant from authenticated;
grant update (name, default_locale, theme_tokens, brand) on public.tenant to authenticated;
-- Avisos: solo se marcan como leídos o descartados (los crean triggers).
revoke insert, update, delete on public.notification from authenticated;
grant update (read_at, dismissed_at) on public.notification to authenticated;
