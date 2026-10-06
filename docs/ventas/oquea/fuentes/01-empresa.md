# OQUEA · Empresa, producto y modelo de negocio

**Versión v0 · 6 de octubre de 2026 · Fuente: entrevistas con Cristian (CTO)**

> **Regla para el agente que carga este documento:** si un dato no está aquí, se queda vacío o `PENDIENTE`. No se rellena con un valor plausible. Revisa específicamente números, porcentajes, fechas y promesas de servicio.

> **Estado de este documento:** Oquea no tiene todavía datos de uso ni ningún cliente de pago. Todo lo que no esté marcado como `HECHO` es `SUPUESTO`, `PREVISIÓN` o `PENDIENTE`.

Etiquetas usadas:
- `HECHO` — existe o ha pasado.
- `PREVISIÓN` — estimación interna de fecha. No es un compromiso y no se vende.
- `SUPUESTO` — hipótesis sin validar en campo.
- `PENDIENTE` — dato que falta. No se dice en una reunión.
- `SOLO EQUIPO INTERNO` — no lo ve un colaborador externo ni un cliente.

---

## 1. Qué es Oquea

`HECHO` Oquea es una plataforma para buceadores y centros de buceo. El buceador escanea el QR del centro y la inmersión se guarda en su logbook digital ya rellena. El centro obtiene la lista de los buceadores que han pasado por él, con su histórico.

`HECHO` Hay tres tipos de perfil: buceador, centro de buceo y ONG. Una misma persona puede gestionar uno o varios centros y tener además su perfil de buceador.

---

## 2. Qué existe hoy · lista cerrada

Solo lo que está en esta lista se puede enseñar y contar como disponible.

### 2.1 Para el centro (web de administración)

| Función | Detalle | Estado |
|---|---|---|
| Alta de centro | Como centro de buceo o como ONG. Una persona puede gestionar varios centros | `HECHO` |
| Equipo | El equipo del centro entra en la aplicación con roles (owner, admin) | `HECHO` |
| Dive sites | El centro crea sus puntos de inmersión con datos precargados: profundidad máxima, tiempo habitual, visibilidad, vida marina | `HECHO` |
| Inmersiones | Se crea un slot con hora. Disciplina: scuba, freediving o snorkel. Tipo: fun dive, discover scuba diving o curso | `HECHO` |
| Slot sin dive site | El centro deja el sitio sin configurar y el primer buceador que escanea lo define; se puede corregir después | `PENDIENTE` confirmar que está en producción |
| My Center | Perfil público del centro: web, idiomas, ubicación en el mapa, equipo, contacto, certificadoras | `HECHO` |
| QR del centro | Un QR único por centro, para poner en el barco o en el local. Versión mejorada prevista para el 7 de octubre de 2026 | `HECHO` · confirmar la publicación antes de salir a campo |
| Lista de buceadores (CRM) | Cada buceador que registra una inmersión con el QR entra automáticamente, con el histórico de lo que ha hecho en el centro | `HECHO` |
| Alta manual de miembros | El centro añade a un buceador a mano; este confirma por correo | `HECHO` |
| Asociación entre centros | Se puede crear en la aplicación. **No tiene ninguna funcionalidad** | `HECHO` · no se enseña como función |

### 2.2 Para el buceador

| Función | Detalle | Estado |
|---|---|---|
| Escaneo del QR | Ve las inmersiones de hoy del centro y, en una opción secundaria, las de los 3 días anteriores | `HECHO` |
| Guardar inmersión | Crea su perfil, le pone nombre y se guarda en el logbook con los datos del dive site ya rellenos | `HECHO` |
| Logbook | Histórico de todas sus inmersiones | `HECHO` |
| Tarjeta exportable | Tres variantes: inmersión, récord personal e hito. Incluyen el nombre del centro ("with [centro]") | `HECHO` según captura · `PENDIENTE` confirmar que las tres están en producción |
| Álbum colaborativo | Fotos de la inmersión compartidas entre participantes y centro durante 30 días | `HECHO` |
| Mapa | Dive sites, centros y ONGs. Hoy solo con datos de España, Latinoamérica y Corea | `HECHO` |
| App móvil iOS y Android | — | `PENDIENTE` confirmar si ya está en las tiendas o llega en noviembre |

### 2.3 Para la ONG

| Función | Detalle | Estado |
|---|---|---|
| Eventos | La ONG crea un evento (por ejemplo, una limpieza) en el que participan varios centros a la vez. El público se inscribe desde el mapa en el centro más cercano y cada centro ve quién va a venir | `HECHO` · hoy solo las ONGs pueden crear eventos |

### 2.4 Datos que faltan del producto

- `PENDIENTE` Idiomas en los que están la web del buceador y el panel del centro (crítico para Corea).
- `PENDIENTE` Si el consentimiento de comunicación comercial se recoge ya en el registro.
- `PENDIENTE` Si la gráfica de la tarjeta de récord representa datos reales de la inmersión. Hasta confirmarlo, **no se dice que Oquea muestra el perfil de la inmersión**.

---

## 3. Qué NO existe hoy · no se vende

