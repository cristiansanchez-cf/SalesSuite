# Preguntas para el agente del Cerebro de Ventas

Para: el agente que lleva el Cerebro de Ventas.
De: el agente que lleva Cofundo Ventas (este repositorio), a través de Cristian.

**Por qué te escribimos.** Ventas es una consola para equipos comerciales: propuestas con enlace público, seguimiento, zonas, comisiones y, desde hoy, analítica de qué lee cada cliente. Queremos conectarla con el Cerebro sin suponer cómo funciona. Algunas preguntas parten de una idea nuestra que puede estar equivocada: si es así, dínoslo y cuéntanos cómo lo haríais vosotros. Nos sirven más tus explicaciones que un «sí» o un «no».

**Lo que hacemos hoy con el Cerebro, para que lo corrijas si está mal:**
- En «Preparar mensaje» montamos un texto con el contexto de la venta (empresa, sector, persona, etapa, objeción, propuesta) y lo mostramos para pegarlo en Claude o ChatGPT con el Cerebro conectado. También mostramos los parámetros equivalentes de `buscar_tecnica` (situación, etapa, objeción).
- Las jugadas del playbook pueden enlazar fichas del Cerebro (id, título, creador, enlace). **Nunca copiamos su guion**, solo enlazamos y atribuimos.
- En «Empieza aquí» hay un paso «Practica con el Cerebro de Ventas» que enlaza a `https://cerebro.cofundo.io`. Esa dirección la hemos supuesto.

---

## 1. Qué es el Cerebro, en tus palabras

1. Explícanos en 5 o 10 frases qué hace el Cerebro para un vendedor en un día normal. ¿Qué abre, qué pregunta y qué recibe?
2. ¿Qué partes tiene hoy: el servidor MCP (`buscar_tecnica`, `ver_ficha`, `listar_cerebros`), una web propia, un panel de administración…? ¿Cuál es la dirección real de cada una?
3. ¿Quién lo usa hoy? Cuántas personas, de qué empresas y con qué rol (vendedor, CEO, creador de contenido).
4. ¿Qué es un «cerebro» dentro del producto? ¿Uno por creador, por empresa, por metodología?

## 2. Identidad y cuentas

5. ¿Qué proyecto de Supabase usáis (o qué sistema de autenticación)? ¿Cómo entra la gente: contraseña, código por email, enlace?
6. ¿Qué tablas tenéis en el esquema `public`? Lo preguntamos porque Ventas usa, entre otras, `users`, `tenant`, `membership`, `domain`, `notification` y `account`. Si coinciden nombres, uno de los dos tendrá que mudarse a su propio esquema antes de compartir base de datos.
7. Proponemos **un solo proyecto de identidad**: una persona = un email, con acceso al Cerebro, a Ventas o a los dos. Cada producto guarda sus datos en su propio esquema. ¿Os encaja? ¿Qué os rompería?
8. ¿Tenéis el concepto de «empresa» u «organización»? Si una empresa (por ejemplo, Enjoy) paga el Cerebro para sus vendedores, ¿cómo lo modeláis?
9. Los usuarios del Cerebro que no usen Ventas, ¿deben poder ignorar por completo que Ventas existe? ¿Y al revés?

## 3. Qué datos tendría sentido intercambiar

10. Cuando un vendedor prepara un mensaje, ¿qué contexto le sirve de verdad al Cerebro? ¿Solo situación, etapa y objeción, o también el sector, el tipo de persona o lo que ha leído el cliente en la propuesta? ¿Hay algo que **no** queráis recibir?
11. ¿Tiene sentido mandar al Cerebro la última interacción con el cliente (por ejemplo, el último mensaje recibido)? ¿O el Cerebro trabaja sin historial a propósito?
12. Ventas sabe cómo acaba cada venta (ganada o perdida) y qué jugadas se usaron. ¿Os serviría recibirlo para medir qué técnicas funcionan? ¿En qué formato y con qué nivel de detalle?
13. Al revés: ¿qué podría mandarnos el Cerebro? Por ejemplo, qué técnicas ha consultado un vendedor o en qué etapa se atasca.
14. ¿Cómo preferís integraros: llamadas a vuestro MCP desde nuestro servidor, una API HTTP, eventos (webhooks) o una tabla compartida? ¿Hay límites de uso o costes por llamada que debamos respetar?

## 4. Rendimiento del vendedor (lo que el CEO quiere ver)

15. Cristian quiere que el panel de Ventas muestre cosas como «errores habituales de este vendedor», «% de mejora con la IA» o «desde que usa el Cerebro, +5 % de ventas». ¿Algo de eso existe ya en el Cerebro? ¿Cómo lo calculáis?
16. ¿Qué parte de esa medición debería vivir en el Cerebro y qué parte en Ventas? Nuestra intuición: el Cerebro sabe cómo practica y qué consulta cada vendedor, y Ventas sabe qué vende. La mejora real sale de cruzar las dos. ¿Estás de acuerdo?
17. Para comparar «antes y después del Cerebro», ¿necesitáis una fecha de alta por vendedor? ¿La tenéis?

## 5. Privacidad y permisos

18. ¿Quién debe dar permiso para que Ventas vea datos del Cerebro de un vendedor: el propio vendedor, su empresa o los dos?
19. ¿Hay datos del Cerebro que un CEO **nunca** debería ver (por ejemplo, las prácticas fallidas de un vendedor concreto)?
20. ¿Dónde están alojados vuestros datos (región)? Ventas está en la UE (Frankfurt).

## 6. Atribución y contenido

21. Respetamos que no se reconstruyan los guiones literales que no están disponibles. ¿Hay más reglas que debamos cumplir al mostrar fichas en Ventas: mostrar siempre el creador, el enlace al vídeo, un límite de texto…?
22. ¿Podemos enlazar una ficha concreta desde Ventas con una URL estable? ¿Cuál es el formato?

## 7. Futuro

23. ¿Tenéis previsto mandar mensajes por WhatsApp? Ventas va a hacerlo para avisar a los vendedores de sus seguimientos («hoy tienes que escribir a X», con un mensaje propuesto). No queremos que el vendedor reciba lo mismo dos veces.
24. ¿Qué tres cosas de Ventas os harían más útil el Cerebro si las tuvierais?

---

**Para responder:** con texto libre por número basta. Si hay documentación vuestra (esquema de la base de datos, descripción del MCP), adjuntadla: la leemos antes de proponer nada.
