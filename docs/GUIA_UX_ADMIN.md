# Guía de UX para una consola de administración

> **Para quien la reciba:** esto no es una norma estricta. Es lo que hemos aplicado en la consola de **Cofundo Ventas** y
> lo que ha hecho que Cristian la catalogue como «de muy alto nivel». Úsala con **tu propio design system y tu marca**:
> aquí no hay colores ni fuentes de Cofundo que copiar, sino decisiones y el porqué de cada una. Donde haya números
> (espacios, tiempos, tamaños), son los que nos funcionaron; ajústalos a tu sistema, pero mantén la proporción.

---

## 0. La idea en una frase

**Cada pantalla responde a una pregunta del usuario, enseña primero lo urgente, usa poco texto y deja aire.** Todo lo
demás sale de ahí.

---

## 1. Cómo piensa el usuario

Antes de diseñar una pantalla, escribe **quién llega y qué pregunta trae**. Si no cabe en una línea, la pantalla hace
demasiadas cosas.

| Quién | Qué pregunta trae | Qué necesita ver primero |
|---|---|---|
| Alguien nuevo (recién invitado) | «¿Qué es esto y qué hago yo aquí?» | Una bienvenida paso a paso que termina **haciendo** algo real |
| El que usa la herramienta a diario | «¿Qué tengo que hacer hoy?» | Lo vencido, después lo de hoy, después lo demás |
| El responsable o el CEO | «¿Va bien el negocio? ¿Quién necesita ayuda?» | Pocas cifras reales y lo que pide su decisión |
| Quien configura (admin) | «¿Está todo listo para que el equipo trabaje?» | Un asistente con valores por defecto y qué falta |

Cómo se comporta de verdad la gente (y qué hemos hecho por eso):

- **No lee, escanea.** Una frase de ayuda como mucho; el resto, en «¿Qué es esto?». Títulos que se entienden solos.
- **Decide por lo que ve primero.** Si lo importante está al final de un formulario largo, no existe. Las acciones
  principales van arriba (o en una cabecera fija).
- **Usa el móvil para el día a día y el ordenador para configurar.** Lo que se hace en la calle funciona en el móvil;
  configurar puede ser de escritorio, pero sin romperse en el móvil.
- **Desconfía de lo que parece inventado.** Separa lo comprobado de la hipótesis. Ninguna cifra que no salga de datos
  reales.
- **Aprende viendo, no leyendo.** Enséñale el producto real (su UI, animada), no un párrafo que lo describa.
- **Se pierde si las cosas cambian de sitio.** El mismo menú para todos los roles; lo que no puedes hacer no
  desaparece de forma rara, simplemente no está en tu camino.

---

## 2. Principios (los diez que más nos han funcionado)

1. **Una pregunta por pantalla.** Cabecera con eyebrow (contexto en mayúsculas pequeñas), titular y una línea de
   entrada; las acciones, a la derecha.
2. **«Añadir» arriba a la derecha**, con un menú de lo que se puede crear ahí. Nada de formularios siempre abiertos.
3. **Asistentes cortos con valores por defecto**: se acepta con un clic y se ajusta solo si hace falta. Opciones grandes
   con icono mejor que desplegables.
4. **Lo urgente primero, en cada lista**: vencido → hoy → resto. Y el motivo, **en texto** (no solo un color).
5. **Poco texto, mucho aire.** Menos cosas por pantalla y más separación entre ellas (ver §3).
6. **Listas como tarjetas, y la tarjeta entera es el enlace.** Nada de tablas para listas de acción. Si algo se puede
   pulsar, tiene que **parecerlo** (borde al pasar, chevron o «Ver →»).
7. **Lo opcional, opcional.** Funciones avanzadas (precios por zona, condiciones…) aparecen cuando hacen falta, no
   antes.
