# Design system de la consola (Cofundo)

La consola `/admin` usa el design system de **Cofundo** (cofundo.io: monocromo con el aurora como único color de marca). Encima lleva una capa de consola basada en la *Guía UI/UX para consolas de administración*. Los **dossiers públicos no se tocan**: siguen con el tema de cada tenant (`theme_tokens`).

> Fuente de verdad del código: `src/styles/console.css`. Si algo de aquí choca con ese archivo, gana el archivo.

## 1. Tres capas de tokens

| Capa | Prefijo | Qué contiene |
|---|---|---|
| 1. Cofundo | `--co-*` | Paleta (`canvas #fafaf7`, `ink #0a0a0a`, `ink-soft`, `ink-dim`, `rule`), aurora (cian → ámbar), tipografías, *easing* |
| 2. Consola | `--console-*` | Semántica de panel: ancho (1120 px), gutter, barra lateral (264 px), **tres radios** (tarjeta 16, control 12, píldora), densidad, tamaños de texto, colores por función (`card-border`, `chip-bg`, `attention`, `danger`…) |
| 3. Puente | `--color-*` | Redefine dentro de `.console` las variables que usan las utilidades Tailwind existentes (`bg-bg`, `text-ink`, `border-line`…) |

Ningún componente escribe un color a pelo: si hace falta uno nuevo, se añade a la capa 2 con un nombre de función.

## 2. Tipografía

Tres voces, **autoalojadas** (`@fontsource-variable/*`), sin peticiones a Google (privacidad y RGPD):
- **Big Shoulders 600**: titulares de pantalla (`.co-page-title`) y números (`.co-num`).
- **Bricolage Grotesque** (ancho 100): solo el wordmark `cofundo`.
- **Inter**: todo lo demás.

Seis tamaños más el titular: entidad 20 · tarjeta 16 · cuerpo y fila 14 · meta 12 · micro 11 (eyebrows y badges). La jerarquía se marca con **peso**, no con tamaño: un título de fila y una cabecera de sección miden lo mismo. El cuerpo va a 14 y no a 13 (en Lumbra, 13 se leía apretado).

## 3. Estructura (shell)

- **Un solo sitio decide el ancho**: `<AdminLayout width="content | workspace">`. Ninguna pantalla pone el suyo.
- **Barra lateral de 264 px**, de arriba abajo: wordmark → conmutador → destinos → anclas abajo (espacio de trabajo y perfil, con su menú).
- **Dos navegaciones con conmutador**: *Vender* (Dossiers o Mis cuentas, Preparar mensaje, Qué ha funcionado, Aprende) y *Configurar* (Configuración guiada, Playbook y mercado, Catálogo, Equipo, Marca). Solo los admins ven el conmutador; ningún menú cambia según permisos.
- **Estado activo con tres señales**: fondo, color y peso.
- **El panel mide su propio ancho** (`container-type`): columnas a partir de 720 y 1100 px; panel secundario al 36 % con topes de 340–380 px (`.co-split`).
- **Móvil (<1024 px)**: cabecera compacta y cajón `<dialog>` con la misma navegación.

## 4. Componentes

| Componente | Archivo / clase | Regla |
|---|---|---|
| Cabecera de pantalla | `ui/PageHeader.astro` | Eyebrow → titular → lede; acciones a la derecha |
| Tarjeta | `.co-card` | Borde de pelo, radio 16, **sin sombra** (la sombra solo en overlays) |
| Lista | `.co-rows` + `.co-row` | Listas accionables como tarjetas y la fila entera es el enlace; nada de tablas |
| Fila que pide atención | `.co-row--attention` | Relleno suave y regla lateral, con el motivo **en texto** |
| Botones | `.co-btn--primary / ghost / quiet / danger` | Primario negro en píldora, uno por vista |
| Campos | `.co-input / select / textarea`, `.co-field`, `.co-help` | 40 px de alto, radio 12, foco con anillo |
| Filtros y opciones | `.co-chip`, `.co-option` (opción grande con icono) | `aria-pressed` o `input:checked` para el estado |
| Badges y etiquetas | `.co-badge` (1–2 palabras) y `.co-tag` (frases cortas) | Una frase no es un badge |
| Estado vacío | `ui/EmptyState.astro` | **Tipado**: `filter` (limpiar filtro), `create` (enlace para crear) o `none` (vacío bueno, con motivo). No se puede pintar uno sin acción ni motivo |
| Mensajes | `ui/Alert.astro` | **Rechazo** (regla de negocio, frase llana) ≠ **fallo** (bug nuestro, con código) |
| Confirmación | `ui/ConfirmDialog.astro` | `<dialog>` nativo para acciones que cambian el estado de alguien o mandan algo fuera. Dice lo que hace y, **obligatorio, lo que no hace** |
| Acciones | `.co-action` | Icono, etiqueta y chevron; las destructivas, en su propio grupo al final |
| Iconos | `ui/Icon.astro`, `lib/ui/icons.ts` | Lucide, trazo 1.5, monocromo; un único módulo |

## 5. Copy

Español de España, tuteo y tono directo, con frases cortas. **`npm run lint:copy` rompe el build** si aparece en la consola:
- «No hay datos», «Sin resultados», «Ha ocurrido un error» o «Algo ha salido mal»;
- lenguaje posicional («más arriba», «la de abajo»…);
- emojis (la consola es monocroma; ✓ · → sí valen).

Los órdenes de las listas son deterministas: si dos filas empatan, decide el id.

## 6. Assets

**No falta ninguno para la consola**: las fuentes vienen de npm, los iconos de `lucide-static` y el wordmark es texto. Si queréis, me podéis pasar:
- el **SVG oficial del wordmark** `cofundo` (hoy se compone con Bricolage; quedaría idéntico, pero el SVG evita depender de la fuente);
- un **favicon** de Cofundo para la consola (hoy usa el del navegador);
- el **nombre definitivo del producto** (hoy «cofundo · Ventas», una constante en `src/lib/site.ts`).

## 7. Lo que se ha adaptado de la guía (y por qué)

- **Radio de tarjeta 16** (Cofundo usa 20 en la landing): la consola puede variar el radio, porque es un cambio de registro y no de marca.
- **Cuerpo a 14** y no a 13, por lo aprendido en Lumbra.
- **Hover de tarjeta sin sombra**: solo cambia el borde. En una consola, la elevación se reserva para lo efímero.
- **Éxito monocromo**, con el tinte cian del aurora al 14 %: Cofundo no tiene verde.
