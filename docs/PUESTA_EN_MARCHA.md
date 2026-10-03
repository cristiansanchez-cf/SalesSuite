# Puesta en marcha: lo que tienes que hacer tú

Lista ordenada para dejar Ventas funcionando en un subdominio de Cofundo. Marca cada casilla al terminar. Si algo no sale como dice aquí, para y dime en qué paso estás: no hace falta que entiendas el porqué de cada cosa.

**Tiempo estimado:** 15 minutos para la demo (parte A) y unas 2 horas para producción (partes B a H), repartibles en varios días.

**Reglas de oro**
- Las claves (Supabase, Resend, Vercel) **nunca** por el chat ni en el repositorio. Van en el panel de cada servicio y en tu `.env` local.
- Cada vez que te diga «comprueba», la comprobación está escrita: si da otra cosa, me lo dices tal cual.

**Nombres que vamos a usar** (cámbialos solo si tienes un motivo):

| Qué | Dirección |
|---|---|
| Demo con datos de prueba | `demo.ventas.cofundo.io` |
| Enjoy the Club | `enjoy.ventas.cofundo.io` |
| Oquea | `oquea.ventas.cofundo.io` (cuando me pases su material) |
| Emails de acceso y avisos | `hola@correo.cofundo.io` |

Usamos `*.ventas.cofundo.io` por una razón: más adelante, un vendedor que trabaje para Enjoy y para Oquea podrá entrar una sola vez y saltar de una empresa a otra.

---

## A. La demo, para verlo ya (15 min, sin Supabase)

Sirve para ver la consola, la analítica de dossiers y «Empieza aquí» con los datos de prueba. Los datos viven en memoria: se reinician cuando Vercel recicla el servidor, y si algo que acabas de hacer no aparece, recarga.

- [ ] **A1.** En https://vercel.com/new importa el repositorio `cristiansanchez-cf/SalesSuite`. Nombre del proyecto: `ventas-demo`.
- [ ] **A2.** Antes de pulsar *Deploy*, abre **Environment Variables** y añade solo estas dos:

  | Nombre | Valor |
  |---|---|
  | `DEMO_MODE` | `1` |
  | `DEV_TENANT_SLUG` | `enjoy` |

  No pongas ninguna variable de Supabase en este proyecto.
- [ ] **A3.** En *Settings → Git → Production Branch*, pon `claude/dreamy-dijkstra-a4xm1g` (es la rama donde está todo; cuando lo fusionemos, la cambias a `main`). Pulsa *Deploy*.
- [ ] **A4.** *Settings → Domains → Add* → `demo.ventas.cofundo.io`. Vercel te dirá qué registro DNS crear. En el DNS de `cofundo.io` (donde lo tengas: Cloudflare, el registrador…):
  ```
  demo.ventas   CNAME   cname.vercel-dns.com.
  ```
  Si usas Cloudflare, pon la nube en **gris** (solo DNS) para ese registro.
- [ ] **A5. Comprueba:** `https://demo.ventas.cofundo.io/api/health` responde con `"mode": "demo"`.
- [ ] **A6. Mira la demo:**
  1. `https://demo.ventas.cofundo.io/admin/login` → abre «Modo demo: entrar como…» → **Comercial Enjoy**.
  2. Menú **Analítica**: «Club Sol» sale en «Escríbele hoy» y «Hotel Mar Azul» en «Nadie la ha abierto».
  3. En otra pestaña de incógnito (o en el móvil) abre `https://demo.ventas.cofundo.io/d/demo-mar-azul-9Lw2`, baja hasta el final y ciérrala.
  4. Vuelve a Analítica y recarga: Mar Azul ya tiene una apertura, con tiempo y secciones. La campana te avisa.
  5. Menú **Empieza aquí**: lo que verá Amrit, Ángel o Uyong al entrar.
  6. Sal y entra como **Admin Enjoy** → *Configurar → Comisiones → Plan → Condiciones acordadas* para probar lo de enseñar las condiciones.

