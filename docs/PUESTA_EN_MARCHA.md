# Puesta en marcha en producción

Esta guía deja Cofundo Ventas funcionando en `enjoy.ventas.cofundo.io`, conectado a su base de datos real, con el espacio de Enjoy dado de alta y su contenido de ejemplo. Todo se hace **desde el navegador**: no hace falta terminal.

**Decisión de Cristian (3 de octubre):**
- Se trabaja directamente en producción. Nadie más sabe que existe, así que de momento puede tener datos de prueba.
- No se monta una demo aparte.
- Más adelante (paso 9): producción se vacía de datos de prueba, se crea un entorno de desarrollo que sea copia de producción, y entonces se da de alta a la gente de verdad.

---

## Para el agente que acompaña a Cristian

Lee esto antes de tocar nada.

1. **Primero mira, después actúa.** Antes de cada paso, comprueba en la pantalla si ya está hecho, a medias o hecho de otra manera. Sigue la tabla «Estado de partida». Si está bien, márcalo y sigue. Si está distinto, corrígelo como dice la tabla. Si no sabes qué es, para y pregunta a Cristian.
2. **Las claves no se escriben en ningún chat ni documento.** Se copian de una pestaña y se pegan directamente en el campo donde van: Vercel, GitHub o Supabase. Esto vale para la contraseña de la base de datos, la clave `service_role`, la clave de Resend y el `CRON_SECRET`. Si hay que guardarlas, va en el gestor de contraseñas de Cristian.
3. **No borres nada que no diga esta guía.** En el DNS de `cofundo.io` hay más registros (web, correo…): solo se tocan los que aparecen aquí.
4. **Al acabar cada paso, ejecuta su «Comprobación».** Si el resultado no coincide, para y apúntalo tal cual (texto exacto del error o captura).
5. **Al final**, rellena la tabla «Informe para el agente de desarrollo» (último apartado) y dásela a Cristian.

### Estado de partida (lo que ya se hizo con la guía anterior)

Cristian siguió una versión anterior hasta el paso «A4». Lo que probablemente exista:

| Dónde | Qué puede haber | Qué hacer |
|---|---|---|
| Vercel | Un proyecto (se llamó `ventas-demo`) conectado a `cristiansanchez-cf/SalesSuite` | **Se reutiliza.** Opcional: *Settings → General → Project Name* → `ventas`. |
| Vercel → Settings → Environment Variables | `DEMO_MODE = 1` y `DEV_TENANT_SLUG = enjoy` | **Borrar las dos** (menú ⋯ de cada una → *Remove*). En producción no se usan. |
| Vercel → Settings → Domains | `demo.ventas.cofundo.io` | **Quitarlo** (*Remove*) y añadir `enjoy.ventas.cofundo.io` (paso 6). |
| DNS de `cofundo.io` | Registro `CNAME` con nombre `demo.ventas` → `cname.vercel-dns.com` (u otro valor que diera Vercel) | **Editarlo**: cambia el nombre a `enjoy.ventas` y deja el valor. Si no se puede editar el nombre, bórralo y crea el nuevo (paso 6). |
| Vercel → rama de producción | `claude/dreamy-dijkstra-a4xm1g` | Correcto: es la rama principal del repositorio. Si pone otra cosa, cámbialo a esta. |
| Supabase | Probablemente nada todavía | Si ya existe un proyecto creado para esto, dime su nombre antes de seguir. |
| Resend | Probablemente nada todavía | Si ya hay un dominio verificado, dime cuál. |

---

### Estado a 3 de octubre (informe de Cowork)

Hechos: estado de partida, pasos 1 a 6. Para la siguiente sesión:
- **El proyecto de Supabase se llama `Sales`** (ref `gxogpgwwihoepgyqqdpp`). El nombre da igual. Usa las claves nuevas (`sb_publishable_…` / `sb_secret_…`): valen igual que `anon` / `service_role`.
- **Paso 7: se bloqueó porque faltan los archivos de marca de Enjoy.** Ya está resuelto: el alta sigue sin ellos y lo avisa con «⚠ Falta assets/…». Repite el **7.1** (prueba) y, si sale en verde, Cristian lanza el **7.2**. El logo, el favicon, la imagen para compartir y la fuente se añaden después a `tenants/enjoy/assets/` y basta con repetir el alta.
- Pendientes: 7, 8 y 9.

## Mapa de lo que habrá al terminar

