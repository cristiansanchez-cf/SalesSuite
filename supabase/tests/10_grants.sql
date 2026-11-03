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
-- Historial de condiciones y visitas a dossiers: solo los escriben triggers y RPC.
revoke insert, update, delete on public.member_conditions_history from authenticated;
revoke insert, update, delete on public.dossier_view from authenticated;
-- Registro del resumen diario: solo el cron (service role).
revoke all on public.daily_digest_log from authenticated;
-- Leads (20261215): lo que llega de la web lo escribe solo el servidor; el equipo gestiona etapas y cancela envíos.
revoke insert, delete on public.lead from authenticated;
revoke update on public.lead from authenticated;
grant update (stage, stage_at, discard_reason, quarantined, quarantine_reasons, validated_at, validated_by, first_response_at,
  first_response_mins, sequence_stopped_at, sequence_stop_reason, account_id, contact_id, facts, updated_at) on public.lead to authenticated;
revoke insert, update, delete on public.lead_submission from authenticated;
revoke update, delete on public.lead_event from authenticated;
revoke insert, update, delete on public.lead_message from authenticated;
grant update (status) on public.lead_message to authenticated;
revoke delete on public.lead_settings from authenticated;
-- Claves de Resend de cada empresa (20261216): solo el servidor.
revoke all on public.lead_secret from anon, authenticated;
-- Correos al CRM (20261221): las direcciones solo por RPC; lo recibido lo escribe el servidor y la persona solo asigna.
revoke insert, update, delete on public.inbound_address from authenticated, anon;
revoke insert, delete on public.inbound_email from authenticated, anon;
revoke update on public.inbound_email from authenticated;
grant update (status, account_id, activity_id, detail) on public.inbound_email to authenticated;
-- Privacidad de los leads (20261222): la prueba bloqueada no la toca nadie con sesión; los registros, solo el servidor.
revoke all on public.lead_consent_proof from authenticated, anon;
revoke insert, update, delete on public.lead_purge_log from authenticated, anon;
revoke insert, update, delete on public.privacy_request from authenticated, anon;
-- Caché de perfiles de redes (20261223): el equipo lee, crea y cambia; nadie borra con sesión.
revoke delete on public.social_profile_cache from authenticated, anon;
-- Asistente de WhatsApp (20261224): su estado solo lo toca el servidor.
revoke all on public.wa_assistant_state from authenticated, anon;
-- Recordatorios por WhatsApp (20261226): su registro solo lo escribe el servidor.
revoke all on public.wa_reminder_log from authenticated, anon;
-- Consumo por empresa (20261227): solo lo escribe el servidor y lo lee el superadmin (platform_usage).
revoke all on public.usage_event from authenticated, anon;
