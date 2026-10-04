# 01 · La empresa y el producto

_Enjoy the Club · exportado el 2026-10-04 de `tenants/enjoy/tenant.json`._

Qué es, qué vende, cómo funciona y cuánto cuesta. Es lo primero que aprende un comercial.

> **Para quien revise esto (persona o agente):** cambia el texto todo lo que quieras, pero **no cambies las `key`** (así sé qué
> pieza sustituye a cuál). Si algo sobra, márcalo **[QUITAR]**; si falta, añádelo como **[NUEVO]** con una `key` inventada
> en minúsculas y guiones. Respeta los límites de cada campo (están en «04 · Cómo lo usa el comercial»).


## 1. Qué es y cómo se presenta (jugadas generales de tipo «Cómo presentarlo»)

### Enjoy en una frase · `empresa-pitch`

El público escanea un QR, sin descargar nada, y **sube fotos, manda mensajes y pide canciones** que salen en la pantalla. Quien organiza lo controla todo desde su móvil.

- **Pantalla Lite:** navegador o Smart TV, se abre y listo.
- **Pantalla Desktop:** en un ordenador; con NDI se pone encima de los visuales que ya hay.
- **Álbum:** todas las fotos de la noche, descargables.

**Cuándo:** Los primeros 30 segundos de cualquier conversación.
**Por qué funciona:** Cuenta lo que pasa en la sala, no la herramienta: nadie compra «interactividad».

### El activo es el consentimiento · `gen-consentimiento`

Quien sube una foto acepta los términos de uso: quien organiza puede usar ese contenido en sus redes y su comunicación.

Ninguna cámara, kiss cam ni fotomatón da eso.

**Por qué funciona:** Es lo único que nadie más ofrece, y responde a «¿y los derechos de imagen?» antes de que salga.

### Lo que existe hoy (y a veces no se vende) · `gen-hoy`

Está en producción y se puede enseñar:

- Fotos del público en pantalla, con validación.
- Álbum colaborativo, **con descarga de las fotos**.
- Mensajes en pantalla, con o sin foto.
- Peticiones de canciones, con menú abierto o cerrado, con o sin dedicatoria.
- **Mensajes a pantalla en tiempo real desde el móvil del responsable.**
- Pantalla Lite (navegador, Smart TV) y Desktop (NDI sobre los visuales).
- Consentimiento de uso comercial del contenido.
- Analítica de participación.

**Una pantalla:** hoy se controla una sola. En recintos con varias, la conversación es qué pantalla y en qué momento.


### Llegar con la marca detrás · `fest-modelo-b`

Hay dos formas de vender un festival. Que lo pague el festival, o que lleguemos con una marca que ya quiere activar allí. En el segundo, el festival deja de preguntarse cuánto le cuesta y pasa a preguntarse cuánto le dan por ponerlo: de gasto pasa a ingreso. Es lo que los propios festivales dijeron que preferirían.

**Las conversaciones con marcas las lleva fundador.** El comercial detecta qué marca patrocina cada festival, quién lleva esa relación y si nos presentan, y lo pasa.


## 2. Visión, estrategia y objetivos

> **HUECO — hoy no existe en la app.** Aprende explica el producto, a quién se vende y cómo, pero no **por qué** la empresa
> hace lo que hace ni **qué objetivos** persigue. Es lo que convierte a un comercial en alguien que cree en lo que vende.

Rellenar (cada punto, 2–5 frases, en el tono de la empresa):

- `vision` · **La visión:** por qué esto es tan grande. Qué cambia en una fiesta cuando el público es protagonista.
- `estrategia-bandera` · **Plantar la bandera en todas partes:** por qué hay cosas gratis (p. ej. la pantalla «Lite» / el
  modelo para bares) y qué se gana con estar en cada local antes que nadie.
- `estrategia-djs` · **Los DJ como canal:** por qué importan, qué ganan ellos y cómo nos abren puertas.
- `objetivos` · **Objetivos de este año:** cuántos locales/eventos, en qué ciudades, qué sector primero y por qué.
- `modelo` · **Cómo gana dinero la empresa** (y el cliente): cuotas, comisión por peticiones, packs… y qué NO se vende todavía.
- `por-que-ahora` · **Por qué ahora:** qué pasa en el mercado (ocio nocturno en caída, móviles, redes) que lo hace urgente.
- `no-somos` · **Lo que no somos:** para no prometer de más.

Dónde saldrá: un bloque nuevo al principio de Aprende («Por qué existimos») antes del recorrido del producto, y como
contexto para el guion de cada reunión.

