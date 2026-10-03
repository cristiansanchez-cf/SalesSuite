# SalesSuite · Dossiers dinámicos white-label

Producto multi-tenant de Cofundo: un comercial compone un **dossier vivo** por prospecto (módulos de UI animados, orden, ocultos, precio) y lo comparte como enlace bajo la marca de su empresa (`pitch.<tenant>/d/<token>`). Enjoy the Club es el primer tenant.

- **Puesta en marcha (Supabase, Vercel, dominio) paso a paso: [`docs/SETUP.md`](docs/SETUP.md)**
- Qué debe aportar Enjoy (marca, copys, código `nh-*`): [`docs/BRAND_INTAKE.md`](docs/BRAND_INTAKE.md)
- Plan y contexto de negocio (incl. §15 huecos detectados): [`docs/PLAN.md`](docs/PLAN.md)
- Decisiones de stack (cierra las preguntas abiertas del plan): [`docs/ADR-0001-stack.md`](docs/ADR-0001-stack.md)
- Cómo añadir un módulo: [`docs/MODULE_AUTHORING.md`](docs/MODULE_AUTHORING.md)
- Alta de un tenant: [`docs/ONBOARDING_TENANT.md`](docs/ONBOARDING_TENANT.md)

**Stack:** Astro 5 SSR (Vercel o Node/Docker) · Tailwind 3 sobre CSS vars · Zod · Svelte 5 (builder) · Supabase (Postgres + Auth + RLS).

## Arrancar en local (modo DEMO, sin Supabase)

```bash
npm install
cp .env.example .env        # deja vacías las claves de Supabase → modo DEMO con supabase/seed/fixtures.json
npm run dev                 # http://localhost:4321
# o con el build de producción:  npm run build && npm run start:demo
```

> En un build de producción **sin** Supabase la app responde 503 (no entra en demo salvo `DEMO_MODE=1`).

| URL | Qué demuestra |
|---|---|
| http://localhost:4321/d/demo-sala-x-7Qm2 | Dossier "Sala X" de Enjoy: orden por rank, 1 módulo oculto, `per_module` con override (250 € + 450 € = 700 €), **dos `tabs-showcase`** animando independientes |
| http://retheme.localhost:4321/d/demo-retheme-Hx8v | Mismos módulos con otro tenant → re-skin solo con `theme_tokens` |
| `/d/demo-draft-Kp9wQ1`, `/d/demo-revoked-Zt4c`, `/d/demo-expired-Bn3r` | Gates → 404 idéntico |
| http://retheme.localhost:4321/d/demo-sala-x-7Qm2 | Token válido bajo otro tenant → 404 |
| http://localhost:4321/admin | **Consola**: en demo eliges usuario (comercial / admin de Enjoy, o comercial de otro tenant → 403) |

`localhost` se resuelve al tenant `DEV_TENANT_SLUG` (por defecto `enjoy`); `*.localhost` se resuelve por la tabla `domain`.

En modo demo los cambios hechos en `/admin` se ven al momento en `/d/<token>` (BD en memoria; se pierde al reiniciar).

## Con Supabase

Producción: sigue [`docs/SETUP.md`](docs/SETUP.md). En local con la CLI (`supabase start` aplica migraciones, seed de demo y plantillas de email de `supabase/config.toml`).

- El renderer público solo usa la clave **anon** y dos RPC `security definer` (`resolve_tenant`, `get_public_dossier`).
- La consola usa **Supabase Auth** (contraseña, enlace mágico, invitaciones, recuperación) con cookies httpOnly (`@supabase/ssr`); cada consulta va con el JWT del usuario → la **RLS** aplica siempre. La `service_role` solo se usa para **invitar** usuarios y en el script de alta.
- Alta de tenants: `npm run tenant:bootstrap -- tenants/<slug>` ([`docs/ONBOARDING_TENANT.md`](docs/ONBOARDING_TENANT.md)).

## Consola `/admin`

| Ruta | |
|---|---|
| `/admin/login` | Login (demo: selector de usuario) |
| `/admin` | Listado: filtros por estado / "solo míos" / búsqueda; alta de dossier (vacío o desde plantilla) |
| `/admin/dossiers/:id` | **Builder**: datos del prospecto, modo de precio (`none`/`total`/`per_module`), catálogo, reordenar (drag & drop + botones ↑↓), ocultar, precio por módulo, personalizar textos (JSON validado contra el schema), actualizar a la última versión del módulo, publicar/despublicar/archivar/borrar, generar/copiar/revocar enlaces con caducidad, vista previa móvil/tablet/escritorio |
| `/admin/dossiers/:id/preview` | Vista previa autenticada (cualquier estado) |
| `/admin/api/dossiers/:id` | API JSON del builder: `GET` estado · `POST {op}` → estado · `DELETE` |
| `/admin/catalog` *(admin)* | Módulos y versiones: crear variante, borrador → publicar → archivar, preview, uso por dossiers |
| `/admin/team` *(admin)* | Invitar por email, cambiar rol, quitar (nunca sin al menos un admin) |
| `/admin/brand` *(admin)* | Colores, radios, tipografía (fuente propia), logos/favicon/imagen OG (subida a Storage), contacto (WhatsApp…), con vista previa |
| `/admin/account` | Nombre y contraseña (también destino de invitación y recuperación) |
| `/admin/auth/confirm` | Destino de los emails de Auth (`token_hash` o `code`) |
| `/api/health` | Estado y diagnóstico de configuración (sin secretos) |