8. **Confirmar lo que tiene consecuencias**: un diálogo propio (no el `confirm()` del navegador) que dice **lo que hace
   y lo que NO hace**. Lo reversible, con «Deshacer» en vez de pregunta.
9. **Nunca una pantalla en blanco.** Primero la forma de lo que viene (shimmer), luego el dato.
10. **Humildad con los datos.** «Comprobado» frente a «hipótesis: pruébalo y cuéntanos».

---

## 3. Espacio y densidad: por qué más aire

La razón: **el aire es jerarquía gratis.** Separar bloques hace que el ojo agrupe sin necesitar bordes, colores ni
títulos extra. Una consola apretada obliga a leerlo todo para saber qué importa.

Lo que usamos (proporciones, no dogma):

| Qué | Valor | Por qué |
|---|---|---|
| Ancho máximo de contenido | ~1120 px (y ~1680 px solo para espacios de trabajo como un editor) | Líneas legibles; **un solo sitio** del layout decide el ancho, ninguna pantalla pone el suyo |
| Margen de página | 32 px escritorio | La pantalla respira desde el borde |
| Separación entre secciones de una página | 48–56 px | Cada sección es una idea; se ven separadas sin líneas |
| Dentro de una tarjeta | 20–28 px de relleno, 12 px entre elementos | Más margen exterior, menos aire interior: densidad de escritorio sin agobio |
| Entre tarjetas de una lista | 12 px | Se leen como grupo |
| Campos de formulario | 40 px de alto | Cómodo con ratón y con dedo |
| Barra lateral | ~264 px | Cabe el nombre de cada destino sin cortar |

Y tres reglas que lo sostienen:
- **Tres radios y ni uno más**: tarjeta (16), control (12) y píldora. Si cada componente inventa el suyo, la UI se ve
  «de varios sitios».
- **Sin sombras en lo que está quieto.** La sombra se reserva para lo que flota (menús, diálogos). Una tarjeta al pasar
  el ratón cambia el borde, no se eleva.
- **El panel mide su propio ancho** (container queries): las columnas aparecen según el espacio del panel, no de la
  ventana. Así la misma pantalla funciona con o sin barra lateral.

---

## 4. Tipografía y jerarquía

- **Pocos tamaños** (los nuestros: entidad 20 · tarjeta 16 · cuerpo 14 · meta 12 · micro 11, más el titular). La
  jerarquía se marca con **peso**, no con más tamaños.
- **Cuerpo a 14, no a 13**: a 13 se lee apretado en una consola que se usa horas.
- **Una voz para titulares y cifras** (más expresiva) y otra para todo lo demás (neutra y muy legible).
- **Titular a dos tonos**: «Tu pantalla, *desde tu móvil*». La primera parte en tinta, la segunda atenuada. Da ritmo y
  deja claro qué es lo importante. **Aplícalo de forma consistente**: si unas portadas lo llevan y otras no, se nota y
  parece un error (nos pasó; ahora va siempre).
- **Eyebrow** (mayúsculas pequeñas y espaciadas) encima del titular para dar contexto: «Pantalla en vivo», «Paso 2 de 6».
- **Fuentes autoalojadas** (sin pedirlas a Google): privacidad y velocidad.

---

## 5. Color

- **Base monocroma + una señal + una atención.** La marca vive en un único color de señal que se usa **como mucho una
  vez por bloque** (el número del paso actual, la opción elegida, una cifra protagonista). Nunca como fondo grande ni
  como botón.
- **El botón principal es sólido y neutro** (en nuestro caso negro, en píldora): uno por vista.
- **La atención** (coral/rojo suave) solo para «esto pide tu acción», con el motivo escrito.
- **Tokens en tres capas**: (1) tu marca (paleta, fuentes), (2) la consola (colores **por función**: borde de tarjeta,
  fondo de chip, atención, peligro…), (3) un puente para las utilidades de CSS. **Ningún componente escribe un color a
  pelo**: si hace falta uno nuevo, se añade a la capa 2 con nombre de función. Cambiar de marca = cambiar la capa 1.
