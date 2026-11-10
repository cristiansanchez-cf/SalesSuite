# Reglas de UI para una consola de administración

> **Para el agente que lo reciba.** Son las reglas con las que está hecha la consola de **Cofundo Ventas**, que
> Cristian considera la mejor que tenemos. No copies colores ni fuentes de aquí: usa la marca y el design system de tu
> proyecto. Lo que se copia son **las decisiones, las proporciones y el orden de las cosas**. Los números son los que
> funcionan aquí; si tu sistema tiene otra escala, quédate con la proporción.
>
> Léelo entero una vez y después aplica la **checklist del final** a cada pantalla que toques.

---

## 0. Lo que más se nota (si solo haces cinco cosas, que sean estas)

1. **Aire.** Doble de separación entre secciones de la que te parece necesaria (48–56 px). El espacio agrupa sin
   necesidad de bordes ni títulos.
2. **Una pregunta por pantalla y una acción principal.** Primero lo que el usuario vino a buscar; el resto, debajo o
   detrás de un clic.
3. **Pocos niveles de jerarquía.** Como mucho: titular de página → título de sección → título de tarjeta → texto. No
   añadas cajas dentro de cajas dentro de cajas.
4. **Tarjetas, no tablas**, para todo lo que se puede abrir o hacer. La tarjeta entera es el enlace.
5. **Enseñar en vez de explicar**: la UI real del producto, fotos de verdad e iconos, y el texto al lado, nunca un
   muro de párrafos.

---

## 1. Si el design system te bloquea

Es lo más habitual: el design system de marca está pensado para una web de marketing (titulares enormes, mucho
color, sombras), no para una herramienta que se usa ocho horas. **No pelees con él ni lo sustituyas: ponle una capa
encima.**

Tres capas de variables CSS:

| Capa | Qué contiene | Quién la toca |
|---|---|---|
| 1. Marca | Paleta, fuentes, curvas de animación del design system de tu proyecto | Nadie desde la consola |
| 2. Consola | Variables **por función**: ancho, márgenes, radios, tamaños de texto, `card-border`, `chip-bg`, `attention`, `danger`… Todas apuntan a la capa 1 | Tú, al crear el panel |
| 3. Puente | Si usas Tailwind u otra librería de utilidades, redefine sus variables **solo dentro de `.console`** | Una vez |

Regla de oro: **ningún componente escribe un color, un radio o un tamaño a pelo.** Si te falta uno, lo añades a la
capa 2 con nombre de función (`--console-attention-bg`, no `--rosa-claro`). Cambiar de marca = cambiar la capa 1.

Qué suele cambiar la consola respecto a la web de marca (y está bien que cambie):
- Titulares más pequeños (36 px, no 80) y cuerpo a **14 px** (13 se lee apretado en una herramienta de horas).
- Sin sombras en lo que está quieto. La sombra, solo para lo que flota (menús, diálogos).
- El color de marca, como **señal** y no como fondo (ver §5).
- Botón principal sólido y neutro (negro o el tono más oscuro de la marca), no del color de marca.

---

## 2. Espacio y medidas (valores reales)

```css
.console {
  --console-page-max: 1120px;      /* ancho de contenido; 1680px solo para espacios de trabajo (editores) */
  --console-page-pad: 32px;        /* margen de página en escritorio */
  --console-sidebar: 264px;
  --console-gap: 12px;             /* entre tarjetas de una lista y entre elementos de una tarjeta */
  --console-card-pad: 20px;        /* relleno de tarjeta (24–28 en tarjetas protagonistas) */
  --console-row-pad: 14px 16px;    /* filas de una lista */
  --console-control-h: 40px;       /* alto de campos y botones */

  /* Tres radios. Ni uno más. */
  --console-radius-card: 16px;
  --console-radius-control: 12px;
  --console-radius-pill: 999px;
}
```

