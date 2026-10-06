# Tests de Cofundo Ventas

Qué pruebas automáticas hay, cómo se corren en local y qué cubre cada una. Si algo se rompe, el CI (`.github/workflows/ci.yml`) lo dice antes de que llegue a producción.

## Resumen

| Capa | Dónde | Cómo corre en el CI |
|---|---|---|
| Unitarios (vitest) | `src/**/*.test.ts` | job `app` → `npm test` |
| Tipos y textos | `astro check`, `scripts/lint-copy.mjs` | job `app` |
| RLS / RPC en SQL | `supabase/tests/*.test.sql` | job `db` → `supabase/tests/run-local.sh` |
| Contrato del servicio (supabase-js contra Postgres + PostgREST + RLS) | `src/**/*.contract.ts`, `src/**/*.supabase.test.ts` | job `db` → `supabase/tests/run-it.sh` |
| Smokes de navegador (Playwright, modo DEMO) | `scripts/smoke-*.cjs` | job `e2e`, 3 tandas en paralelo |

El job `app` además comprueba que **todo** `scripts/smoke-*.cjs` está en alguna tanda del CI: si creas un smoke nuevo y no lo añades a `ci.yml`, falla.

## Cómo se corre en local

Requisitos: Node 22 y `npm ci`.

```bash
# Unitarios, tipos y textos
npm test                  # vitest (los *.supabase.test.ts se saltan sin base de datos)
npx vitest run src/lib/proposal/recipes.test.ts   # un fichero
npm run check             # astro check
npm run lint:copy

# Smokes (navegador) contra la app en modo DEMO
npm run build
npm i --no-save playwright@1.56.1 && npx playwright install chromium   # una vez
DEMO_MODE=1 DEV_TENANT_SLUG=enjoy PORT=4321 HOST=127.0.0.1 node ./dist/server/entry.mjs &
node scripts/smoke-auth.cjs                       # uno
for s in e2e admin tenant-admin; do node scripts/smoke-$s.cjs; done   # varios, en orden
# Opcional: BASE_URL=http://127.0.0.1:4333 (otro puerto) y SHOTS_DIR=/tmp/capturas (capturas en algunos smokes)

# SQL y contrato (necesitan Postgres; ver supabase/tests/run-local.sh y run-it.sh)
ADMIN_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
DATABASE_URL=postgres://postgres:postgres@localhost:5432/salessuite_test npm run db:test
npm run db:it             # además: IT_DATABASE_URL, IT_DB_URI_BASE y POSTGREST_BIN (ver el job «db» de ci.yml)
```

Un smoke escribe `ok: …` por cada comprobación, `FAIL: …` si algo falla (y sale con código 1) y `KNOWN: …` para un bug conocido que todavía no se ha arreglado (no rompe el CI; ver «Bugs encontrados»).

### El orden de los smokes importa

El modo DEMO guarda todo en memoria, y lo que crea un smoke lo ven los siguientes. Dos casos concretos:

- `smoke-e2e` tiene que ir **antes** que `smoke-tenant-admin`, porque este cambia el color de la marca.
- `smoke-org` va **el último** de su tanda, porque convierte a `rep@enjoy.test` en gerente. Por ejemplo, `smoke-commissions` falla si va después.

Los smokes nuevos usan nombres únicos (`Date.now().toString(36)`) y pasan tanto contra un servidor recién arrancado como después de los demás. Cada tanda del CI arranca su propio servidor.

## Qué cubre cada smoke

