# Spike: una sola implementación de datos (FOUNDATIONS §5.2)

Fecha: 3 de octubre de 2026. Duración: un día. Código del spike en `spike/data/` (no está conectado a la app).

## 1. Contexto

Hoy cada módulo tiene **dos** capas de datos:

- `db-demo.ts`: memoria (`src/lib/data/store.ts`). Repite en TypeScript los triggers, la RLS y los RPC.
- `db-supabase.ts`: supabase-js contra el SQL real (`supabase/migrations`).

Los tests de contrato corren contra las dos. Cada regla nueva se escribe dos veces.

Objetivo: quedarnos con **una** (la de Supabase) sin perder:

1. desarrollo local rápido y sin cuenta en la nube;
2. los smokes de Playwright;
3. los tests de contrato;
4. una demo visible con datos de ejemplo.

### Lo que se podría borrar

| Módulo | `db-demo.ts` | `db-supabase.ts` | Contrato | Tests de integración (db:it) |
|---|---:|---:|---:|---:|
| admin (+ colaboradores) | 405 | 403 | 357 + 255 | 19 + 8 |
| commissions | 313 | 195 | 224 | 6 |
| accounts | 216 | 99 | 194 | 5 |
| playbook (+ mercado) | 178 | 170 | 193 + 177 | 19 |
| notify | 112 | 83 | 136 | 5 |
| evidence | 55 | 57 | 138 | 5 |
| **Total `db-demo.ts`** | **1.279** | | | **67** |

Además: `data/store.ts` (300), `data/demo.ts` (53), `admin/otp-demo.ts` (33), `data/demo.test.ts` (44), los 7 lanzadores demo de contrato (`*.test.ts`, 148) y unas 20 ramas `=== 'demo'` / `demoDb()` en páginas y `auth.ts`.

**Total borrable: unas 1.850 líneas.** Los contratos (`*.contract.ts`) se quedan: pasan a correr solo contra el SQL real.

## 2. Qué se probó y qué salió

Todo se ejecutó en este contenedor: Node 22, Postgres 16.14 local, PostgREST 12.2.3, Chromium de Playwright.

### A. PGlite (Postgres en WebAssembly, dentro del proceso)

Versión: `@electric-sql/pglite` 0.5.8 (por dentro es **Postgres 18.3**, 32 bits).

**A0. ¿Aplica todo nuestro SQL? Sí.** `node spike/data/pglite-apply.mjs`

- Stub de Supabase reutilizado tal cual (`supabase/tests/00_supabase_stub.sql`): roles, `auth.users`, `auth.uid()`, `storage`.
- `pgcrypto` existe como extensión de PGlite. No hacen falta más.
- Las 17 migraciones, los grants y `seed.sql`: aplicados sin tocar una línea.
- **Los 12 ficheros de tests SQL de RLS/RPC pasan.** Solo hubo que imitar dos cosas de psql: `\gset` y «una conexión por fichero» (`discard all`).

| Medida | PGlite | Postgres local (`npm run db:test`) |
|---|---:|---:|
| Arrancar vacío (initdb en WASM) | 2,7–3,5 s | — |
| Migraciones + grants + seed | 0,5–0,7 s | — |
| Todo (arranque + SQL + 12 tests) | 4,2–4,9 s | 2,6 s |
| Arranque desde snapshot (5,2 MB gzip) | 1,1 s | — |
| Memoria (RSS del proceso) | 390–620 MB | servidor aparte |
| Consulta con RLS «como usuario» | 2,4 ms | — |

**RLS sin PostgREST: funciona.** `node spike/data/pglite-snapshot.mjs`. En una transacción: `set_config('role','authenticated',true)` + `set_config('request.jwt.claims', …)`. El comercial de Enjoy ve 3 dossiers; el de otro tenant, 1; anon solo llega por el RPC público. Es justo lo que hace PostgREST.

**A1. Adaptador compatible con PostgREST en JS (para que supabase-js hable con PGlite).** No se construyó. Estimación honesta: nuestro código usa 158 `.from()`, 7 `.rpc()`, recursos embebidos (`module_version!inner(module!inner(…))`), `upsert` con `onConflict`, `single/maybeSingle`, `in/is/ilike/or/not` y los códigos de error que el servicio traduce a 403/409. Reproducir eso bien son **10–15 días**, y sería otra copia que mantener (el problema que queremos quitar, movido de sitio). **Descartado.**

