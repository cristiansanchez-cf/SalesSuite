# Correcciones para el agente que carga datos en la app de ventas

**3 de octubre de 2026 · Enjoy the Club**

---

## LEE ESTO PRIMERO

Al cargar el playbook en la app se han introducido **datos que nadie te dio**: precios, duraciones, funcionalidades y promesas de servicio que no existen en ningún documento fuente. No son errores de transcripción: son campos que se rellenaron inventando un valor plausible en lugar de dejarlos vacíos.

Esto es grave porque el playbook lo lee un comercial que no conoce el producto, y lo que diga aquí se lo dirá a un cliente.

**Reglas para esta corrección y para todo lo que cargues a partir de ahora:**

1. **Si un dato no está en el documento fuente, el campo se deja vacío o se marca `PENDIENTE`.** Nunca se rellena con un valor razonable.
2. **Ninguna funcionalidad se nombra si no está en la lista de «Lo que existe hoy» (`gen-hoy`).** Si no está ahí, no existe.
3. **Ningún precio sale de la tabla de tarifas de `01 · sección 5`.** No hay precios en otros sitios.
4. **Ninguna promesa de servicio** (montaje, soporte, horarios, informes automáticos, formación) se incluye si no está escrita literalmente en el fuente.
5. Si dudas entre dos opciones, marca `PENDIENTE` y pregunta.

A continuación, campo por campo, qué está mal y qué hay que poner.

---

## A. PRECIOS INVENTADOS — quitar

### A.1 `tabs-experiencias` → «Precio por defecto: 450 €»
**No existe.** Los módulos de la propuesta **no llevan precio propio**. El precio de la propuesta es uno solo y sale en el módulo `pricing`, tomado de la tabla de tarifas.

**Acción:** quitar el precio del módulo o ponerlo a 0.

### A.2 `tabs-locales` → «Precio por defecto: 300 €»
Mismo caso. **Acción:** quitar.

### A.3 `02 · festivales` → Tamaño de la venta: «3.000–20.000 € (ejemplo)»
**Inventado.** La cifra real de la tabla de tarifas es otra.

**Sustituir por:**
> 1.200–2.500 € por evento; infraestructura de temporada desde 1.500 €/mes. Si entramos con una marca que lo paga, la activación va desde 3.000 €. Todas sin validar: no hemos cerrado ningún festival.

### A.4 `02 · bodas` → Tamaño de la venta: «300–900 € por boda (ejemplo)» y Ciclo: «2–8 semanas»
**Ambos inventados.** En bodas no hemos cobrado nunca, así que no hay ni precio ni ciclo.

**Sustituir ambos por:** `PENDIENTE · sector sin validar, nunca hemos cobrado una boda`

---

## B. FUNCIONALIDADES QUE NO EXISTEN — quitar o verificar

Ninguna de estas aparece en `gen-hoy`. Si alguna existe de verdad, hay que añadirla primero a `gen-hoy` y luego usarla. Si no, se quita.

| Dónde | Qué dice | Problema |
|---|---|---|
| `tabs-experiencias` → pestaña Retos | «Ranking en directo» | No está en `gen-hoy`. ¿Existe un ranking? |
| `tabs-experiencias` → pestaña Dedicatorias | «Exportables al final» | Lo que se descarga son **fotos**. ¿Se exportan también los mensajes? |
| `tabs-experiencias` → pestaña Kiss-cam | «Branding del evento» | ¿Hasta dónde llega la personalización? Hay que concretarlo o quitarlo |
| `tabs-locales` → pestaña Datos | «Reseñas al terminar» | No recogemos reseñas. **Quitar** salvo que exista |
| `tabs-locales` → pestaña Datos | «Informe automático» | ¿El informe post-evento es automático o lo hace una persona? |
| `tabs-locales` → pestaña Pack sala | «Formación en 1 hora» | **Falso.** La configuración es una videollamada de **20 minutos** |

**Corrección confirmada de la última:**
> **Pack sala:** Enjoy incluido en tu oferta — Un extra diferencial que puedes vender o regalar. _(Margen para el local · Lo dejamos configurado contigo en una videollamada de 20 minutos)_

---

## C. PROMESAS DE SERVICIO QUE NO PODEMOS CUMPLIR