| Smoke | Tanda | Qué cubre |
|---|---|---|
| `smoke-e2e` | 1 | Enlaces públicos: 404 de borrador/revocado/caducado, orden y ocultos, precios por módulo, tema de la marca, pestañas independientes y avance automático |
| `smoke-admin` | 1 | Consola: login, Inicio, crear propuesta, arrastrar y soltar, tarifa, publicar, enlace público, revocar/despublicar, «Empieza rápido», receta y combinaciones guardadas, otro tenant → 403 |
| `smoke-tenant-admin` | 1 | Catálogo, equipo (invitar, último admin), marca (color, WhatsApp, og:image), punto de partida, actores, tarifas y Stripe |
| `smoke-playbook` | 1 | Aprende, jugadas, guion del dossier, propuestas de mejora del equipo, historial, métricas por cierres |
| `smoke-market` | 1 | Mapa de mercado, actores, Preparar mensaje con contexto, seguimiento |
| `smoke-partner` | 1 | Colaboradores: acceso con código, sus cuentas, precio bloqueado por política, aislamiento |
| `smoke-evidence` | 1 | «Qué ha funcionado»: cierres, recomendaciones en situaciones parecidas |
| `smoke-mobile` | 1 | **Las 47 páginas** de `src/pages` a 390 px con admin, comercial, colaborador y superadmin: `scrollWidth <= innerWidth`. Falla si aparece una página nueva sin cubrir |
| `smoke-recipes` | 1 | Propuesta con receta por sector: elegir sector, tipo y ángulo, aplicar receta (módulos y orden), publicar, enlace público, presentación (flechas, teclado, pestañas y pantalla en vivo que se quedan la flecha), tarifa y cupón |
| `smoke-org` | 1 | Organigrama: delegación, gerente que solo ve su equipo, superadmin y plataforma |
| `smoke-notifications` | 2 | Campana, avisos, emails y cron |
| `smoke-accounts` | 2 | Zonas y cuentas: «Me la quedo», contacto, bloqueo, importación CSV |
| `smoke-commissions` | 2 | Comisiones: reglas, venta declarada, calcular, liquidar, pagar, API con clave, cupones |
| `smoke-i18n` | 2 | Idiomas desde el menú y Mi cuenta; el navegador no decide |
| `smoke-start` | 2 | «Empieza aquí» y condiciones acordadas |
| `smoke-analytics` | 2 | Aperturas del cliente, tiempo por sección, campana |
| `smoke-daily` | 2 | Resumen diario por email y su enlace a Preparar mensaje |
| `smoke-welcome` | 2 | Bienvenida paso a paso, idioma, primera propuesta |
| `smoke-learn` | 2 | Aprende en orden, recorrido del producto, sector con foto, «Imagínatelo» |
| `smoke-learn-detail` | 2 | Ficha de **cada** sector: «Imagínatelo» con las pantallas de su receta y en orden, ideas para contarlo, ningún `<iframe>`, «Qué decir» con el resumen a la vista (= `summarize(cuerpo, 180)`); ficha de **cada** actor (15) con su contenido; actor inexistente → 404 |
| `smoke-auth` | 2 | Acceso con código (demo), código erróneo y de un solo uso, logout, «usar otra cuenta», mensaje neutro con un email que no existe, `?next=` (y que un `next` externo no saca de la app), invitación → bienvenida |
| `smoke-profile` | 2 | Español por defecto con el navegador en en-US y ko-KR; portugués desde la bienvenida y desde el menú (persiste tras logout y en otro navegador); errores del servidor traducidos; menú de perfil entero y por encima de la página a 1440, 1024 y 390 px; se cierra al pulsar fuera |
| `smoke-personalize` | 3 | Personalizar: logo, foto y vídeo del cliente en la pantalla en vivo, estilo musical, modo presentación |
| `smoke-setup-ai` | 3 | Configuración con IA: prompt, pegar respuesta, revisar e importar |
| `smoke-live-screen` | 3 | Pantalla en vivo: la barrita dura lo que la escena (3,8 s, medido); el minimóvil enseña la misma canción, foto o mensaje que la pantalla; una carátula por canción (vinilo solo si falta) |
| `smoke-rep` | 3 | Comercial (invitado nuevo, no `rep@enjoy.test`): ve las propuestas de ejemplo; la de otro, en solo lectura (UI deshabilitada; la API responde `canEdit=false`, y 403 al editar o borrar); edita la suya; Preparar mensaje con la propuesta ya elegida; «Me la quedo» → «Lo mío», otro comercial la ve reservada, soltarla; Mis comisiones con su resumen y `/admin/commissions/team` → 403 |
| `smoke-admin-config` | 3 | Admin: cambiar el rol (comercial → gerente, con permisos que cambian) y quitar a alguien (su sesión ya no entra); territorio (zona, asignar, días de reserva); comisiones (plan, conector de API, cupón); precios (crear y activar/desactivar una tarifa); marca (acento en la vista previa); configuración guiada (pasos 1–5, sector nuevo y archivarlo) |

## Unitarios añadidos en este checkpoint

| Fichero | Qué cubre |
|---|---|
| `src/lib/playbook/summarize.test.ts` | `stripMarkdown` y `summarize`: Markdown, enlaces, listas, cortes por frase y por palabra, acentos y emojis |
| `src/modules/headline-loose.test.ts` | `splitHeadline(…, true)`: comas, nexos (también en inglés), artículos colgando; las dos mitades juntas dan el titular original |
| `src/lib/i18n/resolve-locale.test.ts` | `resolveLocale` y `fromAcceptLanguage`: español por defecto, `Accept-Language` nunca decide, orden preferencia > cookie > espacio, valores raros |
| `src/lib/setup/presets.test.ts` | `localizePreset` en en, pt y ko: traduce, deja en español lo que no está, no toca claves ni iconos |
| `src/modules/live-screen/config.test.ts` | `screenConfig`: carátula `i` con la canción `i`, vacía solo la que falta; estilos; assets reales de Enjoy |
| `src/lib/proposal/recipes.test.ts` | `planProposal` con las 5 recetas reales de `tenants/enjoy/tenant.json`: todas las combinaciones validan (módulos del catálogo, sin duplicados, orden, topes, schema de cada bloque) y las reglas de `docs/PROPOSAL_PRESETS.md` |