**A2. Interfaz `DbClient` propia con SQL directo.** Funciona técnicamente (ver arriba). Pero obliga a reescribir los seis `db-supabase.ts` (~1.000 líneas) y a que **producción** deje de usar supabase-js/PostgREST: conexión directa a Postgres desde Vercel (pooler, secretos de base de datos en el servidor, `set role` por petición). **10+ días y cambia la seguridad de producción.** No compensa ahora.

**A3. Extra probado: PGlite servido por socket + el PostgREST de verdad.** `bash spike/data/run-it-pglite.sh` (usa `@electric-sql/pglite-socket` 0.2.11).

- Arranca la pila en 3,1 s sin Postgres instalado.
- Tests de integración (supabase-js → PostgREST → PGlite): **61 de 67 pasan** (34 s; con Postgres: 67/67 en 31 s).
- Los 6 que fallan son siempre el mismo caso: un error SQL esperado (único duplicado, `raise exception`) llega como **503 «Database client error»** en vez de 409/403. Es un fallo del multiplexor de `pglite-socket` en el camino de error. Además exige `db-pool=1` y sin sentencias preparadas.
- Con la app encima, tras el primer error la conexión queda mal y los smokes siguientes se caen en cascada.
- **Hoy no es fiable.** Vale la pena revisarlo cuando `pglite-socket` lo corrija: quitaría el requisito de instalar Postgres.

### B. Postgres local + PostgREST real (lo que ya hace `db:it`)

`BACKEND=postgres bash spike/data/local-stack.sh <comando>` levanta: base con migraciones + seed + usuarios de prueba, PostgREST, y `spike/data/local-gateway.mjs` (gateway de ~100 líneas: `/rest/v1` → PostgREST y un **Auth mínimo**: login con contraseña de desarrollo, `/user`, refresco y `/logout`). Después arranca **la app compilada en modo `supabase`** apuntando a esa pila.

| Medida | Demo en memoria hoy | Modo supabase en local |
|---|---:|---:|
| Desde cero hasta servir `/admin/login` | 0,37 s | 2,1–3,5 s (base 1,4–2,5 s) |
| `/api/health` | — | `mode: supabase, database: ok` |
| Tests de contrato (db:it) | — | 67/67, 31 s |

**Smokes sin cambiar ni una línea**, solo con `PLAYWRIGHT_MODULE=spike/data/playwright-local-login.cjs` (envoltorio que cambia el clic en «Entrar como demo» por el formulario de contraseña):

| Smoke | Demo hoy | Local (supabase) | Si falla, por qué |
|---|---:|---:|---|
| admin | 23/23 | 23/23 | |
| e2e | 10/10 | 10/10 | |
| evidence | 16/16 | 16/16 | |
| i18n | 6/6 | 6/6 | |
| market | 18/18 | 18/18 | |
| start | 12/12 | 12/12 | |
| playbook | 21/22 | 22/22 | En demo falla una aserción de evidencia (ya fallaba antes del spike; no investigado). |
| notifications | 9/9 | 8/9 | El cron exige `CRON_SECRET` + Resend fuera de demo. Falta un «mailer de consola» en local. |
| mobile | 33/33 | 32/33 | La cuenta de ejemplo `…0ac001` solo existe en `store.ts`, no en `seed.sql`. |
| accounts | 15/15 | 0 | Las zonas (España › Comunidad Valenciana…) solo están en `store.ts`. |
| commissions | 20/20 | 4/20 | Planes, ventas y liquidaciones de ejemplo solo están en `store.ts`. |
| partner | 32/32 | 0 | Entra con código OTP; el Auth mínimo no lo implementa. |
| tenant-admin | 20/20 | se para al invitar | Invitar usa la API de administración de Auth; no implementada. |

**Conclusión de B: funciona.** Lo que falta es conocido y acotado:

