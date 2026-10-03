# Zonas y cuentas

El objetivo es que nadie «bombardee» un local que ya trabaja un compañero, que cada venta se pague a quien toca y que cada vendedor sepa en segundos qué es suyo, qué está libre y con quién comparte zona.

## Conceptos

- **Zona:** árbol libre por espacio de trabajo (país › región › provincia › ciudad › zona). Una zona incluye todo lo que tiene dentro: quien cubre la Comunidad Valenciana cubre Valencia y Castellón. Sirve igual para Corea o Brasil.
- **Zonas de cada persona** (`membership_zone`): definen «Mi zona» en Cuentas y quiénes son tus **vendedores de zona**, con teléfono (WhatsApp, llamada) y email. El teléfono se pone en *Mi cuenta*.
- **Cuenta:** el local o centro (Club Sol, un centro de buceo…), con zona, sector, dirección, referencia externa (id de Google Maps o del CRM, para importar sin duplicados) y notas.
- **Reserva:** quien contacta una cuenta la tiene reservada **N días** (30 por defecto, configurable). Cada contacto o propuesta renueva la reserva. Si caduca, la cuenta vuelve a estar libre.
- **Bloqueo:** el admin o jefe/a puede bloquear una cuenta con un motivo («El dueño ha pedido no recibir más comerciales»). Nadie puede reservarla y ninguna venta en ella genera comisión.
- **Cliente:** al ganar una venta elegible, la cuenta pasa a ser cliente de quien la vendió. Si se deshace la venta, vuelve a estar en trabajo.

## Qué ve cada uno

| Estado | Para quien la mira |
|---|---|
| Libre | «Me la quedo» en un clic |
| Tuya | Reservada para ti hasta una fecha; registrar contacto, crear propuesta, soltarla |
| De otra persona | Quién la trabaja y hasta cuándo; «si la vendes tú, no generará comisión» |
| Tu cliente / Cliente de otro | Quién la ganó |
| Bloqueada | El motivo |

Los colaboradores no ven el CRM: venden en las cuentas que les asigna el admin (docs/PARTNERS.md).

## Elegibilidad para comisión

Se calcula **en la base de datos** al marcar una propuesta como ganada (`dossier_account_sync` → `account_eligibility_for`). El cliente no puede escribirla. Las mismas reglas, en TypeScript, están en `src/lib/accounts/rules.ts` para la demo, y el contrato comprueba que coinciden.

| Resultado | Cuándo |
|---|---|
| `eligible` | Cuenta libre o tuya, en tu zona (si las zonas son estrictas) |
| `claimed_by_other` | Reservada por otra persona o cliente de otra persona |
| `blocked` | Cuenta bloqueada |
| `out_of_zone` | Con «solo comisión en su zona», fuera de tus zonas |
| `no_account` | Con «exigir cuenta del CRM», venta sin cuenta vinculada |

Si no es elegible, el admin y los jefes/as reciben un aviso (`account_conflict`) y deciden en la propuesta o en Territorio: **pagar comisión** o **sin comisión**. Hasta que deciden, la venta no cuenta para comisiones. Las ventas de colaboradores en sus cuentas asignadas son siempre elegibles.

## Configurar (Territorio)

- **Zonas:** solo admins.
- **Quién cubre qué:** admins y jefes/as.
- **Reglas** (solo admins): días de reserva, solo comisión en su zona, exigir cuenta del CRM.
- **Importar CSV** (admins y jefes/as): columnas `nombre`, `ciudad` o `zona`, `dirección`, `referencia`, `notas`. Las zonas se buscan por nombre, sin tildes ni mayúsculas. Una referencia repetida no se duplica. Las cuentas importadas entran libres. Este es el camino para cargar locales scrapeados de toda España.

## Precios por región (propuesta)

Para el MVP: **mismo precio en todas partes + cupones** como palanca de negociación (ver comisiones). Cuando haga falta diferenciar:

1. **Lista de precios por zona** (`price_list` con `zone_id` y precio por módulo). La propuesta toma la lista de la zona de su cuenta y, si no hay, la de la zona padre. Es la misma herencia del árbol: «Comunidad Valenciana» vale para Valencia salvo que Valencia tenga la suya.
2. **Rango permitido** por módulo y zona (mínimo y máximo): el comercial ajusta dentro del rango y fuera necesita aprobación, con un aviso nuevo del mismo tipo que los conflictos.
3. **Moneda por zona** (Corea en KRW, Brasil en BRL), con el formato del idioma del usuario.

No se ha implementado todavía: se decidirá con datos de las primeras semanas.

## Pruebas

- `supabase/tests/33_accounts.test.sql`: reserva, intento de quitársela, venta de cuenta ajena, decisión, cliente, deshacer, bloqueo, zonas estrictas, caducidad y colaborador sin acceso.
- `src/lib/accounts/rules.test.ts`: reglas puras.
- `src/lib/accounts/accounts.contract.ts`: el mismo contrato en demo y en Postgres + PostgREST.
- `scripts/smoke-accounts.cjs`: recorrido en el navegador.
