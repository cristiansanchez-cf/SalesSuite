# 05 · La propuesta (dossier) tal y como está hoy

> Para el agente de ventas. Lo escribe quien está construyendo la app, para que evalúes la propuesta que recibe el cliente y nos digas cómo debería ser.
> Va acompañado de **06 · Locales**, que baja todo esto a un sector concreto.

---

## 1. Quién te escribe

Soy Claude, el asistente de programación de Anthropic. Construyo la aplicación de ventas de Enjoy the Club (por dentro se llama *Cofundo Ventas*) con Cristian.

Mi trabajo es el código y cargar el contenido que me dais. **No decido qué se vende ni cómo.** Lo que vende la app sale de vuestros documentos: los guiones verificados, las correcciones de 01–04 y la tabla de tarifas. Cuando algo no tiene fuente, se queda vacío o en `PENDIENTE`.

Cristian me ha pedido que te cuente con detalle qué hace hoy la propuesta, para que tú definas cómo debería ser, sector por sector.

---

## 2. Qué es «la propuesta»

Es una página web que el comercial genera en un minuto y le manda al cliente como enlace. El cliente la abre en el móvil o en el ordenador. Hoy es **una presentación de nuestro producto**, no del problema del cliente. Cristian lo ha detectado y es lo que queremos cambiar.

### Cómo se monta (lo que hace el comercial)

1. Crea una propuesta y elige el **sector** del cliente: Locales de ocio nocturno, Promotoras, Conciertos, Festivales o Bodas.
2. La app **pone sola los módulos recomendados para ese sector**, ya ordenados.
3. El comercial puede:
   - **arrastrar** los módulos para cambiar el orden;
   - **ocultar** uno o **añadir** otro del catálogo;
   - elegir la **tarifa** (de la tabla oficial) y, si toca, un **cupón** de la tabla de descuentos;
   - **personalizar** con el logo del cliente, fotos y un vídeo de su local. Salen dentro de la pantalla en vivo.
   - marcar **qué tiene el cliente** (canciones, fotos, mensajes, álbum). Lo que no tiene no se enseña.
   - elegir el **estilo musical** de los ejemplos (las carátulas de canciones que se ven);
   - elegir si se ve **como presentación** (diapositivas, por defecto) o **hacia abajo**.
4. **Comparte el enlace.** La app registra cuándo la abren, cuánto tiempo pasan en cada parte y si se paran en el precio. Las aperturas del propio comercial no cuentan.
5. Si la tarifa tiene enlace de Stripe, el cliente puede **pagar desde la propuesta**.

En los textos, `{company}` se sustituye por el nombre del cliente y `{prospect}` por el de la persona.

### Cómo está hecha por dentro (lo justo para que puedas proponer)

- Cada propuesta es una **lista ordenada de módulos**.
- Cada módulo usa una **plantilla** (el diseño y el comportamiento) y lleva su **contenido** (los textos y las imágenes).
- Hay **5 plantillas** y **6 módulos** en el catálogo.
- **Esto es lo importante para ti:**
  - **Un módulo nuevo con una plantilla que ya existe** es solo contenido. Lo cargo en minutos: tú me das los textos y me dices qué imagen o qué UI debe verse.
  - **Una plantilla nueva** (un tipo de diapositiva que hoy no existe) es trabajo de programación. Es perfectamente posible, pero dime qué necesitas que haga y la construyo.
- En modo presentación, cada módulo es una diapositiva. «Móvil del invitado» se parte en 3.
- **Cambiar un módulo no rompe las propuestas ya enviadas.** Cada módulo tiene versiones y una propuesta enviada sigue con la suya hasta que el comercial la actualiza.

---

## 3. Las 5 plantillas (qué puede enseñar cada una)

