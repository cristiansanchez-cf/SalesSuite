# Organigrama y superadmin

## Quién ve qué

| Figura | Cómo se es | Ve | Puede |
|---|---|---|---|
| **Superadmin** (solo Cristian) | `platform_admin` (fuera de los espacios) | **Todos los espacios**: página **Plataforma** con sus cifras, y dentro de cada uno, como admin | Todo, en cualquier espacio |
| **Admin** | rol `admin` del espacio | Todo el espacio | Marca, catálogo, precios, roles… y el organigrama |
| **Gerente global** | rol «Gerente» (`lead`) **sin** delegación | Todo el espacio | Equipo, playbook, todas las propuestas y comisiones (lectura) y el organigrama |
| **Gerente de zona** | rol «Gerente» **con** delegación | **Solo su delegación**: su gente, sus propuestas, sus comisiones y condiciones | Lo mismo que el global, pero sobre su equipo; invita a su delegación |
| Comercial | rol `rep` | Sus propuestas (y las del espacio para no pisarse cuentas) y sus comisiones | Vender |

Una **delegación** es un equipo comercial: un nombre, su **gerente** y sus **zonas** (las del Territorio). Cada persona está en una o en ninguna.

## Dónde se monta

**Configurar → Organigrama** (`/admin/team/org`): arriba la dirección; debajo, una tarjeta por delegación con su gerente
(desplegable), sus zonas (＋ Zona) y su gente (cada uno con «Mover a…»). Al elegir gerente, esa persona pasa a «Gerente» y a esa
delegación. Un gerente de zona ve aquí solo la suya, sin poder cambiarla. En **Equipo** sale la delegación de cada persona.

## Superadmin

Se nombra desde GitHub → Actions → **Producción** → `superadmin`, con el email en «admin_email» (oculto en los registros) y
«Solo comprobar» desmarcado. Si aún no tiene usuario, se le crea la cuenta (sin email de invitación): entra desde `/admin/login` de cualquier espacio con su email y el código que le llega. Quitarlo: `ADMIN_EMAILS=… npx tsx scripts/superadmin.ts --remove`.
Entra en cada espacio por su dominio (la Plataforma tiene un «Entrar» por espacio); dentro es admin aunque no sea miembro.

**Coste por empresa** (Plataforma → Coste por empresa): lo que gasta cada espacio en IA, audios, WhatsApp, correos y redes, por función y por persona. Ver docs/COSTES.md.

## Alta de una empresa

Paso a paso para el superadmin (una sola vez + cada empresa): [`ONBOARDING_TENANT.md`](ONBOARDING_TENANT.md). Aquí, qué
hace cada pieza.

**Plataforma → Nueva empresa** (solo superadmin): nombre, dirección (sale del nombre), idioma y, si se quiere, el email de su
admin. Crea el espacio con su dirección `<dirección>.ventas.cofundo.io` (o la base de `PLATFORM_DOMAIN`; en local,
`<dirección>.localhost`), su fila de ajustes del CRM (sin paquete de cualificación: por ahora solo se pone por SQL,
docs/CRM_DINAMICO.md §45) e invita a su admin (hace falta `SUPABASE_SERVICE_ROLE_KEY`), cuyo enlace le lleva a la
configuración guiada (`/admin/setup/ia?first=1`). «Entrar y configurar» lleva al superadmin al mismo sitio (allí hay que
iniciar sesión otra vez: la sesión es de cada dirección). Una dirección repetida se rechaza. El espacio nace vacío: sin
marca, sin módulos en el catálogo y sin contenido.

Una sola vez, para que cualquier dirección nueva funcione sin tocar nada:
- Vercel → el proyecto → Settings → Domains: añadir `*.ventas.cofundo.io` (el comodín pide los nameservers de Vercel para
  `ventas.cofundo.io`, o un registro CNAME `*.ventas` → `cname.vercel-dns.com` y la verificación que pida Vercel).
- Supabase → Authentication → URL Configuration → Redirect URLs: añadir `https://*.ventas.cofundo.io/**`.

Después, su admin (o el superadmin) le da al **agente de alta** su web y sus documentos y en unos minutos tiene el borrador de
qué vende, clientes y actores, situaciones, cómo se vende y precios (docs/SETUP_WIZARD.md §Agente de alta). En Plataforma, cada
espacio enseña su **Alta**: los nueve pasos (su admin, qué vende, clientes y actores, situaciones, cómo se vende, precios, logo,
CRM con empresas y primera propuesta), cuáles faltan y un enlace a cada uno en su espacio (`src/lib/org/setup-status.ts`; los
cuenta `platform_overview()`).

