# Assets de Enjoy (los aporta el equipo de Enjoy)

El script de alta sube a Supabase Storage los archivos de esta carpeta y sustituye
cada `"asset:<ruta>"` de `tenant.json` por su URL pública. Archivos esperados:

| Archivo | Uso | Formato |
|---|---|---|
| `logo.svg` | Logo en cabecera y pie del dossier | SVG (o PNG transparente ≥ 400px de ancho) |
| `logo-dark.svg` *(opcional)* | Logo sobre fondos oscuros | SVG/PNG |
| `favicon.png` | Icono de la pestaña | PNG 64×64 o 180×180 |
| `og.png` | Imagen al compartir el enlace (WhatsApp, LinkedIn…) | PNG/JPG 1200×630 |
| `fonts/YWFTKul.woff2` | Fuente de titulares | WOFF2 (confirmar licencia de uso web) |
| `img/*` *(opcional)* | Imágenes usadas en módulos (`"asset:img/…"`) | WEBP/JPG/PNG ≤ 5 MB |

Tipos permitidos: svg, png, jpg, webp, ico, woff2, woff. Máximo 5 MB por archivo.

## img/real/
Fotos reales del producto funcionando en locales, pasadas por Cristian (4 de octubre de 2026). Las tres de pantalla
salen de un tríptico partido en tres. Las usa el módulo «En directo» (plantilla media-strip).

## img/ambiente/
Fotos de ambiente (público en discoteca, festival de noche y de día, fiesta en piscina) pasadas por Cristian el
4 de octubre de 2026 para la pantalla y el móvil de la propuesta. **Pendiente: confirmar que se pueden usar** (no son
de clientes de Enjoy; la de la piscina lleva vasos con marca de otro club).
