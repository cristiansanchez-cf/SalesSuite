# Oquea · Entrega complementaria: la UI de la aplicación

> Complementa a `00-entrega-marca-y-ui.md`. Aquel documento se hizo desde el repositorio
> **web** (`oquea-web`, Astro) y resolvió bien marca, tipografía, iconos y los seis mockups
> de marketing. Para la aplicación decía **PENDIENTE** y listaba nombres de ficheros.
>
> Este documento se ha escrito leyendo el **repositorio de la aplicación** (`OqueaApp`,
> Flutter + Firebase), rama `ngo_event`, commit `49b39dd` del 29 de septiembre de 2026.
> Todos los números salen de ficheros reales y se pueden verificar.

---

## 0. La dimensión de lo que faltaba

| | |
|---|---|
| Vistas en `lib/views/` | **104** |
| Widgets compartidos en `lib/widgets/` | **72** |
| Rutas navegables | **69** |
| Cadenas de interfaz | **1.774**, en inglés, español, portugués de Brasil, portugués de Portugal y coreano |

Los seis mockups de la web cubren seis momentos. La aplicación tiene sesenta y nueve
pantallas. Este documento las mapea todas y detalla las que venden.

---

## 1. Aviso antes de recrear nada: los tokens de la app NO son los de la web

Esto es lo primero que hay que saber, porque una recreación hecha con los tokens de
`tokens.css` saldrá parecida pero no igual, y el fundador lo va a notar.

| Token | Web (`tokens.css`) | App (`lib/theme/app_colors.dart`) | ¿Coincide? |
|---|---|---|---|
| Primario | `#3757BE` | `#3757BE` | Sí |
| Navy | `#1F294C` | `#1F294C` (`exploreNavy`) | Sí |
| Acento lima | `#D0FF00` | `#D0FF00` (`exploreLime`) | Sí |
| Azul muy claro | `#F1F6FD` | `#F1F6FD` (`secondaryLight`) | Sí |
| Fondo | `#FFFFFF` | `#FFFFFF` | Sí |
| **Texto principal** | **`#292929`** | **`#000000`** | **No** |
| **Borde** | **`#EFEFEF`** | **`#E0E0E0`** | **No** |
| **Radio de tarjeta** | **`24px`** | **`16px`** | **No** |
| Radio de botón | `999px` | `999px` (`AppRadius.pill`) | Sí |
| Tipografía | Gilroy | Gilroy | Sí |

**Para recrear pantallas de la aplicación**, usar la columna de la app: negro puro en el
texto, borde `#E0E0E0` y **radio 16**, no 24. El 24 es del lenguaje de marketing.

La consola de escritorio añade además su propia capa semántica, más estricta que el tema
global. Son los valores que hay que usar para el panel del centro:

```
navy          #1F294C      cardBorder    #E6E8EE
primary       #3757BE      chipBg        #EAF0FB
muted         #6B7280      chipGrey      #F4F6FA
hint          #8A8F9A      divider       #EEEEF2
                           progressTrack #E8EEF8
                           alertBg       #FFF1F0   alertBorder #FFD4D2
```

### Escala tipográfica de la aplicación

Material estándar, en Gilroy. Los tamaños que de verdad se usan en pantalla:

| Uso | px | Peso |
|---|---|---|
| Nombre de entidad, escritorio | 22 | 800 |
| Título de sección grande | 20 | 800 |
| Título de tarjeta | 16 | 700 |
| Cabecera de sección | 14 | 800 |
| Título de fila | 14 | 600 |
| Cuerpo | 13–14 | 400 |
| Pie y metadatos | 12 | 400 |
| Etiqueta mínima | 10–11 | 400 |

Detalle que importa al recrear: **la cabecera de sección y el título de fila miden lo
mismo, 14px.** Lo que los separa es el peso, 800 contra 600. Subir el tamaño para marcar
jerarquía es lo que hace que una recreación parezca una app estirada.

### Espaciado y radios declarados

```
espaciado   4 · 8 · 12 · 16 · 20 · 24 · 32 · 40
radios      8 · 12 · 24 · 999        (en la práctica domina el 16)
breakpoints móvil <768 · tablet 768–1279 · escritorio ≥1280
```

---

## 2. Mapa de superficies, con la verdad del código

