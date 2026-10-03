# Qué ha funcionado: evidencia de cierres reales

> «Me puede gustar mucho lo que has dicho, pero si no funciona, no me vale.» Por eso los «me gusta» se han sustituido por **cierres documentados**: ventas reales, ganadas o perdidas, con su situación.

## 1. Piezas

| Pieza | Qué es | Dónde se define |
|---|---|---|
| **Situaciones** (facetas) | Dimensiones con las que se describe una venta: tipo de personalidad, región, rasgos de la cuenta («tiene pantalla», «familiar»…) | Cada tenant, en *Configurar → Configuración guiada* o en `tenant.json` (`facets`) |
| **Situación de la cuenta** | Las facetas de la cuenta (`dossier.situation`) y de cada persona (`dossier_contact.traits`, p. ej. su tipo de personalidad) | En el dossier, en «Cuenta y actores» |
| **Cierre documentado** | Resultado + sector + actores clave + situación + jugadas usadas + qué funcionó y qué no + momento clave y objeción | Al marcar un dossier como ganado o perdido (2 minutos, prerrellenado) |

Nada de esto está escrito para Enjoy. Oquea definirá sus propias situaciones (tipo de experiencia: familiar, para instructores; región: Brasil, Corea) y sus actores (instructor autónomo, director del centro…).

## 2. Cómo se recomienda

Se compara tu situación con la de cada cierre:
- mismo sector: **+3**;
- cada actor en común: **+2**;
- cada opción de faceta en común: **+peso de la faceta** (la región y la personalidad pesan 2);
- si una faceta descrita en los dos lados **no coincide**, resta la mitad de su peso y se muestra como diferencia. Por ejemplo, «Región: Brasil»: lo que funcionó en Brasil se enseña en Corea, pero avisando.

Lo que no se sabe («no lo sé») no suma ni resta. A igualdad, primero lo ganado y después lo más reciente. Las jugadas se ordenan por cuántos cierres parecidos **ganaron** usándolas (los perdidos restan). En el ranking global se usa una tasa suavizada (Laplace), para que 1 de 1 no cuente como un 100 %. Con menos de tres casos parecidos, la pantalla avisa de que «es una pista, no una regla».

## 3. Dónde se ve

- **Qué ha funcionado** (`/admin/wins`): describe tu situación (sector, con quién, cómo es…; todo opcional) y verás los cierres parecidos, con sus coincidencias y diferencias, y las jugadas que más ganan.
- **Guion del dossier**: «En situaciones parecidas», con la situación de esa cuenta.
- **Preparar mensaje**: asistente de cuatro pasos. La petición al Cerebro incluye la experiencia del equipo **separada** de lo que aporte el Cerebro (es nuestra, no del creador).
- **Playbook**: cada jugada muestra «usada en N cierres · ganó M», y las métricas del líder se ordenan por cierres reales.

## 4. Permisos

- Cualquiera documenta los cierres de los dossiers que puede editar. El equipo interno ve los cierres compartidos.
- El líder puede **ocultar** un cierre mal documentado: deja de contar, pero no se borra y su autor lo sigue viendo.
- **Colaboradores**: documentan los suyos. Los del equipo solo los ven si el admin les permite ver lo que comparte el equipo.

## 5. Siguiente paso: CRM y WhatsApp

Hoy el cierre se documenta a mano en dos minutos. Cuando haya CRM y conectores (WhatsApp vía n8n), el cierre se rellenará con la interacción registrada: mensajes, respuestas y momento clave. El aviso de seguimiento («hoy te toca escribir a X, te dejo un mensaje») podrá proponer lo que funcionó en situaciones parecidas. El modelo de datos (`win_story`) ya está preparado para recibirlo.