1. **Datos de ejemplo partidos.** `seed.sql` sale de `fixtures.json`, pero usuarios, zonas, cuentas, colaborador, avisos y comisiones de ejemplo viven solo en `store.ts`. Hay que pasarlos a SQL (`supabase/seed/demo.sql`).
2. **Auth local.** El gateway necesita: OTP con el código visible en local, invitar (crear en `auth.users`) y la API de administración que usa `supabaseIdentity`. Medio día. Alternativa: `supabase start` (Docker) trae GoTrue real y un buzón de pruebas.
3. **Entrar como demo.** Hoy `demoLogin` salta Supabase Auth con una cookie. Propuesta: el botón hace `signInWithPassword` en el servidor con una contraseña de demo (variable `DEMO_PASSWORD`, solo para emails de la lista de demo, solo si `DEMO_LOGIN=1`). El mismo código sirve en local y en la nube, y los smokes siguen pulsando el mismo botón.
4. **Emails en local:** un mailer que escribe en consola cuando no hay Resend.

**Qué necesita un desarrollador:** Postgres 16 (o Docker) y el binario de PostgREST (un único fichero estático; CI ya lo descarga). Nada en la nube.

**CI:** ya tiene un servicio Postgres 16 y descarga PostgREST para `db:it`. El job de smokes necesita lo mismo: +2–3 s de arranque por job. `npm test` sin pila seguiría pasando, pero los contratos se saltan sin pila (ya pasa hoy con los de Supabase): **db:it pasa a ser obligatorio**.

### C. Proyecto Supabase en la nube para la demo pública

No hay acceso a la nube desde aquí: razonado desde el código.

Por qué hace falta: en Vercel la demo en memoria vive **una por instancia** (serverless). Dos visitantes pueden ver datos distintos y todo se pierde en cada arranque en frío. PGlite no lo arregla: seguiría siendo un estado por instancia, con 1,1 s y ~400 MB por arranque, y supabase-js no puede hablarle sin PostgREST.

Cambios en el código:

- Ninguno en la capa de datos: es el modo `supabase` de producción.
- `demoLogin` → contraseña de demo (punto 3 de B). La página de login enseña los botones si `DEMO_LOGIN=1`.
- Script de alta: crea los usuarios de demo con contraseña (`auth.admin.createUser`) y carga `seed.sql` + `demo.sql`.
- Reinicio nocturno (cron o GitHub Action): vaciar y recargar los datos de ejemplo.
- Sin `RESEND_API_KEY` ni invitaciones reales: la demo no debe mandar emails.

Coste operativo:

- Un segundo proyecto Supabase. Cada versión aplica las migraciones a **dos** proyectos (producción y demo): añadirlo al despliegue.
- Plan gratuito: se pausa si no hay actividad (según la tarifa pública conocida; **confirmar** precios y límites actuales). Plan de pago si la demo debe estar siempre despierta.
- Estado compartido: todos los visitantes usan las mismas cuentas de demo y ven lo que hacen los demás hasta el reinicio.

## 3. Comparativa

| | A1 adaptador | A2 SQL directo | A3 PGlite + PostgREST | **B local real** | **C nube (demo)** |
|---|---|---|---|---|---|
| ¿Funciona hoy? | no construido | sí (RLS ok) | 61/67 | **sí: 67/67, 9 smokes** | razonado |
| Días para todos los módulos | 10–15 | 10+ | B + arreglo upstream | **≈ 7** | **≈ 1 + alta** |
| Toca producción | no | **sí** | no | no | no |
| Requisitos de desarrollo | ninguno | ninguno | binario PostgREST | Postgres + PostgREST (o Docker) | — |
| CI | — | — | +3 s | **+2–3 s por job** | — |
| Demo pública | no resuelve | no resuelve | no resuelve | no aplica | **sí, una para todos** |
| Riesgo principal | otra copia de PostgREST | cambio de seguridad | error → 503 | instalación local | coste y reinicio |

## 4. Recomendación

**B para desarrollo, CI, smokes y contratos. C para la demo pública. PGlite no como capa de datos.**

- Una sola implementación: supabase-js contra el SQL real en todas partes.
- PGlite queda como mejora opcional: si `pglite-socket` arregla el camino de error, sustituye a «instala Postgres» en B (los 12 tests SQL ya pasan en él).

