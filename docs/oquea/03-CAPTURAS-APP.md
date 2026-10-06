# Capturas de la app de Oquea · qué sacar y cómo

> Para Cristian / Enrique. Rehecho con la entrega 02 (`docs/ventas/oquea/fuentes/02-entrega-UI-aplicacion.md`):
> medidas, colores, recorridos y textos ya están; **las capturas son lo único que falta para ir al píxel**.
> Sácalas del simulador o de la app de producción (rama `ngo_event`).

## Cómo sacarlas
- En **español**, con un **centro de demo** (no datos de clientes reales). Los textos de ejemplo de la propia app
  valen: `Maaya Thila`, `Manta ray`, `Benalmádena, Málaga`, `Seabed clean-up – Cabo de Gata`.
- PNG a tamaño real, sin recortar. Con scroll: arriba y abajo (`-a`, `-b`).
- Lo que se mueve (escanear, guardar, compartir): **grabación de 5–10 s (MP4)**.
- Carpetas `consola/`, `buceador/` y `qr/`. En un zip.

## 1 · Consola de escritorio (lo que compra el centro) — a 1440 px de ancho
| # | Pantalla | Fichero |
|---|---|---|
| 01 | Actividades de hoy | `activities/activities_list_view.dart` |
| 02 | Detalle de actividad: participantes, quién escaneó y quién se añadió a mano | `activities/activity_details_view.dart` |
| 03 | CRM: lista | `diving_centers/center_crm_views.dart` |
| 04 | CRM: ficha del buceador con historial y notas internas | `diving_centers/center_crm_views.dart` |
| 05 | Mi centro | `diving_centers/desktop_my_centre_view.dart` (sin el mapa dibujado, OQ-797) |
| 06 | QR del centro | `diving_centers/center_qr_view.dart` |
| 07 | «Cómo te ven los buceadores» (ficha pública) | `explore/explore_diving_center_detail_view.dart` |
| 08 | Crear actividad / evento | `activities/create_activity_view.dart`, `create_event_view.dart` |
| 09 | Dive sites | `diving_centers/dive_sites_list_view.dart` |
| 10 | Equipo | `diving_centers/manage_team_members_view.dart` |
| 11 | Centros colaboradores (evento de varios centros) | `diving_centers/collaborating_centres_view.dart` |

## 2 · El QR, sin cuenta (recorrido A) — móvil
| # | Pantalla | Ruta |
|---|---|---|
| 01 | Ficha del centro tras escanear | `/divingcenter/:centerId` |
| 02 | Detalle de la actividad del día | `/divingcenter/:centerId/activities/:id` |
| 03 | Alta por código de 5 dígitos | `verify_code_view.dart` |
| 04 | Inmersión guardada en el logbook | `logbook/logbook_qr_scan_details_view.dart` |
| 🎥 | **Grabación del recorrido entero, del escaneo al logbook** | — |

## 3 · Buceador — móvil
| # | Pantalla | Fichero |
|---|---|---|
| 01 | Logbook (lista) | `logbook/logbook_list_view.dart` |
| 02 | Compartir: tarjeta tipo Strava (normal, transparente y carrusel de vida marina) | `logbook/logbook_social_share_view.dart` |
| 03 | Mapa de explorar con el marcador del centro | `explore/explore_view.dart` |
| 04 | Certificado de participación | `logbook/logbook_event_certificate_view.dart` |
| 05 | Álbum compartido | `activity/activity_album_view.dart` |
| 🎥 | **Grabación: abrir inmersión → compartir → tarjeta** | — |

## No sacar
Catálogo de vida marina (superadmin), reseñas (apagadas), el mapa dibujado de «Mi centro», el planificador de viajes
(tiene datos de demo: ¿está EN PRODUCCIÓN?).

- `22-inmersion-guardada-es.png`: «¡Inmersión añadida a tu logbook!» en español, sacada de la pantalla recreada (`app-steps`, `dive-saved`). Sustituye a la 19 (en inglés) en el tour «Mira lo que vendes».