El documento anterior listaba cinco superficies. Son correctas, pero **dentro de la
aplicación conviven dos productos distintos** que el mapa no reflejaba:

| Superficie | Quién | Qué hace | Dónde vive |
|---|---|---|---|
| **App buceador, móvil** | Buceador | Logbook, QR, explorar, perfil, álbum | `home_view.dart` + pestañas |
| **App centro, móvil** | Personal del centro | Actividades, dive sites, CRM, equipo | mismo shell, otro modo |
| **Consola de escritorio** | Gestor del centro | Todo lo de gestión, en pantalla grande | `widgets/app_shell/` + vistas `desktop_*` |
| **Aterrizaje por QR, sin cuenta** | Buceador que escanea | Ficha de centro y actividad, guardar inmersión | rutas `/divingcenter/*` |
| **Catálogo de vida marina** | Superadmin | Alta, revisión, fusión e importación de especies | `views/marine_life/` |

**La consola de escritorio es la que vende a un centro**, y es la que no estaba
documentada. Un centro de buceo no gestiona su negocio desde el móvil.

El cambio entre modo buceador y modo gestión **no es un menú que cambia según permisos**:
es un conmutador explícito en la barra lateral, con dos juegos de navegación completos
detrás.

---

## 3. Anatomía de la consola de escritorio

Esto es lo que hay que recrear para vender a un centro. Todas las medidas son reales.

### El armazón

```
┌────────────┬──────────────────────────────────────────────┐
│  264 px    │  contenido                                   │
│  lateral   │  ancho máximo 1120 · gutter 24               │
│  padding   │                                              │
│  16 todo   │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- **Barra lateral: 264 px**, fondo blanco, 16 px de padding en los cuatro lados.
- **Contenido: ancho máximo 1120 px**, con 24 px de gutter. Ninguna pantalla elige su
  propio ancho: todas pasan por el mismo marco. Por eso al navegar nada se mueve
  lateralmente.
- **Padding de página: 28–32 px.** Más margen exterior que en móvil y menos aire interior.

### Orden vertical de la barra lateral

```
logo
  ↓ 20
conmutador Gestión / Buceador     ← píldora, fondo #F4F6FA, padding 4, dos mitades
  ↓ 20
destinos de navegación
  ↓ 8
selector de centro activo          ← anclado abajo, abre popup de 280 px
tarjeta de perfil                  ← anclado abajo, abre popup de 280 px
```

Identidad y contexto **anclados abajo, en todas las pantallas, sin excepción**. Es lo que
hace que el gesto se vuelva muscular en una herramienta de uso diario.

### Item de navegación

```
padding 12 horizontal / 12 vertical
separación icono → etiqueta: 12
icono 20 px
margen inferior entre items: 4
radio: píldora (999)
```

El estado activo cambia **tres cosas a la vez**: fondo (`transparente` → `#F1F6FD`), color
de texto e icono (`#7C7C7C` → `#3757BE`) y peso (500 → 600). Con una sola señal se pierde
en visión periférica.

### Tarjeta

Una sola receta, repetida en toda la consola:

```css
background: #FFFFFF;
border-radius: 16px;
border: 1px solid #E6E8EE;
/* sin sombra */
```

**La sombra está reservada a lo que flota de verdad**: popups y menús. Nada que esté en el
flujo de la página proyecta sombra. Es lo que impide que la pantalla parezca un tablero de
widgets.

### Umbrales de columna

Medidos contra el **panel de contenido**, no contra la ventana:

| Ancho del panel | Columnas |
|---|---|
| ≥ 1100 | 3 |
| ≥ 720 | 2 |
| < 720 | 1 |

Cuando una pantalla divide en principal + secundaria, la secundaria toma **36 % con topes
entre 340 y 380 px**.

---

## 4. Inventario completo de pantallas

104 vistas agrupadas por lo que hacen. Las marcadas con ★ son las que mejor venden.

### Acceso y alta (9)