Piezas que ya rozan esto (están en «03»; quizá deban moverse aquí): «El DJ: menú cerrado y propinas para el equipo» (`noche-dj-menu`), «Sal con fecha de prueba» (`noche-prueba-hoy`), ««Me va a romper el ambiente musical del local»» (`noche-obj-dj`), «Lo que existe hoy (y a veces no se vende)» (`gen-hoy`), «La venta en barra: existe hoy y está infravendida» (`gen-venta-barra`), «Roadmap 2027 (se cuenta, no se vende)» (`gen-roadmap`), «Qué precio está validado y cuál no» (`gen-precio-validado`), «"Ya trabajamos con un DJ que hace cosas parecidas"» (`loc-obj-proveedor`).

## 3. Así funciona, de principio a fin (el recorrido de 1 minuto)

Lo ve todo comercial nada más entrar. Cada paso: título (≤ 80), texto (≤ 240) y lo que se enseña al lado.

1. **El invitado escanea el QR** — Sin descargar nada. Lo abre con la cámara y ya está dentro.  
   _Se enseña:_ `phone:scan` (UI real del producto)
2. **Pide una canción o manda un mensaje** — Desde su móvil: una dedicatoria, una foto, la canción que quiere bailar.  
   _Se enseña:_ `phone:sheet` (UI real del producto)
3. **Aparece en la pantalla** — Lo que manda se ve en grande, en directo. Todo el mundo lo mira.  
   _Se enseña:_ `screen:club.message,club.song` (UI real del producto)
4. **Kiss cam, pero voluntaria** — Sale quien quiere salir, y al subir su foto acepta los términos. El momento que nadie olvida, sin el marrón.  
   _Se enseña:_ `screen:club.photo,tp.photo` (UI real del producto)
5. **Todo queda en el álbum** — Fotos y mensajes de la noche, guardados para quien lo contrata.  
   _Se enseña:_ `phone:album` (UI real del producto)
6. **Quien contrata ve el resultado** — Participación, momentos y su marca en cada pantalla. Por eso repite.  
   _Se enseña:_ `report` (UI real del producto)

## 4. Qué ofrecemos (los módulos de la propuesta)

Cada módulo es un bloque de la propuesta que recibe el cliente. Aquí, lo que dice cada uno.

### Pantalla en vivo · `pantalla-en-vivo`

_La pantalla del local, interactiva: reclamo, canción, foto, dedicatoria y modo transparente._  
Tipo: `live-screen`

- **Antetítulo:** Pantalla en vivo
- **Título:** Así se verá en {company}
- **Entradilla:** Toca cada pantalla: es la misma que se proyecta en el local.
- **Pantallas que se enseñan (y la frase que dice el comercial en cada una):**
  - **Reclamo** (`club.idle`): Lo que se ve el 90 % de la noche: un QR gigante. El anzuelo: sin esto no entra nadie.
  - **Canción** (`club.song`): Su canción a pantalla completa, con su nombre y su dedicatoria. El momento de cine.
  - **Foto** (`club.photo`): Su foto en grande y entera (nunca se recorta una cara). Es lo que más se comparte.
  - **Dedicatoria** (`club.message`): Un mensaje delante de toda la sala. Se cobra aparte y funciona solo.
  - **Encima de tus visuales** (`tp.idle`): ¿Ya tienes visuales y VJ? Nos ponemos encima sin tocarlos: el QR va en una tarjeta.
  - **Foto en tarjeta** (`tp.photo`): En modo transparente las peticiones salen en tarjeta pequeña: no tapan el show.

### Móvil del invitado · `movil-invitado`

_El recorrido del invitado en su móvil: escanea, pide, sube su foto y sale en pantalla._  
Tipo: `phone-tour`

- **Antetítulo:** Cómo lo vive el invitado
- **Título:** Sin descargar nada, desde su móvil
- **Entradilla:** Toca cada paso: así pide, sube su foto y sale en la pantalla de {company}.
- **Pasos del móvil** (fijos en el código; dime si quieres cambiar el texto): Escanea · Llega al evento · ¿Qué quiere hacer? · Su foto/mensaje · Pendiente (paga 2 €, solo se cobra si se acepta) · ¡En pantalla! · Álbum · Pide su canción.

### Experiencias en directo · `tabs-experiencias`

_Kiss-cam, dedicatorias, peticiones y álbum: lo que vive cada invitado._  
Tipo: `tabs-showcase`

- **Antetítulo:** Experiencias
- **Título:** Todo lo que pasa en tu evento, en el móvil de cada invitado
- **Pestaña «Kiss-cam»:** Kiss-cam en pantalla gigante — Los invitados envían su momento y aparece en directo. _(Moderación previa)_
- **Pestaña «Dedicatorias»:** Dedicatorias que se leen en voz alta — Mensajes desde el móvil, proyectados en el momento justo. _(Sin descargar app)_
- **Pestaña «Retos»:** Retos y votaciones por mesa — Gamificación ligera para que nadie se quede sentado. _(Premios del local)_

### Enjoy para tu sala · `tabs-locales`

_Enjoy dentro de la oferta de la sala: un extra que vende o regala._  
Tipo: `tabs-showcase`