Un dominio propio de la empresa (p. ej. `ventas.suempresa.com`) no tiene pantalla: Vercel + DNS + Redirect URL
(docs/SETUP.md §3.1 y §6) y la fila en `domain` (con `tenants/<slug>/tenant.json` y el alta por script, o por SQL; ver
docs/ONBOARDING_TENANT.md). La carpeta `tenants/<slug>/` sigue siendo la alternativa para cargar de una vez marca, catálogo y
contenido, también sobre un espacio creado aquí.

Hecho con `platform_create_tenant()` y `platform_add_admin()` (migración `20261212000000_platform_create_tenant.sql`, test
`supabase/tests/74_platform_create_tenant.test.sql`), `org.createSpace()` (`src/lib/org/service.ts`) y
`src/pages/admin/platform.astro`; smoke `scripts/smoke-new-space.cjs`.

## Cómo está hecho

- Migración `20261026000000_org.sql`: `delegation`, `membership.delegation_id`, `zone.delegation_id`, `platform_admin`
  (sin políticas: nadie con sesión lo lee ni se apunta), `is_superadmin()`, `is_global_manager()`, `manages_user()`,
  `set_member_delegation()`, `platform_overview()`. `is_member/is_manager/is_admin/my_role` cuentan al superadmin como admin.
  Políticas acotadas: propuestas, comisiones, pagos, ingresos, condiciones y zonas de cada persona.
  Test: `supabase/tests/44_org.test.sql`.
- App: `src/lib/org/` (datos Supabase/demo, servicio y `scope.ts`). La sesión lleva `superadmin`, `delegationId` y, para el
  gerente de zona, `team` (sus personas): los servicios de propuestas, equipo y comisiones filtran con `inTeam` (en demo es
  la única barrera; en Supabase, además, la RLS).
- Smoke: `scripts/smoke-org.cjs` (montar delegación, ver como gerente de zona, ver como superadmin).
- En demo: `super@cofundo.test` es superadmin.

## Cambiar de espacio

Abajo a la izquierda, la tarjeta del espacio. Si tienes acceso a más de uno (o eres superadmin), es un menú: «Tus
espacios», con el actual marcado y tu papel en cada uno. Al elegir otro se entra directo, sin tocar la URL.

- **Producción**: cada espacio vive en su dominio y la sesión es de ese dominio. `/admin/switch` comprueba que estás en
  ese espacio, pide a Supabase (service role) un enlace de un solo uso **para tu propio email** (sin enviar email) y te
  lleva a `https://<dominio>/admin/auth/confirm`, que abre la sesión allí. Sin service role, va a su login.
- **Demo**: el espacio se guarda en la cookie `ss_demo_tenant` (solo en la consola).
- Código: `src/lib/admin/spaces.ts` (lista, un minuto de caché por persona), `src/pages/admin/switch.ts`,
  `src/components/ui/ConsoleNav.astro`. Prueba: `scripts/smoke-spaces.cjs`.

## Propuestas: cada uno ve las suyas (octubre de 2026)

Pedido de Cristian (10-oct-2026): a un comercial no le deben salir arriba las propuestas de otros.

- **Comercial**: en Propuestas solo ve las suyas (también en «¿Copiar una propuesta anterior?» y en Preparar
  mensaje). Una propuesta de otro no se abre ni por enlace (404). Las que no tienen autor (de ejemplo o del alta del
  espacio) tampoco le salen en la lista.
- **Admin y gerentes**: por defecto, las suyas; el desplegable «Comercial» enseña todo el equipo, las de una persona
  o las que no tienen autor. En Analítica, lo mismo: equipo, mías o un comercial concreto (para ver si sus clientes
  abren las propuestas).
- **Dar copia a un comercial** (editor de la propuesta, solo admin o gerente): cada uno recibe su copia en borrador
  (mismos módulos, textos, sector, receta y fotos), con él como autor, en el idioma que se elija. Ver docs/I18N.md.
- La base de datos no cambia: la RLS sigue dejando leer al equipo (lo usan «Qué ha funcionado» y las cuentas). El
  recorte es de pantalla y del editor. Pruebas: contrato del servicio y `scripts/smoke-proposal-owners.cjs`.