Ninguno de estos puntos se presenta como disponible, ni como «próximamente», salvo compromiso con fecha y por escrito en el acuerdo.

- Reservas online.
- Pasarela de pago o enlaces de pago.
- Trips (viajes) y cursos como productos propios.
- Campañas de email, descuentos automáticos o cualquier automatización sobre la lista de buceadores.
- Integración con WhatsApp.
- Descuentos cruzados entre centros. La asociación existe en la aplicación pero no hace nada.
- Facturación.
- Lectura de ordenadores de buceo.
- Eventos creados por centros que no sean ONG.

**Cómo se describe hoy la lista de buceadores:** «la lista de quién ha buceado contigo y cuántas veces». No se le llama remarketing ni fidelización automática: hoy el centro la consulta y contacta él mismo.

---

## 4. Previsiones internas · `SOLO EQUIPO INTERNO`

Son estimaciones del equipo de producto. No son compromisos.

| Qué | Previsión interna |
|---|---|
| Reservas sobre un slot con enlace de pago (pasarela) | Finales de noviembre de 2026 |
| Mejoras de la lista de buceadores (CRM) · alcance `PENDIENTE` | Noviembre de 2026 |
| Eventos creables por cualquier centro | Noviembre de 2026 |
| Trips | Diciembre de 2026 – enero de 2027. Prioritarios porque desbloquean la red internacional |
| Suscripción de fidelización | Sin fecha |
| Facturación | Primer o segundo trimestre de 2027 |
| Cursos como producto propio | Sin fecha |
| Integración con un CRM de WhatsApp de terceros | Idea, sin decidir |

`HECHO` A los centros que ya han firmado se les dijo que la parte internacional «a lo mejor llegaba para diciembre».

**Regla de comunicación (`PROPUESTA`):** si un cliente pregunta por fechas, el comercial da siempre la fecha tardía del rango y la presenta como previsión. Pagos internacionales: pendientes de revisión legal; no se da fecha fuera de España hasta que esté cerrada.

---

## 5. Modelo de negocio

### 5.1 Hoy

`HECHO` Ningún centro paga por Oquea. El alta, el QR, el logbook y la lista de buceadores son gratuitos.

`HECHO` Nada de lo que sigue se ha cobrado todavía.

### 5.2 Líneas de ingreso planteadas

| Línea | Qué es | Cifra | Estado |
|---|---|---|---|
| Comisión por clientes nuevos | Oquea lleva al centro un grupo o cliente nuevo y se queda un porcentaje de lo generado | 10 % | `HECHO` aceptado de palabra por los centros de la feria de Brasil y recogido en los acuerdos firmados. `PENDIENTE` base exacta del cálculo (solo buceo o paquete completo). No cobrado |
| Comisión dentro de la red | El cliente llega desde otro centro de la red, con descuento cruzado entre ambos centros | En torno al 2 % · cifra no cerrada | `SUPUESTO` aceptado de palabra. Sin funcionalidad. `PENDIENTE` |
| Pasarela de pago | El centro cobra online a través de Oquea. Porcentaje menor, por volumen | `PENDIENTE` | `HECHO` interés declarado. No existe todavía |
| Suscripción de fidelización | Cuota mensual por herramientas de comunicación con los buceadores | `PENDIENTE` | Idea. Llegará después de la fase gratuita |
| Suscripción de facturación | Cuota mensual | 100–200 €/mes en España · adaptado por país | Idea. `SOLO EQUIPO INTERNO`. No se menciona |

### 5.3 Orden estratégico · `SOLO EQUIPO INTERNO`

1. Conseguir acuerdos firmados y el QR puesto en el mayor número posible de centros, en España, Latinoamérica y Corea.
2. Con la pasarela y los trips disponibles, empezar a generar transacciones entre centros de la red.
3. Cuando los centros vean uso real, introducir la suscripción de fidelización.
4. Facturación en 2027.

La prioridad declarada ahora es generar ingresos reales cuanto antes.

---

## 6. Qué vende hoy el comercial

Hoy el comercial no vende una suscripción. Consigue dos cosas en la misma visita:

1. **El acuerdo de centro fundador firmado.**
2. **El QR puesto y funcionando**, con al menos una inmersión creada.

Una firma sin QR en uso no cuenta como resultado. Un centro que firma y no usa Oquea se enfría, y a seis semanas vista no recuerda qué firmó.

### 6.1 Qué recibe el centro hoy (`HECHO`)

- Todo lo de la sección 2, sin coste.
- Su nombre en cada tarjeta que sus buceadores comparten.
- La lista de quién ha buceado con él.
- Su perfil en el mapa de Oquea.
- La condición de centro fundador de la red internacional.

### 6.2 Qué pide Oquea a cambio

- La firma del acuerdo.
- El QR visible en el barco o en el local, y que el equipo lo mencione en el briefing.
- `PROPUESTA` Un criterio de éxito a 30 días, escrito en el momento de la firma: número de inmersiones registradas con el QR. Cifra `PENDIENTE`: la fija cada centro con el comercial según su volumen.
- Si el centro quiere la pasarela: que lo deje por escrito («cuando esté disponible, la usaremos»).

