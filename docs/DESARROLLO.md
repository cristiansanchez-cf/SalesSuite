# Cómo se desarrolla aquí

Guía para quien toca el código por primera vez: cómo arrancarlo, cómo está montado, cómo se prueba y las reglas que
evitan problemas (sobre todo de rendimiento). Los detalles de cada parte están en su doc (índice al final, §6).

## 0. Arrancar en local (modo demo, sin Supabase)

Sin claves de Supabase la app arranca en **modo demo**: datos de ejemplo en memoria (`supabase/seed/fixtures.json` +
`src/lib/data/store.ts`), sin emails y con login de un clic. Los cambios se pierden al reiniciar.

```bash
npm install
npm run build
AI_RESEARCH_FIXTURE=1 DEMO_MODE=1 DEV_TENANT_SLUG=enjoy node ./dist/server/entry.mjs     # http://localhost:4321
```

- `DEMO_MODE=1` permite la demo en un build de producción (sin él, sin Supabase, responde 503 a propósito:
  `src/lib/mode.ts`). `npm run start:demo` es lo mismo sin `AI_RESEARCH_FIXTURE`.
- `AI_RESEARCH_FIXTURE=1`: sin `ANTHROPIC_API_KEY` ni `GOOGLE_MAPS_API_KEY`, la IA (agente de alta, Investigar, Apuntar,
  Limpiar, traducir) y Google responden datos fijos de ejemplo sin llamar a nadie. Es lo que usa CI.
- `DEV_TENANT_SLUG=enjoy`: `localhost` y `127.0.0.1` se resuelven a ese espacio. `*.localhost` (p. ej.
  `retheme.localhost:4321`, `oquea.localhost:4321`) se resuelve por la tabla `domain`, como en producción.
- `npm run dev` (Astro en modo desarrollo, con recarga) también entra en demo sin `.env`; el build es lo que corren los
  smokes y CI.

**Usuarios de demo** (`/admin/login` → «Entrar como…», un clic): `admin@enjoy.test` (admin de Enjoy),
`rep@enjoy.test` (comercial), `dj@enjoy.test` (colaborador: entra con código, que en demo sale en pantalla),
`rep@retheme.test` (comercial de otro espacio: en Enjoy da 403) y `super@cofundo.test` (superadmin: ve **Plataforma**).
En la consola, «Cambiar de espacio» guarda el espacio en la cookie `ss_demo_tenant`.

Enlaces públicos de ejemplo: `/d/demo-sala-x-7Qm2` (Enjoy), `retheme.localhost:4321/d/demo-retheme-Hx8v` (otro tema),
`/d/demo-draft-Kp9wQ1`, `/d/demo-revoked-Zt4c`, `/d/demo-expired-Bn3r` (borrador, revocado y caducado: 404 idéntico).
En demo, `/api/dev/outbox?tag=daily&to=rep@enjoy.test` enseña el último email «enviado» (en producción, 404).

Con Supabase de verdad: [`PUESTA_EN_MARCHA.md`](PUESTA_EN_MARCHA.md) (producción, sin terminal) y
[`SETUP.md`](SETUP.md) (referencia). Las variables de entorno, con una línea cada una: `.env.example`.

## 1. Cómo está montado

**Petición → espacio → sesión → servicios → base de datos.**

- **Espacio (tenant) por dominio**: `src/middleware.ts` lee el `Host` (`src/lib/http.ts`, `requestHost`; solo usa
  `X-Forwarded-Host` con `TRUST_FORWARDED_HOST=1`) y lo resuelve con `resolveTenant` (`src/lib/tenant.ts`) contra la
  tabla `domain`, con un minuto de caché. Un dominio que no está da 404. El middleware también aplica el CSRF (Origin
  contra el host), el idioma y la sesión de `/admin`.
- **Sesión** (`src/lib/admin/auth.ts`, `authenticate` → `buildAdminContext`): Supabase Auth con cookies httpOnly
  (`@supabase/ssr`) o, en demo, la cookie `ss_demo_user`. Comprueba la membresía en ese espacio (o superadmin) y crea los
  servicios de esa petición en `Astro.locals.admin`: `service` (propuestas), `tenantAdmin` (equipo, catálogo, marca),
  `playbook`, `evidence`, `notifications`, `accounts`, `crm`, `commissions`, `analytics` y `org`. Por eso se puede tener
  una caché de lecturas por petición (§3).
- **Astro SSR** (`src/pages`): cada página de `/admin` lee en su cabecera (frontmatter) lo que pinta y, si es un POST,
  hace la acción y redirige (303) a la misma página con `?ok=…`. Los formularios con `data-async="id1 id2"` no
  recargan: piden la página y cambian solo esas secciones (`src/layouts/AdminLayout.astro`). Las islas interactivas son
  Svelte 5 (`src/components/admin/*.svelte`, p. ej. el editor de propuestas).
