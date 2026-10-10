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
«Solo comprobar» desmarcado. Si aún no tiene usuario, se le invita. Quitarlo: `ADMIN_EMAILS=… npx tsx scripts/superadmin.ts --remove`.
Entra en cada espacio por su dominio (la Plataforma tiene un «Entrar» por espacio); dentro es admin aunque no sea miembro.

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
