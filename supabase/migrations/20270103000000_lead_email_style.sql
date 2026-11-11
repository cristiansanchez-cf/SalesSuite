-- Diseño del email de respuesta a los leads (docs/PLAN_AJUSTES.md, paso 8):
--   {}                                         → como ahora: texto, como escrito a mano
--   {"mode":"brand","logoUrl":"https://…","color":"#ff27bb"} → con el logo y el color de la empresa
-- El logo y el color se copian de la marca al elegirlo (el envío no lee la marca del espacio).
alter table public.lead_settings
  add column if not exists email_style jsonb not null default '{}'::jsonb;

alter table public.lead_settings
  add constraint lead_settings_email_style_shape
  check (jsonb_typeof(email_style) = 'object' and pg_column_size(email_style) < 4000);
