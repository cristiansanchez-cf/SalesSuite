# SalesSuite · Dossiers dinámicos white-label

Producto multi-tenant de Cofundo: un comercial compone un **dossier vivo** por prospecto (módulos de UI animados, orden, ocultos, precio) y lo comparte como enlace bajo la marca de su empresa (`pitch.<tenant>/d/<token>`). Enjoy the Club es el primer tenant.

- Plan y contexto de negocio: [`docs/PLAN.md`](docs/PLAN.md)
- Decisiones de stack (cierra las preguntas abiertas del plan): [`docs/ADR-0001-stack.md`](docs/ADR-0001-stack.md)
- Cómo añadir un módulo: [`docs/MODULE_AUTHORING.md`](docs/MODULE_AUTHORING.md)
- Alta de un tenant: [`docs/ONBOARDING_TENANT.md`](docs/ONBOARDING_TENANT.md)

**Stack:** Astro 5 SSR (adapter Node) · Tailwind 3 sobre CSS vars · Zod · Supabase (Postgres + Auth + RLS).

## Arrancar en local (modo DEMO, sin Supabase)

```bash
npm install
cp .env.example .env        # deja vacías las claves de Supabase → modo DEMO con supabase/seed/fixtures.json
npm run dev                 # http://localhost:4321
```

| URL | Qué demuestra |
|---|---|
| http://localhost:4321/d/demo-sala-x-7Qm2 | Dossier "Sala X" de Enjoy: orden por rank, 1 módulo oculto, `per_module` con override (250 € + 450 € = 700 €), **dos `tabs-showcase`** animando independientes |
| http://retheme.localhost:4321/d/demo-retheme-Hx8v | Mismos módulos con otro tenant → re-skin solo con `theme_tokens` |
| `/d/demo-draft-Kp9wQ1`, `/d/demo-revoked-Zt4c`, `/d/demo-expired-Bn3r` | Gates → 404 idéntico |
| http://retheme.localhost:4321/d/demo-sala-x-7Qm2 | Token válido bajo otro tenant → 404 |

`localhost` se resuelve al tenant `DEV_TENANT_SLUG` (por defecto `enjoy`); `*.localhost` se resuelve por la tabla `domain`.

## Con Supabase

```bash
supabase db reset                      # aplica supabase/migrations + supabase/seed.sql
# .env: PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
```
El renderer público solo usa la clave **anon** y dos RPC `security definer` (`resolve_tenant`, `get_public_dossier`).

## Scripts

| Script | |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo / build SSR / servidor Node (`dist/server/entry.mjs`) |
| `npm run check` | `astro check` (tipos) |
| `npm test` | Vitest: tema (incl. inyección CSS), precios, rank fraccional, resolución de props, gates del repo demo, resolución de tenant |
| `npm run db:test` | Migración + seed + **aserciones de RLS/RPC** sobre un Postgres pelado (stub de `auth`), sin Supabase CLI |
| `npm run db:seed:build` | Regenera `supabase/seed.sql` desde `fixtures.json` (CI comprueba que está al día) |
| `node scripts/smoke-e2e.cjs` | Smoke Playwright contra un servidor en marcha (orden, precios, 404s, tema, multi-instancia) |

## Estructura

```
src/
  middleware.ts            Host → tenant (Astro.locals.tenant) + cabeceras de /d/*
  pages/d/[token].astro    Renderer público SSR
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

**Pendiente**
- [ ] **Portar el markup/CSS real `nh-*` de EnjoyWeb** a los módulos (el repo de Enjoy no estaba accesible desde esta sesión: los módulos actuales siguen la estructura del plan con copys placeholder) + `logo-marquee`, `testimonials`, `steps-howitworks`
- [ ] Subir la fuente YWFTKul a Storage y añadir `font.faces` al tema de Enjoy
- [ ] Fase 1: consola `/admin` (Supabase Auth, CRUD, builder Svelte con dnd, precio, enlaces)
- [ ] Despliegue (ver ADR-0001) + dominio `pitch.enjoytheclub.es`