### 6.3 Contenido del acuerdo

- `HECHO` Lo firmado hasta ahora son cartas de intención sin compromiso económico: comisión del 10 % sobre clientes nuevos europeos y permiso de exposición a la red de centros.
- `PENDIENTE` Texto literal del acuerdo. Hasta que esté cargado, el comercial no describe cláusulas de memoria.
- `PENDIENTE` Versión para España y versión para Corea (¿qué se considera «cliente nuevo» en cada mercado?).

### 6.4 Nombre de la red

`PENDIENTE` Nombre definitivo. Provisional en estos documentos: **red de centros fundadores**. No se usa la palabra «cooperativa»: es una figura jurídica concreta y no es lo que se está firmando.

---

## 7. A quién se vende

Dos situaciones de centro. No son segmentos de tamaño: un mismo centro puede ser las dos cosas.

| | Centro destino | Centro emisor |
|---|---|---|
| Qué es | Quiere recibir buceadores de otros países | Tiene buceadores locales que viajan |
| Dónde | Latinoamérica (validado) · Corea (`SUPUESTO`) | España (`SUPUESTO`) |
| Qué le mueve | Abrir mercado internacional | `PENDIENTE` · hipótesis: organizar los viajes de su club a destinos de la red con condiciones ya negociadas |
| Evidencia | `HECHO` En la feria de Brasil fue la primera necesidad que expresaron los centros. Muchos pueden montar el paquete completo salvo el vuelo: recogida, alojamiento, buceo | Ninguna. A los centros de España aún no se les ha planteado |

Quien decide habitualmente: el dueño o el instructor jefe (`SUPUESTO` general del sector, sin validar por cuenta).
Quien lo ejecuta: la persona que está en el barco y dice «escanead el QR». Si a esa persona le supone trabajo extra, el QR no se usa. `SUPUESTO` por validar en campo.

---

## 8. Situación comercial real a 6 de octubre de 2026

- `HECHO` Cero clientes de pago.
- `HECHO` Acuerdos firmados en Latinoamérica (Galápagos, Brasil y otros): 5, cifra por verificar. 3 de ellos han dicho que quieren usar la pasarela.
- `HECHO` Unos 12 centros en España han dicho que empezarán a usar el QR cuando salga la versión mejorada. Ninguno lo está usando todavía.
- `HECHO` No hay ningún dato de uso: ni inmersiones registradas, ni escaneos.
- `HECHO` A ningún centro de España se le ha hablado todavía de la red internacional.
- `HECHO` No hay ningún descuento cruzado ni acuerdo entre centros firmado.

**Consecuencia para el comercial:** no hay casos de éxito, cifras ni testimonios que citar. No se inventan. Los centros firmantes solo se nombran con su permiso por escrito; por defecto, versión anónima («operadores de Galápagos y Brasil»).

---

## 9. Condiciones del comercial · `SOLO EQUIPO INTERNO`

`HECHO` Intención declarada: el comercial que consiga un centro que use la pasarela se queda la mayor parte del porcentaje de Oquea durante al menos un año. Se ha mencionado el 70 % como ejemplo, no como cifra cerrada.

Todo lo demás está `PENDIENTE` y debe cerrarse por escrito antes de que nadie salga a campo:

- `PENDIENTE` Porcentaje definitivo.
- `PENDIENTE` Base de cálculo. Debe ser el margen neto de Oquea después del coste del proveedor de pagos, no el porcentaje bruto.
- `PENDIENTE` Qué lo devenga: volumen realmente procesado, no la firma.
- `PENDIENTE` Desde cuándo cuenta el año: firma o primera transacción.
- `PENDIENTE` Qué cobra el comercial por un acuerdo firmado con QR en uso pero sin pasarela.
- `PENDIENTE` Quién lleva la cuenta cuando el comercial deja de estar disponible.
- `PENDIENTE` Contrato de colaboración por país.

---

## 10. Lo que no se dice nunca

- Que Oquea trae clientes, o cuántos. Se explica el mecanismo: perfil en el mapa, red de centros y, cuando existan, reservas.
- Un porcentaje de descuento entre centros. No hay ninguno firmado.
- Una fecha de pasarela, reservas o trips como compromiso.
- Que la lista de buceadores hace remarketing o envía campañas.
- Cifras de uso, de centros activos o de buceadores. No existen.
- El precio de futuras suscripciones.
- Que Oquea es «el mejor» o «el más adaptado» del mercado. Se dice qué hace, y se enseña.
- El nombre de un centro firmante sin su permiso por escrito.
- «Cooperativa».

---

## 11. Pendientes para cerrar este documento

1. Texto literal del acuerdo firmado.
2. App móvil: disponible hoy o en noviembre.
3. Idiomas de la aplicación.
4. Slot sin dive site: en producción o no.
5. Tarjetas: las tres variantes en producción; naturaleza de la gráfica.
6. Consentimiento comercial en el registro.
7. Base de cálculo del 10 % y definición de «cliente nuevo» por mercado.
8. Proveedor de pagos y países en los que puede operar.
9. Condiciones del comercial (sección 9).
10. Nombre definitivo de la red.
