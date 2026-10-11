-- «Trabaja con» (docs/CRM_DINAMICO.md §22): una empresa enlazada con otra, en los dos sentidos. Un local con la
-- promotora que le hace las fiestas (la ucraniana de los jueves) o con sus DJs invitados. Distinto del grupo (el dueño
-- de varios locales): aquí cada una es de quien es; el enlace solo dice que trabajan juntas, con una nota.
create table public.account_link (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  a_id        uuid not null,
  b_id        uuid not null,
  note        text check (length(note) <= 200),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  check (a_id <> b_id),
  foreign key (tenant_id, a_id) references public.account (tenant_id, id) on delete cascade,
  foreign key (tenant_id, b_id) references public.account (tenant_id, id) on delete cascade
);
-- Un enlace por pareja, sea cual sea el orden.
create unique index account_link_pair on public.account_link (tenant_id, least(a_id, b_id), greatest(a_id, b_id));
create index account_link_a on public.account_link (tenant_id, a_id);
create index account_link_b on public.account_link (tenant_id, b_id);

-- Como persona ↔ empresa: quien es del espacio ve y enlaza (no cambia nada de ninguna de las dos empresas).
alter table public.account_link enable row level security;
create policy account_link_select on public.account_link for select to authenticated using (public.is_member(tenant_id));
create policy account_link_write on public.account_link for all to authenticated
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