| Plantilla | Qué es | Qué se puede poner |
|---|---|---|
| **Portada** (`hero-pitch`) | La primera diapositiva grande | Antetítulo, titular con palabras que rotan, subtítulo, botones y hasta 4 cifras destacadas |
| **Pestañas** (`tabs-showcase`) | Varias pestañas que pasan solas; cada una con título, texto, viñetas y una imagen o un chat simulado | De 1 a 6 pestañas; cada una con título (≤ 100), texto (≤ 400), hasta 5 viñetas y una imagen o un chat simulado |
| **Pantalla en vivo** (`live-screen`) | La pantalla real de Enjoy funcionando, con el nombre del local, sus fotos y su vídeo | Escenas: reclamo con QR, canción, foto, dedicatoria y modo encima de los visuales. Cada escena lleva una frase |
| **Móvil del invitado** (`phone-tour`) | Un móvil que se puede tocar y que hace el recorrido del invitado | Escanea → entra → elige → manda → pendiente → sale en pantalla → álbum → pide canción |
| **Tarjeta de precio** (`pricing-card`) | El precio de la tarifa elegida, con el cupón aplicado | Título, lo incluido, letra pequeña, botón de pago |

---

## 4. Los 6 módulos del catálogo, con su texto literal

### 4.1 Pantalla en vivo · plantilla Pantalla en vivo
- **Título:** «Así se verá en {company}» · *«Toca cada pantalla: es la misma que se proyecta en el local.»*
- **Escenas y lo que dice cada una:**
  1. **Reclamo:** «Lo que se ve la mayor parte de la noche: un QR gigante. El anzuelo: sin esto no entra nadie.»
  2. **Canción:** «Su canción a pantalla completa, con su nombre y su dedicatoria. El momento de cine.»
  3. **Foto:** «Su foto en grande y entera (nunca se recorta una cara). Y se queda en el álbum de la noche: fotos con permiso que el local puede usar en sus redes.»
  4. **Dedicatoria:** «Un mensaje delante de toda la sala, con o sin foto.»
  5. **Encima de tus visuales:** «¿Ya tienes visuales y VJ? Nos ponemos encima sin tocarlos: el QR va en una tarjeta.»
  6. **Foto en tarjeta:** «En modo transparente las peticiones salen en tarjeta pequeña: no tapan el show.»
- De fondo se ve el vídeo de una sala, o el del cliente si el comercial lo sube.

### 4.2 Móvil del invitado · plantilla Móvil del invitado
- **Título:** «Sin descargar nada, desde su móvil» · *«Toca cada paso: así pide, sube su foto y sale en la pantalla de {company}.»*
- **3 diapositivas:**
  - **Escanea y entra:** «Apunta con la cámara al QR de la pantalla o de la mesa. Sin descargar nada.» → «Entra en la página del local: lo que puede hacer, el DJ y las canciones más pedidas.» → «Elige y va directo: foto o mensaje en pantalla, o subir fotos al álbum.»
  - **Y sale en pantalla:** «Su nombre y una dedicatoria. El organizador lo revisa antes de que salga.» → «Ha pagado 2 €. Solo se cobra si se acepta; si no, se devuelve.» → «Sale en grande delante de todos. Y queda guardada en el álbum.»
  - **Y la noche sigue:** «Todas las fotos de la noche, para todos. Las suyas, marcadas.» → «Busca, pide y sube en la lista. Cuanta más gente la pide, antes suena.»

### 4.3 Experiencias en directo · plantilla Pestañas
- **Título:** «Todo lo que pasa en tu evento, en el móvil de cada invitado»
- **Kiss-cam:** «Kiss-cam en pantalla gigante» · «Los invitados envían su momento y aparece en directo.» · Moderación previa.
- **Dedicatorias:** «Dedicatorias que se leen en voz alta» · «Mensajes desde el móvil, proyectados en el momento justo.» · Sin descargar app.
- **Por mesa:** «Dinámicas por mesa» · «Un ejemplo de lo versátil que es: pon un número en cada mesa y que las mesas se escriban por la pantalla.» · «Los de la mesa 1 son muy guapos».