- **Entre secciones de una página: 48–56 px.** Dentro de una sección: 16–20 px. Dentro de una tarjeta: 12 px.
  Es decir, **más aire fuera que dentro**: así el ojo agrupa solo.
- **Un único sitio decide el ancho** (el layout). Ninguna pantalla se pone un `max-width` propio.
- Texto largo (explicaciones, guiones): como mucho **~70 caracteres por línea** (`max-width: 48rem`).
- El panel mide su **propio** ancho (`container-type: inline-size`): las columnas aparecen según el espacio del panel,
  no de la ventana. Columnas a partir de ~720 px y ~1100 px.
- Móvil: **ningún scroll horizontal nunca** (test: `document.documentElement.scrollWidth <= innerWidth` a 390 px).

---

## 3. Jerarquía sin saturar

El error típico de las consolas feas: **todo compite**. Títulos en negrita, subtítulos en negrita, badges de colores,
bordes en todo, iconos en todo.

Reglas:
- **Seis tamaños de texto y ni uno más**: titular 36 · entidad 20 · tarjeta 16 · cuerpo 14 · meta 12 · micro 11
  (eyebrows y badges). La jerarquía se marca con **peso** (400/600/700) y con **tono** (tinta, tinta suave, tinta
  atenuada), no inventando tamaños.
- **Tres tonos de texto**: tinta (`#0a0a0a`) para lo que importa, suave (`#4a4a4a`) para el cuerpo secundario,
  atenuado (`#8a8a8a`) para metadatos. Nunca gris claro sobre blanco para algo que hay que leer.
- **Cabecera de pantalla**, siempre igual: eyebrow (mayúsculas pequeñas espaciadas, 11 px, contexto: «PASO 2 DE 6»,
  «CONFIGURAR») → titular → **una** línea de entrada. Acciones a la derecha.
- **Titular a dos tonos** cuando hay un matiz: «Tu equipo ya tiene IA. *Sigue sin saber qué decir.*» (la segunda
  parte en tinta atenuada). Si lo usas, **en todas** las portadas del mismo tipo, o en ninguna.
- **Una caja como mucho dentro de otra.** Tarjeta blanca → dentro, un bloque gris claro (`inset`) para un ejemplo o
  una cita. Nunca un tercer nivel con borde.
- **Una sola cosa destacada por bloque.** Si todo está en negrita, nada lo está.
- Lo secundario se **esconde detrás de un clic** («Ver más», `<details>`, «Leer entera →»), no se pinta pequeño
  para que quepa.

---

## 4. Dónde va cada cosa

- **Barra lateral fija**, de arriba abajo: marca → (conmutador de modo, si lo hay) → destinos → **abajo, anclados**:
  espacio de trabajo y perfil. El estado activo lleva **tres señales**: fondo, color y peso.
- **Destinos por tarea, no por tabla de la base de datos**: «Inicio», «Propuestas», «Aprende», «Mis comisiones»;
  no «Usuarios», «Registros», «Entidades».
- **Dos modos** si hay mucho: *usar* (lo del día a día) y *configurar* (lo que se toca una vez). Un conmutador arriba
  de la barra lateral que solo ven los admins.
- **El mismo menú para todos los roles.** Lo que no te toca no está en tu camino; no aparecen botones que luego dan
  error.
- **«Añadir» / «Nuevo» arriba a la derecha** de la pantalla. Nada de formularios siempre abiertos ocupando la vista.
- **Acciones destructivas** (borrar, despublicar, revocar) siempre **aparte y al final**, nunca junto a la acción
  principal.
- **Lo urgente primero** en cada lista: vencido → hoy → resto. El motivo, **en texto** («Sin respuesta desde hace 5
  días»), no solo un color.
- **Avisos que piden acción** (falta un dato, algo pendiente): un bloque arriba de la pantalla, fondo suave del color
  de atención + una regla de 3 px a la izquierda, con la frase de qué falta y el campo para arreglarlo **ahí mismo**.