## Qué no está cubierto todavía

- **Login con contraseña, «olvidé la contraseña» y el enlace del correo** (`/admin/auth/confirm`, `/admin/auth/callback`). Solo existen con Supabase de verdad; el modo DEMO no pinta el formulario. Lo mismo pasa con el aviso de «espera N segundos» al pedir demasiados códigos.
- **Las recetas reales en el navegador.** El modo DEMO se carga de `supabase/seed/fixtures.json`, no de `tenants/enjoy/tenant.json`. Allí solo hay una receta (una versión antigua de locales), no existen promotoras ni hoteles, conciertos y festivales no tienen receta y faltan casi todos los módulos que usan las recetas. Por eso `smoke-recipes` prueba de punta a punta solo un sector y avisa con `KNOWN` de los demás. Las recetas reales sí están cubiertas por `recipes.test.ts`. `smoke-recipes` está preparado para probarlas en una instancia con `tenant:bootstrap`.
- **Carátulas reales en el navegador.** En DEMO ninguna canción tiene carátula: las resuelve `scripts/tenant-bootstrap.ts` (iTunes) solo con Supabase. El caso «una con carátula y otra con vinilo» lo cubre `config.test.ts`; `smoke-live-screen` lo tiene escrito, pero en DEMO solo ve vinilos.
- **La barrita de las escenas en reposo y de vídeo** (3,2 s y 5,5 s). Las escenas en reposo no tienen barrita; el vídeo solo aparece al subir uno (lo cubre `smoke-personalize`, sin medir el tiempo).
- **Escape para cerrar el menú de perfil.** No está implementado (es un `<details>`) y los docs no lo piden.
- **En `smoke-mobile`, una sola variante por ruta dinámica** (un sector, un módulo… el primero que aparece enlazado). El colaborador no tiene propuestas propias, así que su editor no se mide.
- **Los retoques de texto de las recetas** (`patch`, `insert`) en el navegador: se comprueba qué módulos salen y en qué orden. En los unitarios sí se valida que el bloque resultante cumple su schema.
- **Editar una tarifa**: `/admin/prices` no lo permite (solo crear y activar/desactivar).
- **Comisiones**: no se prueban la revocación de claves de API, las condiciones por persona ni los referidos.
- **Oquea**: los tests de recetas solo usan `tenants/enjoy`.

## Bugs encontrados

No están arreglados (este checkpoint no toca `src/`). Cada uno está marcado en su test: `test.fails` en vitest o `KNOWN:` en el log del smoke. Cuando se arregle, el `test.fails` empieza a fallar, y hay que cambiarlo a `test` (o el `KNOWN` a `assert`).

1. **Errores de validación del editor de propuestas sin traducir.** `src/pages/admin/api/dossiers/[id].ts` responde el texto literal `'Datos no válidos'` cuando falla el schema, y `'Dossier no encontrado'` con un id mal formado. No pasa por `localizeError`, aunque las traducciones existen en `src/lib/i18n/errors.ts`. `talk-track.ts` y `similar.ts` hacen lo mismo con ids que no son UUID.
   *Reproducir:* entrar, cambiar a English desde el menú de perfil. En la consola del navegador: `fetch('/admin/api/dossiers/<id de una propuesta tuya>', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({op:'setVisible', itemId:'x', visible:1})}).then(r => r.json())` → `{error: 'Datos no válidos'}`; se espera «Invalid data». *Test:* `smoke-profile` (KNOWN).
2. **En DEMO, guardar «Mi cuenta» con `?setup=1` no lleva a la bienvenida.** La redirección a `/admin/welcome` solo está en la rama Supabase de `src/pages/admin/account.astro`. Es menor y solo pasa en demo.
   *Reproducir:* `npm run start:demo`, entrar, abrir `/admin/account?setup=1`, poner un nombre y guardar → te quedas en la misma página. *Test:* `smoke-auth` (KNOWN).
3. **`/admin/prices` desborda en el móvil (549 px de ancho en una pantalla de 390).** Lo causa el bloque «Pagos y comisiones automáticas»: la URL del webhook de Stripe (`code.co-input.!w-auto.flex-1.truncate`) está dentro de un `span.flex.flex-wrap` sin `min-w-0`, así que el `truncate` no actúa.
   *Reproducir:* admin@enjoy.test en un móvil de 390 px → `/admin/prices` → hay scroll horizontal. *Test:* `smoke-mobile` (KNOWN).