| Pieza | Dónde | Para qué |
|---|---|---|
| Base de datos y acceso | Supabase, proyecto `cofundo-ventas` (Frankfurt) | Datos, usuarios y acceso con código por email. Separado del Cerebro: así lo acordamos con su equipo |
| Emails | Resend, dominio `correo.cofundo.io`, remitente `hola@correo.cofundo.io` | Códigos de acceso, invitaciones y avisos |
| Web | Vercel, proyecto `ventas`, dominio `enjoy.ventas.cofundo.io` | La consola y los enlaces de las propuestas |
| Botón de mantenimiento | GitHub → Actions → «Producción» | Aplica cambios de la base de datos y da de alta espacios sin terminal |
| Avisos automáticos | Supabase (pg_cron) llamando a la web cada 10 min | Emails de avisos y resumen de los lunes |

**Tiempo estimado:** unas 2 horas, repartibles. Los pasos 1 y 2 tienen esperas (DNS): se pueden dejar en marcha y seguir con otros.

---

## Paso 1 · Supabase: crear el proyecto (10 min)

- [ ] **1.1** https://supabase.com/dashboard → **New project**.
  - Organización: la de Cofundo.
  - Nombre: **`cofundo-ventas`**. Si ya se creó como `cofundo`, déjalo así: el nombre no cambia nada.
  - Región: **Central EU (Frankfurt)**.
  - Database password: pulsa *Generate* y guárdala **en el gestor de contraseñas** (se usa en el paso 3).
  - Plan: Free sirve para empezar. Ojo: se pausa tras 7 días sin uso. Cuando entren los vendedores, pasar a Pro.
- [ ] **1.2** Espera a que termine de crearse (2–3 min).
- [ ] **1.3** **Authentication → Sign In / Providers:**
  - *Allow new users to sign up*: **OFF**.
  - *Email* (provider): ON. Dentro: **Email OTP Length = 6**, **Email OTP Expiration = 3600**. Guarda.
- [ ] **1.4** **Authentication → URL Configuration:**
  - Site URL: `https://enjoy.ventas.cofundo.io`
  - Redirect URLs: añade, una a una:
    - `https://enjoy.ventas.cofundo.io/**`
    - `https://oquea.ventas.cofundo.io/**`
    - `http://localhost:4321/**`
- [ ] **1.5** (Supabase no deja editar las plantillas hasta que el SMTP propio esté activo: haz antes el paso 2.5.) **Authentication → Emails → Templates.** Para cada plantilla, pega el asunto y el contenido del archivo indicado. Los archivos están en el repositorio, en `supabase/templates/`: ábrelos en GitHub, pulsa *Raw* y copia todo.

  | Plantilla | Asunto | Archivo |
  |---|---|---|
  | Invite user | `Te han invitado` | `invite.html` |
  | Magic Link | `Tu código para entrar` | `magic_link.html` |
  | Confirm signup | `Confirma tu email` | `confirm_signup.html` |
  | Reset Password | `Elige una contraseña nueva` | `recovery.html` |

- [ ] **Comprobación 1:** en *Authentication → Emails → Templates → Magic Link*, la vista previa muestra «Tu código para entrar» con `{{ .Token }}` en grande.

## Paso 2 · Resend: el dominio de envío (15 min + espera de DNS)

- [ ] **2.1** https://resend.com → *Domains → Add domain* → `correo.cofundo.io`, región **EU (Ireland)**.
- [ ] **2.2** Resend muestra 3 o 4 registros (MX, TXT de SPF, TXT de DKIM). Créalos en el DNS de `cofundo.io` **copiando nombre, tipo y valor exactos**. En Cloudflare: nube **gris** (solo DNS).
- [ ] **2.3** En Resend pulsa *Verify*. Puede tardar de minutos a una hora: sigue con el paso 3 mientras tanto.
- [ ] **2.4** Cuando el dominio esté en verde: *API Keys → Create API key*:
  - Nombre: `ventas-envio`.
  - Permission: **Sending access**.
  - Domain: `correo.cofundo.io`.

  Se muestra una sola vez: **cópiala directamente** al campo del paso 2.5 y guárdala en el gestor de contraseñas.
- [ ] **2.5** En Supabase: **Project Settings → Authentication → SMTP Settings → Enable custom SMTP**:

  | Campo | Valor |
  |---|---|
  | Sender email | `hola@correo.cofundo.io` |
  | Sender name | `Cofundo Ventas` |
  | Host | `smtp.resend.com` |
  | Port | `465` |
  | Username | `resend` |
  | Password | la API key `ventas-envio` |