| Pantalla | Fichero | Líneas |
|---|---|---|
| Splash | `splash_view.dart` | 192 |
| Acceso | `onboarding_view.dart` | 1.068 |
| Verificación por código | `verify_code_view.dart` | 821 |
| Bienvenida | `onboarding/onboarding_welcome_screen.dart` | 456 |
| Nombre y usuario | `onboarding/onboarding_name_screen.dart` | 471 |
| Datos personales | `onboarding/onboarding_personal_info_screen.dart` | 455 |
| Nivel de buceo | `onboarding/onboarding_diving_level_screen.dart` | 249 |
| Objetivos | `onboarding/onboarding_goals_screen.dart` | 268 |
| Coordinador del flujo | `onboarding/onboarding_flow_view.dart` | 232 |

Acceso **sin contraseña**: código de cinco dígitos por correo, más Apple y Google.

### Logbook del buceador (16) ★

El corazón del producto para el buceador.

| Pantalla | Fichero | Líneas |
|---|---|---|
| ★ Lista del logbook | `logbook/logbook_list_view.dart` | 1.231 |
| ★ Crear inmersión | `logbook/create_logbook_view.dart` | 3.528 |
| ★ Escáner QR | `logbook/logbook_qr_scanner_view.dart` | 149 |
| ★ Detalle tras escanear QR | `logbook/logbook_qr_scan_details_view.dart` | 2.451 |
| Detalle de inmersión manual | `logbook/logbook_manual_dive_details_view.dart` | 1.529 |
| Detalle de evento | `logbook/logbook_event_details_view.dart` | 874 |
| ★ Compartir en redes | `logbook/logbook_social_share_view.dart` | 742 |
| ★ Tarjetas compartibles | `logbook/widgets/logbook_share_cards.dart` | 1.302 |
| Certificado de participación | `logbook/logbook_event_certificate_view.dart` | 738 |
| Tarjeta de inmersión | `logbook/widgets/logbook_dive_card.dart` | 680 |
| Bloques de fotos | `logbook/widgets/logbook_dive_photos_blocks.dart` | 510 |
| Controles de lista | `logbook/widgets/logbook_list_controls.dart` | 300 |
| Acciones sobre foto propia | `logbook/widgets/logbook_own_photo_actions_sheet.dart` | 230 |
| Logbook en escritorio | `logbook/desktop_logbook_view.dart` | 447 |
| Borrar entrada | `logbook/logbook_delete_entry.dart` | 150 |
| Logo del centro en la tarjeta | `logbook/logbook_center_logo.dart` | 82 |

### Explorar: mapa y fichas (14) ★

| Pantalla | Fichero | Líneas |
|---|---|---|
| ★ Mapa | `explore/explore_view.dart` | **5.364** |
| ★ Ficha de centro | `explore/explore_diving_center_detail_view.dart` | 1.502 |
| ★ Ficha de evento | `explore/explore_event_detail_view.dart` | 1.153 |
| Ficha de dive site | `explore/explore_dive_site_detail_view.dart` | 945 |
| Ver todo | `explore/explore_see_all_list_view.dart` | 884 |
| Ficha emergente del marcador | `explore/explore_marker_ficha.dart` | 749 |
| Filtros avanzados | `explore/explore_deep_filters_panel.dart` | 720 |
| Chrome del mapa | `explore/explore_map_chrome.dart` | 663 |
| Botón de localizarme | `explore/explore_map_locate_fab.dart` | 67 |
| Portada de dive site | `explore/dive_site_cover_image.dart` | 124 |
| Planificador: inicio | `explore/trip_planner/trip_planner_landing_view.dart` | 502 |
| Planificador: destino | `explore/trip_planner/trip_planner_destination_view.dart` | 722 |
| Planificador: viaje | `explore/trip_planner/trip_planner_trip_detail_view.dart` | 403 |
| Datos de demo del planificador | `explore/trip_planner/trip_planner_demo_data.dart` | 331 |

El mapa es la vista más grande del producto. Marcadores con lenguaje de boyas, tipo NGO,
distintivo de evento, pesos por zoom y agrupación por clústers.

### Gestión del centro (19) ★

