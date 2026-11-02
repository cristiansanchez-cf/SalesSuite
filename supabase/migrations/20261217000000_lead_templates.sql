-- =============================================================================
-- Leads (docs/LEADS.md §Mensajes y §Clasificar): los textos de cada empresa (email automático, WhatsApp 1 y 2 y las
-- preguntas por tipo, en es/en/fr; vacío = los de por defecto) y un resumen de qué vende y a quién (ai_context) para
-- que la clasificación de cada lead sepa qué encaja. Lo rellena la consola al guardar los ajustes.
-- =============================================================================
alter table public.lead_settings
  add column templates jsonb not null default '{}' check (jsonb_typeof(templates) = 'object' and octet_length(templates::text) <= 60000),
  add column ai_context text check (length(ai_context) <= 4000);
