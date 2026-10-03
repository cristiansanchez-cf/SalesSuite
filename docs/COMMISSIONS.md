# Comisiones

Esto no puede fallar: con estas cifras se hacen facturas. El diseño prioriza que cada euro sea **trazable** (de qué ingreso sale, con qué regla y por qué), **reproducible** (volver a calcular no cambia ni duplica nada) y **difícil de tocar por error** (lo aprobado no se edita; se corrige con ajustes).

## 1. De dónde sale el dinero: eventos de ingreso

Todo lo que genera comisión llega como un **evento de ingreso normalizado** (`revenue_event`), venga de donde venga:

| Tipo | Ejemplo | Base de la comisión |
|---|---|---|
| `sale` | Enjoy: paquete de 1.000 € | Lo que ingresa la empresa: 1.000 € |
| `recurring` | Suscripción mensual de 90 € | Cada cuota: 90 € |
| `volume` | Oquea: el centro procesa 9.000 € (35 transacciones) por su pasarela; Oquea se queda el 3 % | El ingreso de la empresa: 9.000 € × 3 % = 270 € |
| `metric` | 120 peticiones de canciones este mes en el QR de un local | No hay importe: activa **bounties** |
| `refund` | Devolución de una venta | Resta la comisión de la venta original, en proporción |

Cada evento guarda:
- el importe bruto (`amount`);
- el ingreso de la empresa (`revenue`, o `take_rate` para calcularlo);
- la moneda, la fecha, la cuenta, quien vende (si se sabe), la oferta o paquete (`offer`, p. ej. `pack-1000`) y, para métricas, `metric` y `quantity`.

**Importes en céntimos enteros.** Nunca decimales en coma flotante.

**Idempotencia:** `(origen, external_id)` es único. Reenviar el mismo evento no hace nada. Reenviarlo con importes distintos se **rechaza** (409), nunca se sobrescribe dinero en silencio.

### Cómo entran

1. **Venta declarada** al ganar una propuesta: importe, oferta y fecha. Queda *pendiente de confirmar* por un admin.
2. **API** `POST /api/v1/events` con la clave API del espacio (se guarda solo su hash). Eventos ya en nuestro formato.
3. **Conectores** (`POST /api/v1/ingest/<conector>`): para APIs externas con su propio formato. El admin define un **mapeo** (ruta de cada campo, constantes y multiplicadores; p. ej. `revenue = data.fee * 100`) y la app lo convierte a eventos normalizados. Es el «enrutamiento» de APIs raras: el formato externo no toca el motor.

## 2. A quién se atribuye

En este orden:
1. quien vende indicado en el evento;
2. el autor de la propuesta vinculada;
3. quien ganó la cuenta (`won_by`);
4. quien la tiene reservada.

Para ventanas como «los 6 primeros meses» se usa la fecha en la que se ganó la cuenta.

Si la venta tiene un **conflicto de cuenta** (docs/ACCOUNTS.md) sin aprobar, la línea se crea como **no elegible**, con el motivo. Así queda constancia y se ve por qué no se paga.

## 3. Cuánto: planes y reglas

- Cada persona tiene un **plan**. Si no tiene ninguno, se le aplica el plan por defecto del espacio.
- Un plan es una lista ordenada de **reglas**: **gana la primera que encaja**. Esto lo hace predecible: no hay sumas ni prioridades ocultas.
- **MVP:** «¿Comisiones iguales en todo?» → **Sí: un porcentaje** (una regla sin condiciones). Lo demás son **excepciones** que se colocan encima.

Condiciones (todas opcionales; si hay varias, deben cumplirse todas):
- tipo de evento;
- oferta o paquete;
- zonas (con sus subzonas);
- tramo de importe;
- meses desde que se ganó la cuenta (desde / hasta);
- rol de quien vende (p. ej. colaboradores).

Pagos:
- **Porcentaje** en puntos básicos (30 % = 3000 pb) sobre el ingreso de la empresa.
- **Fijo** por evento.
- **Bounty:** si una métrica de una cuenta llega a un umbral en un mes natural, se paga un importe fijo una vez por cuenta y mes. Ejemplo: QR de peticiones instalado y más de 100 peticiones en un mes → 30 €.