### C.1 `pricing` → «Incluye: Montaje y soporte en directo»

**El error más grave de todos.** Promete presencia física y soporte durante el evento. No existe equipo de montaje, y el soporte no tiene horario comprometido. Además contradice nuestro mejor argumento con producción y tour managers: *«cero montaje, no pedimos nada a tu equipo»*.

### C.2 `pricing` → «Sin permanencia»

Contradice la permanencia de 6 meses de las tarifas de suscripción.

**Sustituir el módulo `pricing` completo por:**

> - **Incluye:** Configuración guiada contigo en 20 minutos · Personalización con vuestra marca · Informe post-evento
> - **Letra pequeña:** Suscripciones con permanencia de 6 meses. Eventos puntuales, pago único.

### C.3 `tabs-locales` → chat de ejemplo

Dice: *«Sábado: 180 invitados confirmados» → «Perfecto, pantalla montada a las 19h»*. Vuelve a dar a entender que montamos pantallas físicamente.

**Sustituir por:**
> «Sábado tenemos lleno» → «Te lo dejo configurado y con vuestro logo»

### C.4 [NUEVO] La excepción de festivales

En locales la configuración es una videollamada de 20 minutos y no hace falta que vaya nadie. **En festivales, la primera vez, sí tiene sentido que vaya un comercial**: hay más dudas, más interlocutores y más que perder.

**[NUEVO] `fest-acompanamiento` · Acompañamiento presencial en festivales**

> En locales no hace falta que vaya nadie: se configura en una videollamada de 20 minutos. En un festival, la primera edición es distinta — hay producción, patrocinadores y mucha gente preguntando. Ahí sí vamos presencialmente la primera vez.
>
> **Es una excepción de festivales y se dice como tal.** No se promete en locales, ni en conciertos de sala, ni en ediciones siguientes del propio festival. Y no aparece en el módulo de precio como algo incluido por defecto.

---

## D. CORRECCIONES DE CONTENIDO QUE YA ESTABAN EN EL FUENTE

Estas no son invenciones, son matices mal recogidos.

### D.1 `02 · ocio-nocturno` → Ciclo de venta
Dice «prueba el mismo día». **Sustituir por:**
> Días. En persona, miércoles por la mañana (llega el reparto del distribuidor: hay alguien con llaves y están receptivos). Jueves como segunda opción. Lunes y martes no: libran. Se cierra con **fecha de prueba** antes de colgar, aunque la prueba sea la siguiente noche que abran.

### D.2 `02 · ocio-nocturno` → Tamaño de la venta
**Sustituir por:**
> 99–499 €/mes (supuesto; hoy pagan 67–100 €/mes). Noche suelta 150 €. Caseta de feria 290 € la feria completa.

### D.3 `02 · promotoras` → Tamaño de la venta
**Sustituir por:**
> 150 € por evento, o 390 €/mes con eventos ilimitados. Histórico: una promotora pequeña pagó 70 €/evento con el producto antiguo.

### D.4 Recorrido, paso 4
**Sustituir por:**
> **Kiss cam, pero voluntaria** — Sale quien quiere salir, y al subir su foto acepta los términos. El momento que nadie olvida, sin el marrón.

---

## E. TARIFAS QUE FALTAN EN `01 · sección 5`

| Sector | Tipo | Tarifa | Precio |
|---|---|---|---|
| Conciertos y artistas | Sala de conciertos | Sala +20.000 | A medida · requiere prueba de carga |
| Festivales | Festival | Festival +20.000 | A medida · requiere prueba de carga |
| Festivales | Activación de marca | Activación de marca en festival | desde 3.000 € /evento |

Las dos «a medida» llevan aviso visible: **no se cotizan sin prueba de carga**. La de activación de marca: **la lleva fundador, no el equipo comercial**.

---

## F. PIEZAS NUEVAS QUE FALTAN

### `gen-seguimiento` · Lo que de verdad nos ha hecho perder clientes
> Almería, Altare, Batiq Fest, Shark Events, Bresh, Topamin Fest, The Lab, Deep Delay y la tercera promotora: todos dijeron que sí, y todos se perdieron por no hacer seguimiento. Ninguno se perdió por precio, por producto ni por competencia.
>
> Noche 1: mirar los datos y escribir al día siguiente **con el resultado**, no preguntando «¿qué tal?». Semana 1: llamada corta. Mes 1: revisión y petición de referencia. Cierre de temporada: contactar **antes** de que reabra — Altare se perdió exactamente ahí.