- **Servicios** (`src/lib/<área>/service.ts`): las reglas (permisos con `src/lib/admin/permissions.ts`, validación con
  zod, errores `AdminError` con mensaje traducible en `src/lib/i18n/errors.ts`). Una página nunca habla con la base de
  datos directamente.
- **Bases de datos, dos implementaciones de la misma interfaz** por área (`src/lib/<área>/db.ts`):
  `db-supabase.ts` (PostgREST con el JWT del usuario, así que la **RLS** aplica siempre) y `db-demo.ts` (en memoria,
  para el modo demo y las pruebas rápidas). Lo que hace una lo tiene que hacer la otra; lo garantizan los **contratos**
  (§2). Áreas con este patrón: `admin`, `accounts`, `crm`, `commissions`, `analytics`, `evidence`, `notify`, `org`,
  `playbook`.
- **Seguridad en Postgres** (`supabase/migrations/`): cada tabla lleva `tenant_id` y RLS (`is_member`, `is_admin`,
  `my_role`, `is_partner`, `is_superadmin`…). La `service_role` solo se usa en el servidor para invitar, para
  `/admin/switch`, en el cron y en los scripts de alta. El enlace público usa la clave anon y RPC `security definer`
  (`resolve_tenant`, `get_public_dossier`, `track_dossier_view`…).
- **Enlace público** `/d/<token>` (`src/pages/d/[token].astro`): repositorio público `src/lib/data/` (demo o Supabase),
  render común `src/components/dossier/DossierView.astro`, tema por espacio (`src/layouts/ThemedShell.astro`,
  `src/lib/theme.ts`, `src/lib/brand.ts`). Los módulos de la propuesta: `src/modules/<tipo>/` + `src/modules/registry.ts`
  ([`MODULE_AUTHORING.md`](MODULE_AUTHORING.md)).
- **Idiomas** (`src/lib/i18n/`): consola en es, en, pt y ko; textos en `src/lib/i18n/messages/*.ts`; contenido de cada
  empresa traducido aparte (`content_i18n`). [`I18N.md`](I18N.md).
- **Menú** de la consola: `src/lib/ui/nav.ts` (lo pinta `src/components/ui/ConsoleNav.astro`).
- **Datos de ejemplo**: `supabase/seed/fixtures.json` es la fuente única de la demo y de `supabase/seed.sql`
  (`npm run db:seed:build`; CI comprueba que está al día). Los espacios reales se describen en `tenants/<slug>/tenant.json`
  ([`ONBOARDING_TENANT.md`](ONBOARDING_TENANT.md)).

## 2. Pruebas: qué hay y cuándo añadir cada una

| Capa | Dónde | Cómo se corre | Qué prueba |
|---|---|---|---|
| Tipos | todo | `npx astro check` (`npm run check`) | Tipos de Astro, Svelte y TS; también que los cuatro idiomas tengan las mismas claves |
| Copy | `src/pages/admin`, `src/components/{admin,ui,playbook}`, `src/lib/…` | `npm run lint:copy` | Textos prohibidos de la guía de consolas (vacíos sin salida, «arriba/abajo», emojis) |
| Unitarias | `src/**/*.test.ts` | `npm test` (`vitest run`) | Funciones puras: prioridad, perfiles, lector de webs, importador, caché… |
| Contrato | `src/lib/*/*.contract.ts` | demo: dentro de `npm test` · Postgres: `npm run db:it` | El mismo test contra las dos bases: permisos y reglas del servicio |
| SQL | `supabase/tests/NN_*.test.sql` | `npm run db:test` | Migraciones, seed, restricciones, RLS y RPC sobre un Postgres pelado (stub de `auth`) |
| Smokes | `scripts/smoke-*.cjs` | servidor demo + `node scripts/smoke-X.cjs` | La app de verdad en el navegador (Playwright) |

- **`npm run db:test`** (`supabase/tests/run-local.sh`) necesita `psql` y un Postgres local; por defecto usa
  `postgres:///postgres` y crea la base `salessuite_test` (cámbialo con `ADMIN_DATABASE_URL` / `DATABASE_URL`).
- **`npm run db:it`** (`supabase/tests/run-it.sh`) además necesita el binario de PostgREST
  (`POSTGREST_BIN=/ruta/postgrest`): corre los `*.supabase.test.ts` (contratos sobre Postgres + PostgREST + RLS con
  `supabase-js`) y el script de alta (`supabase/tests/bootstrap-it.sh`).