### 4.4 Enjoy para tu sala · plantilla Pestañas
- **Título:** «Tu sala, con algo que la competencia no tiene»
- **Pack sala:** «Enjoy incluido en tu oferta» · «Un extra diferencial que puedes vender o regalar.» · Margen para el local · Lo dejamos configurado contigo en una videollamada de 20 minutos. *(chat simulado: «Sábado tenemos lleno» / «Te lo dejo configurado y con vuestro logo»)*
- **Datos:** «Datos de cada evento» · «Participación y momentos top de cada evento.» · Informe post-evento.

### 4.5 Precio de la propuesta · plantilla Tarjeta de precio
- **Título:** «Propuesta para {company}» · *«Lo dejamos configurado contigo, con vuestra marca, sin pedir nada a tu equipo.»*
- **Incluido:** Configuración guiada contigo en 20 minutos · Personalización con vuestra marca · Informe post-evento.
- **Letra pequeña:** «Suscripciones con permanencia de 6 meses (sin permanencia si lo necesitáis). Eventos puntuales, pago único.»
- **Botones:** «Reservar fecha» (email) y «Pagar ahora» (si la tarifa tiene enlace de Stripe).

### 4.6 Portada para bodas · plantilla Portada
- «La boda de la que todos van a *hablar / acordarse / presumir*» + subtítulo. **Solo existe portada para bodas.**

---

## 5. Qué módulos pone la app sola en cada sector

| Sector | Orden por defecto |
|---|---|
| Locales de ocio nocturno | Pantalla en vivo → Móvil del invitado → Experiencias → Enjoy para tu sala → Precio |
| Promotoras | Pantalla en vivo → Móvil del invitado → Experiencias → Precio |
| Conciertos | Pantalla en vivo → Móvil del invitado → Experiencias → Precio |
| Festivales | Pantalla en vivo → Móvil del invitado → Experiencias → Precio |
| Bodas | Portada → … |

Es decir: **casi la misma propuesta para todos los sectores**. Solo cambian el nombre del cliente, sus fotos y el precio.

---

## 6. Lo que ya existe en la app y se podría usar para separar variantes

Hoy estos datos se guardan, pero **no cambian la propuesta**. Solo cambian el guion de la reunión del comercial.

- **Sector.**
- **Actores de la cuenta** (dueño, gerente, DJ, encargado, el de la puerta, quien lleva el Instagram…). Cada actor tiene un «ángulo» por módulo.
- **Situaciones**, que el comercial marca en la cuenta:
  - *Cómo es el sitio:* tiene pantalla · DJ residente · aforo de más de 500 · patrocinio de bebidas · celebra bodas.
  - *Temporada:* todo el año · solo verano · ferias y fiestas.
  - *Personalidad:* analítico · directo · expresivo · afable.
  - *Región.*
- **Tarifa elegida** (tramo de aforo).

**Se puede construir** que estos datos cambien la propuesta. Por ejemplo: «si el local tiene DJ residente → añade el módulo X», «si no tiene pantalla → quita la pantalla en vivo y enseña solo el móvil», «si es un pub con mesas → añade dinámicas por mesa». Y se pueden añadir situaciones nuevas (por ejemplo «noches flojas» o «pub con gente sentada»). **Necesito que tú definas las reglas.**

---

## 7. Nota de sinceridad: lo que no está bien o no está hecho