Con esto ya puedes enseñarlo. Lo que sigue es para que entren las personas de verdad.

---

## B. Supabase: la base de datos y el acceso (30 min)

**Decisión que te propongo:** un proyecto llamado **`cofundo`**, no `salessuite`. Hoy lo usa Ventas; mañana puede ser también la identidad común con el Cerebro (ver «Cerebro y Ventas: una sola identidad», más abajo). Como el acceso es sin contraseña, mover usuarios de un proyecto a otro más tarde es solo volver a dar de alta sus emails: no hay contraseñas que migrar.

- [ ] **B1.** https://supabase.com/dashboard → **New project**:
  - Organización: la de Cofundo. Nombre: `cofundo`.
  - **Región: Central EU (Frankfurt).**
  - Contraseña de base de datos: genérala y guárdala en tu gestor de contraseñas.
  - Plan: **Pro** en cuanto entren clientes reales (copias diarias y no se pausa). Para empezar con los 3 vendedores, Free vale, pero se pausa tras una semana sin uso.
- [ ] **B2.** Apunta el **Project ref**: es el trozo de la URL del panel `…/project/<ref>`.
- [ ] **B3. Migraciones.** En tu ordenador, dentro del repositorio (rama `claude/dreamy-dijkstra-a4xm1g`):
  ```bash
  npx supabase login
  npx supabase link --project-ref <ref>     # pide la contraseña de la base de datos
  npx supabase db push                      # crea todas las tablas
  ```
  ⚠️ **No** ejecutes `supabase/seed.sql`: son los datos de la demo.
- [ ] **B4. Comprueba:** en *Table Editor* aparecen `tenant`, `dossier`, `dossier_view`, `member_conditions_history`… todas con candado (RLS). En *Storage* existe el bucket `tenant-assets`.
- [ ] **B5. URLs** (*Authentication → URL Configuration*):
  - **Site URL:** `https://enjoy.ventas.cofundo.io`
  - **Redirect URLs** (una por línea):
    ```
    https://enjoy.ventas.cofundo.io/**
    https://oquea.ventas.cofundo.io/**
    http://localhost:4321/**
    ```
- [ ] **B6. Alta cerrada** (*Authentication → Sign In / Providers*): **Allow new users to sign up: OFF**. Provider Email: ON. En Email: **Email OTP Length = 6** y **Email OTP Expiration = 3600**.
- [ ] **B7. Plantillas** (*Authentication → Emails → Templates*). Copia el contenido de cada archivo de `supabase/templates/`:

  | Plantilla | Archivo | Asunto |
  |---|---|---|
  | Invite user | `invite.html` | Te han invitado |
  | Magic Link | `magic_link.html` | Tu código para entrar |
  | Confirm signup | `confirm_signup.html` | Confirma tu email |
  | Reset Password | `recovery.html` | Elige una contraseña nueva |

- [ ] **B8. Claves** (*Project Settings → API Keys*): ten a mano, sin pegarlas en ningún chat:
  - la **Project URL** (`https://<ref>.supabase.co`);
  - la clave **anon / publishable**;
  - la clave **service_role / secret** (es la peligrosa: solo en Vercel y en tu `.env`).

## C. Resend: los emails (20 min)

- [ ] **C1.** En https://resend.com → *Domains → Add domain* → `correo.cofundo.io`, región EU.
- [ ] **C2.** Resend te da 3 o 4 registros DNS (SPF, DKIM y MX de retorno). Créalos en el DNS de `cofundo.io` **tal cual** (nombre y valor). Espera a que salgan en verde (de minutos a una hora).
- [ ] **C3.** *API Keys → Create*: nombre `ventas-envio`, permiso **Sending access**, dominio `correo.cofundo.io`. Cópiala una sola vez a tu gestor de contraseñas. Es exclusiva de esta app: si se filtra, se revoca sin tocar nada más.
- [ ] **C4. SMTP de Supabase** (*Project Settings → Authentication → SMTP Settings → Enable custom SMTP*):

  | Campo | Valor |
  |---|---|
  | Sender email | `hola@correo.cofundo.io` |
  | Sender name | `Cofundo Ventas` |
  | Host | `smtp.resend.com` |
  | Port | `465` |
  | Username | `resend` |
  | Password | la clave `ventas-envio` |