- **Texto sobre fotos**: siempre con la foto oscurecida (degradado) **y** una sombra suave en la letra. Si no se lee en
  la peor zona de la foto, no vale.

---

## 6. Estructura (el «shell»)

- **Barra lateral fija**, de arriba abajo: marca → (conmutador de modo si lo hay) → destinos → **anclas abajo**:
  el espacio de trabajo y el perfil.
- **Estado activo con tres señales**: fondo, color y peso. No solo color.
- **Destinos por tarea, no por tabla de base de datos**: «Inicio», «Propuestas», «Preparar mensaje», «Aprende»… En
  nuestro caso, dos modos (Vender / Configurar) con un conmutador que solo ven los admins.
- **Menús flotantes en primer plano.** Si la barra lateral tiene su propio scroll, recorta lo que sobresale: el menú del
  perfil tiene que salir **por encima de la página** (posición fija), nunca cortado. Se cierra al pulsar fuera.
- **Móvil (< 1024 px)**: cabecera compacta y un cajón con **la misma** navegación. Ninguna pantalla con scroll
  horizontal (lo comprobamos con un test: `scrollWidth <= innerWidth`).

---

## 7. Recorridos clave

### Entrar (login)
- **Primero, sin contraseña:** email → **código de 6 dígitos** (y un enlace en el mismo email). El código va **arriba**
  en el email: funciona aunque el email se abra en otro dispositivo.
- La contraseña es **opcional**, para quien la quiera.
- **Mensaje neutro** al pedir el código («Si el email tiene acceso, te hemos enviado un código…»): no revela qué emails
  existen. Pero el **motivo real** de un fallo se registra en el servidor, para poder diagnosticar.
- Errores de límite legibles: «Espera 40 segundos y vuelve a pedirlo», no el error crudo.
- «Usar otra cuenta» a mano en el paso del código.

### Invitación
- Se invita desde **Equipo**, con rol. Llega «Te han invitado» → al aceptar, elige nombre (y contraseña si quiere) →
  aterriza en la **bienvenida**.
- Si esa persona ya tenía cuenta, se le añade al equipo y la pantalla lo dice («Ya tenía cuenta: añadido»). Recomendado (nosotros aún no lo hacemos): mandarle también un aviso por email, para que no se quede sin saber que ya tiene acceso.
- Las plantillas de email son las tuyas, en el idioma de la empresa, con la marca del espacio.

### Bienvenida (primera vez)
- **Una idea por pantalla**, con barra de progreso («Paso 2 de 6») y botón «Saltar».
- **Selector de idioma** visible desde el primer paso.
- Termina **haciendo** algo real (crear la primera propuesta), no leyendo.
- Lo que aparece en cada paso se ve **de un vistazo**: tarjeta con título + lo principal del texto + «Leer entera →».
  Nunca un texto cortado a mitad de frase, ni Markdown crudo («**», «>», «1.»).

### Cambiar de idioma
- En el **menú del perfil**, en un clic; vuelve **a la misma pantalla**.
- **Por defecto, el idioma de la empresa**, no el del navegador. Se guarda en la cuenta de cada uno.
- Todo lo de la interfaz (incluidos los **errores del servidor**) en ese idioma. El contenido que escribe la empresa
  va en el idioma en que lo escribe.

### Salir (logout)
- En el menú del perfil, abajo del todo, **siempre en el mismo sitio**. Sin confirmación (es reversible: se vuelve a
  entrar). Lleva a la pantalla de acceso.

### Varias organizaciones (si las hubiera)
- El ancla del **espacio de trabajo** (abajo en la barra lateral, encima del perfil) dice en qué organización estás.
  Con más de una, ese ancla es el **conmutador**: lista de organizaciones, la actual marcada, y al cambiar vuelves a
  «Inicio» de la otra (no a una pantalla que allí no existe).
