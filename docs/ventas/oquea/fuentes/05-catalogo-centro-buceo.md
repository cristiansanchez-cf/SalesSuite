# OQUEA · Catálogo de módulos del dossier · Tipo de cliente: centro de buceo

**Versión v0 · 6 de octubre de 2026 · Textos en español, pendientes de traducción**

> **Regla para el agente que monta el dossier:** el texto de cada módulo se usa literal. No se añaden cifras, fechas, porcentajes, nombres de clientes ni funciones que no estén en este documento. Si una variable entre corchetes no tiene valor, el módulo no entra. Un hueco es correcto; un hueco relleno con algo plausible es un error.

> **Estado:** Oquea no tiene clientes de pago ni datos de uso. El dossier no incluye casos de éxito, testimonios ni cifras de resultados, porque no existen.

---

## 1. Las tres decisiones

El dossier se monta con tres decisiones independientes.

### 1.1 Tipo de cliente

Este catálogo cubre **centro de buceo**. `PENDIENTE` catálogos para ONG, tour operador y federación o certificadora.

### 1.2 Ángulo · uno solo, nunca mezclados

El ángulo es lo que le mueve a ese centro. Lo elige el comercial después del descubrimiento.

| `angulo` | Cuándo se elige | Evidencia | Nunca decir |
|---|---|---|---|
| `abrir_mercado` | Recibe o quiere recibir buceadores de otros países | `HECHO` Primera necesidad expresada por los centros en la feria de Brasil | Cuántos clientes recibirá ni cuándo. Que Oquea «trae» clientes |
| `cobro_online` | Cobra solo en persona y le interesa cobrar online | `HECHO` 3 de los centros firmantes lo han pedido | Fechas como compromiso. Porcentajes. Que la pasarela ya existe |
| `que_vuelvan` | Le preocupa no saber quién bucea con él ni volver a contactarles | `SUPUESTO` Interés declarado, sin validar | Campañas, automatización, remarketing. Insinuar que hoy pierde clientes por su culpa |
| `viaje_de_club` | Organiza viajes de buceo con sus propios clientes | `SUPUESTO` Sin validar; aún no se ha planteado a ningún centro | Descuentos concretos. Que Oquea venderá viajes a sus clientes |

Si el comercial no ha elegido ángulo, se usa `abrir_mercado` fuera de España y `que_vuelvan` en España. `PROPUESTA`, por validar.

### 1.3 Tramo de precio

Hoy existe un único tramo: `fundador_sin_coste`. La dimensión se mantiene separada para cuando haya tarifas. `PENDIENTE` todos los demás tramos.

---

## 2. Reglas generales

**Tope de módulos**

- Versión argumentario: 7 módulos como máximo.
- Versión apoyo visual: 5 módulos como máximo.

`PROPUESTA`; ajustar a las plantillas de la aplicación.

**Orden de prioridad cuando se cumplen más reglas de las que caben**

1. Obligatorios: `portada`, `como_funciona`, `red_fundadores`, `condiciones`, `siguiente_paso`.
2. `tu_nombre_en_cada_inmersion`.
3. `tus_buceadores`.
4. `perfil_y_mapa`.
5. `album`.
6. `eventos`.
7. `en_preparacion`.

**Las dos versiones**

- **Argumentario:** el comercial no va a estar delante. Lleva el texto completo de cada módulo.
- **Apoyo visual:** lo cuenta el comercial. De cada módulo solo el titular y la captura; sin párrafos. Los módulos `condiciones` y `siguiente_paso` mantienen el texto completo en las dos versiones.

**Plantilla de cada módulo:** `PENDIENTE`, la asigna el agente de la aplicación según las plantillas disponibles. Aquí se indica solo el tipo de contenido.

---

## 3. Módulos

### `portada`

- **Posición:** 1
- **Regla:** siempre.
- **Contenido:** titular + nombre del centro + fecha.
- **Texto literal, según ángulo:**
  - `abrir_mercado`: «[Centro], centro fundador de la red internacional de Oquea»
  - `cobro_online`: «[Centro] en Oquea: del QR en el barco al cobro online»
  - `que_vuelvan`: «[Centro]: quién bucea contigo, y cuántas veces»
  - `viaje_de_club`: «[Centro] y la red de centros fundadores de Oquea»
- **Fuente:** entrevista 6-oct-2026.

### `como_funciona`

