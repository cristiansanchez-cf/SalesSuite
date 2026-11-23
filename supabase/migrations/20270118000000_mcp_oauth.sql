-- Conecta tu IA con un clic (docs/MCP.md §OAuth): OAuth 2.1 con PKCE y registro dinámico, para añadir el CRM en
-- claude.ai, ChatGPT, Claude Code, Cursor… entrando con la cuenta. Criterio de Cristian: «sigue con el OAuth».
-- · oauth_client: los clientes que se registran solos (RFC 7591). Públicos: sin secreto (PKCE obligatorio).
-- · oauth_code: el código de un solo uso (10 min) tras «Autorizar», con su reto PKCE. Solo su hash.
-- · mcp_token: los tokens que da el OAuth van a la misma tabla que las claves personales (se ven y se revocan en
--   «Tus conexiones»), con su token de refresco (hash) y caducidades.
-- Las tres las toca solo el servidor (service role): sin políticas para nadie más.
create table public.oauth_client (
  client_id     text primary key check (client_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  name          text not null check (length(name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.oauth_client enable row level security;

create table public.oauth_code (
  code_hash      text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id      text not null references public.oauth_client(client_id) on delete cascade,
  tenant_id      uuid not null references public.tenant(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  redirect_uri   text not null check (length(redirect_uri) <= 2000),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
  scope          text check (length(scope) <= 200),
  expires_at     timestamptz not null,
  used_at        timestamptz
);
create index oauth_code_expires_idx on public.oauth_code (expires_at);
alter table public.oauth_code enable row level security;

alter table public.mcp_token
  add column refresh_hash text unique check (refresh_hash ~ '^[0-9a-f]{64}$'),
  add column refresh_expires_at timestamptz;

-- Al refrescar, el servidor cambia el token y el de refresco (rotación). Lo demás (y para las personas, todo menos
-- revocar) no se toca.
create or replace function public.mcp_token_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.tenant_id, new.user_id, new.client_id, new.created_at) is distinct from (old.tenant_id, old.user_id, old.client_id, old.created_at)
     or (current_user in ('authenticated', 'anon') and (new.token_hash, new.prefix, new.refresh_hash, new.expires_at, new.refresh_expires_at)
         is distinct from (old.token_hash, old.prefix, old.refresh_hash, old.expires_at, old.refresh_expires_at)) then
    raise exception 'Solo se puede revocar' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