4. **Ficha del sector «Locales de ocio nocturno» desborda en el móvil (417 px).** El botón «Preparar un mensaje para locales de ocio nocturno →» (`a.co-btn.co-btn--ghost`) no parte la línea. Con «Bodas» cabe porque el nombre es más corto.
   *Reproducir:* cualquier rol, 390 px → `/admin/learn/sector/ocio-nocturno`. *Test:* `smoke-mobile` (KNOWN).
5. **Ficha del actor «propietario/gerente del local» desborda en el móvil (454 px).** Pasa lo mismo con «Preparar mensaje para un/a propietario/gerente del local →» (`a.co-btn.co-btn--primary`).
   *Reproducir:* 390 px → `/admin/learn/sector/ocio-nocturno/propietario-local`. *Test:* `smoke-mobile` (KNOWN).
6. **`/admin/platform` desborda en el móvil (410 px) en cuanto los ingresos tienen 4 cifras.** La cifra `span.co-figure.text-4xl` («1200,00 €») está en un `grid-cols-3` (`src/pages/admin/platform.astro:31`).
   *Reproducir:* servidor demo recién arrancado → `node scripts/smoke-commissions.cjs` → super@cofundo.test a 390 px → `/admin/platform`. *Test:* `smoke-mobile` (KNOWN, solo cuando hay ingresos).
7. **`screenConfig` rompe con `musicStyles: {}`**, aunque el schema lo da por bueno (`z.record` acepta un objeto vacío): `style` queda `undefined` y salta un error en `style.songs`. Una personalización con estilos musicales vacíos tumbaría la pantalla en vivo.
   *Reproducir:* `screenConfig({venueName:'a', djName:'', photos:[], covers:[], autoplay:true, musicStyles:{}}, {}, [])` → `Cannot read properties of undefined (reading 'songs')`. *Test:* `src/modules/live-screen/config.test.ts` (`test.fails`).
8. **`summarize` recorta por palabra una frase que termina justo en el máximo.** Busca `'. '` con espacio, así que no ve el punto del último carácter.
   *Reproducir:* `summarize('Uno dos tres. Cuatro cinco seis.', 13)` → `'Uno dos…'`; se espera `'Uno dos tres.'`. *Test:* `summarize.test.ts` (`test.fails`).
9. **`summarize` parte un emoji por la mitad** cuando no hay espacios: corta por unidades UTF-16.
   *Reproducir:* `summarize('😀'.repeat(40), 10)` → deja medio emoji (`.isWellFormed() === false`). *Test:* `summarize.test.ts` (`test.fails`).
10. **(Menor) `summarize` deja el `!` de una imagen Markdown.**
    *Reproducir:* `summarize('![logo](https://x.test/l.png) Hola')` → `'!logo Hola'`. *Test:* `summarize.test.ts` (`test.fails`).

### Datos del modo DEMO desfasados (no es un fallo de la app, pero limita los tests)

`supabase/seed/fixtures.json`, de donde sale el modo DEMO, se ha quedado atrás respecto a `tenants/enjoy/tenant.json`:

- sectores: 4 frente a 6;
- actores: 15 frente a unos 32;
- recetas: 1 (y antigua) frente a 5;
- faltan casi todos los módulos de las recetas.

*Ver:* `npm run start:demo` → rep@enjoy.test → nueva propuesta → Sector: solo salen Bodas, Locales de ocio nocturno, Conciertos y Festivales, y «Locales» no ofrece ni tipo ni ángulo. Si se carga el DEMO desde `tenant.json`, `smoke-recipes` y `smoke-learn-detail` probarán las recetas reales sin cambiar nada.

### Smokes que estaban mal (corregidos en este checkpoint, no eran fallos de la app)

- **`smoke-daily` dejaba el CI de producción en rojo.** Esperaba «Hotel Mar Azul» en «Sin próximo paso», pero `smoke-analytics`, que corre antes, la abre como cliente. Por diseño (`src/lib/notify/daily.ts`), cada propuesta sale una sola vez en su motivo más urgente, y «Te han abierto» gana. Ahora acepta las dos secciones.
- **`smoke-personalize` (que no estaba en el CI) esperaba que la flecha cambiara de diapositiva.** En esa diapositiva está la pantalla en vivo, que se queda la flecha para recorrer sus pantallas, como hace a propósito (`src/modules/live-screen/client.ts`). Ahora lo comprueba así: primero las pantallas y luego la diapositiva.