- [ ] **Comprobación 2:** Resend muestra `correo.cofundo.io` como **Verified** y Supabase guarda el SMTP sin error.

Ten en cuenta que el plan gratuito de Resend permite **100 emails al día**. Cada inicio de sesión gasta uno: de sobra para empezar.

## Paso 3 · GitHub: los secretos del botón de mantenimiento (10 min)

El repositorio tiene un botón (*Actions → Producción*) que aplica la base de datos y da de alta espacios. Necesita tres secretos.

- [ ] **3.1** En Supabase, botón **Connect** (arriba) → pestaña de cadenas de conexión → **Session pooler** → copia la URI. Tiene esta forma:
  `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`

  Sustituye `[YOUR-PASSWORD]` (corchetes incluidos) por la contraseña del paso 1.1.

  Usa la **Session pooler**, no la «Direct connection»: GitHub no llega a la directa.
- [ ] **3.2** En Supabase: **Project Settings → API Keys**. Necesitas:
  - la **Project URL** (`https://<ref>.supabase.co`);
  - la clave **`service_role`** (o *secret*; pulsa *Reveal*).
- [ ] **3.3** En GitHub: `cristiansanchez-cf/SalesSuite` → **Settings → Secrets and variables → Actions → New repository secret**. Crea estos tres:

  | Name | Secret |
  |---|---|
  | `SUPABASE_DB_URL` | la URI del 3.1, con la contraseña ya puesta |
  | `PUBLIC_SUPABASE_URL` | la Project URL |
  | `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role |

- [ ] **Comprobación 3:** en *Settings → Secrets and variables → Actions* aparecen los tres nombres. Los valores no se ven, y es normal.

## Paso 4 · Crear las tablas (5 min)

- [ ] **4.1** GitHub → pestaña **Actions** → en la izquierda, **Producción** → botón **Run workflow**:
  - What: `migraciones`.
  - Dry run: **marcado**.
  - *Run workflow*.
- [ ] **4.2** Abre la ejecución. En el paso «Migraciones (qué se aplicaría)» debe salir la lista de migraciones, desde `20261002000000_init.sql` hasta `20261031000000_proposal_presets.sql`.
- [ ] **4.3** Repite el 4.1 con **Dry run desmarcado**. Debe acabar en verde.
- [ ] **Comprobación 4:** en Supabase → *Table Editor* aparecen, entre otras, `tenant`, `dossier`, `dossier_view` y `member_conditions_history`, con el candado de seguridad activado. En *Storage* existe el bucket `tenant-assets`.

Si falla con «Faltan secretos», revisa el paso 3. Si falla con un error de conexión, la URI del 3.1 no es la de *Session pooler* o la contraseña está mal.

## Paso 5 · Vercel: conectar la web a la base de datos (10 min)

- [ ] **5.1** Vercel → el proyecto → **Settings → Environment Variables.** Primero, si existen, **borra** `DEMO_MODE` y `DEV_TENANT_SLUG`.
- [ ] **5.2** Añade estas variables (entorno **Production**; también Preview si lo ofrece):

  | Key | Value | ¿Sensitive? |
  |---|---|---|
  | `PUBLIC_SUPABASE_URL` | la Project URL (paso 3.2) | No |
  | `PUBLIC_SUPABASE_ANON_KEY` | Supabase → *Project Settings → API Keys* → clave **anon** / *publishable* | No |
  | `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role | **Sí** |
  | `RESEND_API_KEY` | la API key `ventas-envio` | **Sí** |
  | `RESEND_FROM` | `Cofundo Ventas <hola@correo.cofundo.io>` | No |
  | `CRON_SECRET` | una cadena aleatoria de 40 caracteres (genérala en el gestor de contraseñas y guárdala ahí: se usa en el paso 8) | **Sí** |

- [ ] **5.3** **Deployments** → el último despliegue → menú **⋯** → **Redeploy**. Las variables solo se aplican a despliegues nuevos.
- [ ] **5.4 Velocidad: la web, en la misma región que la base de datos.** Vercel → el proyecto → **Settings → Functions → Function Region** → la región más cercana a la de Supabase (Supabase → *Project Settings → General → Region*; el botón «Producción» también la escribe en su resumen). Ejemplos: Supabase `eu-west-3` (París) → Vercel `cdg1`; `eu-central-1` (Fráncfort) → `fra1`; `eu-west-1` (Irlanda) → `dub1`. Guardar y **Redeploy**. Es lo que más se nota: cada página hace varias consultas y, si la web está en EE. UU. y la base en Europa, cada una cruza el Atlántico.
- [ ] **Comprobación 5:** `https://<proyecto>.vercel.app/api/health` responde con `"status": "ok"`, `"mode": "supabase"` y `"database": "ok"`. Si dice `"misconfigured"`, el campo `problems` dice qué falta.

