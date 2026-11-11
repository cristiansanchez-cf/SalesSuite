# Plan: ajustes ordenados y tutoriales guiados

Estado: propuesto el 11-nov-2026. Paso 1 hecho (`/admin/leads/configurar`, `SetupCard`, `lib/leads/setup-steps.ts`). Se hace por pasos; cada paso se puede usar en cuanto se sube.

## El problema

Los ajustes funcionan, pero cuesta usarlos:

- **No se sabe dónde está cada cosa.** Los ajustes de los leads se abren desde la bandeja (CRM → Leads → «Ajustes») y
  también desde Configurar → Empresa. En Configurar, «Datos del CRM» junta Importar, Ciudades, Limpiar y Campos sin
  explicar qué es cada uno.
- **Una página para todo.** `/admin/leads/ajustes` es una sola página larga: conexión, email, vídeos, firma, textos en
  tres idiomas, WhatsApp, privacidad y vista previa. Nadie sabe por dónde empezar ni para qué sirve cada parte.
- **Campos sin explicación.** Ejemplos: «webs permitidas» es una caja de texto (¿una por línea?), las plantillas de
  WhatsApp son 9 cajas (`wa1 · es`, `wa1 · fr`…) aunque solo se use español, y la firma son 8 campos sueltos.
- **El comercial no sabe qué le toca.** Para usar el asistente de WhatsApp tiene que tener su teléfono en Mi cuenta, y eso
  no lo dice ningún sitio.

## Cómo queremos que sea

**Una regla:** cada cosa que se configura es una **tarjeta de configuración** con tres estados.

1. **Sin empezar.** Explica qué es y qué ganas («Cuando alguien rellene el formulario de tu web, le contestamos en
   segundos»), con una vista previa o una animación, y un botón **Empezar**.
2. **A medias.** «Te quedaste en el paso 2 de 4. Continuar». Lo que ya hiciste queda guardado.
3. **Hecho.** Un resumen corto (por ejemplo, «2 webs conectadas · último lead hace 3 h») y **Editar**. El detalle queda
   plegado.

Al pulsar **Empezar** o **Continuar** se abre un modal por pasos. Cada paso es el tutorial: qué hacer, dónde clicar
(con capturas) y el campo justo para ese paso. Lo obligatorio lleva la etiqueta «Obligatorio», y no se puede activar
nada hasta tenerlo.

## Nuevo mapa

**Vender** (todos):

- CRM → **Leads**: solo la bandeja. Si no está activado, el admin ve un aviso «Termina de configurar los leads» que lleva
  a Configurar. Desaparece el botón «Ajustes» de la bandeja.
- **Mi cuenta**: el teléfono pasa a ser obligatorio en la bienvenida. Debajo, una tarjeta **«Tu asistente de
  WhatsApp»** con:
  - el número al que escribir, con enlace directo y QR;
  - el aviso «Comprueba que escribes desde este número: +34 …»;
  - el botón «Probar ahora».

**Configurar** (admin):

| Sección | Qué hay | Cambio |
|---|---|---|
| Empresa | Puesta en marcha, Marca | Igual |
| **Leads entrantes** (antes «Leads web») | Tarjetas por pasos (abajo) | Nueva página. Se llama así porque también llegan desde la app, no solo desde la web |
| **Asistente de WhatsApp** | Para qué sirve; quién del equipo tiene el teléfono puesto y quién no; recordatorios diarios | Nueva |
| Datos del CRM | Importar · Ciudades · Limpiar · Campos | Cada pestaña con una frase de qué hace y cuándo usarla |
| Resto | Playbook, Catálogo, Equipo, Comisiones | Igual |

## Leads entrantes: cuatro pasos y dos extras

Arriba, el estado («En pruebas» o «Activo») y una barra de progreso. Debajo, las tarjetas en orden:

1. **Conecta tu web o tu app** *(obligatorio)*
   - Vista previa: un formulario que se rellena y, al lado, el lead que aparece en el CRM.
   - Dos caminos:
     - **«Lo hace mi desarrollador o mi agente de IA»**: un prompt para copiar con la dirección, el formato y un
       ejemplo, sacado del contrato de `docs/agentes/ENJOY_APP_LEADS.md` con los datos del espacio.
     - **«Lo hago yo»**: el código para pegar.
   - **Webs permitidas** como lista: «+ Añadir web», con validación de la dirección. El campo técnico «marca» se
     rellena solo.
   - Botón **«Enviar un lead de prueba»** y el aviso «Último lead recibido: …». El paso queda hecho cuando llega uno.
2. **Email de respuesta** *(obligatorio)*
   - Logo de Resend y el aviso «Por ahora solo funciona con Resend».
   - Tutorial: crear la cuenta, añadir el dominio, poner los registros DNS (los sacamos de su API y los enseñamos ya
     rellenados), crear la clave y pegarla.
   - Después, lo obligatorio: remitente, nombre del remitente, a quién se contesta y a quién avisar (como lista con «+
     Añadir»). Comprobamos que el dominio del remitente está verificado.
