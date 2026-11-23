-- CIMD (Client ID Metadata Documents; docs/MCP.md §OAuth): claude.ai no se registra, su client_id es la URL https de
-- su ficha. Se guarda en oauth_client como las demás (oauth_code la referencia), así que el client_id puede ser
-- también una URL https (como mucho 200 caracteres, lo que cabe en mcp_token.client_id).
alter table public.oauth_client drop constraint oauth_client_client_id_check;
alter table public.oauth_client add constraint oauth_client_client_id_check
  check (client_id ~ '^[A-Za-z0-9_-]{16,64}$' or (client_id ~ '^https://[^[:space:]]+$' and length(client_id) <= 200));