## Paso 6 · El dominio `enjoy.ventas.cofundo.io` (5 min + espera)

- [ ] **6.1** Vercel → **Settings → Domains**: si está `demo.ventas.cofundo.io`, **Remove**. Después, **Add** → `enjoy.ventas.cofundo.io`.
- [ ] **6.2** En el DNS de `cofundo.io`: si existe el registro `demo.ventas`, **cámbiale el nombre** a `enjoy.ventas`. Si no existe, créalo:
  ```
  Tipo: CNAME    Nombre: enjoy.ventas    Valor: (el que indique Vercel, normalmente cname.vercel-dns.com)
  ```
  En Cloudflare: nube **gris**.
- [ ] **Comprobación 6:** Vercel muestra el dominio con el check azul («Valid Configuration»), y `https://enjoy.ventas.cofundo.io/api/health` responde igual que en la comprobación 5.

Hasta el paso 7, `https://enjoy.ventas.cofundo.io/admin` da 404. Es lo esperado: aún no existe el espacio Enjoy.

## Paso 7 · Dar de alta el espacio de Enjoy (5 min)

Crea Enjoy con su marca y con el **catálogo, el mercado y el playbook de ejemplo** (son los datos de prueba), y te invita como admin.

- [ ] **7.1** GitHub → **Actions → Producción → Run workflow**:
  - What: `alta-espacio`.
  - Tenant: `enjoy`.
  - Admin email: **el email de Cristian**.
  - Dry run: **marcado**.

  Debe acabar en verde con una línea del tipo «tenant.json válido: … 1 admins». El email no aparece en el registro: GitHub lo oculta. Las líneas «⚠ Falta assets/…» son avisos, no errores: Enjoy se da de alta sin su logo ni su fuente hasta que se suban.
- [ ] **7.2** Repite con **Dry run desmarcado**.
- [ ] **Comprobación 7:** a Cristian le llega «Te han invitado» desde `hola@correo.cofundo.io`. Al pulsar *Aceptar invitación* entra en `https://enjoy.ventas.cofundo.io`, completa su nombre y aterriza en **Empieza aquí**.

Si no llega el email: mira en Resend → *Emails* si salió. Si no salió, revisa el SMTP del paso 2.5. Si salió y el enlace da error, revisa las Redirect URLs del 1.4.

## Paso 8 · Avisos automáticos (5 min)

- [ ] **8.1** Supabase → **Database → Extensions**: activa **pg_cron** y **pg_net**.
- [ ] **8.2** Supabase → **SQL Editor → New query**. Pega esto, sustituye `PEGA_AQUI_EL_CRON_SECRET` por el valor del paso 5.2 (directamente desde el gestor) y pulsa *Run*:
  ```sql
  select cron.schedule('ventas-avisos', '*/10 * * * *', $$
    select net.http_get(
      url := 'https://enjoy.ventas.cofundo.io/api/cron/notifications',
      headers := jsonb_build_object('Authorization', 'Bearer PEGA_AQUI_EL_CRON_SECRET')
    );
  $$);
  ```
  Una sola tarea sirve para todas las empresas.
- [ ] **Comprobación 8:**
  - `https://enjoy.ventas.cofundo.io/api/health` muestra `"emailConfigured": true` y `"cronConfigured": true`. Esto solo dice que las claves están puestas.
  - Para saber que funciona: pasados 10 minutos, ejecuta en el SQL Editor:
    ```sql
    select status_code, created from net._http_response order by created desc limit 3;
    ```
    Debe salir `200`. Si sale `401`, el `CRON_SECRET` del SQL no coincide con el de Vercel. Para corregirlo, borra la tarea con `select cron.unschedule('ventas-avisos');` y repite el 8.2.

### Dossiers de ejemplo

