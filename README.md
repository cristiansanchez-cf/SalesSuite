# Cofundo Ventas (SalesSuite)

Herramienta de ventas B2B multiempresa de Cofundo. Cada empresa (Enjoy, Oquea…) tiene su **espacio** en su propio dominio
(`<empresa>.ventas.cofundo.io` o uno suyo), con su marca, su CRM, su playbook y sus comisiones. Sus comerciales preparan
**propuestas vivas** (módulos animados, orden, precio) y las comparten como enlace `/d/<token>` bajo la marca de la empresa.

**Stack:** Astro 5 SSR (Vercel o Node/Docker) · Svelte 5 · Tailwind 3 sobre variables CSS · Zod · Supabase (Postgres + Auth + RLS + Storage).

## Arrancar en local (modo demo, sin Supabase)

```bash
npm install
npm run build
AI_RESEARCH_FIXTURE=1 DEMO_MODE=1 DEV_TENANT_SLUG=enjoy node ./dist/server/entry.mjs
# http://localhost:4321/admin → «Modo demo: entrar como…» (un clic): admin@enjoy.test, rep@enjoy.test, super@cofundo.test…
```

Comprobaciones antes de subir:

```bash
npx astro check        # tipos (y que los cuatro idiomas tengan las mismas claves)
npm test               # vitest: unitarias + contratos contra la base demo
npm run lint:copy      # reglas de copy de la consola
npm run db:test        # migraciones + seed + RLS/RPC en un Postgres local (psql)
PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright node scripts/smoke-new-space.cjs   # un smoke, con el servidor demo arrancado
```

**Todo lo demás para desarrollar** (usuarios de demo, arquitectura, pruebas, rendimiento, scripts e índice de la
documentación): [`docs/DESARROLLO.md`](docs/DESARROLLO.md).

## Dónde está cada cosa

| Quiero… | Leer |
|---|---|
| Entender el código y arrancarlo | [`docs/DESARROLLO.md`](docs/DESARROLLO.md) |
| Poner en marcha producción (Supabase, Vercel, dominio, emails) | [`docs/PUESTA_EN_MARCHA.md`](docs/PUESTA_EN_MARCHA.md) y [`docs/SETUP.md`](docs/SETUP.md) |
| Dar de alta una empresa nueva (superadmin) | [`docs/ONBOARDING_TENANT.md`](docs/ONBOARDING_TENANT.md) (resumen) → [`docs/ORG.md`](docs/ORG.md) §Alta de una empresa |
| Saber cómo funciona una parte (CRM, comisiones, playbook…) | Índice en [`docs/DESARROLLO.md`](docs/DESARROLLO.md) §6 |
| Añadir un módulo de propuesta | [`docs/MODULE_AUTHORING.md`](docs/MODULE_AUTHORING.md) |

## Estructura

```
src/
  middleware.ts         Host → espacio, CSRF, idioma, sesión de /admin, cabeceras
  pages/admin/          Consola (una página por pantalla; POST → acción → 303)
  pages/d/[token].astro Enlace público de una propuesta
  pages/api/            health, track (analítica), cron de avisos, API de ingresos y webhook de Stripe
  lib/<área>/           service.ts (reglas) + db.ts (interfaz) + db-supabase.ts / db-demo.ts (+ contrato)
  lib/i18n/             Idiomas (es, en, pt, ko) y textos de pantalla
  modules/              Módulos de las propuestas + registry.ts
  components/, layouts/ UI de la consola y del enlace público
supabase/
  migrations/           Esquema, RLS y RPC
  seed/fixtures.json    Datos de ejemplo (demo y seed.sql)
  tests/                Aserciones SQL (run-local.sh) y de integración (run-it.sh)
  templates/            Emails de Supabase Auth
tenants/<slug>/         tenant.json + assets de cada espacio (alta por script)
scripts/                smoke-*.cjs (Playwright), alta de espacios, superadmin, traducción, lint de copy
```

CI (`.github/workflows/ci.yml`): tipos, copy, tests, build, SQL, integración con PostgREST y todos los smokes contra un
servidor demo. Producción sin terminal: GitHub → Actions → **Producción** (`.github/workflows/production.yml`).