Arquitectura: el builder (Svelte) solo envía **operaciones** (`src/lib/admin/ops.ts`); las reglas viven en un único servicio (`src/lib/admin/service.ts`) sobre la interfaz `AdminDb`, con dos implementaciones: memoria (demo) y Supabase con la sesión del usuario. La misma batería de tests de contrato (`service.contract.ts`) se ejecuta contra ambas.

## Scripts

| Script | |
|---|---|
| `npm run dev` / `build` / `start` / `start:demo` | Desarrollo / build SSR / servidor Node / servidor Node en demo |
| `npm run tenant:bootstrap -- tenants/<slug> [--dry-run]` | Alta/actualización idempotente de un tenant en Supabase (service role) |
| `npm run check` | `astro check` (tipos) |
| `npm test` | Vitest: tema (incl. inyección CSS), precios, rank fraccional, resolución de props, gates del repo demo, resolución de tenant |
| `npm run db:test` | Migración + seed + **aserciones de RLS/RPC** sobre un Postgres pelado (stub de `auth`), sin Supabase CLI |
| `npm run db:it` | Contrato del servicio de la consola (dossiers, equipo, catálogo, marca) y script de alta contra **Postgres + PostgREST + RLS** reales con `supabase-js` (`POSTGREST_BIN=/ruta/postgrest`) |
| `npm run db:seed:build` | Regenera `supabase/seed.sql` desde `fixtures.json` (CI comprueba que está al día) |
| `node scripts/smoke-e2e.cjs` | Smoke Playwright del enlace público (orden, precios, 404s, tema, multi-instancia) |
| `node scripts/smoke-admin.cjs` | Smoke Playwright de la consola: plan §13 pasos 2–7 por la UI (login, crear, drag & drop, ocultar, precio, publicar, enlace, revocar, RBAC, móvil) |
| `node scripts/smoke-tenant-admin.cjs` | Smoke Playwright de catálogo, equipo y marca (incl. reflejo en el enlace público) |

Los smokes van contra un servidor en modo demo: `npm run build && npm run start:demo`.

## Estructura

```
src/
  middleware.ts            Host → tenant, CSRF, sesión de /admin, cabeceras
  pages/d/[token].astro    Renderer público SSR
  pages/admin/             Consola (login, listado, builder, preview, API)
  components/admin/Builder.svelte   Isla del builder
  components/dossier/DossierView.astro   Render compartido (público + preview)
  lib/admin/               ops (contrato), service (reglas), db-demo / db-supabase, auth
  layouts/ThemedShell.astro Inyección de theme_tokens ⊕ theme_override
  modules/
    registry.ts            block_type → { schema, Component }
    resolve.ts             default_props ⊕ prop_overrides → schema.parse + ctx (precio, prospecto)
    runtime.ts             mountAll/init(root): JS por instancia
    hero-pitch/ tabs-showcase/ pricing-card/   (Component.astro + schema.ts + client.ts)
  lib/
    theme.ts pricing.ts rank.ts tenant.ts env.ts
    data/  (index: repositorio público · supabase.ts · demo.ts · mappers.ts)
  components/ (Button, Card, Container, Section, Icon, ItemPrice)
supabase/
  migrations/              Esquema + RLS + RPC
  seed/fixtures.json       Fuente única de datos de ejemplo (demo + seed.sql)
  tests/                   Stub de Supabase + aserciones RLS
```

## Estado

**Fase 0 — hecha**
- [x] Scaffold Astro SSR + Tailwind con mapeo `var(--…)`, tokens, átomos, shell temado
- [x] Registry + contratos Zod + resolución de props/precio
- [x] Módulos: `hero-pitch`, `tabs-showcase` (estrella, multi-instancia probada), `pricing-card`
- [x] Esquema Supabase + RLS + RPC token-gated, con tests de seguridad
- [x] Middleware de tenant por Host, renderer `/d/<token>` con gates y 404 neutro

**Fase 1 — consola y builder: hecha**
- [x] Auth (Supabase Auth email+contraseña / magic link; login de demo), RBAC admin/rep, 403 por tenant
- [x] Listado con filtros y alta (vacío o desde plantilla)
- [x] Builder: catálogo, drag & drop + teclado/botones, ocultar, precio `none|total|per_module` + overrides, personalización validada, actualizar versión, publicar/despublicar/archivar/borrar, enlaces con caducidad y revocación, vista previa por dispositivo
- [x] CSRF propio (Origin vs host del tenant) — ver ADR-0001
- [x] Tests: contrato del servicio en demo **y** en Postgres+PostgREST+RLS; E2E de consola en navegador

**Fase 1.5 — listo para producción (salvo cuentas y datos de Enjoy)**
- [x] Guardia de producción (sin config → 503, nunca demo), `/api/health`
- [x] Equipo, catálogo y marca desde la consola; invitaciones, recuperación y cuenta
- [x] Marca en el dossier (logo, CTA WhatsApp, pie, favicon, OG para compartir)
- [x] Storage por tenant con RLS; permisos por columna; nunca sin admin
- [x] Script de alta idempotente + `tenants/enjoy` prerrellenado; despliegue Vercel/Docker; guía SETUP

**Pendiente — necesita a otra persona**
- [ ] **Tú:** crear el proyecto Supabase, SMTP, Vercel y DNS → [`docs/SETUP.md`](docs/SETUP.md)
- [ ] **Agente de Enjoy:** rellenar `tenants/enjoy/` (marca, assets, copys, admins) → [`docs/BRAND_INTAKE.md`](docs/BRAND_INTAKE.md)
- [ ] **Acceso a EnjoyWeb** para portar el diseño real `nh-*` y añadir `logo-marquee`, `testimonials`, `steps-howitworks`

**Pendiente — siguiente iteración**
- [ ] Editor de personalización por formulario (hoy JSON validado) a partir de los schemas Zod