| Pantalla | Fichero | Líneas |
|---|---|---|
| ★ Mi centro en escritorio | `diving_centers/desktop_my_centre_view.dart` | 1.154 |
| ★ CRM del centro | `diving_centers/center_crm_views.dart` | 1.896 |
| ★ QR del centro | `diving_centers/center_qr_view.dart` | 227 |
| Alta de centro | `diving_centers/new_diving_center_view.dart` | 2.724 |
| Selector de centro | `diving_centers/select_diving_center_view.dart` | 2.593 |
| Lista de dive sites | `diving_centers/dive_sites_list_view.dart` | 1.682 |
| Alta de dive site | `diving_centers/new_dive_site_view.dart` | 1.836 |
| Detalle de dive site | `diving_centers/dive_site_details_view.dart` | 1.660 |
| Añadir dive site | `diving_centers/add_dive_site_view.dart` | 1.313 |
| Equipo | `diving_centers/manage_team_members_view.dart` | 1.168 |
| Detalle de centro | `diving_centers/center_details_view.dart` | 826 |
| Actividades recientes | `diving_centers/diving_center_recent_activities_view.dart` | 703 |
| Centros colaboradores | `diving_centers/collaborating_centres_view.dart` | 671 |
| Lista de centros | `diving_centers/diving_centers_view.dart` | 473 |
| Editar centros de un sitio | `diving_centers/edit_dive_site_centers_view.dart` | 439 |
| Elegir sitio al unirse | `diving_centers/join_dive_select_dive_site_view.dart` | 312 |
| Ajustes CRM de superadmin | `diving_centers/superadmin_crm_settings_view.dart` | 265 |
| ★ Aterrizaje público del centro | `diving_centers/diving_center_public_view.dart` | 673 |
| ★ Actividad pública tras QR | `diving_centers/diving_center_activity_public_view.dart` | 2.061 |

### Actividades y eventos (5) ★

| Pantalla | Fichero | Líneas |
|---|---|---|
| ★ Lista de actividades | `activities/activities_list_view.dart` | 3.225 |
| ★ Detalle de actividad | `activities/activity_details_view.dart` | 2.034 |
| Crear evento | `activities/create_event_view.dart` | 2.203 |
| Crear actividad | `activities/create_activity_view.dart` | 1.974 |
| Participantes | `activities/activity_participants_view.dart` | 831 |

### Perfil del buceador (17)

Perfil, secciones y el flujo de completado paso a paso: foto, teléfono, experiencia
previa, certificaciones, seguro, tallas de equipo y contactos de emergencia.

### Catálogo de vida marina (7)

Catálogo, detalle, alta guiada, revisión, fusión de duplicados e importación por CSV con
simulacro previo. Es funcionalidad de superadmin y **no conviene enseñarla a un centro**:
no es suya.

### Álbum compartido y otros (5)

Álbum de la actividad, invitaciones, ajustes y borrado de cuenta.

---

## 5. Los momentos que venden, con su recorrido real

El documento anterior proponía los momentos. Estos son los **recorridos tal y como existen
en el código**, con las rutas, para que la recreación siga el orden verdadero.

### A · El buceador registra su inmersión con un QR ★★★

Es el momento central del producto y el que se usará de verdad el día de una salida.

```
escanea el QR del centro
   → /divingcenter/:centerId                    ficha del centro, SIN cuenta
   → elige la actividad del día
   → /divingcenter/:centerId/activities/:id     detalle, SIN cuenta
   → "Guardar en mi logbook"
   → si no tiene cuenta: alta por código de 5 dígitos y vuelve aquí
   → la inmersión queda en su logbook
```

**Lo que hace esto vendible a un centro**: el buceador no necesita tener la aplicación
instalada ni una cuenta para llegar a la ficha. El centro imprime un QR y lo pone en el
mostrador y en el barco.

Datos que se enseñan: nombre del centro, foto de cabecera, actividad del día, punto de
inmersión, hora. Personalizables con los del cliente.

### B · El buceador comparte la inmersión ★★★

```
/logbook  →  abre una inmersión  →  Compartir  →  /logbook/:id/share
```

Genera una **tarjeta tipo Strava**: foto de la inmersión de fondo y las estadísticas
encima — profundidad máxima, duración, temperatura, punto. Hay variante transparente y
carrusel de vida marina.

Es marketing gratis para el centro, cuyo logo va en la tarjeta.

### C · El centro gestiona su día ★★★

```
consola de escritorio
   → Actividades: lo de hoy, agrupado por día
   → Detalle de actividad: participantes, quién escaneó el QR y quién fue añadido a mano
   → CRM: ficha del buceador, su historial con este centro, notas internas
```