- **Lo opcional, opcional**: funciones avanzadas aparecen cuando hacen falta (un «Avanzado» plegado), no desde el
  primer día.
- **Lo que flota sale entero y por encima**: menús y diálogos con `position: fixed` o en la capa superior; nunca
  recortados por un contenedor con scroll.

---

## 5. Color

- **Base monocroma** (fondo `#fafaf7`, tarjetas blancas, tinta casi negra, bordes `rgba(0,0,0,.08)`).
- **Una señal** (el color de marca, aquí un violeta): **como mucho una vez por bloque**. El número del paso actual,
  la opción elegida, una cifra protagonista, el icono de «Por qué funciona». Nunca un fondo grande ni un botón.
- **Una atención** (coral suave): solo «esto pide tu acción», y siempre con el motivo escrito.
- **Peligro** (rojo): solo en acciones destructivas.
- El éxito puede ser monocromo (un tinte muy suave); no hace falta un verde.
- **Texto sobre fotos**: foto oscurecida con degradado (de abajo arriba: 88 % → 45 % → 10 %) **y** el texto en
  blanco. Si no se lee en la peor zona de la foto, no vale.

---

## 6. Componentes (recetas)

**Tarjeta**: borde de pelo, radio 16, fondo blanco, sin sombra. Al pasar el ratón cambia el borde (más oscuro), no se
eleva.

```css
.card { background:#fff; border:1px solid var(--console-card-border); border-radius:var(--console-radius-card); padding:var(--console-card-pad); }
.card--link:hover { border-color: var(--console-card-border-hover); }
.inset { background:#f6f6f3; border-radius:var(--console-radius-control); padding:16px; } /* bloque dentro de la tarjeta */
```

**Lista accionable**: tarjetas apiladas con 12 px entre ellas; **la fila entera es el enlace**, con un chevron (›) o
«Ver →» a la derecha. Título de fila en 14/600, meta en 12 atenuado debajo.

**Tarjeta con foto (la que más gusta)**: para temas, sectores, tutoriales, cualquier cosa «a la que se entra».

```css
.photo-card { position:relative; isolation:isolate; display:flex; min-height:16rem; overflow:hidden; border-radius:16px; background:#121014; color:#fff; }
.photo-card img { position:absolute; inset:0; z-index:-2; width:100%; height:100%; object-fit:cover; }
.photo-card__shade { position:absolute; inset:0; z-index:-1; background:linear-gradient(to top, rgba(0,0,0,.88), rgba(0,0,0,.45) 45%, rgba(0,0,0,.1)); }
.photo-card__body { display:flex; flex:1; flex-direction:column; justify-content:flex-end; gap:.6rem; padding:1.75rem; }
.photo-pill { border-radius:999px; background:rgba(255,255,255,.16); backdrop-filter:blur(6px); padding:.25rem .7rem; font-size:.8rem; font-weight:600; }
.photo-cta { width:fit-content; border-radius:999px; background:#fff; color:#000; padding:.6rem 1.2rem; font-weight:700; }
```

Dentro: píldoras de estado arriba («✓ Repasado», «Sigue por aquí»), título grande (30–48 px, bold) abajo, una línea
de meta y un botón blanco en píldora («Empezar →»). En rejilla de 2 columnas a partir de tablet.

**Tarjeta con icono** (cuando no hay foto): icono de 26 px dentro de un cuadrado de 56 px con radio 16, fondo del
color de señal muy suave y el icono en el color de señal; a la derecha, título (18–20/700) y meta; chevron al final.

**Tarjeta de contenido (consejo, guion, jugada)**, en este orden:
1. Título (20/700).
2. «Cuándo» en una línea, con icono de reloj, en tinta suave.
3. **El texto principal, grande** (17 px, interlineado 1.6). Si es una frase para decir tal cual, como cita: regla
   de 3 px a la izquierda en el color de señal.
