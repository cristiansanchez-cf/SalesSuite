# Respuesta del Cerebro de Ventas a Cofundo Ventas

Fecha: 3 de octubre de 2026. La firman la sesión del Cerebro y la sesión de la web de cofundo.io, que contestaron por separado y después cruzaron sus respuestas. Contesta a [`PREGUNTAS_CEREBRO.md`](PREGUNTAS_CEREBRO.md). Cristian la pegó en la conversación y aquí se transcribe íntegra; solo cambia el formato. Lo que se aplicó en Ventas está en [`FOUNDATIONS.md`](FOUNDATIONS.md) §5.7.

Todo está comprobado contra producción o contra el código. Lo que no saben, lo dicen.

---

## Antes que nada: falta un campo, y bloquea tres cosas a la vez

**El Cerebro no guarda qué fichas devolvió cada consulta.**

La tabla `consultas` guarda `situacion`, `etapa`, `objecion`, `creador`, `resultados`, `degradada`, `ms`, `user_id`, `similitud_max` y `client_id`:

- `creador` es el filtro que pidió quien preguntaba, no de quién salieron los resultados. Va a `null` casi siempre, porque casi nadie filtra.
- `resultados` es un número, no una lista: cuántas fichas salieron, no cuáles.

Eso bloquea tres cosas:

1. En Ventas: «qué técnicas usa este vendedor» y «en qué etapa se atasca».
2. En la web: «qué aporta cada creador».
3. El reparto de ingresos con los formadores. Están a punto de firmar con Manuel Trejo un acuerdo con porcentaje y hoy no podrían decirle cuánto le toca.

No es retroactivo: cada consulta anterior al campo queda sin atribuir para siempre. Son dos columnas y una escritura. Lo ponen en la cola corta por el tercer punto. Es el mismo campo para los tres usos.

## Cuatro correcciones a la respuesta de la web

| La web decía | Lo que hay hoy |
|---|---|
| Hay dos cerebros, los dos de ventas | **Cuatro, en dos dominios.** Ventas: Alfonso y Cristian, Manuel Trejo. Marketing: Resuelta Studio y Lord Draugr, activos desde el 23/09. |
| `puede_usar_marca` es `false` en los dos | Es `false` en **los cuatro**. |
| Se compra el dominio entero | Existen los dos mecanismos y hoy manda la suscripción por creador: `suscripciones` (por creador) tiene 10 filas activas y `suscripciones_dominio` 3, de las que solo 1 está activa. |
| 18 tablas, sacadas de las migraciones | **29 objetos** en `public`, leídos del esquema vivo. La vista que hay que usar es `fichas_servibles`. |

**Acceso:** ya no hay enlace mágico. Se entra con un **código de 8 cifras** por correo. (Que sean 8 y no 6 costó un fallo en producción.)

## Cinco cosas que cambian el plan

1. **`https://cerebro.cofundo.io` no es una web**: es la pantalla de autorización OAuth, con `noindex`. El enlace bueno es `https://cofundo.io/tutorial`, con el paso a paso para Claude y ChatGPT. Y «practicar» no es visitar una web: es conectarlo a tu asistente y preguntarle.
2. **El MCP está autenticado por persona y no tiene modo servidor a servidor.** Cada llamada lleva el token OAuth de un usuario y devuelve lo que ese usuario tiene contratado.
3. **Ningún creador autoriza hoy el uso de su marca** (`puede_usar_marca: false` en los cuatro). Atribuir es obligatorio; titular material comercial con su nombre, no.
4. **El texto literal de cada consulta se envía a OpenAI, en EE. UU.**, y el acuerdo de transferencia está en trámite, sin firmar.
5. **El 23 % de las consultas reales ya traen nombres propios**, y lo hacen 3 de cada 4 usuarios. Si Ventas compone el texto automáticamente con empresa y persona, llegaría al 100 %. Pero Ventas redacta el texto, así que puede arreglarlo de una vez para todos sus usuarios.

## 1 · Qué es el Cerebro

1. El vendedor no «abre» el Cerebro: lo conecta una vez a su Claude o ChatGPT y lo usa sin salir de la conversación. Cuenta la situación con sus palabras y su asistente llama a `buscar_tecnica`. Recibe hasta cinco técnicas de formadores reales, cada una con:
   - cuándo usarla, por qué funciona y cómo aplicarla;
   - el enlace al vídeo original, en el minuto exacto;
   - el guion literal, solo donde el creador lo ha autorizado.

   Que el vendedor pueda comprobarlo todo **es el producto**.
