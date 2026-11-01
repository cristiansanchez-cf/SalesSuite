-- =============================================================================
-- Leads (docs/LEADS.md §Resend): cada empresa puede usar su propia cuenta de Resend (su dominio, su factura, su
-- reputación). La clave se guarda cifrada (AES-GCM con LEADS_SECRET del servidor) en lead_secret, que solo lee el
-- servidor (service role): sin políticas para nadie más. En lead_settings queda solo una pista («re_…abcd») para
-- que la consola diga si hay clave propia. Sin clave propia, se usa la de la plataforma (RESEND_API_KEY).
-- =============================================================================
create table public.lead_secret (
  tenant_id      uuid primary key references public.tenant(id) on delete cascade,
  resend_key_enc text check (length(resend_key_enc) <= 1000),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.users(id) on delete set null
);
alter table public.lead_secret enable row level security;
revoke all on public.lead_secret from anon, authenticated;
create trigger keep_tenant_id before update of tenant_id on public.lead_secret for each row execute function public.keep_tenant_id();

alter table public.lead_settings add column resend_key_hint text check (length(resend_key_hint) <= 20);
