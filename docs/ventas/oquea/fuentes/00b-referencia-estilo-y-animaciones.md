# Referencia de estilo y craft web — cómo lo hicimos en Oquea

> **Para el agente que está construyendo la otra web.**
> Esto NO es un design system que debas copiar. Tu marca es distinta (otros
> colores, otra tipografía, otro tono) y eso manda. Lo que sigue son las
> **decisiones y técnicas** que nos dieron un resultado que gustó: el *porqué*
> detrás de cada una y *cómo aplicar el mismo principio con TUS propios tokens*.
> Tómalo como consejo. Donde diga un valor concreto (px, ms, curvas), es un
> punto de partida sensato, no una regla; ajústalo a tu marca.
>
> Stack de referencia: **Astro 5 (SSG) · TypeScript · Tailwind v4 solo utilidades
> + CSS propio (BEM) · cero JS por defecto**. Si usas otro stack, los principios
> siguen valiendo.

---

## 0. El principio que lo gobierna todo: contención

La web gustó no por ser llamativa, sino por ser **calmada, consistente y con
oficio**. Menos efectos, mejor ejecutados. Si dudas entre "añadir algo" o
"quitarlo", quítalo. Cada decisión de abajo empuja hacia esa misma dirección.

---

## 1. Arquitectura de tokens (hazlo primero, antes de maquetar)

**Qué hicimos:** definimos TODO como variables CSS en `:root` —color, tipografía,
espaciado, radios, motion, z-index— y luego una capa de *alias semánticos*
encima (`--color-bg`, `--color-text-primary`, `--color-primary`, `--color-border`…)
que apuntan a los tokens crudos. Los componentes usan los alias, nunca el valor.

**Por qué:** cambiar la marca entera es tocar 10 variables, no 400 archivos. Y
fuerza consistencia: nadie inventa un gris nuevo a mitad de página.

**Cómo adaptarlo:** usa TUS colores de marca, pero replica la estructura de dos
capas (crudo → semántico). Y sobre todo: **usa escalas cerradas**, no valores
libres. Nosotros nos limitamos a:
- **Espaciado:** `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. Nada de `15px` o `22px`.
- **Tipografía (UI):** `10 · 12 · 14 · 16 · 18 · 20 · 24`. Los títulos de
  marketing sí rompen la escala (H1 ~48–56, H2 ~32–48) — es la única excepción.
- **Radios:** un valor para tarjetas (nosotros 24), uno para "pills"/botones
  (999 = cápsula), y 6/8/12/16 para elementos internos.

```css
:root {
  /* crudos */
  --brand-500:#....; --brand-700:#....; --ink-900:#....; --paper:#fff;
  /* semánticos (lo que usan los componentes) */
  --color-bg: var(--paper);
  --color-text-primary: var(--ink-900);
  --color-primary: var(--brand-700);
  --color-border: #ececec;
  /* escalas */
  --sp-sm:8px; --sp-md:12px; --sp-lg:16px; --sp-xl:20px; --sp-2xl:24px; --sp-3xl:32px;
  --radius-lg:12px; --radius-2xl:24px; --radius-full:999px;
}
```

---

## 2. Motion — tokens de movimiento y una sola técnica de scroll

**Qué hicimos:** tres duraciones y tres curvas como tokens, y las reutilizamos en
todo. Nada de `transition: 0.3s ease` suelto por ahí.

```css
--motion-fast:150ms; --motion-normal:250ms; --motion-slow:400ms;
--motion-ease:cubic-bezier(.4,0,.2,1);
--motion-ease-out:cubic-bezier(0,0,.2,1);
--motion-spring:cubic-bezier(.34,1.56,.64,1);
```

**La animación estrella — "reveal on scroll":** los bloques entran con un
*fade + subida suave* cuando aparecen en viewport. Es el 80% del "se siente
vivo" con casi cero coste. Un solo `IntersectionObserver` global controla tres
variantes: `.reveal` (bloque), `.reveal-scale` (títulos grandes, añade micro
zoom) y `.reveal-stagger` (rejillas: los hijos entran en cascada).

**Reglas de oro que hacen que quede bien y no molesto:**
- Se dispara **una vez** (`unobserve` tras revelar), no cada vez que scrolleas.
- **Respeta `prefers-reduced-motion`**: si está activo, se muestra todo de
  golpe sin animación. Innegociable por accesibilidad.
- Umbral bajo (~12%) y un pelín de `rootMargin` negativo para que dispare justo
  antes de estar del todo dentro.
- La cascada del stagger es corta (retardos de ~90ms, máx ~6 hijos). Más se
  siente lento.

```html
<script>
  const els = document.querySelectorAll('.reveal, .reveal-scale, .reveal-stagger');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => io.observe(e));
  }
