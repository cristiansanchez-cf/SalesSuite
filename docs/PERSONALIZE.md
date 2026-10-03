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
