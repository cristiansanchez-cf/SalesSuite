# Calendario (Outlook, Google, Apple)

Criterio de Cristian: «una integración súper sencilla con tu calendario… que lo que hagas me genere los eventos. Howl
Crew, hablar en enero: si no hay hora, todo el día; si hay hora, a esa hora».

## Cómo funciona

Cada persona tiene un **enlace secreto de calendario** (`/cal/<enlace>.ics`, iCalendar). Se suscribe **una vez** desde
su calendario y, desde entonces, sus próximos pasos salen solos y se actualizan solos. Sin permisos de Microsoft ni de
Google (no hay OAuth): funciona con Outlook (web y escritorio), Google Calendar y el Calendario de Mac/iPhone.

- **Mi cuenta → Calendario → «Conectar mi calendario»**: crea el enlace y enseña los botones «Abrir en Outlook»
  (`outlook.office.com/calendar/0/addfromweb`), «Abrir en Google Calendar» (`calendar.google.com/calendar/r?cid=webcal:…`)
  y «Abrir en Calendario» (`webcal:`), más copiar el enlace y los pasos a mano.
- **Qué sale**: de todas sus empresas (espacios), las empresas suyas con próximo paso y sus propuestas abiertas con
  próximo paso, de 60 días atrás a 400 adelante. Título «Empresa · paso» («Reunión: …» si es una reunión), descripción
  con el contacto, el canal, el espacio y el enlace a la ficha.
- **Hora** (`hasTime` en lib/calendar/ics.ts): el próximo paso del CRM es un día (se guarda a las 10:00 del servidor) →
  **todo el día**; con otra hora (propuestas, con fecha y hora) → **a esa hora** (30 min; las reuniones, 1 h y aviso 30
  min antes). Las 00:00 de su zona horaria también cuentan como «todo el día».
- **Se actualiza solo**, pero no al instante: Outlook y Google vuelven a leerlo cada pocas horas (el .ics pide 1 h;
  cada calendario decide).
- **Seguridad**: el enlace es la llave (48 caracteres aleatorios); solo lee y solo lo de su dueño, de los espacios en los
  que sigue. «Cambiar el enlace» deja el anterior sin valer; «Desconectar» lo borra. Tabla `calendar_feed` con RLS (cada
  uno el suyo) y RPC `my_calendar_token` / `drop_my_calendar` (migración 20270107; test SQL 89). La ruta `/cal/` se
  lee sin sesión (middleware) con service role.

## Más adelante

Escribir en el calendario al momento (y leer la disponibilidad) necesita conectar con permisos (Microsoft Graph / Google
Calendar API con OAuth). El enlace cubre lo que se pidió con mucho menos.