Para ver propuestas reales en tu cuenta sin crearlas a mano: GitHub → Actions → **Producción** → *Qué hacer* = `dossiers-ejemplo`, *Email* = el tuyo (o vacío: el admin más antiguo), «Solo comprobar» desmarcado. Crea tres propuestas publicadas (Locales, Promotoras, Conciertos) con sus módulos recomendados y una tarifa, **en modo prueba** (tus aperturas no cuentan). Repetirlo no las duplica. El resumen enlaza cada una al editor; el enlace del cliente está en «Compartir».

### Si va lento

Cada respuesta de la consola lleva la cabecera `Server-Timing` (DevTools → Network → la petición → *Timing*): `tenant`, `auth`, `prep` y `page` en milisegundos. Las páginas de más de 1,5 s dejan una línea `[lento]` en los registros de Vercel. Si `auth` y `page` son altos en todas las páginas, revisa el paso 5.4 (región).

## Paso 9 · Probar el recorrido completo (15 min)

Lo hace Cristian. El agente solo apunta lo que no salga como se describe.

- [ ] **9.1 Acceso con código:**
  - Sal de la consola. En `/admin/login`, pon tu email → llega «Tu código para entrar» con el código arriba → lo escribes → entras.
  - Pide dos códigos seguidos: la pantalla dice «espera N segundos».
  - Recarga la pantalla del código: ofrece «Ya tengo un código para…».
- [ ] **9.2 Un vendedor de prueba:** en *Configurar → Equipo*, invita a un segundo email tuyo como **Comercial**. Acepta desde ese correo (mejor en una ventana de incógnito): aterriza en **Empieza aquí**.
- [ ] **9.3 Condiciones:** como admin, *Configurar → Comisiones → Plan → Condiciones acordadas*:
  - escribe algo para el comercial de prueba y marca «Ya están acordadas»;
  - como comercial, recarga «Empieza aquí»: se ven;
  - cámbialas otra vez: aparece «Historial de mis condiciones».
- [ ] **9.4 Analítica:**
  - Como comercial, crea una propuesta, publícala y copia el enlace.
  - Ábrelo en el móvil, baja hasta el final y ciérralo.
  - En **Analítica** aparece la apertura con su tiempo y sus secciones, y la campana avisa «… ha abierto tu propuesta».

Cuando 9.1 a 9.4 salgan bien, Cristian dice **«validado: acceso, Empieza aquí y analítica»** y quedan congelados como tests (`docs/VALIDATED.md`).

## Paso 10 · Más adelante: producción limpia + entorno de desarrollo

Cuando toque empezar con la gente de verdad (no ahora). Lo preparará el agente de desarrollo con su propio botón; aquí solo el plan:

1. Crear un segundo proyecto de Supabase, `cofundo-ventas-dev`, y un segundo proyecto de Vercel con su dominio, por ejemplo `dev.ventas.cofundo.io`. Será la copia donde se prueba.
2. Copiar a desarrollo la estructura y el contenido de ejemplo.
3. En producción, borrar las propuestas, los usuarios de prueba y el contenido de ejemplo. Dejar solo la marca y el catálogo real de cada empresa.
4. Dar de alta a Amrit y Ángel (Enjoy) y, cuando exista su espacio, a Uyong (Oquea).

---

## Informe para el agente de desarrollo

Al terminar (o al quedarse bloqueado), rellenar y pasar a Cristian. **Sin claves.**

| Paso | Estado (hecho / a medias / no) | Notas o error exacto |
|---|---|---|
| Estado de partida corregido (variables demo borradas, dominio demo quitado, DNS renombrado) | | |
| 1 · Supabase (nombre del proyecto y región) | | |
| 2 · Resend (dominio verificado, SMTP en Supabase) | | |
| 3 · Secretos de GitHub | | |
| 4 · Migraciones (última migración aplicada) | | |
| 5 · Vercel (resultado de `/api/health`) | | |
| 6 · Dominio `enjoy.ventas.cofundo.io` | | |
| 7 · Alta de Enjoy (¿llegó la invitación?) | | |
| 8 · Avisos automáticos (`cronConfigured`) | | |
| 9 · Recorrido completo (qué falló, si algo) | | |

## Lo que necesita el agente de desarrollo de Cristian (no del agente que acompaña)

- Material de **Oquea** (logo en SVG, colores, tipografía si la hay, y qué incluye el QR gratuito) para crear su espacio en `oquea.ventas.cofundo.io`.
- **Qué vende exactamente** Amrit (conciertos y artistas) y Ángel (Results), para cambiar el catálogo de ejemplo por el real.
- Las respuestas del agente del Cerebro a `docs/PREGUNTAS_CEREBRO.md`.
