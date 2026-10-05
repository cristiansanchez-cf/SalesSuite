# Oquea · peticiones a la sesión de Enjoy (código compartido)

> Lo que la sesión de Oquea ha tocado o necesita fuera de `tenants/oquea/**`, `docs/ventas/oquea/**` y `docs/oquea/**`.

## Hecho en la rama de Oquea (revisar al integrar)
| Archivo | Qué | Riesgo para Enjoy |
|---|---|---|
| `src/modules/app-steps/**` | Plantilla nueva «Pasos con la app» | Ninguno (plantilla nueva) |
| `src/modules/center-console/**` | Plantilla nueva «Consola del centro» | Ninguno (plantilla nueva) |
| `src/modules/registry.ts` | Las dos entradas | Ninguno |
| `src/modules/Thumb.astro` | Miniatura de `app-steps` (el primer móvil) | Ninguno (rama nueva del `if`) |
| `src/lib/i18n/messages/team.ts` | Nombre de las plantillas en es/en/pt/ko | Ninguno |
| `scripts/sample-dossiers.ts` | Ejemplo `centro-buceo` (sector `centros-buceo`) | Ninguno: en Enjoy no existe el sector y se salta |

## Pendiente (no lo he tocado)
1. **La fuente de texto del espacio no llega al cuerpo de la propuesta.** `html` resuelve `font-family: var(--font-sans)`
   con el valor por defecto y `.ds-root` redefine la variable pero no vuelve a declarar `font-family`, así que el texto
   corrido sale en la fuente del sistema (los titulares sí, porque usan `font-display`). Afecta también a Enjoy.
   Arreglo propuesto: `font-family: var(--font-sans)` en `.ds-root` (ThemedShell). Las plantillas de Oquea lo declaran
   ellas mismas mientras tanto.
2. **Las miniaturas de Aprende tienen la paleta de Enjoy fija** (`Thumb.astro`: fondo `#0d0a12` y brillo rosa). Con
   Oquea (marca clara) se ven oscuras y rosas. Propuesta: sacar el fondo y el brillo de los tokens del tema.
3. **El recorrido de Aprende (`tour.ui`) solo sabe pintar la UI de Enjoy** (`phone:`, `screen:`, `report`). Oquea usa
   capturas (`image`). Si se quiere la UI viva, haría falta un `ui: 'oquea:<pantalla>'` que pinte `app-steps/Screen.astro`.
