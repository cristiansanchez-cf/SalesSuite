# 03 · Guía de inicio y web · cargado

Fuentes: `fuentes/03-guia-de-inicio-PT.pdf` (traducida en `fuentes/03-guia-de-inicio-ES.md`) y la web de Oquea
(`fuentes/ui-web/index.astro.txt`, texto literal en español). Script: `scripts/apply-oquea-03.py` (va después del 00).

## Cargado
- **Pie:** WhatsApp y teléfono +34 623 790 890 · enrique@oquea.com · oquea.app (todo de la guía; WhatsApp confirmado por
  Cristian el 5-oct-2026).
- **Catálogo (12):** portada · cómo funciona (escanean, tú los ves) · consola del centro · registro por QR · CRM ·
  compartir · tu QR · actividades · dive sites · equipo · alta del centro (verificado en menos de 24 h) · cierre.
  Plantillas nuevas: `app-steps` (pasos con 1–2 móviles y la pantalla real recreada) y `center-console` (la consola de
  escritorio, interactiva). Todas las pantallas, en español.
- **Sector «Centros de buceo»** con su receta: completa (9 diapositivas) y apoyo visual (5). Preguntas: ¿salidas
  diarias? → actividades · ¿instructores o divemasters? → equipo · ¿le preocupa montarlo? → dive sites · ¿más de un
  centro? → aviso en el alta. Sin precio: falta la tarifa (documento 04).
- **Aprende · «Lo que vendes, en 1 minuto»:** 6 pasos con capturas reales.
- **Jugadas (10):** visión (paso 0), Oquea en una frase, el argumento en tres pasos, «un negocio que fideliza», sin
  descargar nada, el QR visible, «te lo montamos», verificación en 24 h, «empieza en minutos» y lo que no se vende.
- **Dossier de ejemplo** «Oquea para tu centro de buceo» en `scripts/sample-dossiers.ts` (con salidas diarias y equipo).

## Textos míos (corrígelos)
- **Toda la traducción de la guía** al español (`03-guia-de-inicio-ES.md`).
- Titulares que no están en la guía ni en la web: «Un escaneo y la inmersión queda en su logbook», «Cada buceador, en
  tu CRM», «Comparten la inmersión, con tu logo», «Tu centro en Oquea, verificado en menos de 24 h», «Todo tu centro,
  en una pantalla», y los textos cortos de la consola («Las salidas del día y cuántos buceadores tienes ya en tu CRM»…).
- Tarjetas redactadas a partir de la entrega de la app: «Escaneó el QR o lo añadiste tú», «Historial con tu centro»,
  «Con tu centro dentro», «Sin descargar nada».
- El texto de las pantallas que en la guía salen en inglés (acceso, inmersión guardada, mis centros, equipo, crear
  actividad): traducción mía. Hay que cotejarlo con el maestro de traducciones de la app.
- Los datos de ejemplo de las pantallas (Laura Méndez, 128 buceadores, 1.204 inmersiones, Maaya Thila…): salen con la
  etiqueta «Datos de ejemplo» en la consola. Nunca como resultados.

## Decisiones
- Lo que la web marca como **«Próximamente»** (mapa interactivo, viajes y ofertas flash) **no sale** en la propuesta.
- **Reseñas**: no salen (están apagadas en la app). **Promociones y ofertas** del CRM: no salen hasta confirmar que están
  en producción.
- «Gratis para empezar» (web): no sale hasta tener la tarifa.
- La guía dice «Verificação em menos de 24h» y Cristian lo confirma: se promete.

## PENDIENTE
- Documentos de negocio 01, 02, 04–07 (cliente ideal, actores, precios, casos, equipo). Lo sabe: Enrique / Cristian.
- ¿Las promociones y la comunicación directa del CRM están en producción? Lo sabe: Enrique.
- Maestro de traducciones de la app (`OQUEA_translation_master.xlsx`) para que los textos de las pantallas sean los
  oficiales. Lo tiene: Enrique.
- Capturas a 2x de la consola de escritorio y del CRM por dentro (para afinar la recreación). Lo saca: Enrique.
