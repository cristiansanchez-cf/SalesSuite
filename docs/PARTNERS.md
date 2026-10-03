# Colaboradores (partners): vendedores puntuales con acceso limitado

> Un **DJ** que vende Enjoy en los tres locales donde pincha. Un **monitor de buceo autónomo** que vende Oquea en sus centros. No son del equipo, pero pueden vender: necesitan una versión de la consola que solo les enseñe lo suyo, sin la tarifa y sin poder tocar precios.

## 1. Qué es (y qué no)

| | Comercial (rep) | Colaborador (partner) |
|---|---|---|
| Entra con | Código por email (o contraseña) | **Código por email**, sin contraseña |
| Ve dossiers | Todos los del equipo | **Solo los suyos** |
| Crea propuestas | Libres | **Solo para sus cuentas** (locales, centros…) que asigna el admin |
| Módulos | Todo el catálogo | **Solo los que el admin le permite** (p. ej. 1, 2 y 3, no el 4) |
| Precios | Los ve y los ajusta | **Nunca ve la tarifa ni toca precios**: los fija la política de cada cuenta |
| Playbook | Todo lo oficial + trucos del equipo; aporta | Lo oficial de **sus** módulos, **sin monetización**; trucos del equipo solo si el admin lo permite; **no aporta** (vota «me funcionó») |
| Mercado | Todos los sectores | Solo los sectores de **sus cuentas** |
| Cosas solo para él | — | **Su guía** (nota de bienvenida) e **indicaciones por cuenta** |
| Caducidad | — | Opcional: al caducar no entra, sus propuestas se conservan |

**El líder de ventas** de momento es el admin (lo pediste así). Un rol de líder separado (gestiona playbook y colaboradores, pero no marca ni catálogo) es fácil de añadir más adelante: sería otro valor del mismo enum y otra lista de permisos.

## 2. Precio por cuenta: lo decide el admin

Cada cuenta del colaborador tiene una **política de precio**:

| Política | El cliente ve | Para qué |
|---|---|---|
| **Sin precios** (por defecto) | Propuesta sin precios | El colaborador abre la puerta y la empresa negocia |
| **Precio de tarifa** | El precio de catálogo | Cuentas estándar |
| **Precio especial** | Tarifa ± un % (de −90 % a +200 %) | Más barato para un local amigo, o más caro donde haga falta |

- El precio se aplica **solo** al añadir un módulo; el colaborador ve el resultado («405 €»), nunca la tarifa ni el %.
- Si el admin **cambia la política**, se recalculan las propuestas de esa cuenta, **también las ya enviadas** (el enlace muestra el precio nuevo).
- El admin puede abrir cualquier propuesta del colaborador y ajustar un precio a mano.
- Ojo: si la cuenta muestra precios, el colaborador los ve en *su* propuesta (es lo que envía). Lo que nunca ve es la tarifa general, los precios de otras cuentas ni la monetización del playbook.

## 3. Flujo

1. **Admin → Equipo → Invitar colaborador:** email, módulos permitidos, fecha de fin (opcional) y nota de bienvenida.
2. En su ficha, el admin **añade sus cuentas** (nombre, sector, política de precio e indicaciones). Ve en directo qué precio verá el cliente en cada módulo.
3. El colaborador recibe la invitación por email y pulsa el botón. Las siguientes veces: **email → código de 6 dígitos → dentro**.
4. Entra en **Mis cuentas**: su guía, sus cuentas con las indicaciones del admin y «Nueva propuesta» en cada una. El sector se rellena solo.
5. Construye la propuesta con sus módulos, la publica, envía el enlace y apunta el **próximo paso**. «Aprende» y «Preparar mensaje» funcionan igual, limitados a lo suyo.
6. El admin ve sus propuestas en su ficha (y en el listado general) con autor y cuenta.

## 4. Cómo está construido (seguridad)

- **Base de datos** (`supabase/migrations/20261007000100_partner.sql`): `is_member()` pasa a significar «equipo interno», así que **todas las políticas existentes quedan cerradas para el partner** y lo que puede ver se abre política a política (`is_partner()` comprueba también la caducidad).
- **Tarifa:** el partner no puede leer `module_version` (es donde está el precio). Catálogo e items le llegan por las RPC `partner_catalog` / `partner_items`, sin `default_price`.
- **Precios:** triggers `zz_partner_dossier_guard` y `zz_partner_item_guard` fijan el modo y el precio por la política de la cuenta e ignoran cualquier precio que intente poner; `partner_account_reprice` reaplica los cambios del admin.
- **App** (`src/lib/partner/scope.ts`): las mismas reglas sobre los datos, para que la demo (sin RLS) se comporte igual. Los tests de contrato las ejecutan contra la demo **y** contra Postgres + PostgREST + RLS reales, incluida una prueba de «defensa en profundidad» con un cliente sin el filtro de la app.
- **Tests:** `supabase/tests/28_partner.test.sql` (RLS/RPC/triggers), `src/lib/partner/partner.contract.ts` y `scripts/smoke-partner.cjs` (E2E: código, Mis cuentas, precio bloqueado, aislamiento, gestión y caducidad).

## 5. Demo

`dj@enjoy.test` (*DJ Dani*): Experiencias y Locales; cuentas **Sala Luna** (sin precios), **Club Neón** (−10 %) y **Terraza Sur** (tarifa). En `/admin/login` escribe su email: en demo el código aparece en pantalla.

## 6. Decisiones abiertas (para hablar)

1. **¿Aportan al playbook?** Hoy no (solo votan). Propuesta: que puedan proponer trucos que pasen por la bandeja del líder antes de verse.
2. **¿Publican solos?** Hoy sí: publican y envían. Alternativa: «enviar a revisión» y que el admin publique, al menos para cuentas con precio especial.
3. **Comisiones:** ya queda registrado quién creó cada propuesta, de qué cuenta y su resultado (ganado/perdido). El cálculo y la liquidación serían la siguiente pieza.
4. **¿Puede el colaborador dar de alta cuentas nuevas?** Hoy solo el admin. Podría proponerlas (pendientes de aprobar).
5. **Líder de ventas:** rol aparte cuando haga falta (ver §1).
