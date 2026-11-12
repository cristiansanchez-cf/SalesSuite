# SciScreen

Espacio creado desde **Plataforma → Nueva empresa** (docs/ORG.md §Alta de una empresa). Su contenido (agente de alta) y
su CRM (importado desde su export de HubSpot) están en la base de datos; **este directorio trae la marca y el catálogo de
propuestas**, para aplicarlos con `alta-espacio` sin tocar nada más (no hay mercado, jugadas, precios ni campos del CRM:
`market` pisaría los sectores que creó el agente).

## De dónde sale (SciScreen design system 1.0, 1 nov 2026)

| Aquí | Del design system |
|---|---|
| Fondo `#fcfaf5`, superficie `#f6f2e6` | `--color-surface` paper-50, `--color-surface-subtle` cream-50 |
| Texto `#242320`, secundario `#53524f`, borde `#e9e8e3` | paper-900, paper-700 (el terciario falla AA sobre cream), paper-200 (borde de tarjeta) |
| Principal `#2246b2` | `--color-accent` blue-700: «el azul actúa» (enlaces, botones, foco) |
| Acento `#e1f5ff` con texto `#000341` | blue-50 + navy-950 («el navy es»: marca) |
| Radios 24 / píldora | tarjetas 24, botones y chips en píldora |
| Darker Grotesque 500 y 700 (titulares), Instrument Sans variable (texto) | las fuentes que sirve su app (OFL, licencias en `assets/fonts/`). Nunca pedir 600 a Darker Grotesque |
| `logo.svg` | su lockup para fondo claro, rehecho como su componente `Logo` (CONFLICTS C13): la geometría de `logo3` en navy con la banda en el color de la página. **No** se usa el `logo2.svg` entregado |
| `logo-on-dark.svg` | `logo3` / `lockup-on-navy.svg` tal cual (crema sobre navy) |
| `favicon.svg` | `mark.svg` (isotipo, navy) |
| `og.png` | 1200×630: el lockup crema sobre navy-950, hecho aquí (sus fotos no tienen el formato y algunas llevan texto) |

Fuera a propósito: las fotos con texto incrustado o marcas ajenas (photo1 con esquinas, photo4–8; SCI-88), el sello
`Liquid_glass` (C6/D10), el logo `lockup-light-AS-DELIVERED` y el verde/rojo de estados (la propuesta no los usa).

## Propuestas (catálogo)

| Módulo | Tipo | Qué enseña |
|---|---|---|
| `portada` | hero-pitch | La marca y lo que cambia en su página |
| `lo-que-te-pasa` | problem-solution | Hoy → con SciScreen (verificador, sello con registro, revisar y preparar) |
| `como-funciona` | tabs-showcase | Tu página → evidencia → dictamen → el sello, con sus fotos y el sello |
| `su-web` | site-verify | Su página de verdad (captura de Personalizar → Su web) con el sello real encima (compacto, placa o tarjeta) y la etiqueta «Simulación»; un cursor lo pulsa, la barra pasa a sciscreen.com y se abre la página del sello: marca, estado, URL verificada, fechas y cada afirmación con su evidencia y sus estudios |
| `el-sello` | seal-showcase | El sello en una página de ejemplo junto a sus afirmaciones, dónde va y los cuatro estados en palabras |
| `pricing` | pricing-card | La suscripción anual; sin tarifas hasta que estén confirmadas («Según las páginas que verifiquemos») |

**El sello, del kit del sello (12 nov 2026, `assets/seal/kit/`):** el que se instala de verdad, «Verificado a día [fecha]»,
en tres tamaños (compacto, placa, tarjeta) y dos colores (azul para fondos claros, crema para oscuros). En las propuestas
se pinta en HTML (`src/modules/SciSeal.astro`, con la fecha de hoy) y a su tamaño real sobre la captura (en una de 1440
px: compacto 271 × 32, placa 189 × 60, tarjeta 159 × 162). El sello antiguo («Vigente · Evaluación válida»,
`sello-cream.svg`) ya no se usa. Siempre «Simulación» sobre la web de una marca que aún no está verificada; el sello
certifica que **las afirmaciones de esa página** se han revisado contra la literatura científica, nunca el producto ni la
marca. Al pulsarlo se abre la página del sello en **sciscreen.com**, no en la web de la marca.

Reglas del design system que sigue (07-the-seal, 06-copy):
- **Sello:** solo el dibujo «Vigente» (`assets/seal/sello-cream.svg` sobre papel; `sello-navy.svg` para fondo navy, con
  su `#030050` tal cual, D4). Entero, nunca recortado ni por debajo de 72 px de alto. Los otros estados no tienen dibujo
  (C4): se cuentan con palabras. Un sello por página, nunca en envases, publicidad ni el pie de toda la web.
- **Textos:** «marca» (no «cliente»), «afirmación», «evidencia», «dictamen», «verificador», «sello». Nunca «avalado»
  (art. 44 Ley 17/2011): el sello dice qué se comprobó y cuándo. Sin exclamaciones, sin emoji, sin «arriba/abajo».
- **Fotos:** `img/foto-tarjeta.webp` (photo2), `img/foto-laboratorio.webp` (photo9) y `img/foto-producto.webp` (photo3),
  pasadas a WebP.

Pendiente de SciScreen: las tres tarifas (nombre, precio, qué incluye; se ponen en Precios), el enlace de «Hablamos 15
min» para los botones, si se puede citar AERTeM y un caso real con permiso.

## Aplicar

GitHub → Actions → **Producción** → `alta-espacio`, espacio `sciscreen`, primero con «Solo comprobar».
