-- Leads (docs/LEADS.md §WhatsApp con tu OK): el aviso de lead nuevo por WhatsApp a quien atiende (con «Le hablamos»)
-- y cuándo espera el WhatsApp 1 al lead a ese OK.
--   wa_approval: 'auto'     → como antes: los claros, automático; los dudosos, nada (lo sigue una persona).
--                'doubtful' → los claros, automático; los dudosos esperan a «Le hablamos» (por defecto).
--                'all'      → ninguno sale solo: todos esperan a «Le hablamos».
--   team_whatsapp: avisar por WhatsApp (además del email) a quien atiende, si tiene el teléfono en Mi cuenta.
alter table public.lead_settings
  add column if not exists wa_approval text not null default 'doubtful' check (wa_approval in ('auto', 'doubtful', 'all')),
  add column if not exists team_whatsapp boolean not null default true;

-- El aviso por WhatsApp a quien atiende va por la misma cola (se reclama antes de enviar, se reintenta).
alter table public.lead_message drop constraint if exists lead_message_step_check;
alter table public.lead_message add constraint lead_message_step_check check (step in ('autoreply', 'notify', 'wa1', 'wa2', 'team_wa'));