- Cada organización con su marca y su dominio; el usuario es el mismo.
- Un rol de plataforma (superadmin) ve todas, pero **nunca** se mezclan datos de dos organizaciones en una pantalla.

### Roles
- Mismo menú para todos; lo que no te toca, no está en tu camino (no aparecen botones que luego dan error).
- Cuando una regla impide algo, **se dice por qué en una frase** («Solo el autor o un admin puede editar esta
  propuesta»), en tu idioma.

---

## 8. Componentes y patrones

| Patrón | Regla |
|---|---|
| Cabecera de pantalla | Eyebrow → titular → una línea; acciones a la derecha |
| Tarjeta | Borde fino, radio de tarjeta, sin sombra |
| Lista | Tarjetas apiladas; la fila entera es el enlace; nada de tablas para acciones |
| Fila que pide atención | Relleno suave + regla lateral + **motivo en texto** |
| Botones | Principal (uno por vista), secundario, discreto, peligro (este, siempre aparte y al final) |
| Opciones | «Opción grande» con icono para elegir entre pocas cosas; chips para filtrar |
| Badge vs etiqueta | Badge = 1–2 palabras. Una frase no es un badge |
| Estado vacío | **Tipado**: por filtro (botón «Quitar filtro»), por crear (enlace para crear) o vacío bueno (con el motivo). Prohibido un vacío sin acción ni motivo |
| Mensajes | **Rechazo** (una regla de negocio, en frase llana) ≠ **fallo** (algo nuestro, con código para soporte) |
| Confirmación | Diálogo propio; dice lo que hace y **lo que no hace** |
| Iconos | Una sola librería, trazo fino, monocromos |
| Enlaces | Que parezcan enlaces: subrayado, «→» o tarjeta con borde al pasar. Si al lado hay un texto vacío, parece roto |

---

## 9. Copy (cómo se escribe)

- **Tuteo, frases cortas, tono directo.** Lo que diría una persona, no un sistema.
- **Prohibido** (lo comprueba un linter que rompe el build): «No hay datos», «Sin resultados», «Ha ocurrido un error»,
  «Algo ha salido mal»; lenguaje posicional («más arriba», «el de abajo»); emojis en la interfaz.
- Los vacíos y los errores dicen **qué pasa y qué hacer**: «Todavía no hay sectores. Añade el primero o parte de un
  ejemplo».
- Nada de jerga interna ni de JSON a la vista.
- Órdenes deterministas: si dos filas empatan, decide el id (la lista no «baila» al recargar).

---

## 10. Carga y velocidad percibida

- **Barra de progreso arriba** al pulsar un enlace; si tarda más de ~350 ms, la página anterior se sustituye por el
  **shimmer** de la siguiente (su silueta: tarjetas, filas, cabecera).
- **Por bloques**: la cabecera sale al momento y lo que consulta datos llega después, con su shimmer.
- **Imágenes** perezosas y con hueco que brilla hasta que llegan.
- Base de datos y servidor **en la misma región**: es lo que más se nota.

---

## 11. Enseñar el producto (Aprende, demos, propuestas)

Esto es lo que más ha elevado la percepción de calidad:

- **La UI real, no capturas ni ventanas de navegador.** Recreamos las pantallas del producto en HTML/CSS con los datos
  del cliente (su nombre, su logo, sus fotos). Así siempre encajan y se pueden personalizar.
- **Coherencia total**: lo que el móvil envía es exactamente lo que sale en la pantalla (la misma foto, la misma canción,
  el mismo mensaje). Una captura fija con otra foto rompe la ilusión.
- **Animaciones rápidas y «con dopamina»**: cada transición ≤ 3 s; una acción completa (escanear → enviar → aparece)
  en ~2,5 s; cada estado se queda ~4 s. La barra de progreso de una escena dura **exactamente** lo que la escena.
