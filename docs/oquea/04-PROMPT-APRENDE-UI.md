# Oquea · Aprende «Así funciona, de principio a fin» con UI, no con capturas

> Para la **sesión de Oquea**. Pégalo tal cual. Lo pide Cristian (6-oct-2026).

## Qué quiere Cristian

En Aprende, la tarjeta **«Lo que vendes, en 1 minuto»** abre **«Así funciona, de principio a fin»**
(`/admin/learn/tour`): los pasos 01, 02, 03, 04, 05 uno debajo de otro, con su número grande, título, frase y, al lado,
lo que se ve.

- **En Enjoy** al lado de cada paso **no hay una foto**: está la **UI de verdad recreada en HTML** (el móvil del invitado
  en la pantalla justa, la pantalla del local con su escena, el informe). Se mueve, se lee y usa los colores del tema.
  Cristian lo valoró como de lo mejor de la app: el comercial *ve* el producto funcionando.
- **En Oquea** el recorrido existe (`tenants/oquea/tenant.json → tour`, 5 pasos), pero cada paso usa una **captura**
  (`image`). **Hay que cambiarlo por UI**, igual que en Enjoy.

Ya lo tenías apuntado en `docs/oquea/PETICIONES.md` → Pendiente 3. Esto es la luz verde y el cómo.

## Cómo lo hace Enjoy (léelo antes de tocar nada)

- `src/pages/admin/learn/tour.astro`: cada paso de `tenant.tour.steps[]` puede llevar `ui`. `uiOf(ui)` decide qué se
  pinta; si no hay `ui` o no se puede pintar, cae a `image` (la captura). Si tampoco hay imagen, queda el hueco.
  - `ui: "phone:<paso>"` pinta `src/modules/phone-tour/Phone.astro` con `only=<paso>`, `zoom=0.78` y `float`, que
    deja el móvil flotando.
  - `ui: "screen:<escena>,<escena>"` pinta `src/modules/live-screen/ScreenMini.astro`.
  - `ui: "report"` pinta `src/modules/live-screen/ReportMini.astro`.
- Los datos de ejemplo de esa UI salen del **kit** (`admin.playbook.learnIndex().kit`, en `src/lib/playbook/service.ts`).
  El kit se arma con las props de los módulos del catálogo del espacio (`phone-tour`, `live-screen`). Así, la UI de
  Aprende es la misma que la de las propuestas.
- El marco (`.tour__frame--ui` + `.tour__glow`) y la alternancia izquierda/derecha ya están hechos y valen para Oquea.

## Qué hacer en Oquea

1. **Añadir dos tipos de `ui`** en `uiOf` (`tour.astro`), sin tocar los tres de Enjoy:
   - `ui: "app:<pantalla>"` → un móvil con `src/modules/app-steps/Screen.astro` (las 19 pantallas que ya recreaste:
     `qr-activity`, `dive-saved`, `share-card`, `create-activity`, `crm-diver`…).
   - `ui: "console:<vista>"` → la consola del centro de `src/modules/center-console` en tamaño mini (`today`,
     `activity`, `crm`, `centre`). Si hace falta, sácala a un `ConsoleMini.astro`, como `ScreenMini` sale de
     `live-screen`.
2. **Ampliar el kit** para que lleve las props de `app-steps` y `center-console` del catálogo de Oquea (el `sample`:
   nombres, punto de inmersión, cifras). Si un espacio no tiene esos módulos, su `ui` cae a `image`, igual que hoy.
3. **Cambiar los 5 pasos** de `tour` con un script `scripts/apply-oquea-NN.py` (nunca el JSON a mano). Se quedan
   título, frase e `image`, que sigue de respaldo. Propuesta para revisar:

   | Paso | Hoy (captura) | UI propuesta |
   |---|---|---|
   | 01 El centro crea la inmersión | `01-panel-centro-actividades.png` | `console:activity` (o `app:create-activity`) |
   | 02 El buceador escanea el QR | `02-registro-qr-logbook.png` | `app:qr-activity` |
   | 03 La inmersión queda en su logbook | `19-inmersion-guardada.png` | `app:dive-saved` |
   | 04 Al centro le queda la lista | `04-crm-perfil-buceador.png` | `console:crm` (o `app:crm-diver`) |
   | 05 Su nombre y su logo en cada tarjeta | `share-card-aerea.png` | `app:share-card` |

4. **De paso, si te da tiempo**: Pendiente 2 de `PETICIONES.md`. Las miniaturas de Aprende (`Thumb.astro`) tienen el
   fondo oscuro y el brillo rosa de Enjoy fijos y deben salir de los tokens del tema. Así Aprende de Oquea se ve
   entero con su marca.

## Reglas

- **Código compartido**: hazlo en tu rama y abre un **PR contra `claude/dreamy-dijkstra-a4xm1g`**. La sesión de Enjoy lo
  revisa e integra. No hay migraciones, así que no toques el workflow «Producción» de migraciones.
- **Enjoy no puede cambiar**: `phone:`, `screen:` y `report` siguen igual. Pasa `scripts/smoke-learn.cjs` (Enjoy) y
  añade al smoke un caso de Oquea (o uno nuevo) que compruebe que los 5 pasos pintan UI
  (`[data-testid=tour-ui]`) y no `img`.
- **Datos de ejemplo**: nombres y cifras inventados y marcados como ejemplo («Datos de ejemplo»), nunca resultados de
  un cliente. Solo funciones que existen hoy en la app.
- **Nada de fotos de stock dentro del móvil**: el móvil es UI. Una foto solo si es una captura real de la app, y como
  último recurso.
- Tokens del tema, sin colores fijos. Que se vea bien a 375 px de ancho (móvil del comercial).
- Antes de subir: `npm run check`, `npm test`, `npm run tenant:bootstrap -- tenants/oquea --dry-run` y el smoke.
  Manda capturas a Cristian del recorrido en escritorio y en móvil.

## Si no sabes de dónde sacar la UI

Si una pantalla no está recreada, o no sabes cómo es de verdad (qué campos, qué orden, qué textos), **no la inventes**.
**Díselo a Cristian**, con la pantalla exacta y lo que te falta. Él se lo pide a los agentes que trabajan en el
repositorio de Oquea (`OqueaApp`, Flutter, `lib/views/…`, y la web) para que te pasen el código exacto de esa vista. Con
ese código la recreas en HTML, como hiciste con `app-steps` y `center-console`.

Al terminar, actualiza `docs/oquea/ESTADO.md` y `docs/oquea/PETICIONES.md` (Pendiente 3 → hecho).