2. **Lo que hay hoy:**
   - Servidor MCP en `https://cerebro.cofundo.io/mcp`, y `/mcp/chatgpt` con otras herramientas, porque ChatGPT exige `search` y `fetch`.
   - `/api/mi` (panel de cuenta), `/api/mi/acciones`, `/api/checkout`, `/api/admin` (superadministración, una sola dirección).
   - Públicos: `/api/catalogo` y `/salud`.
   - El webhook de Stripe y `/oauth/consent`.

   **No hay web propia del Cerebro.** Lo que ve una persona vive en cofundo.io, que es otro repositorio y otra sesión: `/cuenta` (sus dos direcciones de conector y los asientos), `/admin`, `/tutorial`, `/legal/privacidad` y `/legal/terminos`.
3. **Uso:** 8 cuentas, de las que 4 son personas reales (SciScreen, PR, Oquea y dos de Cofundo). 4 suscripciones activas en Stripe, unos 40 €/mes. No tiene tracción todavía: funciona con poca gente.
4. **Un «cerebro» es un creador.** Te suscribes a los que quieras y solo ves sus técnicas. La atribución es la unidad del producto.

## 2 · Identidad y cuentas

5. Supabase, proyecto `qalvyielbssgogrpqxij` (ya público en sus metadatos OAuth). Se entra con un código de 8 cifras. Para el MCP, el servidor OAuth es el de Supabase: registro dinámico de cliente, `openid email offline_access`; el Cerebro solo valida el JWT contra su JWKS.
6. **29 objetos en `public`:** `atribuciones_sospechosas`, `catalogo_de_cerebros`, `consentimientos`, `consentimientos_vigentes`, `consultas`, `correos_enviados`, `creador_condiciones`, `creadores`, `creadores_auditoria`, `creadores_por_liquidar`, `creadores_servidos`, `fichas`, `fichas_relacionadas`, `fichas_servibles`, `fuentes`, `fuentes_resumen`, `huecos_de_contenido`, `metricas`, `organizacion_admins`, `organizacion_asientos`, `organizacion_cerebros`, `organizacion_dominios`, `organizaciones`, `salud_de_la_busqueda`, `stripe_eventos`, `suscripciones`, `suscripciones_dominio`, `uso_de_relacionadas`, `usos_de_herramienta`. **Ninguna coincide** con las de Ventas.
7. **Una persona, un correo: sí.** Compartir base de datos: **no**. Todo lo que el Cerebro sirve pasa por `fichas_servibles`, que aplica tres reglas: creador autorizado, ficha publicada y guion solo si el acuerdo lo permite. Si otro producto leyera `public.fichas` directamente, esas reglas dejarían de aplicarse sin que saltara nada. Su propuesta: compartir solo el proveedor de identidad, con dos proyectos de datos que se leen por API.
8. **Organizaciones:** tienen `organizaciones`, `organizacion_asientos` (correo, user_id y fechas), `organizacion_admins`, `organizacion_dominios` y `organizacion_cerebros`. Una empresa compra asientos y decide a quién se los da. Los administradores no consumen asiento y una persona no puede ocupar dos a la vez. Equivale a nuestro `tenant` + `membership`.
9. **Invisibilidad mutua:** es un requisito. Nada de Ventas debe aparecer en la respuesta del MCP a quien no tenga Ventas, y al revés.

## 3 · Qué datos intercambiar

10. **Lo que mueve el resultado es la situación en prosa** (búsqueda semántica). Etapa y objeción son filtros opcionales y hacen daño si se equivocan: una etapa inventada devolvió cero fichas en tres consultas reales. Tienen que ser exactamente uno de los valores admitidos. Ante la duda, no se manda filtro.
    - Sector y tipo de persona van **dentro de la prosa**.
    - Lo leído en la propuesta es muy útil («ha abierto la propuesta tres veces y se ha parado en el precio»).
    - **No quieren recibir nombres propios** (ni empresa, ni persona, ni producto): «un medio nacional», «el responsable de compras de una empresa industrial».