- **Posición:** 2
- **Regla:** siempre.
- **Contenido:** tres pasos con captura de cada uno.
- **Texto literal:**
  > **1. Creas la inmersión.** Hora, punto de inmersión y tipo. Los datos del punto ya están cargados: profundidad máxima, tiempo habitual, visibilidad, vida marina.
  >
  > **2. El buceador escanea tu QR.** Elige la inmersión de hoy y la guarda. Su logbook queda relleno sin escribir nada.
  >
  > **3. A ti te queda el registro.** Cada buceador que guarda una inmersión entra en tu lista, con todo lo que ha hecho contigo.
- **Fuente:** producto en producción, entrevista 6-oct-2026.

### `tu_nombre_en_cada_inmersion`

- **Posición:** 3
- **Regla:** siempre que quepa. Prioridad 2.
- **Contenido:** captura de las tres tarjetas.
- **Texto literal:**
  > El buceador puede exportar una tarjeta de su inmersión para compartirla. Hay tres: la de la inmersión, la de récord personal y la de hito.
  >
  > En todas aparece el nombre de tu centro.
- **Condición:** `PENDIENTE` confirmar que las tres variantes están en producción. Si solo hay una, el texto se reduce a esa.
- **Nunca:** decir que la tarjeta muestra el perfil de la inmersión.
- **Fuente:** captura de pantalla 6-oct-2026.

### `tus_buceadores`

- **Posición:** 4
- **Regla:** ángulo `que_vuelvan`; o el centro dijo en el descubrimiento que no guarda datos de quien bucea con él.
- **Contenido:** captura de la lista.
- **Texto literal:**
  > Tu lista de buceadores se llena sola: cada persona que guarda una inmersión con tu QR aparece en ella, con su histórico en tu centro.
  >
  > También puedes añadir buceadores a mano. Reciben un correo para confirmar.
  >
  > Hoy la lista sirve para saber quién ha buceado contigo y cuántas veces.
- **Nunca:** campañas, envíos, descuentos automáticos, remarketing.
- **Fuente:** producto en producción, entrevista 6-oct-2026.

### `perfil_y_mapa`

- **Posición:** 5
- **Regla:** ángulo `abrir_mercado` o `viaje_de_club`.
- **Contenido:** captura del perfil del centro y del mapa.
- **Texto literal:**
  > Tu centro tiene un perfil público en Oquea: web, idiomas, ubicación, equipo, certificadoras y contacto.
  >
  > Aparece en el mapa junto a los puntos de inmersión y los demás centros. Hoy el mapa cubre España, Latinoamérica y Corea.
- **Nunca:** cifras de visitas o de buceadores registrados.
- **Fuente:** producto en producción, entrevista 6-oct-2026.

### `album`

- **Posición:** 6
- **Regla:** el centro dijo que comparte fotos con sus clientes por WhatsApp o que hace fotos en las inmersiones.
- **Contenido:** captura del álbum.
- **Texto literal:**
  > Cada inmersión tiene un álbum compartido. El centro y los buceadores suben sus fotos y todo el grupo las ve, durante treinta días. Sin pedir teléfonos.
- **Fuente:** producto en producción, entrevista 6-oct-2026.

### `eventos`

- **Posición:** 6 (alternativo a `album`)
- **Regla:** el centro colabora con una ONG o participa en limpiezas u otras acciones.
- **Contenido:** captura de un evento en el mapa.
- **Texto literal:**
  > Las ONGs organizan eventos en Oquea, como limpiezas, en los que participan varios centros a la vez. La gente se inscribe desde el mapa en el centro más cercano, y tú ves quién va a venir al tuyo.
- **Nunca:** decir que el centro puede crear sus propios eventos. Hoy solo los crean las ONGs.
- **Fuente:** producto en producción, entrevista 6-oct-2026.

### `red_fundadores`

- **Posición:** penúltimo bloque de contenido, antes de `condiciones`.
- **Regla:** siempre.
- **Contenido:** texto, sin cifras.
- **Texto literal, según ángulo:**
  - `abrir_mercado`:
    > Oquea está firmando con centros de distintos países para que los buceadores de unos conozcan a los otros. Los primeros en firmar son los centros fundadores de la red.
    >
    > Es un proyecto internacional y va por fases. Hoy empieza con tu centro en el mapa y tu QR en el barco.
  - `cobro_online`:
    > Los centros fundadores serán los primeros en probar lo que Oquea está preparando, empezando por la reserva y el cobro online.
    >
    > Si te interesa, queda escrito en el acuerdo.
  - `que_vuelvan`:
    > Lo que venga después de la lista de buceadores lo vamos a construir con los centros fundadores. Sois los que decís qué hace falta.
  - `viaje_de_club`:
    > Los centros fundadores de otros países quieren recibir grupos. Si organizas viajes con tus buceadores, la red es un lugar donde encontrar a quién ir.
