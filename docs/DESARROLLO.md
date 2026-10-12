# Cómo se desarrolla aquí

Guía corta para quien toca el código por primera vez: cómo está montado, cómo se prueba y las reglas que evitan
problemas (sobre todo de rendimiento). Los detalles de cada parte están en su doc (`CRM_DINAMICO.md`, `ACCOUNTS.md`…).

## 1. Cómo está montado

- **Astro SSR** (`src/pages`): cada página de `/admin` lee en su cabecera (frontmatter) lo que pinta y, si es un POST,
  hace la acción y redirige (303) a la misma página con `?ok=…`. Los formularios con `data-async="id1 id2"` no
  recargan: piden la página y cambian solo esas secciones (`AdminLayout.astro`).
- **Servicios** (`src/lib/*/service.ts`): las reglas (permisos, validación con zod, errores `AdminError` con mensaje
  traducible en `src/lib/i18n/errors.ts`). Una página nunca habla con la base de datos directamente.
- **Bases de datos, dos implementaciones de la misma interfaz** (`db.ts`): `db-supabase.ts` (Postgres + RLS, la de
  verdad) y `db-demo.ts` (en memoria, para el modo demo y las pruebas rápidas). Lo que hace una lo tiene que hacer la
  otra; lo garantizan los **contratos** (abajo).
- **Contexto por petición** (`src/lib/admin/auth.ts`, `authenticate`): cada petición crea sus servicios. Por eso se
  puede tener una caché de lecturas por petición (§3).

## 2. Pruebas: qué hay y cuándo añadir cada una

| Capa | Dónde | Cómo se corre | Qué prueba |
|---|---|---|---|
| Unitarias | `src/**/*.test.ts` | `npx vitest run` | Funciones puras: prioridad, perfiles, lector de webs, importador, caché… |
| Contrato | `src/lib/*/*.contract.ts` | demo: con vitest · Supabase: `POSTGREST_BIN=… bash supabase/tests/run-it.sh` | El mismo test contra las dos bases: permisos y reglas del servicio |
| SQL | `supabase/tests/NN_*.test.sql` | `bash supabase/tests/run-local.sh` | Migraciones, restricciones, RLS, RPC |
| Smokes | `scripts/smoke-*.cjs` | `npm run build`, servidor demo y `node scripts/smoke-X.cjs` | La app de verdad en el navegador (Playwright) |

- **Una función nueva del servicio que escribe datos o mira permisos** → test en el contrato (corre en las dos bases).
- **Una migración** → `supabase/migrations/AAAAMMDDhhmmss_nombre.sql` y su `supabase/tests/NN_nombre.test.sql`,
  **añadido a mano** a la lista de `run-local.sh`. En producción se aplica con el workflow `production.yml`
  (`migraciones`, `dry_run: false`).
- **Un flujo de pantalla** → un smoke, **añadido a mano** a `.github/workflows/ci.yml` (si no, CI no lo corre).
- **En CI todos los smokes van seguidos contra el mismo servidor demo** (lo que crea uno lo ven los siguientes): usa
  nombres propios de cada smoke, no compruebes «solo hay N» de algo compartido, no cambies el rol ni sueltes las
  empresas de los usuarios de ejemplo (y si hace falta, ese smoke va al final de `ci.yml`), y espera a una condición
  en vez de a una pausa fija (en CI no se sacan capturas y todo va más rápido). Para reproducirlo: arranca un servidor
  demo y corre los smokes en el orden de `ci.yml` sin reiniciarlo.
- Antes de subir: `npx astro check`, `npx vitest run`, `run-local.sh`, `run-it.sh` y los smokes de lo tocado
  (mira que `npm run build` termine bien: si falla, el servidor sigue con el `dist/` viejo).

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

## 4. Estilo del código

- Comentarios en español, cortos, diciendo **por qué** (el qué ya lo dice el código), con la sección del doc (§N).
- Antes de escribir un helper, busca si ya existe (`norm`, `zonePath`, `socialUrl`, `legalKey`, `chunks`…).
- Textos de pantalla en `src/lib/i18n/messages/*.ts` en los cuatro idiomas (es, en, pt, ko).
- Nada de datos inventados: lo que se muestra tiene una fuente (lo dijo alguien, su web, Google…).