- **Smokes**: con el servidor demo del §0 arrancado en otra terminal,
  `PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright node scripts/smoke-new-space.cjs` (sin
  `PLAYWRIGHT_MODULE`, el `playwright` del proyecto: `npm i --no-save playwright`). `BASE_URL` cambia el servidor
  (por defecto `http://127.0.0.1:4321`) y `SHOTS_DIR=/carpeta` guarda capturas.

Cuándo añadir cada una:

- **Una función nueva del servicio que escribe datos o mira permisos** → test en el contrato (corre en las dos bases).
- **Una migración** → `supabase/migrations/AAAAMMDDhhmmss_nombre.sql` y su `supabase/tests/NN_nombre.test.sql`,
  **añadido a mano** a la lista de `supabase/tests/run-local.sh`. En producción se aplica con GitHub → Actions →
  **Producción** (`.github/workflows/production.yml`, *Qué hacer* = `migraciones`, «Solo comprobar» desmarcado).
- **Un flujo de pantalla** → un smoke, **añadido a mano** a `.github/workflows/ci.yml` (si no, CI no lo corre).
- **En CI todos los smokes van seguidos contra el mismo servidor demo** (lo que crea uno lo ven los siguientes): usa
  nombres propios de cada smoke, no compruebes «solo hay N» de algo compartido, no cambies el rol ni sueltes las
  empresas de los usuarios de ejemplo (y si hace falta, ese smoke va al final de `ci.yml`, como `smoke-org.cjs`), y
  espera a una condición en vez de a una pausa fija (en CI no se sacan capturas y todo va más rápido). Para
  reproducirlo: arranca un servidor demo y corre los smokes en el orden de `ci.yml` sin reiniciarlo.
- Antes de subir: `npx astro check`, `npm test`, `npm run lint:copy`, `npm run db:test`, `npm run db:it` y los smokes
  de lo tocado (mira que `npm run build` termine bien: si falla, el servidor sigue con el `dist/` viejo).

## 3. Rendimiento: reglas

Lo que más pesa en el CRM es leer **todas** las empresas o **todas** las interacciones del espacio. Reglas:

1. **Índice ligero** (`listAccountIndex` → `AccountRef`): para buscar por nombre, agrupar, ver duplicados o contar
   listas, ~14 columnas en vez de ~55. `allAccounts()` (todo) solo cuando de verdad hace falta la empresa entera.
2. **Caché de lecturas por petición** (`src/lib/data/request-cache.ts`): zonas, reglas, tipos, campos, la empresa
   (`getAccount`), miembros y enlaces se leen una vez por petición aunque los pidan varios servicios. Cualquier
   escritura la vacía y lo que devuelve es una copia. Solo en `authenticate` (una petición); los contratos no la usan
   porque reutilizan un contexto con varios usuarios escribiendo.
3. **En paralelo**: en la cabecera de una página, todo lo que no depende de otra cosa va en un solo `Promise.all`.
   Las páginas de PostgREST (1000 filas) se piden de 4 en 4 (`paged`).
4. **Lo justo**: «se enfría» lee la vista `crm_last_activity` (una fila por empresa), no todas las interacciones;
   los nombres de grupo, solo de las filas que se ven; la lista de empresas no carga personas; las pantallas del CRM
   usan `segmentList()` (sectores) y no el mapa de mercado entero.
5. **Cuándo se carga**: lo de arriba de la página y lo que cambia un formulario `data-async` va en la página (si no, el
   cambio sin recargar no lo encuentra). Lo de abajo y poco usado puede ir en un *server island* (`server:defer`, con
   su shimmer), como el inicio. Lo lento que el usuario espera (IA) dice lo que va haciendo (Apuntar).

Cada respuesta de la consola lleva la cabecera `Server-Timing` (`tenant`, `auth`, `prep`, `page`; `src/lib/timing.ts`).

## 4. Estilo del código

- Comentarios en español, cortos, diciendo **por qué** (el qué ya lo dice el código), con la sección del doc (§N).
- Antes de escribir un helper, busca si ya existe (`norm`, `zonePath`, `socialUrl`, `legalKey`, `chunks`…).
- Textos de pantalla en `src/lib/i18n/messages/*.ts` en los cuatro idiomas (es, en, pt, ko).
- Nada de datos inventados: lo que se muestra tiene una fuente (lo dijo alguien, su web, Google…).

## 5. Scripts útiles