### `gen-cobertura` · Lo primero que se comprueba
> La cobertura es lo que más rompe, con diferencia. Si no hay, no hay producto: la gente no puede escanear. Se comprueba antes de vender y, si no la hay, se dice y no se vende. Pasó en Pastrami y en El Portón, en plena calle de la feria.

### `fest-modelo-b` · Llegar con la marca detrás
> Hay dos formas de vender un festival. Que lo pague el festival, o que lleguemos con una marca que ya quiere activar allí. En el segundo, el festival deja de preguntarse cuánto le cuesta y pasa a preguntarse cuánto le dan por ponerlo: de gasto pasa a ingreso. Es lo que los propios festivales dijeron que preferirían.
>
> **Las conversaciones con marcas las lleva fundador.** El comercial detecta qué marca patrocina cada festival, quién lleva esa relación y si nos presentan, y lo pasa.

### `fest-una-pantalla` · Una pantalla, no el recinto
> Hoy manejamos una pantalla. Un festival tiene varias. La conversación es **en qué pantalla y en qué momento**, no «cubrimos vuestro recinto». Si no se acota en la primera reunión, el cliente se imagina todo el festival y lo descubre el día del montaje. El manejo múltiple está en roadmap: se cuenta como dirección, nunca con fecha.

### `bodas-aviso` · Lo que ha pasado hasta ahora en bodas
> Bodas es el sector del que menos sabemos y el único donde nunca hemos cobrado. Hubo 12 leads, pricing cerrado y resellers definidos: a los organizadores que iban a pagarnos 300 €/mes les pareció buena idea y no pagó ninguno; a los resellers con 100 € de base les pareció bien y no revendió ninguno. Cuando un precio le parece bien a todo el mundo y no compra nadie, el problema no es el precio. No es prioridad hasta 2027 y todo lo que hay aquí son hipótesis.

### `gen-no-robot` · Estructura, no guion
> Todo lo que hay en este playbook es estructura y munición, no texto para recitar.
>
> *Alfonso y Cristian:* «Tú no necesitabas un script cuando conociste a tu pareja. 'Espérate, cita 17, seguimiento 17, cariño'. Qué absurdo sería. Quítate el script, fluye en la conversación. Tienes que tener una estructura, unas bases: preguntas abiertas, cerradas, de dirección, de psicología inversa. Y sabiendo que hay estos tipos de preguntas, yo sé cuándo tirar de una y cuándo de otra. Necesitaría tantos guiones como personas existen en el mundo.»

### `gen-filtro-mensajes` · Filtro antes de mandar nada
> - Verbos de lo que hiciste («he mirado vuestro Instagram»), no de lo que sentiste («me quedé pensando en vuestro proyecto»).
> - Si lo averiguaste después, dilo así. Fingir familiaridad previa se detecta.
> - Nada de negar para plantar la idea: «no vengo a venderte nada».
> - Adjetivos valorativos solo con el dato detrás.
> - Una sola fecha concreta. «Hablamos la semana que viene» es un cierre inexistente.
>
> Dos pruebas: si el mensaje sirve para otro cambiando solo el nombre, no está terminado. Y todo lo que diga que sabes tiene que ser cierto.

### `gen-video-fundamentos` · Manda el vídeo antes de la llamada
> Un vídeo corto de los fundamentos, visto antes de la llamada, hace que el cliente llegue casi convencido y que la llamada sea para preguntar y no para explicar *(Alfonso y Cristian)*. Para Enjoy: dos o tres minutos de la pantalla funcionando en una sala real. **PENDIENTE: ese vídeo todavía no existe.**

---

## G. Verificación final antes de dar por buena la carga

Para cada campo cargado, el agente debe poder responder: **¿de qué frase del documento fuente sale esto?** Si no hay frase, el campo se vacía.

Revisar especialmente todo lo que sea: un número, una duración, un plazo, un porcentaje, el nombre de una funcionalidad o una promesa de servicio.