- [ ] **C5.** Ojo con el límite del plan gratuito de Resend: **100 emails al día**. Cada inicio de sesión gasta uno. Con 3 vendedores sobra; vigila el panel de Resend si entra más gente.

## D. Vercel: la app de verdad (20 min)

- [ ] **D1.** https://vercel.com/new → importa de nuevo el repositorio, ahora como proyecto `ventas`. Rama de producción: `claude/dreamy-dijkstra-a4xm1g` (como en A3).
- [ ] **D2. Environment Variables** (Production):

  | Nombre | Valor | Notas |
  |---|---|---|
  | `PUBLIC_SUPABASE_URL` | la Project URL de B8 | |
  | `PUBLIC_SUPABASE_ANON_KEY` | la clave anon de B8 | |
  | `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role de B8 | Márcala **Sensitive** |
  | `RESEND_API_KEY` | la clave `ventas-envio` de C3 | Márcala **Sensitive** |
  | `RESEND_FROM` | `Cofundo Ventas <hola@correo.cofundo.io>` | |
  | `CRON_SECRET` | una cadena larga aleatoria (por ejemplo, genera 40 caracteres en tu gestor) | Márcala **Sensitive** |

  **No** pongas `DEMO_MODE` en este proyecto.
- [ ] **D3.** Deploy.
- [ ] **D4. Dominios** (*Settings → Domains*): añade `enjoy.ventas.cofundo.io` (y `oquea.ventas.cofundo.io` cuando toque). En el DNS de `cofundo.io`:
  ```
  enjoy.ventas   CNAME   cname.vercel-dns.com.
  oquea.ventas   CNAME   cname.vercel-dns.com.
  ```
- [ ] **D5. Comprueba:** `https://enjoy.ventas.cofundo.io/api/health` responde `"status": "ok"`, `"mode": "supabase"`, `"database": "ok"`. Hasta que hagas el paso E, la página de la consola dará 404: es normal (aún no existe el espacio Enjoy).

## E. Dar de alta el espacio de Enjoy (15 min)

- [ ] **E1.** En tu ordenador, en el repositorio:
  ```bash
  cp .env.example .env
  ```
  Abre `.env` y rellena `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (las de B8).
- [ ] **E2.** Abre `tenants/enjoy/tenant.json` y en `"admins": []` pon tu email entre comillas: `"admins": ["tu@email"]`. (No lo subas al repositorio si prefieres que no quede ahí; sirve igual en local.)
- [ ] **E3.** Primero en prueba, luego de verdad:
  ```bash
  set -a && . ./.env && set +a
  npm run tenant:bootstrap -- tenants/enjoy --dry-run
  npm run tenant:bootstrap -- tenants/enjoy
  ```
- [ ] **E4. Comprueba:** te llega «Te han invitado» desde `hola@correo.cofundo.io` → *Aceptar invitación* → entras como admin en `https://enjoy.ventas.cofundo.io/admin`.

## F. Avisos automáticos (10 min)

Los avisos por email y el resumen de los lunes necesitan que alguien llame a la app cada 10 minutos. Lo más sencillo, sin pagar Vercel Pro, es que lo haga la propia base de datos:

- [ ] **F1.** Supabase → *Database → Extensions*: activa **pg_cron** y **pg_net**.
- [ ] **F2.** *SQL Editor → New query*, sustituye `<CRON_SECRET>` por el valor de D2 y ejecuta:
  ```sql
  select cron.schedule('ventas-avisos', '*/10 * * * *', $$
    select net.http_get(
      url := 'https://enjoy.ventas.cofundo.io/api/cron/notifications',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$);
  ```
  Una sola llamada atiende a todas las empresas.