3. **Tus mensajes** *(recomendado; si no, van los nuestros)*
   - Solo el idioma del espacio. **«+ Añadir idioma»** para inglés o francés.
   - A la izquierda, el texto; a la derecha, la vista previa en vivo: el email como se verá y el WhatsApp como burbuja.
   - Las preguntas por tipo de solicitud van plegadas. Se mantiene «Que lo escriba la IA».
   - **Firma:** un recuadro donde pegar la firma de Gmail o de Outlook, imágenes incluidas. La limpiamos y subimos las
     imágenes pegadas. Los campos sueltos quedan como «o rellénala a mano».
4. **WhatsApp a los leads** *(opcional, avanzado)*
   - Animación: el lead rellena el formulario y le llega el WhatsApp.
   - Tutorial con lo que hemos vivido con Enjoy:
     1. verificar el negocio;
     2. crear la app;
     3. añadir el número, en coexistencia si ya usa WhatsApp Business;
     4. el webhook;
     5. conectar la app a la cuenta (`subscribed_apps`);
     6. las plantillas.
   - **Plantillas:** generamos los nombres (`lead_hola_es`…) y el botón «Copiar texto para Meta», solo en los idiomas
     activos. Horario y festivos, aquí.

Extras, plegados al final:

- **Vídeo y enlace de reserva:** se mandan con la respuesta y en el segundo WhatsApp. Por ahora, el enlace, con una frase
  que explique para qué sirve y la vista previa; por tipo de solicitud, plegado. Subir el vídeo arrastrándolo, más
  adelante.
- **Privacidad y plazos:** valores recomendados ya puestos y el botón «Editar».

## Asistente de WhatsApp: dos cosas distintas

- **El equipo habla con el asistente** (apuntar, preguntar, recordatorios). Un único número de Cofundo para todas las
  empresas; ya está hecho (`ASSISTANT_WHATSAPP_PHONE_ID`).
  - La empresa no tiene que hacer nada en Meta: solo que cada comercial ponga su teléfono.
  - Las plantillas de recordatorio se aprueban **una vez**, para Cofundo, en vez de una vez por empresa.
  - El recordatorio diario («Hoy te toca escribir a Club Sol…» y, si dices que sí, el mensaje propuesto) ya existe; solo
    le falta la plantilla aprobada.
- **Contestar a los leads por WhatsApp.** Con el número de cada empresa: es el paso 4 de Leads entrantes.

**Escala.** Que 500 o 10.000 personas escriban al mismo número no es problema: contestar a lo que te escriben es gratis
y no tiene límite. Lo que cuesta son los mensajes que manda el asistente sin que le hayan escrito (los recordatorios),
porque van con plantilla:

- Coste: unos 0,02 € cada uno en España. Con 10.000 comerciales y un recordatorio por día laborable, unos 4.000 € al
  mes.
- Ahorro: si el comercial ha escrito en las últimas 24 h, el recordatorio va como mensaje normal y es gratis.
- Tope diario: Meta empieza con un número de mensajes al día que sube solo con el uso y la calidad. Hay que pedir que lo
  suban antes de pasar de unos pocos miles de comerciales.

Estas cifras hay que comprobarlas con la tarifa de Meta del momento.

## Primeros pasos (tutoriales)

- **Admin**, en Inicio: «Primeros pasos» con empresa y marca, equipo invitado, leads entrantes y asistente de WhatsApp,
  cada uno con su estado y su enlace.
- **Comercial**, en Inicio: teléfono puesto, prueba el asistente y primera propuesta.

Se va tachando solo y desaparece cuando está todo.

## Emails con la marca

Primero, una plantilla estándar con el logo y el color principal de la marca del espacio, con su vista previa. Más
adelante, que cada empresa la ajuste con su design system.

## Orden

| # | Paso | Qué se ve al acabar |
|---|---|---|
| 1 ✅ | Mapa nuevo y tarjeta de configuración | Cada cosa en su sitio. «Leads entrantes» en Configurar con las tarjetas (de momento, abren lo de siempre). Sin «Ajustes» en la bandeja |
| 2 | Conecta tu web o tu app | Lista de webs, prompt para el desarrollador o el agente, lead de prueba |
| 3 | Email de respuesta | Tutorial de Resend con los DNS reales, obligatorios marcados, lo hecho plegado |
| 4 | Tus mensajes y firma | Idioma a idioma, vista previa en vivo, firma pegada |
| 5 | Asistente de WhatsApp y teléfono | Teléfono obligatorio, tarjeta en Mi cuenta, página del asistente con quién lo tiene |
| 6 | WhatsApp a los leads | El tutorial de Meta paso a paso y las plantillas sin cajas sobrantes |
| 7 | Primeros pasos | Las listas de admin y comercial en Inicio |
| 8 | Emails con la marca | Plantilla estándar con logo y color |

Cada paso lleva sus pruebas (unitarias y e2e) y capturas en escritorio y móvil antes de subirse.

## Decisiones (con lo recomendado)

- **Nombre:** «Leads entrantes». Alternativa: «Captación».
- **Teléfono obligatorio:** para quien vende (admin y comercial), en la bienvenida; los colaboradores externos, opcional.
- **Vídeos:** de momento, enlace (YouTube, Vimeo o Drive); subir el archivo, más adelante.
- **Firma:** pegarla de Gmail o Outlook. Importarla conectando Gmail u Outlook pide permisos de su correo; se deja para
  después.
