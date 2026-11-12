# Alta de una empresa nueva (superadmin)

Cómo deja Cristian, como superadmin, una empresa nueva lista para vender: desde la consola, sin terminal ni SQL. Detalle
de cada pieza: [`ORG.md`](ORG.md) §Alta de una empresa (qué crea y cómo está hecho) y [`SETUP_WIZARD.md`](SETUP_WIZARD.md)
(configuración guiada y agente de alta).

## Una sola vez (antes de la primera empresa)

1. **Ser superadmin.** GitHub → Actions → **Producción** → *Qué hacer* = `superadmin`, tu email en «admin_email» y «Solo
   comprobar» desmarcado ([`ORG.md`](ORG.md) §Superadmin). En la consola aparece **Plataforma** en el menú.
2. **Vercel → el proyecto → Settings → Domains:** añadir `*.ventas.cofundo.io`, para que cualquier dirección nueva
   responda sin tocar nada (el comodín pide que `ventas.cofundo.io` use los nameservers de Vercel, o un CNAME `*.ventas`
   → `cname.vercel-dns.com` con la verificación que pida Vercel).
3. **Supabase → Authentication → URL Configuration → Redirect URLs:** añadir `https://*.ventas.cofundo.io/**`, para que
   las invitaciones y los códigos de acceso funcionen en cualquier espacio.

4. **Acceso general** ([`HUB.md`](HUB.md)): añadir también `ventas.cofundo.io` (sin asterisco) en Vercel y
   `https://ventas.cofundo.io/**` en las Redirect URLs de Supabase. Ahí entra todo el mundo y elige su empresa.

Si los espacios cuelgan de otra base que no sea `ventas.cofundo.io`, se pone en `PLATFORM_DOMAIN` (Vercel) y se usa esa
base en los pasos 2 y 3.

## Cada empresa nueva

1. **Plataforma → Nueva empresa.** Nombre, dirección (sale sola del nombre: `ocean-dive-lab` →
   `ocean-dive-lab.ventas.cofundo.io`), idioma y, si ya lo sabes, el **email de su admin**. «Crear empresa». Una
   dirección repetida se rechaza.
2. **Su admin** recibe la invitación por email; al aceptarla entra directamente en la **configuración guiada**
   (`/admin/setup/ia?first=1`). Si prefieres prepararlo tú antes, «Entrar y configurar» te lleva al mismo sitio; allí
   hay que iniciar sesión otra vez (la sesión es de cada dirección) o entrar desde «Cambiar de espacio».
3. **Agente de alta** (`/admin/setup/agente`; en la configuración guiada, arriba: «Que lo prepare la IA con su web y
   sus documentos»). Se le da su web, hasta 4 documentos (presentación, tarifas, argumentario…; 4 MB en total) y unas
   líneas si se quiere. En unos minutos devuelve el borrador de **qué vende, clientes y actores, situaciones, cómo se
   vende y precios**, más las preguntas que no ha podido contestar. Se contestan, **Afinar**, y **Importar** (solo añade,
   nunca borra). Necesita `ANTHROPIC_API_KEY` en Vercel; sin ella, el botón sale desactivado y queda el camino de los
   prompts uno a uno ([`SETUP_WIZARD.md`](SETUP_WIZARD.md)).
4. **Lo que el agente no hace** (cada cosa en su pantalla del espacio):
   - **Logo y marca:** Configurar → Marca (`/admin/brand`).
   - **Catálogo de módulos de la propuesta:** un espacio nuevo empieza sin módulos; se crean en Configurar → Catálogo
     (`/admin/catalog`) a partir de las plantillas, que traen textos de ejemplo.
   - **Precios:** el agente los propone solo si están escritos en sus fuentes; se revisan en Tarifas y pagos (`/admin/prices`).
   - **Empresas del CRM:** a mano o con el importador (`/admin/import`, solo admin).
   - **Equipo:** invitar comerciales y repartir zonas (Configurar → Equipo, Territorio).
5. **Estado del alta, en Plataforma.** Cada espacio tiene su desplegable **Alta** con nueve pasos — su admin, qué vende,
   clientes y actores, situaciones, cómo se vende (5 o más jugadas generales), precios, logo, CRM con empresas y primera
   propuesta publicada —, cuáles faltan y un enlace a cada uno en su espacio.

**Dominio propio** de la empresa (p. ej. `ventas.suempresa.com`), si lo quiere: no hay pantalla para añadirlo. Se añade
el dominio en Vercel y su CNAME ([`SETUP.md`](SETUP.md) §6), su Redirect URL en Supabase (§3.1) y la fila en la tabla
`domain` del espacio (con la alternativa de abajo, en `domains`, o con el SQL de referencia).

## Alternativa: alta desde una carpeta `tenants/<slug>/`

Para una empresa con mucho material ya preparado (marca completa, catálogo con sus textos, playbook, tarifas, campos del
CRM), como Enjoy y Oquea: se describe todo en `tenants/<slug>/tenant.json` + `assets/` ([`BRAND_INTAKE.md`](BRAND_INTAKE.md))
y se carga con el script idempotente. Sirve también para completar un espacio creado desde Plataforma: el script busca el
espacio por `slug` y lo actualiza (pon en `domains` también su `<slug>.ventas.cofundo.io`, marcando cuál es el principal).

- **Sin terminal:** GitHub → Actions → **Producción** → `alta-espacio`, *Espacio* = la carpeta, primero con «Solo
  comprobar» marcado y después desmarcado ([`PUESTA_EN_MARCHA.md`](PUESTA_EN_MARCHA.md) paso 7).
- **Con terminal:**

  ```bash
  npm run tenant:bootstrap -- tenants/<slug> --dry-run
  PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run tenant:bootstrap -- tenants/<slug>
  ```

El script crea o actualiza el espacio, sus dominios, la marca (sube los assets a Storage), el catálogo (versiona solo lo
que cambió), mercado, playbook, situaciones, tarifas, cupones y campos del CRM, e invita a los admins (`admins` o
`ADMIN_EMAILS=…`). Con un dominio que no sea `*.ventas.cofundo.io`, ese dominio necesita lo del párrafo «Dominio propio».

## Referencia: equivalente en SQL

Solo como referencia o para emergencias. Ejecutar como service role / SQL Editor.

```sql
insert into public.tenant (slug, name, default_locale, theme_tokens, brand) values (
  'enjoy', 'Enjoy the Club', 'es-ES',
  '{"colors":{"primary":"#ff27bb","accent":"#e1ff00"}}',
  '{"logoUrl":"https://<ref>.supabase.co/storage/v1/object/public/tenant-assets/<tenant_id>/brand/logo.svg"}'
) returning id;

insert into public.domain (tenant_id, hostname, is_primary) values ('<tenant_id>', 'pitch.enjoytheclub.es', true);
insert into public.crm_settings (tenant_id) values ('<tenant_id>') on conflict (tenant_id) do nothing;

-- El usuario debe existir en Auth (invitado desde el panel: Authentication → Users → Invite)
insert into public.membership (user_id, tenant_id, role)
select id, '<tenant_id>', 'admin' from public.users where email = 'admin@enjoytheclub.es';
```

Claves válidas de `theme_tokens` y `brand`: `src/lib/theme.ts` y `src/lib/brand.ts`.