| Script | Para qué |
|---|---|
| `npm run tenant:bootstrap -- tenants/<slug> [--dry-run]` | Alta o actualización idempotente de un espacio desde su `tenant.json` (service role) |
| `npm run tenant:samples -- <slug> [--dry-run]` | Propuestas de ejemplo de un espacio (`scripts/sample-dossiers.ts`) |
| `npm run tenant:translate -- <slug> [--dry-run]` | Traduce el contenido del espacio a sus `content_i18n.locales` (Claude) |
| `npx tsx scripts/superadmin.ts [--dry-run] [--remove]` | Nombra o quita superadmin (`ADMIN_EMAILS=…`) |
| `npm run db:seed:build` | Regenera `supabase/seed.sql` desde `fixtures.json` |
| `npm run export:sales -- <slug>` | Exporta a Markdown el contenido comercial de `tenants/<slug>/tenant.json` en `docs/ventas/<slug>/` (`scripts/export-sales.ts`) |

En producción, lo mismo sin terminal: GitHub → Actions → **Producción** (`migraciones`, `alta-espacio`, `las-dos`,
`dossiers-ejemplo`, `traducir`, `superadmin`, `informe-crm`, `buscar-nombres`). Los `scripts/apply-*.py` son cambios de
contenido de una vez sobre `tenants/*/tenant.json` (ya aplicados; se dejan como registro).

## 6. Índice de la documentación

**Arrancar y desplegar**
- [`PUESTA_EN_MARCHA.md`](PUESTA_EN_MARCHA.md): producción paso a paso desde el navegador (Supabase, Resend, GitHub, Vercel, dominio, avisos).
- [`SETUP.md`](SETUP.md): referencia detallada de Supabase, Auth, claves, Vercel/Docker y dominios.
- [`ADR-0001-stack.md`](ADR-0001-stack.md): por qué este stack. [`FOUNDATIONS.md`](FOUNDATIONS.md): objetivos y hoja de ruta.
  [`PLAN.md`](PLAN.md): el plan original y el contexto de negocio (histórico).

**Superadmin: dar de alta una empresa**
- [`ORG.md`](ORG.md) §Alta de una empresa: Plataforma → Nueva empresa → su admin → agente de alta → estado del alta.
- [`SETUP_WIZARD.md`](SETUP_WIZARD.md): configuración guiada y agente de alta.
- [`ONBOARDING_TENANT.md`](ONBOARDING_TENANT.md): el mismo proceso de principio a fin y la alternativa por `tenant.json`.
  [`BRAND_INTAKE.md`](BRAND_INTAKE.md): qué aporta una empresa para su `tenant.json`.

**Producto, por área**
- CRM: [`CRM_DINAMICO.md`](CRM_DINAMICO.md) (campos, personas, seguimiento, prioridad, ruta, IA, mapa, tablero…) y
  [`ACCOUNTS.md`](ACCOUNTS.md) (zonas, reservas y elegibilidad).
- Equipo: [`ORG.md`](ORG.md) (roles, delegaciones, superadmin) y [`PARTNERS.md`](PARTNERS.md) (colaboradores).
- Propuestas: [`PROPOSAL_PRESETS.md`](PROPOSAL_PRESETS.md) (receta por sector), [`PERSONALIZE.md`](PERSONALIZE.md)
  (logo, fotos, vídeo, pantallas, contacto), [`MODULE_AUTHORING.md`](MODULE_AUTHORING.md) (módulos nuevos).
- Vender mejor: [`PLAYBOOK.md`](PLAYBOOK.md), [`EVIDENCE.md`](EVIDENCE.md) (qué ha funcionado), [`FOLLOWUP.md`](FOLLOWUP.md) (seguimiento).
- Dinero: [`COMMISSIONS.md`](COMMISSIONS.md) (comisiones, tarifas, cupones, Stripe).
- Medir y avisar: [`ANALYTICS.md`](ANALYTICS.md), [`NOTIFICATIONS.md`](NOTIFICATIONS.md).
- Idiomas: [`I18N.md`](I18N.md).

**Diseño, calidad y seguridad**
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), [`GUIA_UX_ADMIN.md`](GUIA_UX_ADMIN.md), [`UX_REVIEW.md`](UX_REVIEW.md).
- [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md), [`VALIDATED.md`](VALIDATED.md) (recorridos validados por el fundador).

**Exploración y otros**
- [`SPIKE_DATA.md`](SPIKE_DATA.md) (spike de datos, no conectado a la app), [`PREGUNTAS_CEREBRO.md`](PREGUNTAS_CEREBRO.md) /
  [`RESPUESTA_CEREBRO.md`](RESPUESTA_CEREBRO.md) (integración con el Cerebro de Ventas).
- `docs/oquea/`, `docs/ventas/`: material de cada empresa (Oquea, Enjoy). `docs/agentes/`: prompts para agentes.
