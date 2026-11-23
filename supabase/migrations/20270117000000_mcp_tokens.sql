-- Conecta tu IA (docs/MCP.md): claves personales para el servidor MCP (/api/mcp). Criterio de Cristian: «lo que ya
-- hacemos por WhatsApp, por MCP, para que los usuarios lo puedan conectar a su IA directamente».
-- Cada clave es de UNA persona en UN espacio y actúa como ella (sus permisos de siempre: RLS). Se guarda solo el hash
-- (sha256); la clave se enseña una vez al crearla. Se puede revocar. client_id: las que dé el OAuth (fase 2).
create table public.mcp_token (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  prefix       text not null check (length(prefix) between 4 and 24),
  client_id    text check (length(client_id) <= 200),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
create index mcp_token_user_idx on public.mcp_token (tenant_id, user_id);
alter table public.mcp_token enable row level security;

-- Cada uno ve, crea y revoca las suyas (en un espacio del que es miembro). El servidor las comprueba con service role.
create policy mcp_token_select on public.mcp_token for select to authenticated using (user_id = auth.uid());
create policy mcp_token_insert on public.mcp_token for insert to authenticated
  with check (user_id = auth.uid() and (public.is_member(tenant_id) or public.is_partner(tenant_id)));
create policy mcp_token_update on public.mcp_token for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Al revocar solo cambia revoked_at (ni el hash ni de quién es).
create or replace function public.mcp_token_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.tenant_id, new.user_id, new.token_hash, new.prefix, new.client_id, new.created_at) is distinct from
     (old.tenant_id, old.user_id, old.token_hash, old.prefix, old.client_id, old.created_at) then
    raise exception 'Solo se puede revocar' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger mcp_token_guard before update on public.mcp_token for each row execute function public.mcp_token_guard();
revoke all on function public.mcp_token_guard() from public, anon, authenticated;
