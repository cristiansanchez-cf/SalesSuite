# Revisión UX de la consola (octubre 2026)

Un subagente recorrió las diez tareas reales con Playwright, a 1440×900 y a 390×844, como admin, comercial y colaborador. Contó los clics y leyó el código. Este es el resumen y el plan; las capturas y los scripts de medición se generaron en el entorno de trabajo (`/tmp/claude-0/ux-review/`).

> En una frase: en el móvil la consola no sirve, el CEO no tiene dónde ver el negocio y el builder del dossier es un formulario de unos 2.800 px con las acciones importantes al final.

## Los 10 problemas más graves

| # | Problema | Dónde | Solución | Esfuerzo | Estado |
|---|---|---|---|---|---|
| 1 | Desbordamiento horizontal en el móvil: la portada mide 754 px en un viewport de 390 | `.co-rows`, `PageHeader`, builder, pestañas del Playbook | `minmax(0,1fr)`, cabecera que se apila, pestañas con scroll y un test `scrollWidth <= innerWidth` | S | Hecho |
| 2 | El CEO no tiene inicio: lo único agregado son tres números escondidos en Playbook → «Qué funciona» | `/admin` | Página **Inicio** por rol: KPIs, vencidos del equipo, cierres, pendientes y comisiones | M | Hecho |
| 3 | El builder es un muro de 8 tarjetas: publicar, enlace y resultado están al final, y aparece JSON y jerga | `Builder.svelte` | Cabecera fija con «Publicar y copiar enlace», próximo paso y Ganado/Perdido; pestañas Propuesta / Cuenta / Enlaces; sector al crear | L | Pendiente |
| 4 | Configuración guiada, paso 3: actores en lista de texto (la queja del dueño) | `setup.astro` | Tarjetas de actor por sector, tarjeta «+ Añadir actor» con el sector puesto | M | Hecho |
| 5 | «Preparar mensaje» ignoraba la objeción elegida si el tipo no era «objeción» | `compose.astro` | Elegir objeción pasa el tipo a «Responder a una objeción» | S | Hecho |
| 6 | Sectores y actores en dos sitios con aspectos distintos; «Qué funciona» duplicado | `nav.ts`, `setup`, `playbook` | Un solo editor de mercado; las métricas pasan a Inicio | M | Pendiente |
| 7 | `confirm()` nativo en el builder, sin decir lo que la acción no hace | `Builder.svelte` | `<dialog>` con «Lo que no hace» y «Deshacer» en lo reversible | S | Hecho |
| 8 | El debrief mide 2,4 pantallas, con 24 casillas y 18 actores | `debrief.astro` | Jugadas del guion de ese dossier y el resto plegadas | M | Pendiente |
| 9 | El colaborador ve 3 formularios abiertos y el builder completo de un comercial | `PartnerHome`, builder | «Nueva propuesta» en un clic y builder reducido | M | Pendiente |
| 10 | Editar la cuenta de un colaborador: la ayuda contradice el select y el cambio toca propuestas ya enviadas sin opción | `team/partners/[userId]` | Política como tarjetas, % solo con «especial» y casilla «Aplicar también a las ya enviadas» | S–M | Hecho |

## Clics medidos y objetivo

| Tarea | Hoy | Objetivo |
|---|---|---|
| Crear dossier → módulos → actores → publicar → enlace → próximo paso | 26 interacciones, unos 2.800 px de scroll | unas 12 |
| Marcar ganado y documentar | 4 interacciones, pero escondidas al final | 3 desde la cabecera |
| Configuración guiada con sector, actor y situación | 19 interacciones y 6 recargas | unas 12 |

## Arquitectura de información propuesta

1. **Inicio** como primer destino de Vender, distinto por rol: CEO o jefe/a (KPIs y equipo), comercial («Hoy»), colaborador («Mis cuentas»).
2. **Dossiers como pipeline:** el estado del deal (abierto, enviado, ganado, perdido) separado del estado de publicación.
3. **Configurar:** Primeros pasos (asistente, hasta completarlo) → Mercado y actores (un solo editor) → Playbook → Catálogo, Equipo y Marca.
4. **Preparar mensaje** sobre todo dentro del dossier.
5. **Móvil primero** para los flujos de calle; Configurar puede ser solo de escritorio, pero sin romperse.

## Carga

Nunca una pantalla en blanco: primero la forma de lo que viene, luego el dato.

- **Al navegar** (toda la consola, `AdminLayout`): barra de progreso arriba al hacer clic; si la página tarda más de 350 ms, la anterior se sustituye por el shimmer de una página (`<Shimmer variant="page">`). Los enlaces con `data-no-progress` no lo activan.
- **Por bloques** (server islands de Astro): la cabecera sale al momento y el cuerpo con datos llega en una segunda petición, con su shimmer como `slot="fallback"`. Hoy: Inicio (`components/admin/home/HomeBody.astro`) y Aprende (`components/admin/learn/LearnBody.astro`). El middleware autentica `/_server-islands/*` como la consola (sin sesión: 401, no redirige). Ojo: dentro de un bloque, `Astro.url` es la URL del bloque, no la de la página; los parámetros que necesite se le pasan como props.
- **Fotos**: `class="co-img"` + `loading="lazy"` + `decoding="async"`; el hueco brilla hasta que la foto llega.
- **Patrón para una página nueva**: cabecera (título, botones) en la página; todo lo que consulte la base de datos, en un componente con `server:defer` y `<Shimmer slot="fallback" variant="…" />` con la silueta que tendrá (`home`, `cards`, `rows`, `hero`, `page`).