4. «Por qué funciona» en un `inset` gris con icono de bombilla en color de señal.
5. Pie a 12 px atenuado: fuentes («Fuente: …») y metadatos. **Nunca** «Redactado por la IA» ni detalles internos.

**Botones**: principal (sólido, oscuro, píldora; **uno por vista**), secundario (borde), discreto (solo texto),
peligro (aparte). Con flecha «→» cuando llevan a otro sitio.

**Campos**: 40 px de alto, radio 12, etiqueta encima en 12–13/600, ayuda debajo en 12 atenuado, foco con anillo
visible. El ejemplo del campo (placeholder) cambia según lo elegido («+34 600 000 000» para teléfono, «@usuario»
para Instagram).

**Opciones**: para elegir entre pocas cosas, «opción grande» (tarjeta con icono, título y una línea) en vez de un
desplegable. Para filtrar, chips.

**Badge vs etiqueta**: badge = 1–2 palabras («PUBLICADO», «NUEVO»). Una frase no es un badge.

**Estado vacío, siempre tipado**: por filtro («Quitar filtro»), por crear (enlace a crear el primero) o vacío bueno
(«Nada vencido: vas al día»). Prohibido un vacío sin acción ni motivo.

**Confirmación**: diálogo propio (no el `confirm()` del navegador) que dice lo que hace **y lo que no hace**. Lo
reversible no se confirma: se ofrece «Deshacer».

**Iconos**: una sola librería (Lucide), trazo fino (1.5), monocromos, 14–18 px junto al texto. Un icono acompaña,
no sustituye: siempre con su palabra.

---

## 7. Páginas que enseñan (tutoriales, onboarding, «cómo funciona»)

Es lo que más ha subido el nivel percibido. La estructura que funciona:

1. **Portada en dos columnas (50/50)**: a la izquierda eyebrow, titular grande (48 px), una frase que lo resume; a
   la derecha, **la UI real del producto** dentro de un marco oscuro con un brillo suave del color de marca detrás
   (`radial-gradient` del color de marca al 30 % en el centro). Nada de capturas de pantalla: recrea la UI en HTML
   con datos de ejemplo creíbles.
2. **«Qué es», por partes**: una lista de secciones, cada una con título (24 px), texto corto y **su pantalla al
   lado** (60/40). **Alterna** el lado de la imagen en cada sección (izquierda, derecha, izquierda) para que no sea
   monótono. La pantalla, `position: sticky` mientras se lee su texto.
3. **«Cómo contarlo» / «Qué hacer»**: después de entenderlo, las tarjetas de acción.
4. **Un solo botón al final**: «Ya lo tengo →», que marca el progreso y lleva a lo siguiente.

Y en la página índice de los tutoriales:
- Pasos numerados (01, 02, 03) con el número en color de señal y una barra de progreso arriba: «Llevas 3 de 9».
- **Un botón «Sigue por aquí →»** al siguiente pendiente. El usuario nunca tiene que pensar qué toca.
- Cada tema, una **tarjeta con foto**.
- **No dupliques** contenido en dos sitios: si algo está en el tema, en el índice general solo se enlaza.

Animaciones: rápidas. Cada transición ≤ 3 s; cada estado se queda ~4 s; la barra de progreso de una escena dura
exactamente lo que la escena.

---

## 8. Texto (copy)

- **Tuteo, frases cortas, tono directo.** Lo que diría una persona.
- **Una línea de ayuda como mucho** por bloque. Lo demás, detrás de «¿Qué es esto?» o «Leer más».
- **Títulos que se entienden solos** y nombran lo que el usuario gana («Tu contacto en esta propuesta»), no lo que
  es por dentro («Configuración de canal de usuario»).
- **Prohibido**: «No hay datos», «Sin resultados», «Ha ocurrido un error», «Algo ha salido mal»; lenguaje posicional
  («más arriba»); emojis; JSON, IDs o jerga interna a la vista; textos cortados a mitad de frase o con Markdown crudo
  («**», «>», «1.» sueltos).