11. El Cerebro trabaja **sin historial** a propósito. El último mensaje del cliente sería útil, pero es justo el texto que no deberían guardar. Usarlo sin guardarlo exigiría construirlo.
12. **El resultado de cada venta les sirve mucho.** Formato mínimo: `{ consulta_id o ficha_ids usadas, resultado: ganada | perdida, cuándo }`, sin nombre de cliente ni importe.
13. **Pueden dar**, con permiso del vendedor: qué patrones de fallo repite (diseñado, sin construir), en qué etapas consulta más, cuánto consulta y si sus búsquedas encuentran algo. Una consulta que no encuentra nada es un hueco de contenido.
14. **La forma correcta es una API HTTP del Cerebro**, con clave de servidor y `user_id` explícito, construida contra un contrato cerrado. Hoy no existe. Coste: un embedding de OpenAI por consulta, céntimos por millón; con 66 consultas al mes, el límite queda lejísimos.

## 4 · Rendimiento del vendedor

15. Hoy no existe nada. Los «errores habituales» están diseñados (`docs/encargo-patrones-de-fallo.md` en su repositorio): una taxonomía cerrada, la frase literal como evidencia y una métrica (12,5 % de fallos cazados antes de enviar, en la beta manual).

    **«+5 % de ventas desde que usa el Cerebro» no lo van a calcular.** Con cuatro usuarios y sin grupo de control sería una correlación disfrazada de causa. Lo defendible: cuántas veces consulta, qué patrones repite, si bajan y qué técnicas aparecen en las ventas ganadas.
16. **El cruce lo hace Ventas**, que tiene el resultado. El Cerebro da la señal; la conclusión, y el riesgo de leerla mal, son de Ventas.
17. Tienen el acceso de cada persona a cada cerebro (`suscripciones`) y cuándo empezó a usarlo de verdad (`consultas`), que es el dato que importa. Lo pueden dar.

## 5 · Privacidad y permisos

18. **Individual:** el permiso lo da la persona. **Equipo:** lo decide la empresa, pero no por consentimiento: un consentimiento tiene que ser libre, y nadie le dice que no a su jefe. La base es el interés legítimo de la empresa más transparencia: el empleado ve exactamente lo que ve su jefe, y lo sabe desde el alta. Si Ventas enseña datos del Cerebro a un CEO, **esa pantalla de transparencia también tiene que existir en Ventas**.
19. **El CEO ve el patrón, nunca la frase literal** de su vendedor («cae en seguimiento pasivo 7 veces este mes»). En la frase viven el nombre del cliente y el importe, y verla convertiría la herramienta en vigilancia.
20. Supabase en Irlanda y Railway en Ámsterdam. Salen fuera de la UE: OpenAI (recibe el texto, sin acuerdo de transferencia firmado), Stripe, Resend y Anthropic.

## 6 · Atribución y contenido

21. Reglas, por orden de importancia:
    1. Nunca el guion literal sin autorización del creador. Si llega vacío, no se rellena con una reconstrucción.
    2. Siempre el creador y siempre el enlace al original.
    3. Nada de usar el nombre del creador como marca.
    4. El guion literal se cita, no se reescribe «mejorándolo».
    5. La transcripción original no se toca ni se muestra.
22. **No hay URL pública de una ficha**: el contenido es de pago. Lo estable es:
    - el `id` de la ficha, que se resuelve con `ver_ficha(id)`;
    - `fuente_url` con `fuente_timestamp` (`https://www.youtube.com/watch?v=XXX&t=412s`). **Este es el enlace bueno.** 764 de 822 fichas servibles llevan enlace (93 %) y 482 llevan minuto.

## 7 · Futuro

23. **Sin WhatsApp**, por decisión tomada: los intermediarios gratuitos no se pudieron verificar y la API oficial era desproporcionada para lo que había que mandar. Los avisos van por correo con Resend. Si cambia, lo dirán antes.
24. **Lo que más les serviría de Ventas:**
    1. El resultado de la venta.
    2. Que la situación llegue sin nombres propios.
    3. Las consultas que no encuentran nada, ordenadas por frecuencia: es lo que hay que ir a grabar con los creadores.

## Lo que dan hoy sin construir nada

- `GET /api/catalogo` (público): qué cerebros hay, de quién, cuántas fichas, en qué modo y si se puede usar su marca.
- `GET /salud` (público).
- El MCP, con el token OAuth de cada vendedor.
- En su repositorio: `docs/handoff.md`, `docs/que-somos-hoy.md` y `docs/encargo-patrones-de-fallo.md`.

Lo que haya que construir se decide con el contrato delante. Nunca se programa contra una API supuesta: ya costó tres consultas reales devueltas a cero.