</script>
```
```css
.reveal,.reveal-scale{opacity:0;transform:translateY(20px);transition:opacity 720ms var(--motion-ease-out),transform 720ms var(--motion-ease-out);}
.reveal-scale{transform:translateY(20px) scale(.985);}
.reveal.is-visible,.reveal-scale.is-visible{opacity:1;transform:none;}
.reveal-stagger>*{opacity:0;transform:translateY(24px);transition:opacity 700ms var(--motion-ease-out),transform 700ms var(--motion-ease-out);}
.reveal-stagger.is-visible>*{opacity:1;transform:none;}
.reveal-stagger.is-visible>*:nth-child(2){transition-delay:90ms}
.reveal-stagger.is-visible>*:nth-child(3){transition-delay:180ms}/* …hasta ~6 */
@media (prefers-reduced-motion:reduce){.reveal,.reveal-scale,.reveal-stagger>*{opacity:1!important;transform:none!important;transition:none!important}}
```

**Consejo:** con esto + hovers sutiles ya tienes movimiento de sobra. Resiste la
tentación de parallax pesado, scroll-jacking o librerías de animación. Si algún
día quieres un "wow", que sea **un** momento puntual, no toda la página.

---

## 3. Navbar / header — cómo lo montamos

**Estructura (3 zonas):** logo a la izquierda · navegación en el centro ·
"acciones" a la derecha (selector de idioma + enlace "Iniciar sesión" secundario
+ **un** botón CTA primario). En móvil, el bloque central y las acciones
colapsan en un *drawer* que abre una hamburguesa.

**Decisiones que lo hacen sentir pro:**
- **Sticky** arriba, con fondo sólido (no transparente sobre contenido: evita
  ilegibilidad). Añade `scroll-padding-top` al `html` para que los anclas no
  queden ocultos bajo el header.
- **Una sola jerarquía de acción:** el CTA primario es el único botón "lleno".
  "Iniciar sesión" es un enlace de texto. No compitas dos botones fuertes.
- **Drawer móvil en JS vanilla**, sin framework: la hamburguesa togglea
  `aria-expanded` y un atributo `hidden` en el panel. El panel **se cierra solo**
  al pulsar un ancla interna. Accesible: `aria-controls`, `aria-label`, foco
  visible.
- Altura del header como token (`--header-h`) para reusarla en el
  `scroll-padding` y en cálculos.

**Cómo adaptarlo:** misma anatomía y mismas reglas de accesibilidad; cambia
colores/tipografía. Si tu marca tiene menos ítems, no rellenes: un navbar con 3
enlaces limpios se ve mejor que uno con 7 forzados.

```html
<header class="site-header" data-header>
  <div class="container header__inner">
    <a class="header__brand" href="/">LOGO</a>
    <nav class="header__nav" aria-label="Principal"><a href="…">…</a>…</nav>
    <div class="header__end">
      <a class="header__signin" href="…">Iniciar sesión</a>
      <a class="btn btn--primary" href="…">CTA principal</a>
      <button class="header__burger" aria-expanded="false" aria-controls="mnav" data-burger>≡</button>
    </div>
  </div>
  <div id="mnav" class="mobnav" hidden> … mismos enlaces + CTA full-width … </div>
