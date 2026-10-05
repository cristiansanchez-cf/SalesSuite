# 02 · UI de la aplicación · guardado

Fuente: `docs/ventas/oquea/fuentes/02-entrega-UI-aplicacion.md`, `ui-app/tokens-app.css`, `ui-app/consola-centro.html`
(OqueaApp, rama `ngo_event`, commit `49b39dd`). La carpeta `entrega_original/` del zip es la entrega 00, ya cargada.

## Qué se hace con esto
- **No cambia `tenant.json`**: el tema del dossier sigue con los tokens de la web (lenguaje de marketing, tarjeta 24).
- Los tokens de la app (texto `#000`, borde `#E0E0E0`/`#E6E8EE`, tarjeta 16, lateral 264, contenido 1120) van dentro
  de las plantillas que recrean la app: **consola del centro** (recorrido C) y **móvil del buceador** (A y B).

## Decisiones mías (corrígelas)
- Las cifras de la recreación de la consola (128 buceadores, 1.204 inmersiones, nombres) son **de ejemplo**: en la
  propuesta saldrán como ejemplo o con las cifras del cliente, nunca como resultados.
- No se enseña: catálogo de vida marina, reseñas, el mapa dibujado de «Mi centro» (OQ-797).

## PENDIENTE
- Capturas y grabaciones → `docs/oquea/03-CAPTURAS-APP.md` (rehecho con las rutas reales).
- ¿Está **EN PRODUCCIÓN** el planificador de viajes? (tiene `trip_planner_demo_data.dart`). ¿Y el evento de varios
  centros (rama `ngo_event`): está en producción o solo en esa rama? Lo sabe: Enrique.