- Errores y vacíos dicen **qué pasa y qué hacer**. Un **rechazo** (una regla: «Solo un admin puede…») no es lo mismo
  que un **fallo** (nuestro, con código para soporte).
- Datos con humildad: nada de cifras inventadas; separa lo comprobado de la hipótesis.
- Todo el texto de la interfaz en archivos de mensajes, con las mismas claves en todos los idiomas (incluidos los
  errores del servidor).

---

## 9. Carga

- **Nunca una pantalla en blanco.** Al navegar, una barra de progreso fina arriba; si tarda más de ~350 ms, la
  silueta (shimmer) de la página siguiente.
- La cabecera sale al momento; los bloques que consultan datos llegan después con su propio shimmer.
- Imágenes perezosas (`loading="lazy"`) con un hueco del tamaño final, para que nada salte.

---

## 10. Errores que ya cometimos (no los repitas)

| Lo que pasó | La regla |
|---|---|
| Menú del perfil cortado por la barra lateral | Lo que flota, por encima de todo |
| Títulos a dos tonos en unas portadas sí y en otras no | Un estilo, en todas o en ninguna |
| Textos cortados a mitad de frase en tarjetas | Resumir cortando en final de frase |
| Enlaces que no parecían clicables | Tarjeta entera clicable + «Ver →» |
| Letra ilegible sobre una foto | Degradado oscuro + texto blanco |
| Una tarjeta de consejo con la cabecera más grande que el consejo | El contenido es lo grande; los metadatos, al pie y pequeños |
| «Redactado por la IA» en una tarjeta | Las fuentes, como nota al pie; lo interno, nunca a la vista |
| El mismo contenido en dos pestañas | Un sitio por cosa; en el otro, un enlace |
| Un aviso que decía dos cosas contradictorias | Un aviso = una frase = una acción |
| Una función que nadie encontraba porque estaba en un solo sitio | Lo que cada uno configura de sí mismo, también en «Tu cuenta» |
| Interfaz en inglés porque el navegador lo estaba | El idioma lo decide la empresa (y la persona), no el navegador |

---

## 11. Checklist antes de dar una pantalla por buena

- [ ] ¿Responde a **una** pregunta y lo urgente está primero?
- [ ] ¿Hay **una** acción principal, arriba, y las destructivas al final y aparte?
- [ ] ¿Respira? (48–56 px entre secciones, más aire fuera que dentro de las tarjetas)
- [ ] ¿Como mucho cuatro niveles de jerarquía y una caja dentro de otra como máximo?
- [ ] ¿Solo seis tamaños de texto y la jerarquía hecha con peso y tono?
- [ ] ¿El color de marca aparece como mucho una vez por bloque?
- [ ] ¿Todo lo pulsable parece pulsable? ¿Las listas son tarjetas con la fila entera clicable?
- [ ] ¿Lo que se enseña lleva foto, icono o la UI real, y no solo texto?
- [ ] ¿Vacíos y errores dicen qué hacer?
- [ ] ¿Funciona a 390 px sin scroll horizontal?
- [ ] ¿Carga con silueta, sin pantalla en blanco?
- [ ] ¿Usa solo variables (ningún color, radio ni tamaño a pelo)?
- [ ] ¿Lo flotante sale entero y por encima?

---

## 12. Cómo trabajar para llegar aquí

- **Iterar con capturas**: el fundador manda capturas de lo que no le convence; se arregla **en el componente**, no
  en la pantalla, para que mejore en todas a la vez.
- **Probarlo como el usuario real**, con el rol más básico, recorriendo la app entera.
- **Tests de navegador** para lo que no se puede romper (entrar, crear, publicar, idioma) y para «sin scroll
  horizontal en móvil».
- Antes de dar algo por terminado, **mirar la captura**: si algo compite, sobra o está apretado, no está terminado.
