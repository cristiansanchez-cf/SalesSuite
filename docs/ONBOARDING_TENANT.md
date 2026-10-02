# Alta de un tenant

Todo como **service role / SQL editor** de Supabase (el alta de tenants no está expuesta a usuarios).

```sql
-- 1. Tenant + tema
insert into public.tenant (slug, name, default_locale, theme_tokens) values (
  'enjoy', 'Enjoy the Club', 'es-ES',
  '{"colors":{"primary":"#ff27bb","accent":"#e1ff00","accent-contrast":"#0d0d0d"},
    "font":{"display":"''YWFTKul'', ui-sans-serif, system-ui, sans-serif",
            "faces":[{"family":"YWFTKul","src":"https://<proyecto>.supabase.co/storage/v1/object/public/tenant-assets/<tenant_id>/YWFTKul.woff2"}]}}'
) returning id;

-- 2. Dominios (el primario + el wildcard de plataforma)
insert into public.domain (tenant_id, hostname, is_primary) values
  ('<tenant_id>', 'pitch.enjoytheclub.es', true),
  ('<tenant_id>', 'enjoy.cofundo.app', false);

-- 3. Primer admin (el usuario debe haberse registrado antes en Supabase Auth;
--    el trigger on_auth_user_created ya creó su fila en public.users)
insert into public.membership (user_id, tenant_id, role)
select id, '<tenant_id>', 'admin' from public.users where email = 'admin@enjoytheclub.es';

-- 4. Catálogo: module + module_version publicadas (ver MODULE_AUTHORING.md §6)
```

5. DNS del tenant: `CNAME pitch → <host de la plataforma>`. Provisionar el certificado (Vercel Domains API o Cloudflare for SaaS) y marcar `domain.ssl_status = 'active'`.

Las claves de `theme_tokens` válidas están en `src/lib/theme.ts` (`themeTokensSchema`). Tokens inválidos se ignoran (tema por defecto) y se avisa en logs.
