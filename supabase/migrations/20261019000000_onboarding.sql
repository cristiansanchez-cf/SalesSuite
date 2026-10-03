-- Bienvenida paso a paso (/admin/welcome): cuándo terminó cada persona la de cada espacio. { "<tenant_id>": "<fecha ISO>" }.
-- Por espacio: un vendedor que trabaja para Enjoy y para Oquea ve la bienvenida de cada una. La edita la propia persona
-- (política users_update_self).
alter table public.users add column onboarding jsonb not null default '{}'::jsonb check (jsonb_typeof(onboarding) = 'object');
