# Correcciones para el agente · documentos 03 (Jugadas) y 04 (Cómo lo usa el comercial)

**4 de octubre de 2026 · Enjoy the Club** — copia del documento de revisión. Se aplica con `scripts/apply-correcciones-03-04.py`.

## A. Nomenclatura
- `loc-` = jugadas del módulo «Enjoy para tu sala» (bodas y fincas). Los guiones de ocio nocturno van con `noche-`.
- Si ya existe una jugada que dice lo mismo, se actualiza esa (no duplicados): `noche-calendario`, `gen-venta-barra`, `noche-dj-menu`, `noche-prueba-hoy` y varias objeciones.

## B. Datos inventados (bodas)
- `exp-prueba` («Participación media 92 %»): QUITAR. NUEVO `gen-prueba-escaneo`: «En 2025 se registraron cerca de 30.000 peticiones de canciones con muy pocos eventos. Es lo que demuestra que el público sí escanea un QR dentro de un evento.» Por qué funciona: «Es el único dato de participación que tenemos y es real.»
- `exp-upsell`: sin cifras. «Vende las experiencias en pack, no sueltas. El coste marginal de añadir una es casi cero y una experiencia suelta compite con lo que ya hace el DJ. **Descuentos: los de la tabla oficial, ninguno más.**»
- `loc-monet`: `PENDIENTE · precio de bodas sin definir; nunca hemos cobrado una boda`.
- `bodas-aviso` (Consejos · Mentalidad · Bodas · solo equipo interno): «Bodas es el sector del que menos sabemos y el único donde nunca hemos cobrado. Hubo 12 leads, pricing cerrado y resellers definidos: a los organizadores que iban a pagarnos 300 €/mes les pareció buena idea y no pagó ninguno; a los resellers con 100 € de base les pareció bien y no revendió ninguno. Cuando un precio le parece bien a todo el mundo y no compra nadie, el problema no es el precio. Todo lo que hay en este sector son hipótesis.»

## C. Módulos vacíos
Reasignar a **Pantalla en vivo**: `conc-ndi`, `noche-pantalla-movil`, `gen-venta-barra`, `conc-multipantalla`, `conc-obj-pantallas`, `noche-obj-vj`. A **Móvil del invitado**: `exp-demo`, `conc-obj-derechos`, `gen-consentimiento`. `conc-menu-cerrado` se queda en Experiencias.
- NUEVO `pantalla-que-ve` (Pantalla en vivo · Cómo presentarlo · Pitch/Demo): «El 90 % de la noche la pantalla enseña un QR grande: ese es el anzuelo, sin eso no entra nadie. Cuando alguien pide algo, salta a pantalla completa con su nombre y su dedicatoria, y vuelve al QR. Si ya tienes visuales, nos ponemos encima en una tarjeta pequeña sin taparlos.»
- NUEVO `movil-sin-app` (Móvil del invitado · Cómo presentarlo · Pitch/Demo): «Abre la cámara, apunta al QR y ya está dentro. Sin descargar nada y sin registrarse. Elige qué quiere hacer, lo manda, y si alguien lo valida sale en pantalla en segundos. Todo lo que ha subido se le queda en el álbum.»

## D. Duplicados
- «Es caro»: una general (el precio no se argumenta, se cambia de línea) y las de sector solo con su ancla (8.000 € de kiss cam en conciertos; dos meses sin permanencia en locales).
- «Ya tenemos pantallas y un VJ»: una sola, en Pantalla en vivo, para los dos sectores.
- Descuentos: solo `gen-descuentos`. Traer de vuelta: una sola.

## E. Documento 04
1. El sector filtra, no puntúa.
2. Cerebro de Ventas: se carga el guion literal del creador, con título y nombre; no se reescribe, no se resume, no se «mejora». La adaptación a Enjoy va al lado, marcada como tal.
3. Hasta 20 cierres registrados, no se reordena por datos. Bienvenida fija: `gen-seguimiento-causa`, `noche-prueba-hoy`, `gen-precio-reglas`.
4. Falta el paso 0 de Aprende (parte F).

## F. Paso 0 «Por qué existimos» (Consejos · Mentalidad)
`vision`, `por-que-ahora`, `estrategia-bandera` (solo equipo), `estrategia-datos` (solo equipo), `estrategia-djs`, `modelo`, `objetivos` (solo equipo · PENDIENTE, lo rellena Cristian), `no-somos`. Textos literales en `tenants/enjoy/tenant.json`.

## G. Verificación final
Para cada jugada: ¿de qué frase del documento fuente sale? Si no hay frase, se vacía o se marca `PENDIENTE`.
