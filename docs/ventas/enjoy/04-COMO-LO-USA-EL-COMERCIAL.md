# 04 · Cómo lo usa el comercial (y cómo devolvérmelo)

_Enjoy the Club · exportado el 2026-10-04 de `tenants/enjoy/tenant.json`._

Dónde aparece cada pieza de 01–03 dentro de la app, en qué orden, y el formato para devolverlo mejorado.

> **Para quien revise esto (persona o agente):** cambia el texto todo lo que quieras, pero **no cambies las `key`** (así sé qué
> pieza sustituye a cuál). Si algo sobra, márcalo **[QUITAR]**; si falta, añádelo como **[NUEVO]** con una `key` inventada
> en minúsculas y guiones. Respeta los límites de cada campo (están en «04 · Cómo lo usa el comercial»).


## 1. El día a día del comercial

1. **Bienvenida** (6 pasos, la primera vez): hola → qué vendemos (el recorrido + los módulos) → a quién (sectores) →
   cómo se vende (3 jugadas fijas que elige el líder; las que más ganan solo cuando haya 20 cierres documentados) → sus condiciones → su perfil.
2. **Aprende** (en orden, con progreso):
   0. **Por qué existimos** — visión, estrategia, modelo y objetivos (01 · 2). Algunas piezas solo las ve el equipo interno.
   1. **Lo que vendes, en 1 minuto** — el recorrido «Así funciona» (01 · 3).
   2. **Qué ofrecemos** — una ficha por módulo (01 · 4) con sus jugadas (03, por módulo), ordenadas por tipo:
      «Cómo presentarlo» → «Para quién (y cuándo no)» → «Preguntas de descubrimiento» → «Pruebas y casos» → «Objeciones» → «Precio y monetización» → «Guiones» → «Consejos».
   3. **A quién vendemos** — una ficha por sector (02): propuesta de valor, cliente ideal, actores, qué enseñar.
   4. **Cómo se vende** — las jugadas generales (03, «Generales»).
3. **Crea la propuesta**: elige sector, tarifa y módulos (los recomendados del sector salen ya puestos), personaliza con el
   logo/fotos/vídeo del cliente y comparte el enlace. El cliente la ve como una presentación.
4. **Guion de la reunión** (se genera solo, no inventa nada: ordena las jugadas oficiales según la propuesta):
   0. **Antes de nada** — el aviso del sector (si lo tiene) y su mentalidad. **Antes de ir** — lo que se mira y se manda
      antes de la llamada o la visita.
   1. **Con quién hablas** — cada contacto de la cuenta con su papel, qué quiere, qué le duele, cómo abordarle y su ángulo
      con cada módulo (02 · actores).
   2. **Apertura** — guiones de primer contacto (si el sector no tiene relato propio, también el «Cómo presentarlo» general).
   3. **Descubrimiento** — preguntas del sector (o generales) + las de los módulos de la propuesta.
   4. **Lo que se cuenta** — el relato del sector, en su orden (solo sectores con guion verificado).
   5. **Presentación** — por cada módulo, en el orden de la propuesta: 1 «Cómo presentarlo», 1 «Para quién», 1 «Prueba»,
      1 «Consejo» y el mejor truco del equipo. **Si el módulo no tiene jugadas, sale vacío** (hoy: «Portada para bodas»).
   6. **Precio** — «Precio y monetización» de los módulos + las del sector (o generales). Regla: después del valor.
   7. **Objeciones probables** — las de los módulos y las del sector (o generales), ordenadas por lo que más ha funcionado.
   8. **Cierre y seguimiento** — guiones de cierre y seguimiento del sector (o generales).
   > **El sector manda:** en cada apartado, si el sector tiene jugadas propias, salen solo esas. Las generales cubren huecos.
5. **Preparar mensaje**: arma un texto con el contexto de la cuenta (sector, actor, situación, objeción, etapa) y las jugadas
   que mejor encajan, para pegarlo en ChatGPT/Claude con el Cerebro de Ventas conectado. El sector **filtra, no puntúa**:
   si la jugada es de otro sector, no entra. Entre las que quedan: actor exacto +100, misma objeción +60, misma etapa +40,
   y lo que ha ganado en cierres reales (solo a partir de 20 cierres documentados).
6. **Qué ha funcionado**: cada cierre ganado o perdido registra qué jugadas se usaron; las que ganan suben solas.

## 2. Formato para devolvérmelo

Lo más fácil para mí: **los mismos cuatro documentos, editados**, respetando los títulos y las `key`. Para cada pieza:

| Pieza | Campos | Límites |
|---|---|---|
| Jugada (03) | título · texto · cuándo usarla · por qué funciona · tipo · etapa · objeción · sectores · actores | título ≤ 200, texto ≤ 8000 (ideal < 600), cuándo ≤ 1000, por qué ≤ 2000 |
| Paso del recorrido (01 · 3) | título · texto | título ≤ 80, texto ≤ 240, máx. 8 pasos |
| Módulo (01 · 4) | nombre · descripción · textos de la propuesta | títulos ≤ 120, entradillas ≤ 300, frase de cada pantalla ≤ 220 |
| Sector (02) | propuesta de valor · cliente ideal · cuándo no · cómo decide · tamaño · ciclo · qué enseñar | párrafos cortos o viñetas |
| Actor (02) | quiere · le duele · cómo abordarle · cómo ayuda · cómo lo tumba · objeciones · ángulos | una o dos frases cada uno |

Valores permitidos — **tipo:** `pitch` (Cómo presentarlo), `fit` (Para quién (y cuándo no)), `discovery` (Preguntas de descubrimiento), `proof` (Pruebas y casos), `objection` (Objeciones), `monetization` (Precio y monetización), `script` (Guiones), `tip` (Consejos). **Etapa:** `prospeccion` (Prospección), `primer_contacto` (Primer contacto), `descubrimiento` (Descubrimiento), `pitch_demo` (Pitch / Demo), `objeciones` (Objeciones), `negociacion` (Negociación), `cierre` (Cierre), `seguimiento` (Seguimiento), `mentalidad` (Mentalidad). **Objeción:** `precio` (Precio), `tiempo` (Tiempo / me lo pienso), `desconfianza` (Desconfianza), `no_lo_necesito` (No lo necesito), `no_decido_yo` (No decido yo), `comparar` (Quiere comparar opciones), `ya_tengo_proveedor` (Ya tengo proveedor).

Reglas de estilo que ya sigue la app (para que lo nuevo encaje):

- Se lee en el móvil, delante del cliente o justo antes: **frases cortas, una idea por bloque, poco texto**.
- Lo que el comercial **dice** va como lo diría (en segunda persona al cliente, sin jerga interna).
- `{company}` se sustituye por el nombre del cliente y `{prospect}` por el de la persona.
- Nada de importes altos ni tramos de pago en lo que ve el cliente (decisión de producto).
- Cada objeción: qué dice el cliente (entre comillas) → qué contestas → cómo vuelves a la venta.
- Si una técnica viene del Cerebro de Ventas, se carga **el guion literal del creador**, con su título y su nombre. No se
  reescribe, no se resume y no se «mejora». Al lado puede ir la adaptación al contexto de la empresa, **marcada como tal**.
  Es material interno: no sale en nada que vea el cliente.
