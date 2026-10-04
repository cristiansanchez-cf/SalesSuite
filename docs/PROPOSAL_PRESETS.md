# Propuesta por sector (preajustes)

La propuesta no es una demo del producto: cuenta lo que gana **quien paga**, en su sector y en su situación
(documento 07 del agente de ventas, `docs/ventas/enjoy/fuentes/propuesta-07.md`).

## Cómo lo usa el comercial
1. Elige el **sector** de la propuesta.
2. Si el sector tiene receta, sale el panel **«Monta la propuesta para este cliente»**:
   - **Combinaciones guardadas** («hazme un José María»): un clic monta tipo, ángulo, preguntas, modo y tarifa.
   - **Cómo la vas a usar:** *Va sola* (argumentario: convence sin el comercial delante) o *Apoyo visual* (lo cuenta él).
   - **Elecciones de una sola opción**, en orden: el **tipo de cliente** y, si aplica, el **ángulo** (uno solo, nunca mezclados).
   - **Lo que sabes del cliente:** preguntas de sí/no; algunas solo salen con un tipo o un ángulo.
   - Tras montarla, **«Guardar esta combinación»** con un nombre: la ve todo el equipo; la borra quien la hizo o un admin.
3. **Montar la propuesta** rehace la lista de módulos con los textos del sector. Se puede volver a montar
   (avisa de que lo cambiado a mano se pierde). Después se arrastra, oculta o añade como siempre.

Lo que eligió se guarda en `dossier.preset` (privado: la propuesta pública no lo devuelve).

## La receta (`segment.proposal`, desde `tenant.json` → `market[].proposal`)
```json
{
  "blocks":  { "pantalla": { "module": "pantalla-en-vivo", "props": { "title": "Tu pantalla, desde tu móvil" } } },
  "modes":   { "full": ["portada", "problema", "pantalla", "movil", "precio"], "visual": ["movil", "pantalla", "dinamicas", "precio"] },
  "questions": [
    { "key": "dj", "label": "¿Tiene DJ residente?", "rules": [{ "add": "dj", "after": "movil" }] }
  ]
}
```
- **Bloque** = un módulo del catálogo (por clave) + sus textos para ese sector (se guardan como personalización del módulo).
  Un mismo módulo puede salir varias veces con textos distintos (p. ej. `tabs-experiencias` como «Dinámicas» y como «Tu DJ»).
  Así las jugadas de ese módulo siguen apareciendo en el guion.
- **Elecciones** (`choices`): una opción por elección, con `default`; `when` = solo si otra respuesta está (p. ej. el ángulo solo con `tipo:estandar` o `tipo:grupo`). Las respuestas se guardan como `elección:opción`.
- **Reglas** (primero las de las elecciones, luego las de las preguntas): `add` (con `after`/`before`, que aceptan alternativas: la primera que esté), `remove`, `replace` → `with`, `patch` → `set` (retoca textos), `insert` (mete un elemento en una lista: `into`, `at`, `value`). Cualquier regla admite `when` (solo si esa respuesta está).
- **Tope** (`max` por modo) y **prioridad** (`priority`): si no caben, salen los de menos prioridad. No se comprime nada. Una opción de una elección puede traer su propio orden (`priority`): si se elige, manda ese (la última elección con orden propio gana).
- El alta valida que cada bloque, con sus textos encima de los del módulo, sea válido para su plantilla.

Lógica pura en `src/lib/proposal/preset.ts` (`planProposal`), la usan el editor (`applyPreset`), las muestras y el alta.

## Plantillas nuevas
| Plantilla | Para qué |
|---|---|
| `problem-solution` | «Lo que te pasa hoy»: 1–4 tarjetas problema → lo que cambia, y una nota opcional |
| `case-study` | Caso real con nombre (solo con autorización por escrito), cita y foto opcionales |
| `live-screen` · escena `club.promo` | El local escribe a su pantalla desde su móvil («chupito a 2 €…») |
| `phone-tour` · `parts` | Grupos propios: cada paso con lo que hace el invitado y **«Para ti»** (lo que significa para quien paga). `price: 0` quita el pago; `djName: ""` quita el DJ |
| `cost-math` | «Lo que ya te cuesta»: el comercial mete las cifras del cliente en el editor (€ por noche, noches al mes, horas del domingo). Sin cifras, la diapositiva no sale |
| `pricing-card` · `footnote` | Una línea final. El sufijo («/ mes», «/ evento») sale del periodo de la tarifa |

Portada, «lo que te pasa hoy» y caso real son **contexto**: no salen como módulos sin jugadas en el guion de la reunión.

## Hoy
- **Locales de ocio nocturno:** receta del documento 08 (`scripts/apply-propuesta-08.py`) con las respuestas del 12 encima (`scripts/apply-respuestas-12.py`, siempre después): tipo (local, grupo, revende para privados, caseta de feria), ángulo A–F, 9 preguntas (karaoke incluida), tope de 8 (5 en apoyo visual). En el ángulo D y en grupos el caso se queda antes que los condicionales.
- **Promotoras de eventos:** receta del documento 09 (`scripts/apply-propuesta-09.py`): tipo (pequeña, asentada; la operación de escala la lleva fundador y no tiene receta), ángulo A–D, frecuencia (decide la tarifa: evento suelto, pack anual o suscripción), 4 preguntas, tope de 7 (5 en apoyo visual).
- **Conciertos y artistas:** receta del documento 11 (`scripts/apply-propuesta-11.py`): tipo (sala, promotor, artista o manager, agencia, charanga), ángulo A, B o D (el C, paquete VIP, bloqueado), 3 preguntas (menú cerrado, patrocinador, más de una pantalla → la pantalla de la barra; adenda 11-bis, `scripts/apply-adenda-11bis.py`), tope de 8.
- **Hoteles y resorts:** dossier de validación del documento 14 (`scripts/apply-propuesta-14.py`): 6 diapositivas fijas, sin preguntas ni precio. Lo enseña un colaborador externo con el enlace del ejemplo «Enjoy para hoteles y resorts» (las aperturas cuentan).
- **Festivales:** receta del documento 15 (`scripts/apply-propuesta-15.py`): tipo (recinto, festival mediano, festival grande, infraestructura de temporada), ángulo A–D, 3 preguntas (VJ → encima de vuestros visuales, patrocinadores, primera edición → acompañamiento), tope de 8.
- Bodas: sin receta todavía (módulos recomendados como siempre).
