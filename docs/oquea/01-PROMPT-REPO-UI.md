# Prompt para el repositorio (y el Figma) de Oquea · lo que necesitamos para replicar su UI

> Pega esto al agente que tiene el **repositorio de Oquea** (y, para lo que no esté en código, úsalo como lista para
> sacar del **Figma**). El objetivo es que las propuestas comerciales de Oquea en Cofundo Ventas lleven su marca y
> enseñen **su producto real**, igual que ya pasa con Enjoy the Club.

---

## Prompt (copiar desde aquí)

Hola. Estamos dando de alta a **Oquea** en **Cofundo Ventas**, una plataforma de propuestas comerciales y formación
de ventas con varios espacios (uno por empresa). Ya funciona para Enjoy the Club. Para Oquea necesitamos que las
propuestas que reciben sus clientes (centros de buceo y similares) **se vean como Oquea** y **enseñen la app real**,
no una aproximación.

No te pedimos que cambies nada de tu repositorio. Te pedimos que **nos entregues** lo siguiente, con rutas y archivos
reales, y que nos digas qué **no existe** o qué **tiene licencia que lo impida**. Responde con un único documento
Markdown, con estas secciones y en este orden. Donde no sepas algo, escribe **PENDIENTE** y quién lo sabría.

### 1. Identidad visual (design tokens)

Tabla con el valor exacto y **de qué archivo sale** (ruta en el repo o nombre del estilo en Figma):

| Token | Qué es | Valor | Fuente |
|---|---|---|---|
| `bg` | Fondo principal | `#rrggbb` | |
| `surface` | Fondo de tarjetas / secundario | | |
| `text` | Texto principal | | |
| `muted` | Texto secundario | | |
| `border` | Bordes y líneas | | |
| `primary` / `primary-contrast` | Color de marca y el texto que va encima | | |
| `accent` / `accent-contrast` | Color de acento y el texto que va encima | | |
| `radius.card` / `radius.button` | Redondeo de tarjetas y botones | `px` | |
| Tema | ¿Claro, oscuro o los dos? ¿Cuál es el principal en marketing? | | |

Si el design system usa más tokens (estados, degradados, sombras), lístalos aparte con su uso: nos ayudan a recrear las
pantallas aunque no todos pasen al tema.

### 2. Tipografía

- Familias de titulares y de texto, con los **pesos** que se usan.
- Los archivos **`.woff2`** (o `.ttf`/`.otf` para convertirlos) de cada peso.
- **Licencia**: ¿permite uso web en un dominio distinto del de Oquea (p. ej. `oquea.ventas.cofundo.io`)? Si no, la
  alternativa que aceptáis.

### 3. Logo e imagen de marca

- Logo en **SVG**: versión para fondo claro y para fondo oscuro (si son distintas). Isotipo suelto si existe.
- **Favicon** (SVG o PNG 512×512).
- **Imagen para compartir** (OG): 1200×630, la que sale al mandar un enlace por WhatsApp.
- Reglas de uso del logo (márgenes, tamaños mínimos, qué no se puede hacer).

### 4. La UI del producto (lo más importante)

En Enjoy, lo que más vende es ver **la pantalla del local** y **el móvil del invitado** funcionando dentro de la
propuesta: recreamos esas pantallas en HTML/CSS con los datos del cliente (su nombre, su logo, sus fotos) y animaciones
cortas (cada transición, menos de 3 segundos). Para Oquea queremos lo mismo con **sus** pantallas. Necesitamos:

1. **Mapa de superficies del producto**: qué apps o vistas tiene Oquea (p. ej. app del buceador, panel del centro,
   pantalla o tablet del centro, web pública…), quién usa cada una y qué hace en ella.
2. Para cada superficie, **los 4–6 momentos que mejor venden el producto**, en orden de flujo (p. ej. «el buceador
   escanea → ve su ficha → registra la inmersión → recibe sus puntos → canjea»). Para cada momento:
   - **Captura** a tamaño real (PNG) o el **frame de Figma** (enlace + nombre del frame).
   - **Código** del componente o pantalla (ruta en el repo): markup y estilos. Nos sirve para recrearlo fiel.
   - Qué datos de ejemplo enseña (nombres, cifras, textos) y cuáles se deberían personalizar con el cliente.
3. **Iconografía**: la librería que usáis (nombre y versión) o los SVG propios.
4. **Ilustraciones, mockups y fotos** de producto o de uso real (con permiso de uso): centros, buceadores, pantallas.
5. **Vídeos** cortos del producto funcionando (MP4/WebM), si los hay.
6. **Animaciones y microinteracciones** características (cómo aparece una tarjeta, una notificación, un sello…).

### 5. Web y material comercial actual

- URL de la web y de las páginas de producto o soluciones.
- Si hay un deck o dossier comercial (Figma, PDF, Keynote): enlace o archivo. Nos dice qué enseñáis primero y cómo.
- **Tono de voz** (tú/usted, tuteo, palabras que sí y que no) y ejemplos de textos reales.

### 6. Idiomas

- Idiomas de la app y de la web. ¿Hay traducciones oficiales de términos clave (en, pt, ko…)?

### 7. Datos de contacto comercial (para el pie de la propuesta)

- WhatsApp comercial (con prefijo), email, web, razón social. Dominio que queréis para las propuestas.

### Formato de entrega

- Un Markdown con las 7 secciones.
- Los archivos (fuentes, logos, capturas, fotos, vídeos) en una carpeta con esta estructura, o enlaces descargables:

```
oquea-entrega/
  fuentes/          *.woff2 (+ licencia)
  marca/            logo.svg, logo-oscuro.svg, isotipo.svg, favicon.svg, og.jpg
  producto/<superficie>/<nn>-<momento>.png   (+ .mp4 si hay)
  fotos/            fotos de uso real (con permiso)
  iconos/           (si son propios)
```

Gracias. Si algo de esto vive en otro sitio (Figma, Drive), dinos dónde y quién tiene acceso.

---

## Para la sesión de Cofundo Ventas (no se pega): qué se hace con cada cosa

| Entrega | Dónde va | Notas |
|---|---|---|
| Tokens | `tenants/oquea/tenant.json` → `theme_tokens.colors`, `radius`, `font` | Solo las claves de la lista blanca (`src/lib/theme.ts`) |
| Fuentes | `tenants/oquea/assets/fonts/*.woff2` → `font.faces[]` (`asset:fonts/…`) | Sin licencia web, no se sube |
| Logo, favicon, OG | `tenants/oquea/assets/` → `brand.logoUrl`, `logoOnDarkUrl`, `faviconUrl`, `ogImageUrl` | |
| UI del producto | Plantillas nuevas en `src/modules/<tipo>/` (`docs/MODULE_AUTHORING.md`) | PR a la rama de producción; recrear con tokens, no con colores fijos; animaciones rápidas; personalizable con `{company}`, logo y fotos del cliente |
| Fotos y vídeos | `tenants/oquea/assets/img/…` → módulo «En directo» (`media-strip`) | Solo con permiso de uso |
| Contacto, dominio | `brand.contact`, `domains` | DNS y redirect de Auth: `docs/SETUP.md` |
| Tono, deck | Contexto para el agente de negocio (doc 02) y para las portadas | |