- **Nunca:** «cooperativa». Número de centros. Nombres de centros sin permiso escrito. Porcentajes de descuento.
- **Fuente:** entrevista 6-oct-2026. Ángulo `viaje_de_club`: `SUPUESTO`.

### `en_preparacion`

- **Posición:** después de `red_fundadores`.
- **Regla:** solo en ángulo `cobro_online`, y solo en versión argumentario. En cualquier otro caso no entra.
- **Contenido:** texto breve, sin fechas.
- **Texto literal:**
  > **En preparación.** Reserva y cobro online desde Oquea. No está disponible todavía. Se avisará a los centros fundadores cuando lo esté.
- **Condición:** fuera de España este módulo no entra hasta que la revisión legal de pagos internacionales esté cerrada. `PENDIENTE`.
- **Nunca:** fecha, porcentaje, ni la palabra «próximamente».
- **Fuente:** entrevista 6-oct-2026.

### `condiciones`

- **Posición:** penúltimo.
- **Regla:** siempre. Texto completo en las dos versiones.
- **Contenido:** tres bloques.
- **Texto literal:**
  > **Hoy.** El alta, el QR, el logbook de tus buceadores, la lista y el perfil en el mapa no tienen coste.
  >
  > **Cuando Oquea te lleve un cliente nuevo.** Oquea se queda un 10 % de esa reserva, en los términos del acuerdo. Si no hay reserva, no hay comisión.
  >
  > **Más adelante.** Habrá funciones de pago. Se presentarán antes a los centros fundadores, y cada centro decidirá si las contrata.
  >
  > **Lo que pedimos.** El acuerdo firmado, el QR a la vista en el barco o en el local, y que el equipo lo mencione en el briefing.
- **Condición:** `PENDIENTE` texto literal del acuerdo y base de cálculo del 10 %. Si el acuerdo de ese mercado no recoge el 10 %, el segundo bloque no entra.
- **Nunca:** precios de suscripciones futuras. Porcentaje de la pasarela.
- **Fuente:** entrevista 6-oct-2026; cartas de intención firmadas.

### `siguiente_paso`

- **Posición:** último.
- **Regla:** siempre. Texto completo en las dos versiones.
- **Contenido:** tres pasos + contacto del comercial.
- **Texto literal:**
  > 1. Firmamos el acuerdo de centro fundador.
  > 2. Damos de alta el centro y creamos tu primera inmersión.
  > 3. Dejamos el QR puesto.
  >
  > Dentro de treinta días revisamos juntos cuántas inmersiones se han registrado. Fecha: [fecha de revisión].
  >
  > [Nombre del comercial] · [teléfono]
- **Condición:** si no hay fecha de revisión, la línea de la revisión no entra.
- **Fuente:** guion de campo v0.

---

## 4. Lo que nunca aparece en un dossier de centro de buceo

- Casos de éxito, testimonios o logotipos de otros centros.
- Cifras de uso, de buceadores, de centros o de resultados.
- Promesas de clientes nuevos, de ingresos o de retorno.
- Fechas de funciones futuras.
- Reservas, pagos, viajes, cursos, campañas, WhatsApp o facturación como funciones disponibles.
- Descuentos entre centros.
- Precios de suscripciones.
- La palabra «cooperativa».
- Comparaciones con competidores o con las aplicaciones de las certificadoras.
- Cualquier dato de estrategia interna, márgenes o comisiones del comercial.

---

## 5. Pendientes para cerrar este catálogo

1. Plantillas disponibles en la aplicación y asignación por módulo.
2. Texto literal del acuerdo, por mercado.
3. Confirmación de las tres tarjetas en producción.
4. Nombre definitivo de la red.
5. Traducciones: coreano, portugués de Brasil, inglés. Con revisión de alguien del país.
6. Validar en campo los ángulos `que_vuelvan` y `viaje_de_club`.
7. Capturas actualizadas de cada pantalla, con la versión del QR del 7 de octubre.