</header>
```

---

## 4. Botones y micro-interacciones

- **Forma de cápsula** (`border-radius:999px`) para botones/pills. Da un aire
  amable y moderno. (Si tu marca es más "seria/tech", un radio menor también
  vale — mantén UNO solo, coherente.)
- **Peso semibold, tamaño base 16, padding cómodo** (`12px` vertical, `24px`
  horizontal). Nada de botones enanos.
- **Jerarquía por variantes:** `primary` (relleno de marca), `ghost`
  (secundario, fondo claro/borde suave) y una variante `on-dark` para secciones
  oscuras. Regla: **un primario por vista/sección**.
- **Micro-feedback:** en `:active`, `transform: translateY(1px)` (se "hunde"
  1px). Transiciones con `--motion-fast`. Estados hover que cambian fondo/borde,
  no que salten de tamaño.
- **Foco visible** con outline de marca en todo lo interactivo (accesibilidad).

---

## 5. Jerarquía visual: bordes y fondos, no sombras

**Qué hicimos:** la jerarquía se construye con **fondos alternos y bordes de
1px**, casi sin `box-shadow`. Secciones que alternan `fondo blanco / fondo gris
muy suave` para marcar ritmo. Tarjetas = `borde 1px + radio grande`.

**Por qué:** el flat con buenos bordes envejece mejor y se ve más limpio que las
sombras por todas partes. Reservamos sombra solo para 3–4 casos de marketing
(CTA principal, tarjetas flotantes de producto, mockups) y muy suaves.

**Hover de tarjeta que quedó bien:** el borde se tiñe al color de marca claro +
`translateY(-3px)` + una sombra suavísima que aparece solo en hover. Sutil.

**Cómo adaptarlo:** si tu marca SÍ es de sombras/neumorfismo, adáptalo — pero
elige un lenguaje y sé consistente. Lo que mata una web es mezclar tres estilos
de elevación.

---

## 6. Ritmo de sección y "cabeceras de sección"

**Patrón repetido en toda la web:** cada sección tiene una *cabecera* con tres
piezas fijas:
1. **Eyebrow**: etiqueta corta, mayúsculas, *letter-spacing*, tamaño pequeño,
   color de marca. (ej. "ECOSISTEMA")
2. **Título**: grande, `clamp()` para que escale con el viewport.
3. **Lede**: 1–2 frases de apoyo, color secundario, ancho máximo ~60ch.

Padding vertical generoso y fluido: `padding-block: clamp(40px, 8vw, 96px)`.
Contenedor centrado con `max-width` (~1200px) y gutter lateral fijo (~24px).

**Por qué:** da un pulso reconocible: el usuario aprende a "leer" la página. Y el
`clamp()` hace que se vea bien de móvil a desktop sin mil media queries.

---

## 7. Hero y "enseñar el producto"

- **Hero de home:** eyebrow/microlínea + titular grande + lede + fila de CTAs
  (primario + ghost) a un lado, y un **visual del producto** al otro (en móvil se
  apila, visual debajo).
- **Heros de páginas internas:** versión centrada, solo texto, con un par de
  *halos* radiales muy tenues de fondo animados con un `@keyframes` lento de
  escala (respetando reduced-motion). Aporta profundidad sin distraer.
- **Mockups de producto:** en vez de screenshots planos, montamos marcos de
  móvil con UI "de mentira" pero realista (barras, tarjetas, chips). Uno de los
  bloques **rota** entre varias pantallas con un timer que solo corre cuando la
  sección está en viewport y se puede clicar para saltar. Vende el producto
  mucho mejor que una imagen estática.

**Cómo adaptarlo:** aunque no hagas mockups, el principio es **mostrar, no
describir**. Un preview real de lo que ofreces > un icono genérico.

---

## 8. Formularios (lo aprendimos en la página de soporte)

- Inputs con **radio medio (12px)**, borde suave, padding cómodo, tamaño 16
  (evita el zoom automático en iOS).
- **Foco claro:** borde de color de marca + un *ring* de 3px translúcido del
  mismo color. Se ve accesible y cuidado.
- **Selects con caret propio:** `appearance:none` + un SVG de flecha posicionado,
  para que no salga el feo nativo.
- **Checkbox de consentimiento** con `accent-color` de marca.
- **Progressive enhancement:** el form funciona aunque falle el JS (nosotros con
  `action="mailto:"` de fallback) y el JS solo lo *mejora* (arma un asunto/cuerpo
  estructurado). Nunca dependas de JS para que un formulario básico sirva.
- Estados de error visibles y con `role="alert"`.

---

## 9. Tipografía y fuentes (estrategia, no la fuente)

- **Una familia manda toda la UI** (en Oquea, Gilroy). Coherencia total.
- Fuentes de "display/marketing" o "acento emocional" **con moderación**, solo
  para titulares o 1–2 palabras. No metas 4 tipografías.
- **Rendimiento de fuentes:** self-host de la principal con `font-display:swap` y
  **preload de los 2–3 pesos críticos** (los del above-the-fold). Las
  secundarias, desde su CDN con `preconnect`. Evita FOIT y CLS.

**Cómo adaptarlo:** usa TUS fuentes, pero mantén "una para UI + una de acento" y
la misma disciplina de carga.

---

## 10. Color de acento — úsalo como acento

Nosotros tenemos un color vibrante (lima) que usamos **solo como relleno/fondo,
nunca como color de texto** (contraste malo). Regla general transferible: tu
color más saturado es para *momentos* (un botón, un highlight, un fondo), no para
párrafos. El cuerpo de texto va en tinta neutra sobre fondo claro.

---

## 11. Rendimiento y SEO horneados desde el inicio (no "después")

Esto influye en el resultado tanto como el diseño:
- **Estático / SSG, cero JS por defecto.** Solo `<script>` inline pequeños para
  lo imprescindible (drawer, reveal, rotador). HTML que carga en <200ms.
- **CSS crítico inline**, resto diferido.
- **Un layout base centraliza el `<head>`**: `title`, `description`, `canonical`,
  Open Graph, Twitter Card, favicon, y **JSON-LD** (Organization global +
  Breadcrumb/tipo específico por página). Cada página solo pasa sus props.
- **Imágenes en `.webp`, `loading="lazy"`** salvo el hero (`eager` +
  `fetchpriority=high`).
- Si es multi-idioma: una **fuente única de rutas** que alimente `hreflang` y el
  `sitemap` automáticamente (así no se desincronizan nunca).
- `robots.txt` + sitemap desde el día 1.

---

## 12. Checklist anti-patrones (lo que evitamos a propósito)

- ❌ Sombras por todas partes / mezclar lenguajes de elevación.
- ❌ Valores fuera de escala (`15px`, `13px`, radios random).
- ❌ Dos botones primarios compitiendo en la misma vista.
- ❌ Animaciones que se repiten en cada scroll, o parallax pesado.
- ❌ Ignorar `prefers-reduced-motion` y el foco de teclado.
- ❌ Tipografías de más (4 fuentes).
- ❌ El color de acento como texto de cuerpo.
- ❌ Depender de JS para que algo básico (nav, form) funcione.
- ❌ Emojis como iconografía: usa un set de iconos coherente (uno solo).

---

### Resumen en una línea
**Tokens cerrados + contención + un solo truco de animación bien hecho (reveal on
scroll con reduced-motion) + jerarquía por bordes/fondos + rendimiento y a11y de
serie.** Adáptalo a tu marca; el estilo cambia, la disciplina no.
