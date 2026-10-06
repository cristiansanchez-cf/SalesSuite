# 01 · 05 · Guion de campo · cargado

Fuentes (tal cual): `fuentes/01-empresa.md`, `fuentes/05-catalogo-centro-buceo.md`, `fuentes/03-guion-campo.md` (los tres
v0, 6-oct-2026). Scripts, en este orden: `apply-oquea-00` → `03` (guía) → `01` → `05` → `03b` (guion).

## Lo que manda ahora
El **01 es la lista cerrada**: lo que no está en su sección 2 no se enseña. Corrige lo cargado desde la guía y la web:

| Antes (guía / web) | Ahora (01) |
|---|---|
| La tarjeta lleva el **logo** del centro | Lleva el **nombre** («with [centro]») |
| Lista de buceadores «CRM y fidelización», «cliente que vuelve» | «La lista de quién ha buceado contigo y cuántas veces». Sin fidelización ni remarketing |
| Mapa «Próximamente» | Mapa **HECHO** (España, Latinoamérica y Corea) |
| Actividades recurrentes («Prográmalas») | Fuera: no está en la lista cerrada |
| Certificaciones y notas internas en la ficha del buceador | Fuera: el 01 habla de «su histórico en tu centro» |
| Roles Owner / Staff | Owner / Admin |
| Plazas por salida | Fuera: no está en la lista |

## Cargado
- **Sector «Centros de buceo»:** qué es, centro destino / emisor, quién decide (dueño o instructor jefe) y quién lo
  ejecuta (quien está en el barco), con lo que es SUPUESTO marcado. Aviso: sin clientes de pago ni datos de uso.
- **Actores (2):** dueño o instructor jefe (decide) · quien está en el barco (lo ejecuta o lo tumba).
- **Situaciones (2):** situación del centro (destino / emisor) y mercado (España, Latinoamérica, Corea, otro).
- **Dossier (05), 11 módulos con el texto literal:** portada (titular por ángulo) · cómo funciona (3 pasos, 3 pantallas) ·
  tu nombre en cada inmersión · tus buceadores · tu perfil y el mapa · álbum · eventos de ONG · red de centros
  fundadores (texto por ángulo) · en preparación · condiciones · siguiente paso.
- **Receta:** mercado → ángulo (uno solo) → 4 preguntas (no guarda datos → tus buceadores; fotos → álbum; ONG → eventos;
  el acuerdo no recoge el 10 % → fuera ese bloque). Argumentario, tope 7; apoyo visual, tope 5 (titular y captura;
  condiciones y siguiente paso, completos). «En preparación» solo con cobro online, en España y en argumentario.
  Orden de recorte, el del 05.
- **Los 10 módulos de la guía** salen del catálogo (`is_catalog: false`): siguen en la base con su historial, no se ofrecen.
- **Pantallas nuevas** de la app: mapa con el perfil del centro, álbum compartido y evento de ONG. La de crear inmersión
  enseña hora, punto, disciplina, tipo y los datos del punto ya cargados.
- **Jugadas (66):** 16 del 01 (6 solo para el equipo interno: modelo de negocio, previsiones, situación real, lo firmado,
  condiciones del comercial…) y 44 del guion: antes de ir, apertura, las 6 preguntas, la demo en orden, la red por
  ángulo, condiciones, cierre, 9 objeciones, mensajes y seguimiento. Las frases de los creadores, literales y con su
  ficha del Cerebro. Retiradas: «un negocio que fideliza» y «escanean, tú los ves… con tu logo».
- **Fijas en la bienvenida (1–9):** Oquea en una frase · qué vende hoy el comercial · lo que no se dice nunca · lo que no
  existe · es una estructura, no un texto · apertura · la demo · condiciones · los tres gestos del cierre.
- **Aprende · lo que vendes, en 1 minuto:** 5 pasos con el texto del 01 y del 05.
- **Dossiers de ejemplo:** «España · que vuelvan + fotos» y «abrir mercado · Latinoamérica».

## Lo que he puesto yo (corrígelo)
- **Titulares** de los módulos que el 05 no titula: «Cómo funciona», «Tu nombre en cada inmersión», «Tus buceadores»,
  «Tu perfil y el mapa», «El álbum de cada inmersión», «Eventos con varios centros», «La red de centros fundadores»,
  «Condiciones», «Siguiente paso». En la portada, la etiqueta «Oquea».
- **Pantallas elegidas** para cada módulo y los **datos de ejemplo** dentro de ellas (nombres, Maaya Thila, 30 m…).
- Ángulo por defecto de la receta: «Que vuelvan» (la receta solo admite uno; el aviso dice que fuera de España es
  «Abrir mercado»).

## No sale (falta en la plataforma)
- **Fecha** en la portada, **fecha de revisión** y **«[Nombre del comercial] · [teléfono]»** en el siguiente paso: la
  propuesta solo sabe poner el nombre del cliente. Por la regla del 05 («variable sin valor, no entra»), no salen.
  Hacen falta variables nuevas (comercial y fecha): ver `docs/oquea/PREGUNTAS.md`.

## 6-oct-2026 (tarde) · UI nueva en el contenido (`apply-oquea-07.py`, `apply-oquea-08.py`)
- La tarjeta lleva el **nombre** del centro, no su logo: fuera «y su logo» en el recorrido, «Tu nombre», «Compartir» y
  las jugadas `campo-tarjeta` y `que-recibe-el-centro`.
- Álbum: el texto literal del 05 se queda. Tarjetas redactadas por la sesión a partir de Cristian: «Útil para tus
  buceadores. Descargan sus fotos y las de sus compañeros de salida.» · «Y lo comparten. Cada foto que comparten lleva
  la inmersión con tu centro: publicidad que no pagas.» **Revisar.**
- Datos de ejemplo de las pantallas (nombres, cifras, «Mar Limpio ONG», «Maldivas 2025 – Mantas»): inventados.
