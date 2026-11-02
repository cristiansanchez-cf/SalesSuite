-- Leads (docs/LEADS.md §Firma): la firma del email automático de cada empresa, por campos (nombre, cargo, teléfono,
-- dirección, email, web, logo y texto legal). La plataforma la maqueta igual en todos los clientes de correo.
alter table public.lead_settings
  add column email_signature jsonb not null default '{}' check (jsonb_typeof(email_signature) = 'object' and octet_length(email_signature::text) <= 8000);