- **Antetítulo:** Para {company}
- **Título:** Tu sala, con algo que la competencia no tiene
- **Pestaña «Pack sala»:** Enjoy incluido en tu oferta — Un extra diferencial que puedes vender o regalar. _(Margen para el local · Lo dejamos configurado contigo en una videollamada de 20 minutos)_
  - Chat de ejemplo: «Sábado tenemos lleno» → «Te lo dejo configurado y con vuestro logo»
- **Pestaña «Datos»:** Datos de cada evento — Participación y momentos top de cada evento. _(Informe post-evento)_

### Precio de la propuesta · `pricing`

_El precio de la propuesta, claro y sin sorpresas._  
Tipo: `pricing-card`

- **Antetítulo:** Inversión
- **Título:** Propuesta para {company}
- **Entradilla:** Lo dejamos configurado contigo, con vuestra marca, sin pedir nada a tu equipo.
- **Incluye:** Configuración guiada contigo en 20 minutos · Personalización con vuestra marca · Informe post-evento
- **Letra pequeña:** Suscripciones con permanencia de 6 meses (sin permanencia si lo necesitáis). Eventos puntuales, pago único.
- **Botón:** Reservar fecha

### Portada para bodas · `hero-bodas`

_La portada de la propuesta, con el nombre de los novios._  
Tipo: `hero-pitch`

- **Antetítulo:** Propuesta para {company}
- **Título:** La boda de la que todos van a _(palabras que rotan: hablar / acordarse / presumir)_
- **Entradilla:** Enjoy convierte cada momento de la boda en algo compartido: mensajes, fotos y canciones de los invitados, en la pantalla y en un álbum para siempre.

## 5. Tarifas

Lo que el comercial elige en la propuesta: primero el tipo y luego la tarifa (★ = la típica, va preseleccionada).

| Sector | Tipo | Tarifa | Precio |
|---|---|---|---|
| Locales de ocio nocturno | Local | ★ Local pequeño (hasta 150) | 99 € /mes |
| Locales de ocio nocturno | Local | Local mediano (150–500) | 249 € /mes |
| Locales de ocio nocturno | Local | Local grande (más de 500) | 499 € /mes |
| Locales de ocio nocturno | Local | Validación · 5 primeros locales | 99 € /mes |
| Locales de ocio nocturno | Local | Noche suelta en local | 150 € /evento |
| Locales de ocio nocturno | Caseta de feria | ★ Caseta · feria completa (hasta 7 días) | 290 € pago único |
| Locales de ocio nocturno | Caseta de feria | Caseta · día suelto | 90 € /evento |
| Promotoras de eventos | Promotora | ★ Evento de promotora | 150 € /evento |
| Promotoras de eventos | Promotora | Promotora · eventos ilimitados | 390 € /mes |
| Conciertos y artistas | Charanga u orquesta | ★ Charanga u orquesta · evento | 120 € /evento |
| Conciertos y artistas | Charanga u orquesta | Charanga u orquesta · temporada (mayo–septiembre) | 390 € pago único |
| Conciertos y artistas | Sala de conciertos | ★ Sala hasta 1.000 | 600 € /evento |
| Conciertos y artistas | Sala de conciertos | Sala 1.000–5.000 | 1200 € /evento |
| Conciertos y artistas | Sala de conciertos | Sala 5.000–20.000 | 2500 € /evento |
| Conciertos y artistas | Agencia de conciertos | ★ Agencia o promotora · fechas ilimitadas | 1500 € /mes |
| Festivales | Festival | Festival hasta 5.000 | 1200 € /evento |
| Festivales | Festival | ★ Festival 5.000–20.000 | 2500 € /evento |
| Festivales | Festival | Infraestructura de temporada | 1500 € /mes |
| Conciertos y artistas | Sala de conciertos | Sala +20.000 · **A medida · no se cotiza sin prueba de carga** | A medida |
| Festivales | Festival | Festival +20.000 · **A medida · no se cotiza sin prueba de carga** | A medida |
| Festivales | Activación de marca | Activación de marca en festival · **Desde 3.000 € · la lleva fundador, no el equipo comercial** | desde 3000 € /evento |

Las marcadas «a medida» se ven en la propuesta con su aviso, pero no se pueden elegir.

## 6. Descuentos (cupones)

Regla: ningún descuento sin contrapartida.

| Código | Qué es | Valor | Contrapartida |
|---|---|---|---|
| `PACK5` | Pack de 5 o más fechas (−20 %) | 20 % | Contrapartida: fechas comprometidas por escrito. |
| `GRUPO25` | Grupo con varios locales (−25 %) | 25 % | Contrapartida: todos los locales, no uno de prueba. |
| `CIUDAD20` | Ajuste de ciudad (−20 %) | 20 % | Sin contrapartida: es ajuste de mercado. |
| `PRIMERA50` | Primera fecha o primer año (−50 %) | 50 % | Contrapartida: caso con nombre, testimonio a cámara y derecho de tanteo en la siguiente edición. |