Aquí es donde **el panel de escritorio hace el trabajo**, y donde conviene enseñar la
consola y no el móvil.

### D · El centro se deja encontrar ★★

```
/explore  mapa
   → marcador del centro
   → ficha pública: sobre el centro, idiomas, ubicación, dive sites,
     vida marina, equipo, contacto
```

El centro ve exactamente lo que ve un buceador desde «Cómo te ven los buceadores».

### E · Evento de varios centros ★★

Un centro organiza un evento —una limpieza de fondos, por ejemplo— e invita a otros
centros. Los participantes se registran con el QR de cualquiera de ellos y aparecen en el
CRM del organizador. Al terminar hay **certificado de participación** y álbum compartido.

Es el caso que mejor explica por qué una ONG o una cadena quiere Oquea.

---

## 6. Datos de ejemplo reales

Para que la recreación no invente textos: la aplicación tiene **1.774 cadenas** ya
traducidas a cinco idiomas, y el maestro está en
`~/Desktop/OQUEA_traducciones/OQUEA_translation_master.xlsx`, hoja `FOR THE CODE`.

Ejemplos de marcador de posición que usa el propio producto:

| Campo | Ejemplo real de la app |
|---|---|
| Punto de inmersión | `Maaya Thila` |
| Especie | `Manta ray` |
| Evento | `Seabed clean-up – Cabo de Gata` |
| Ubicación | `Benalmádena, Málaga` |
| Profundidad máxima | `32` m |
| Total de inmersiones | `124` |
| Tiempo total | `5700` min |
| Inmersión más larga | `68` min |
| Presión de botella | `200 / 210 / 220 / 230 bar` |
| Duración típica | `30 / 40 / 50 / 60 min` |

Destinos que ya aparecen en el planificador: **Maldivas, México, Mar Rojo, España.**

---

## 7. Iconografía de la aplicación

El documento anterior dice que la app usa Phosphor «según el DS». En el código, la
aplicación usa **dos fuentes a la vez**:

- Iconos de Material (`Icons.settings_outlined`, `Icons.place_outlined`…) en la mayoría de
  la interfaz.
- **Imágenes PNG propias** en `assets/images/` y `assets/images/nav/` para la navegación y
  la marca: `ic_home.png`, `ic_person.png`, `ic_calendar.png`, `ic_pin.png`,
  `ic_people.png`, `ic_crm.png`, `ic_logo_blue.png`.

Para recrear en web, los SVG propios estilo Phosphor que ya entregaron son la elección
correcta: son más limpios que los PNG de la app y mantienen la marca.

---

## 8. Advertencias para quien recree estas pantallas

**No copiar los radios variables.** El 16 domina, pero conviven 30, 24, 20, 18, 17, 15 y
14 en apariciones sueltas. Es deriva, no intención. Fijar tres: tarjeta 16, control 12,
píldora 999.

**No recrear la consola de escritorio con sombras.** Es la decisión que más la define.

**La vista de «Mi centro» en escritorio tiene un mapa que es un dibujo**, no un mapa: una
ilustración fija con el pin en el centro, idéntica para todos los centros. Está reportado
como defecto (OQ-797) y **no debe recrearse así**: para una propuesta hay que enseñar un
mapa real con la ubicación del cliente.

**Las reseñas están apagadas** en la ficha que ve el buceador, en tres sitios del código y
a propósito. No enseñar reseñas en una recreación hasta que se decida.

**Hay seis pantallas de catálogo de vida marina** que son de superadmin. No forman parte
de lo que compra un centro.

---

## 9. Qué falta todavía, y quién lo tiene

| Qué | Estado | Quién |
|---|---|---|
| Capturas PNG a tamaño real de cada pantalla | **PENDIENTE** | Se pueden sacar del simulador; no hay ninguna en el repositorio |
| Frames de Figma por pantalla | **PENDIENTE** | Figma `cgUfyZggGl48N3OWugHOEz` (Oquea-CE PROD) |
| Vídeos del producto funcionando | **PENDIENTE** | Marketing |
| Fotos de uso real de centros y buceadores | Hay 4 en la entrega anterior | Marketing, con permiso confirmado |

Las capturas son lo único que impide una recreación fiel al píxel. Todo lo demás —medidas,
colores, estructura, recorridos y textos— está en este documento.
