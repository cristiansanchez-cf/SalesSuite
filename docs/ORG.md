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
