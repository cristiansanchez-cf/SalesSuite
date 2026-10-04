# Capturas de la app de Oquea · qué sacar y cómo

> Para Cristian / Enrique. Con esto se recrean en HTML las pantallas de la app dentro de las propuestas (como la
> pantalla en vivo y el móvil del invitado de Enjoy). Los 6 mockups de la web ya están cargados; esto es **la app real**.

## Cómo sacarlas
- **Móvil**, en **español**, la app de producción (o el simulador). Captura a tamaño real (PNG, sin recortar ni comprimir).
- **Con un centro de demo**, no con datos de clientes reales: nombres de buceadores inventados o tuyos. Si sale una
  persona real, dímelo y lo tapo.
- Si una pantalla tiene **scroll**, una captura arriba y otra abajo (`-a`, `-b`).
- Si tiene **animación** (el QR al escanear, guardar en el logbook, la tarjeta al compartir), una **grabación de
  pantalla** de 5–10 s (MP4). Vale más que 3 capturas.
- Nombre: `<nn>-<momento>.png`, en dos carpetas: `buceador/` y `centro/`. Mándalo en un zip.

## Buceador (el viaje que vende, en orden)
| # | Pantalla | Vista en OqueaApp | Por qué |
|---|---|---|---|
| 01 | Escanear el QR del centro | `logbook/` → escáner QR | El momento «sin descargar nada / un gesto» |
| 02 | Landing del centro o la actividad al escanear | `/divingcenter/:id` (Flutter web) | Lo primero que ve el buceador **del centro** (marca del cliente) |
| 03 | Guardar la inmersión en el logbook (antes y después de pulsar) | `logbook/` → crear | El gancho de fidelización |
| 04 | Detalle de la inmersión (profundidad, temperatura, vida marina, fotos) | `logbook/` → detalle | Lo que el buceador se lleva |
| 05 | Logbook completo (lista de inmersiones) | `logbook/` | Por qué vuelve |
| 06 | Tarjeta para compartir (y la pantalla de compartir) | `logbook/` → compartir social | El centro sale en las redes del buceador |
| 07 | Álbum compartido de la salida | `activity/activity_album_view.dart` | Fotos que traen al grupo de vuelta |
| 08 | Home / perfil del buceador | `home_view.dart`, `edit_profile_view.dart` | Contexto |

## Centro (lo que compra quien paga)
| # | Pantalla | Vista en OqueaApp | Por qué |
|---|---|---|---|
| 01 | Panel: actividades de hoy | `activities/` | El día a día del centro |
| 02 | Crear una actividad (formulario) | `activities/` → crear | «Se hace en un minuto» |
| 03 | Detalle de una actividad con los buceadores apuntados | `activities/` | Quién viene |
| 04 | QR del centro (pantalla para imprimir o enseñar) | `diving_centers/` → QR | Cómo entra el buceador |
| 05 | CRM: lista de buceadores | `diving_centers/` / CRM | Su base de clientes, por fin |
| 06 | CRM: ficha de un buceador (historial, certificación, última inmersión) | CRM | El argumento de fidelización |
| 07 | Dive sites (lista y mapa) | `diving_centers/` → dive sites | Su zona, bonita |
| 08 | Equipo del centro | `diving_centers/` → equipo | Para centros con varios instructores |
| 09 | Perfil público del centro | `diving_centers/` → vista pública | Lo que ve un buceador nuevo |

## Si hay más
- Promociones / mensajes a buceadores, viajes y ofertas flash: **solo si están EN PRODUCCIÓN**. Si son del mockup de la
  web pero aún no existen en la app, dímelo: no salen en ninguna propuesta como si existieran.
- Onboarding (splash, alta, código de verificación): una captura de cada, por si hace falta.