Ejemplos:

| Caso | Regla |
|---|---|
| Enjoy, todo igual | `30 %` |
| Paquete grande | `offer = pack-3000 → 10 %`, encima de la general |
| Paquete pequeño | `offer = pack-300 → 50 %` |
| Los DJ comisionan menos | Plan «Colaboradores» con `20 %` asignado a los DJ, o regla `rol = partner → 20 %` |
| Corea más | `zona = Corea → 40 %` |
| Oquea | `tipo = volume, meses 0–6 → 70 %` (del 3 % de take rate) |
| QR de canciones | `tipo = metric, métrica = song_requests, umbral 100/mes → 30 €` |

**Referidos:** el plan puede pagar a quien invitó un % de las comisiones de su invitado durante N meses desde que entró. Ejemplo: DJ Antonio cobra un 10 % de lo que gane DJ Sebastián el primer año. Sale de `membership.invited_by`.

**Redondeo:** al céntimo, mitad hacia arriba, en aritmética entera. Solo se redondea una vez por línea.

## 4. El libro (ledger)

Cada cálculo crea **líneas** (`commission_entry`):
- persona, evento, regla aplicada (con su texto en ese momento), base, importe, periodo (mes) y motivo;
- una **clave de deduplicación** única (`ev:<evento>:commission:<persona>`, `bounty:<regla>:<cuenta>:<mes>:<persona>`…). Procesar dos veces no duplica nada.

Ciclo de vida:

```
pendiente → aprobada → pagada
    ↘ anulada        (solo desde pendiente)
no elegible          (con motivo; un admin puede aprobarla si decide pagarla)
```

- **Lo aprobado no se edita ni se borra** (trigger en Postgres). Un error se corrige con un **ajuste**: una línea nueva, positiva o negativa, con motivo obligatorio.
- Cambiar un plan **no recalcula** lo ya calculado. «Recalcular pendientes» anula las líneas pendientes y vuelve a procesar con el plan actual.
- **Liquidación:** por persona y periodo, junta lo aprobado no liquidado y **congela el total a pagar**. Marcarla como pagada pasa sus líneas a pagadas. Lo que llegue después va al saldo vivo del periodo siguiente.

## 5. Quién ve qué

| | Comercial / colaborador | Jefe/a de ventas | Admin |
|---|---|---|---|
| Sus líneas y liquidaciones | Sí, con la explicación de cada euro | Sí | Sí |
| Las de todo el equipo | No | Solo lectura | Sí |
| Planes, eventos, aprobar, liquidar, claves API | No | No | Sí |

## 6. Cupones

Catálogo de cupones del espacio (30 %, 10 %, mes gratis…) que el admin crea como palancas de negociación, con usos máximos y caducidad (Comisiones → Cupones).

- El equipo interno lo elige en el precio de la propuesta. Los colaboradores no aplican cupones.
- El cliente ve el precio anterior tachado y el nombre del cupón.
- La propuesta guarda una **copia** del descuento (trigger `dossier_coupon_apply`): editar o desactivar el cupón no cambia lo ya enviado. Los usos, la caducidad y si está activo los valida Postgres.
- Como la comisión se calcula sobre lo que de verdad ingresa la empresa (el evento), un descuento reduce la comisión sin reglas extra.

## 7. Garantías y pruebas

- Motor puro en TypeScript (`src/lib/commissions/engine.ts`) con tests exhaustivos:
  - cada ejemplo de esta página;
  - idempotencia (procesar dos veces = cero líneas nuevas);
  - una devolución completa deja la comisión neta en cero;
  - el redondeo nunca crea ni pierde céntimos frente al cálculo exacto en más de medio céntimo por línea;
  - no hay importes negativos salvo devoluciones y ajustes.
- Postgres impone lo que no puede depender del código:
  - unicidad de eventos y de claves de línea;
  - inmutabilidad de lo aprobado;
  - RLS (cada uno ve lo suyo);
  - importes enteros.
- Contrato en demo y en Postgres + PostgREST.