- [ ] **F3. Comprueba:** `https://enjoy.ventas.cofundo.io/api/health` dice `"cronConfigured": true` y `"emailConfigured": true`.

## G. Prueba de acceso (10 min, una vez)

- [ ] **G1.** Desde *Equipo*, invita a un segundo email tuyo como **Comercial** → llega «Te han invitado» → aceptas → aterrizas en **Empieza aquí**.
- [ ] **G2.** Sal. En `/admin/login` pon ese email → llega «Tu código para entrar» con el código arriba → lo escribes → entras.
- [ ] **G3.** Pide dos códigos seguidos → la pantalla dice «espera N segundos».
- [ ] **G4.** Recarga la pantalla del código → ofrece «Ya tengo un código para…».
- [ ] **G5.** Crea una propuesta, publícala, abre el enlace en el móvil → en *Analítica* aparece la apertura y la campana te avisa.

Cuando G1 a G5 salgan bien, dime **«validado: acceso y Empieza aquí»** y los congelo como tests (docs/VALIDATED.md).

## H. Los tres vendedores

- [ ] **H1.** Para cada uno, desde *Equipo → Invitar*: email, rol (**Comercial** si es del equipo, **Colaborador** si va por su cuenta con cuentas asignadas) y su zona si aplica.
  - **Amrit** (Enjoy · conciertos y artistas).
  - **Ángel** (Enjoy · Results).
  - **Uyong** (Oquea · Corea, empezando por el QR gratuito): **espera** a que montemos el espacio de Oquea (ver «Lo que necesito de ti»).
- [ ] **H2.** Condiciones: *Configurar → Comisiones → Plan → Condiciones acordadas*. Para quien aún no las tiene acordadas, no toques nada: verá «Las acordaremos contigo cuando hayas probado». Para quien sí, escribe sus condiciones en palabras sencillas y marca «Ya están acordadas». Cada cambio queda en el historial.

---

## Lo que necesito de ti para seguir

| Qué | Para qué | Cuándo |
|---|---|---|
| «Demo vista» y lo que no te cuadre | Ajustar antes de que entren los vendedores | Tras A6 |
| `/api/health` de producción en `ok` | Saber que B, C y D están bien | Tras D5 |
| Material de Oquea: logo (SVG), colores, tipografía si tienen, y qué incluye el QR gratuito | Preparar `tenants/oquea` como el de Enjoy | Cuando puedas |
| Qué vende exactamente cada uno (Amrit: conciertos/artistas; Ángel: Results) | Rellenar el catálogo y el «Qué vendemos» de Empieza aquí con lo real | Antes de invitarlos |
| Los emails de los tres | Solo si quieres que los invite yo con el script (si no, desde *Equipo*) | Cuando los tengas |
| Respuestas del agente del Cerebro (docs/PREGUNTAS_CEREBRO.md) | Decidir la identidad común y la integración | Cuando las tengas |

## Cerebro y Ventas: una sola identidad

Lo que te recomiendo (detalle en docs/FOUNDATIONS.md §5.7 y §9):

1. **Un solo sitio de identidad** (el proyecto `cofundo` de Supabase): cada persona es un email y puede tener acceso al Cerebro, a Ventas o a los dos.
2. **Cada producto guarda lo suyo** en su propio espacio de la base de datos, sin pisarse.
3. **No hace falta un tercer servicio** de autenticación: Supabase ya hace ese papel, y añadir otro sería más piezas que mantener.
4. **Cuándo:** con el Cerebro en 3 o 4 usuarios, el cambio es barato ahora. Pero espera a las respuestas de su agente: si su base de datos ya tiene tablas con los mismos nombres que las de Ventas, decidiremos quién se muda de espacio y lo haremos en una tarde.
