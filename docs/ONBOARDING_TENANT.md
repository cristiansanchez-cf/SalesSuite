# Alta de un tenant

**Forma recomendada:** carpeta `tenants/<slug>/` + script idempotente.

```bash
cp -r tenants/enjoy tenants/<slug>          # y edita tenant.json + assets/
npm run tenant:bootstrap -- tenants/<slug> --dry-run
PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run tenant:bootstrap -- tenants/<slug>
```

El script crea o actualiza el tenant, sus dominios, la marca (sube los assets a Storage), el catálogo (versiona solo lo que cambió) e invita a los admins. Formato y requisitos: [`BRAND_INTAKE.md`](./BRAND_INTAKE.md). Configuración previa de Supabase: [`SETUP.md`](./SETUP.md).

Después, en `SETUP.md`:
- **Redirect URL** del dominio nuevo en Supabase Auth (§3.1);
- **dominio** en Vercel + CNAME del tenant (§6).

A partir de ahí los admins del tenant gestionan **equipo, catálogo y marca desde `/admin`**, sin SQL.

## Referencia: equivalente en SQL

Solo como referencia o para emergencias. Ejecutar como service role / SQL Editor.

```sql
insert into public.tenant (slug, name, default_locale, theme_tokens, brand) values (
  'enjoy', 'Enjoy the Club', 'es-ES',
  '{"colors":{"primary":"#ff27bb","accent":"#e1ff00"}}',
  '{"logoUrl":"https://<ref>.supabase.co/storage/v1/object/public/tenant-assets/<tenant_id>/brand/logo.svg"}'
) returning id;

insert into public.domain (tenant_id, hostname, is_primary) values ('<tenant_id>', 'pitch.enjoytheclub.es', true);

-- El usuario debe existir en Auth (invitado desde el panel: Authentication → Users → Invite)
insert into public.membership (user_id, tenant_id, role)
select id, '<tenant_id>', 'admin' from public.users where email = 'admin@enjoytheclub.es';
```

Claves válidas de `theme_tokens` y `brand`: `src/lib/theme.ts` y `src/lib/brand.ts`.
