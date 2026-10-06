# Prompt para un agente en paralelo · checkpoint de tests

> Pega la sección «Prompt» como primer mensaje de una sesión nueva sobre este repositorio. Trabaja en su propia rama y
> **no cambia el comportamiento de la app**: solo deja fijado, con pruebas, lo que hoy funciona. Así la sesión principal
> puede seguir construyendo (el CRM) sin miedo a romper lo anterior.

---

## Prompt (copiar desde aquí)

Vas a hacer un **checkpoint de tests** de Cofundo Ventas (este repo): dejar cubierto con pruebas automáticas lo que la
app hace hoy, para que nada se rompa sin que lo sepamos. No añades funciones ni cambias diseño.

### Reglas para no pisar a la otra sesión

- Trabaja en la rama **`claude/checkpoint-tests`**, creada desde `claude/dreamy-dijkstra-a4xm1g` (la rama de
  producción). Al terminar, abre un **PR contra `claude/dreamy-dijkstra-a4xm1g`**.
- Solo tocas: `scripts/smoke-*.cjs`, `**/*.test.ts`, `**/*.contract.ts`, `supabase/tests/**`, `.github/workflows/ci.yml`
  y `docs/TESTING.md` (nuevo). **No tocas** `src/**` (salvo añadir un `data-testid` que falte, y lo dices en el PR),
  `tenants/**`, migraciones ni `scripts/apply-*.py`.
- **Nunca** lances el workflow «Producción» ni toques datos reales.
- Si un test descubre un **bug**, no lo arregles: déjalo marcado como `test.fails` / `test.todo` (o el smoke con un
  `KNOWN:` en el log) y apúntalo en `docs/TESTING.md` → «Bugs encontrados», con pasos para reproducirlo.
- Habla en español con el fundador (Cristian): respuestas cortas y una lista de lo que has hecho al final.

### Qué hay hoy (léelo antes)

- Stack: Astro 5 SSR + Svelte 5, Supabase (Postgres + RLS), vitest, smokes de Playwright (`scripts/smoke-*.cjs`) que
  corren contra la app en **modo demo** (`DEMO_MODE=1 DEV_TENANT_SLUG=enjoy node ./dist/server/entry.mjs`).
- CI (`.github/workflows/ci.yml`): `astro check`, `lint:copy`, vitest, build; tests SQL de RLS
  (`supabase/tests/run-local.sh`); contrato contra Postgres+PostgREST (`run-it.sh`); y 16 smokes.
- **Fuera del CI hoy:** `smoke-org.cjs`, `smoke-personalize.cjs`, `smoke-setup-ai.cjs`. Primera tarea: que pasen y
  meterlos en el CI.
- Docs útiles: `docs/FOUNDATIONS.md` (recorridos), `docs/UX_REVIEW.md`, `docs/I18N.md`, `docs/PROPOSAL_PRESETS.md`,
  `docs/ACCOUNTS.md`, `docs/COMMISSIONS.md`, `docs/PARTNERS.md`, `docs/ORG.md`.

### Qué tienes que cubrir (por orden de importancia)

1. **Acceso**: login con código (demo), con contraseña, logout, «usar otra cuenta», mensaje neutro cuando el email no
   existe, redirección a `?next=`. Invitación → bienvenida.
2. **Idioma**: español por defecto aunque el navegador esté en otro idioma; cambio desde el menú de perfil y desde la
   bienvenida; errores del servidor en el idioma elegido (`src/lib/i18n/errors.ts`).
3. **Menú de perfil**: se abre entero y por encima de la página (no lo recorta la barra lateral) y se cierra al pulsar
   fuera.
4. **Propuesta con receta** (por sector: locales, promotoras, conciertos, festivales, hoteles): crear, elegir tipo y
   ángulo, aplicar receta, publicar, abrir el enlace público, modo presentación (flechas, pestañas que consumen la
   flecha), tarifa y cupón.
5. **Pantalla en vivo**: la barrita dura lo que la escena; el minimóvil enseña la misma foto/canción/mensaje que luego
   sale en la pantalla; carátulas por canción (vinilo solo en la que falta).
6. **Aprende**: ficha de sector (Imagínatelo con las pantallas de la receta, ideas para contarlo, sin iframes), fichas
   de actor, «Qué decir» con resumen visible.
7. **Comercial** (rol `rep`): ve las propuestas de ejemplo, no puede editar las de otros, Cuentas («Me la quedo»),
   Preparar mensaje, Mis comisiones.
8. **Admin**: equipo (invitar, cambiar rol, quitar), territorio, comisiones, precios, marca, configuración guiada.
9. **Móvil (390 px)**: ninguna pantalla con scroll horizontal (`scrollWidth <= innerWidth`) en todas las rutas.
10. **Unitarios** de lo que no tiene: `summarize` y `stripMarkdown`, `splitHeadline(…, true)`, `localizePreset`,
    `resolveLocale`, `screenConfig` (carátulas por canción), `planProposal` con cada receta real de
    `tenants/enjoy/tenant.json` (todas las combinaciones validan).

### Entregable

- PR con los tests nuevos, los tres smokes metidos en el CI y **CI en verde**.
- `docs/TESTING.md`: cómo se corre todo en local (comandos exactos), qué cubre cada smoke, qué no está cubierto todavía
  y «Bugs encontrados».
- Al final, un resumen: cuántos tests había, cuántos hay, tiempo del CI, y los bugs que has visto.
