-- Combinaciones guardadas («hazme un José María», docs/PROPOSAL_PRESETS.md): tipo, ángulo, preguntas, modo y tarifa
-- con un nombre, para montar una propuesta de golpe. Las ve todo el equipo; las borra quien la hizo o un admin.
create table public.proposal_template (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant(id) on delete cascade,
  segment_id      uuid not null references public.segment(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 60),
  mode            text not null default 'full' check (mode in ('full', 'visual')),
  answers         text[] not null default '{}' check (cardinality(answers) <= 20),
  price_option_id uuid references public.price_option(id) on delete set null,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (tenant_id, segment_id, name)
);
create index proposal_template_tenant_idx on public.proposal_template (tenant_id, segment_id);

alter table public.proposal_template enable row level security;
create policy proposal_template_select on public.proposal_template for select to authenticated
  using (public.is_member(tenant_id));
create policy proposal_template_insert on public.proposal_template for insert to authenticated
  with check (public.is_member(tenant_id) and created_by = auth.uid());
create policy proposal_template_delete on public.proposal_template for delete to authenticated
  using (public.is_member(tenant_id) and (created_by = auth.uid() or public.is_admin(tenant_id)));
