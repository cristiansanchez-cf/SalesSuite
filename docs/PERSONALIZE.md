# Personalizar la propuesta

En el editor, justo debajo de «Compartir»: **Personaliza para {cliente}**. Tres huecos:

| Hueco | Qué subir | Dónde sale |
|---|---|---|
| Logo | Su logo (PNG, JPG, WebP o SVG, hasta 5 MB) | Arriba a la izquierda de la pantalla en vivo, en lugar de su nombre |
| Fotos | Hasta 8: de su local, de su Instagram (PNG, JPG o WebP, hasta 8 MB) | En «Foto» (su foto a pantalla completa) y dentro del móvil que la envía |
| Vídeo | Uno, con sus visuales (MP4 o WebM, hasta 30 MB) | Pantalla extra «Su vídeo»: el móvil lo sube, desaparece y el vídeo sale de fondo con la pantalla encima |

Idea de venta: con su logo, un generador de vídeo (Gemini, Runway…) hace en 5 minutos un visual suyo. Lo subes y la propuesta enseña **su** local funcionando.

## Cómo funciona

- La subida va **directa del navegador a Storage** con una URL firmada (un vídeo no cabe en una petición de Vercel): `POST /admin/api/dossiers/:id/media {step:'sign'}` → `PUT` del archivo → `POST {step:'attach', url}`. Quitar: `DELETE {url}`.
- Permisos (migración `20261024000000_client_media.sql`): solo el autor de la propuesta, un admin o el jefe/a de ventas, y solo en `<espacio>/dossiers/<propuesta>/…` (`can_edit_dossier_media`). Test: `supabase/tests/42_client_media.test.sql`.
- Se guarda en `dossier.client_media` (`{logo, photos[], video}`), la propuesta pública lo devuelve (`media`) y llega a los módulos en `ctx.media`. Hoy lo usa la pantalla en vivo; cualquier módulo puede.
- En demo no hay Storage: los archivos van a memoria (`/demo-media/…`) y se pierden al reiniciar.

## Cómo se ve: presentación o hacia abajo

En la misma tarjeta, **Cómo se ve**: «Presentación» (por defecto) o «Hacia abajo». Se guarda en `client_media.layout` (`'slides' | 'scroll'`, sin migración: va dentro del jsonb).

- **Presentación** (`DossierView.astro`): una sección por pantalla, en horizontal, como pasar páginas. Flechas a los lados (abajo en el móvil), deslizar con el dedo (scroll-snap), teclado (← → / RePág AvPág), puntos y «3 / 8». La diapositiva actual entra con un pequeño zoom; `#4` en la URL guarda dónde estás. Lo que no cabe se baja dentro de la diapositiva.
- Un módulo puede partirse en varias diapositivas con `parts` en el registro. Hoy, el móvil del invitado: 1–3 «Escanea y entra», 4–6 «Y sale en pantalla», álbum y canciones (lo que el cliente no tenga, fuera). Cada trozo va solo con una barra que dice cuánto falta para el siguiente paso.
- El destinatario puede cambiarlo con «Ver hacia abajo» / «Ver como presentación» (`?ver=scroll|slides`).
- Analítica: el tiempo por sección sigue igual (`data-item-id` en cada diapositiva); «hasta dónde ha llegado» es la diapositiva más lejana vista.

## Vídeo del local de ejemplo

Las pantallas «Encima de tus visuales» y «Foto en tarjeta» necesitan unos visuales de fondo. Si el comercial no ha subido el vídeo del cliente, sale uno de ejemplo (`venueVideo` en la pantalla en vivo: `img/live/venue.webm` y `.mp4`, luces de club generadas, sin derechos de terceros). El navegador elige el formato que reproduce.

## Contacto del comercial

Cada propuesta lleva como botón principal el contacto de **quien la hizo**, para que el cliente le escriba directamente. Se pone en el editor, en la tarjeta **«Tu contacto en esta propuesta»** (encima del constructor), y vale para todas las propuestas de esa persona.

| Canal | Qué poner | El botón abre |
|---|---|---|
| WhatsApp | Número con prefijo (+34 600 000 000) | `wa.me/<número>` con el saludo de la propuesta |
| KakaoTalk | ID o enlace `open.kakao.com` / `pf.kakao.com` | Con enlace, el chat; con ID, se enseña el ID (KakaoTalk no tiene enlace a un ID personal) |
| LINE | ID o enlace `line.me` | `line.me/ti/p/~<id>` |
| Telegram | @usuario | `t.me/<usuario>` |
| Instagram | @usuario | `ig.me/m/<usuario>` (mensaje directo) |
| Teléfono | Número con prefijo | `tel:` |
| Email | Dirección | `mailto:` con el título de la propuesta |

- Se guarda en `users.contact_channel` / `contact_value` (migración `20261111000000_rep_contact.sql`), con la política `users_update_self`. La propuesta pública lo lee con `get_public_contact(token, tenant)` (misma puerta que `get_public_dossier`; solo nombre, canal y valor).
- **Sin canal, o con canal y sin valor**: la propuesta enseña el contacto de la marca (`brand.contact`), como antes. La tarjeta lo avisa («Falta tu número o usuario»).
- Después del suyo, el pie enseña los de la marca. En propuestas en coreano no se ofrece el WhatsApp de la marca (allí no se usa).
- Un admin que abre la propuesta de otro ve su contacto, sin poder cambiarlo.
- `scripts/sample-dossiers.ts` deja puesto el canal de los comerciales (`contactChannel` de las propuestas `perRep`; en Oquea Corea, KakaoTalk) si no tenían ninguno, con el valor vacío para que cada uno lo complete.
