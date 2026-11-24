-- WhatsApp al validar (docs/LEADS.md §2f): al validar un lead (en la ficha, en la bandeja, desde el aviso por WhatsApp o
-- por MCP), si el espacio tiene su WhatsApp conectado, le sale el primero a los minutos de `wa_delay_minutes`.
-- Por defecto todos esperan a que se valide (`wa_approval = 'all'`): nada sale solo. Los espacios que ya tenían el
-- valor por defecto anterior ('doubtful', puesto ayer por 20270125) pasan al nuevo.
alter table public.lead_settings
  add column if not exists wa_delay_minutes integer not null default 5 check (wa_delay_minutes between 1 and 120);
alter table public.lead_settings alter column wa_approval set default 'all';
update public.lead_settings set wa_approval = 'all' where wa_approval = 'doubtful';