## 5. Plan de migración (cada paso deja todo en verde)

En verde = `astro check`, `lint:copy`, `vitest`, `db:test`, `db:it` y smokes.

| Paso | Qué | Días |
|---|---|---:|
| 0 | Pila local oficial: `npm run dev:local` (de `spike/data/local-stack.sh`), gateway con contraseña, refresco, OTP visible, invitar y admin. `supabase/seed/demo.sql` con todo lo que hoy solo está en `store.ts`. `demoLogin` por contraseña (`DEMO_LOGIN`, `DEMO_PASSWORD`). Mailer de consola. El modo demo en memoria **sigue vivo**. | 2 |
| 1 | Smokes en los dos modos en CI (matriz) hasta tener paridad. Arreglar los que dependen del orden. | 1 |
| 2 | evidence: borrar `db-demo.ts`, su lanzador demo y su cableado en `auth.ts`. | 0,25 |
| 3 | notify (incluido el cron demo). | 0,5 |
| 4 | playbook + mercado. | 0,5 |
| 5 | accounts. | 0,5 |
| 6 | commissions (incluida `commissions/api.ts`). | 0,75 |
| 7 | admin + colaboradores (el más grande). | 1 |
| 8 | Borrar `store.ts`, `data/demo.ts`, `otp-demo.ts`, `DEMO_MODE` en `mode.ts` y las ramas demo de las páginas. Smokes solo en modo supabase local. | 0,5–1 |
| 9 | Demo pública en un proyecto Supabase propio (C): alta, migraciones en el despliegue, reinicio nocturno. | 1 |
| | **Total** | **≈ 8–9** |

Truco para los pasos 2–7: mientras un módulo aún tenga demo, el modo demo funciona igual; el módulo migrado deja de tener versión en memoria y solo se prueba en local real. Por eso los smokes pasan a modo supabase local **antes** (paso 1).

## 6. Lo que tiene que decidir o aportar el fundador

1. **Aceptar que desarrollar exige Postgres + PostgREST** (o Docker). Sin eso no hay app en local tras el paso 8.
2. **Crear un segundo proyecto Supabase para la demo** y elegir plan (gratis con pausas o de pago). Darnos su URL, anon key y service role key como secretos del despliegue.
3. **Política de la demo pública:** estado compartido entre visitantes y reinicio cada noche. ¿Vale? ¿Hace falta bloquear acciones (invitar, subir logos)?
4. **Contraseña de demo:** va en una variable del servidor; los visitantes nunca la ven (entran con el botón).

## 7. Lo que no se pudo verificar

- Nada en la nube (opción C): sin acceso desde aquí.
- GoTrue real: se usó un Auth mínimo propio. OTP, invitaciones y API de administración no se probaron en local.
- Smokes accounts, commissions, partner y tenant-admin en modo supabase: bloqueados por datos de ejemplo y Auth, no por la capa de datos.
- PGlite en Vercel (tamaño del paquete, límites de memoria de la función): solo medido en Node local.
- PGlite usa Postgres 18; Supabase y CI usan 15–16. No vimos diferencias, pero es una deriva a vigilar.

## 8. Cómo reproducir

```bash
npm --prefix spike/data install                       # PGlite (solo para el spike)
node spike/data/pglite-apply.mjs                      # A0: migraciones + seed + 12 tests SQL en PGlite
node spike/data/pglite-apply.mjs --no-tests --dump=/tmp/snap.tar.gz
node spike/data/pglite-snapshot.mjs /tmp/snap.tar.gz  # arranque desde snapshot + RLS sin PostgREST
POSTGREST_BIN=/ruta/postgrest bash spike/data/run-it-pglite.sh   # A3: db:it contra PGlite

npm run build
POSTGREST_BIN=/ruta/postgrest BACKEND=postgres \
  PLAYWRIGHT_REAL=/ruta/a/playwright PLAYWRIGHT_MODULE=$PWD/spike/data/playwright-local-login.cjs \
  bash spike/data/local-stack.sh node scripts/smoke-notifications.cjs   # B: smoke en modo supabase local
```