1. **Enseña el producto, no el problema del cliente.** No hay ni una diapositiva sobre lo que le preocupa a un local, a una promotora o a un festival. Tampoco hay una de «tu problema → lo que cambia».
2. **Es igual para todos los sectores.** Un pub pequeño con noches flojas y un festival de 20.000 personas reciben casi lo mismo.
3. **No hay portada salvo en bodas.** La propuesta de un local empieza directamente en la pantalla.
4. **Contradicciones con lo que ya habéis decidido:**
   - La pestaña **«Kiss-cam»** sigue en Experiencias. La kiss-cam no está en «Lo que existe hoy» y en «Lo que no somos» dice «No somos una kiss cam».
   - **«Informe post-evento»** sale en Enjoy para tu sala y en el Precio. En «Lo que existe hoy» pone «Analítica de participación», no un informe. Puede ser una promesa de servicio que no damos.
   - **«Enjoy para tu sala»** está pensado para bodas («un extra que puedes vender o regalar», «margen para el local»), pero sale por defecto en Locales de ocio nocturno.
   - **La canción** es la segunda escena de la pantalla y el último paso del móvil. El guion de locales dice: «Nunca se abre por aquí. Un dueño no ve valor en que le pidan canciones».
   - **Lo que más vende con un dueño**, la pantalla desde su móvil («chupito a 2 €»), **no aparece en la propuesta**. Solo está en el guion.
5. **No hay casos reales**: ni La Biblioteca, ni El Andén, ni Batiq. Tampoco testimonios ni cifras de clientes. Solo hay una cifra validada: las ~30.000 peticiones de canciones de 2025.
6. **Las fotos son de banco de imágenes libres** (fiestas genéricas), no de nuestros clientes. **No hay vídeo real del producto**: está en `PENDIENTE` en los guiones.
7. **El texto por módulo no se puede retocar cómodamente** desde la propuesta. Hoy se edita en el catálogo y vale para todos.
8. **La propuesta no recoge lo que dijo el cliente en el descubrimiento.** Por ejemplo, las respuestas a las cinco preguntas de locales.

---

## 8. Plantillas nuevas que puedo construir si las pides

Solo es la lista de lo que sé hacer. **Tú decides si hace falta alguna y con qué contenido:**

- **Problema → solución:** 2–4 tarjetas «lo que te pasa hoy / lo que cambia con Enjoy».
- **Caso real:** nombre del cliente (con su permiso), qué pasó, foto o vídeo y una cita.
- **Imagínatelo:** una sucesión de escenas de una noche concreta («martes 01:30, barra parada → mandas un mensaje a la pantalla → …») con la UI real.
- **Dinámicas:** galería de dinámicas posibles (por mesas, cuenta atrás, votaciones…), cada una con su ejemplo en pantalla. *Solo las que existan hoy o se puedan hacer con lo que existe.*
- **Lo que ya te cuesta:** la cuenta de la pregunta 3 de locales (horas del domingo editando fotos, lo que cobra quien viene a hacerlas) rellenada por el comercial con las cifras del cliente.
- **Cómo empezamos:** los pasos hasta la primera noche (configuración, prueba, primera noche).
- **Portada por sector.**
- **Respuestas a lo que te preocupa:** 3–4 objeciones habituales con su respuesta, para que el cliente se las encuentre resueltas.

---

## 9. Qué necesito que me devuelvas

Para **cada sector** (empezamos por Locales, documento 06):

1. **Las variantes** (las «separaciones») y **la pregunta o el dato que decide cada una**. Por ejemplo: «¿noches flojas? sí/no», «¿DJ residente? sí/no», «¿pub con mesas o discoteca?», «¿tiene pantalla?».
2. **Para cada variante, la lista de diapositivas en orden.** De cada una:
   - **Objetivo** (qué tiene que pensar el cliente al verla).
   - **Plantilla** (una de las 5 de arriba o una nueva del punto 8).
   - **Textos literales:** antetítulo, título, texto, viñetas y la frase de cada escena.
   - **Qué se ve** (qué escena de la pantalla, qué paso del móvil, qué imagen).
   - **Fuente:** de qué frase del guion o del documento sale. Si no hay fuente, márcalo `PENDIENTE`.
3. **Qué módulos actuales sobran, se quedan o se reescriben.**
4. **Qué no debe aparecer nunca** en la propuesta de ese sector.

Mismas reglas de siempre: no se cambia ningún dato sin fuente, no hay promesas de servicio que no damos, y solo se nombran funciones que estén en «Lo que existe hoy».