- **Formato 50/50**: a un lado la lista numerada de lo que pasa (01, 02… con la explicación solo en la activa), al
  otro la pantalla grande. Esquinas poco redondeadas en las pantallas (parecen pantallas, no botones).
- **«Imagínatelo»**: en el sitio donde se aprende, cuéntalo **todo**: cada pantalla con su UI al lado y lo que se puede
  hacer con ella, más las ideas del equipo para contarlo. El comercial es el primero que tiene que creérselo. Aquí sí
  vale más texto y más pasos.
- **Los recursos que dependen de terceros, verificados**: por ejemplo, las carátulas solo del artista original; si no
  hay una buena, un marcador neutro antes que una equivocada.

---

## 12. Idiomas

- Todos los textos de la interfaz en un único sitio por grupo, con **las mismas claves en todos los idiomas** (si falta
  una, no compila).
- Errores del servidor traducidos al mostrarse, según el idioma de quien lee.
- El idioma por defecto lo decide la empresa; cada persona lo cambia en un clic.

---

## 13. Errores que cometimos y corregimos (para que no los repitas)

| Lo que pasó | La regla que salió |
|---|---|
| El menú del perfil quedaba cortado por la barra lateral | Lo que flota, en primer plano y por encima de todo |
| Títulos de portada a dos tonos en unas sí y en otras no | Un estilo se aplica a todos o a ninguno |
| Texto «cortado» a mitad de frase en tarjetas | Resumir cortando en final de frase; nunca dejar un «1.» o «>» suelto |
| Enlaces que no parecían clicables y un texto vacío al lado | Tarjeta entera clicable + resumen visible + «Leer →» |
| Letra ilegible sobre una foto | Foto oscurecida + sombra en la letra |
| La interfaz en inglés porque el navegador estaba en inglés | El idioma lo decide la empresa (y la persona), no el navegador |
| Un móvil de ejemplo con una foto distinta de la que salía en pantalla | UI recreada y datos compartidos entre las dos piezas |
| Transiciones lentas o barras que no avanzaban | Tiempos cortos y barras atadas a la duración real |
| Errores en un idioma distinto al de la interfaz | Traducción centralizada y un test que obliga a traducir los nuevos |
| Etiquetas que no se entendían («Foto en tarjeta») | Nombrar por lo que el usuario gana («Modo transparente: nos ponemos encima de lo tuyo») |

---

## 14. Checklist antes de dar una pantalla por buena

- [ ] ¿Responde a **una** pregunta? ¿Lo urgente está primero?
- [ ] ¿Hay **una** acción principal, arriba?
- [ ] ¿Se lee de un vistazo? (títulos solos, una línea de ayuda como mucho)
- [ ] ¿Respira? (secciones separadas, sin bordes de más)
- [ ] ¿Todo lo pulsable parece pulsable?
- [ ] ¿Vacíos y errores dicen qué hacer?
- [ ] ¿Funciona a 390 px sin scroll horizontal?
- [ ] ¿Carga con shimmer, sin pantalla en blanco?
- [ ] ¿Está en el idioma de quien lee, incluidos los errores?
- [ ] ¿Usa solo tokens (ningún color ni radio a pelo)?
- [ ] ¿Lo flotante (menús, diálogos) sale entero y por encima?

---

## 15. Cómo trabajamos para llegar aquí

- **Iterar con capturas**: el fundador manda capturas de lo que no le convence y de referencias que le gustan; se
  corrige **de forma transversal** (si algo está mal en una pantalla, se arregla en el componente y se ve bien en todas).
- **Probar como el usuario real**: invitarse a uno mismo con el rol más básico y recorrer la app entera.
- **Pruebas automáticas de recorridos** (navegador real) para lo que no se puede romper: entrar, cambiar de idioma,
  bienvenida, crear y publicar.
- **Criterio propio**: las referencias inspiran, no se copian.
