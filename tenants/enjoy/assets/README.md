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
