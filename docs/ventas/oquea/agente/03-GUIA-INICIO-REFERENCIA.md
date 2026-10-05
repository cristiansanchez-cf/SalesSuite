# 03 · Guía de inicio (PT) · referencia para dossiers

Fuente: `docs/ventas/oquea/fuentes/03-guia-de-inicio-PT.pdf` (14 diapositivas, en portugués de Portugal). Según
Cristian, es la presentación con la que **se ha vendido y se ha validado el negocio**. Es la referencia de cómo se
cuenta Oquea y de cómo se maqueta una propuesta.

## 1. Qué cuenta, en orden
| # | Diapositiva | Idea |
|---|---|---|
| 1 | Portada (navy) | «Comece a usar a oquea em minutos.» · chip lima «Para centros de mergulho» |
| 2 | 1 · Perfil personal | Abre `oquea.app` en el navegador del móvil. Email + código o Google |
| 3 | 2 · «Os Meus Centros» | Desde el perfil se gestiona todo |
| 4 | 3 · Crear centro | Puedes tener más de un centro (uno por ubicación física) |
| 5 | 4 · Datos básicos | Nombre, ubicación, contacto. «Quanto mais completo for, mais fácil será para os mergulhadores encontrarem o seu centro» |
| 6 | 5 · Unidades | Metros/pies, presión, temperatura, duración típica y presión de llenado |
| 7 | 6 · Logo, redes y fotos | «Dá personalidade ao teu perfil» |
| 8 | 7 · Enviar y verificación | Oquea revisa el centro antes de publicarlo |
| 9 | 8 · El QR | «Cada centro tem um QR único.» Barco, mostrador, entrada: «Quanto mais visível, mais escaneamentos.» |
| 10 | 9 · Equipo | Invitar instructores y divemasters con un enlace (WhatsApp o email) |
| 11 | 10 · Dive sites | «Preferes que façamos isso por ti?» Oquea los da de alta si le pasas nombres y coordenadas |
| 12 | 11 · Actividades | Nombre, dive site, fecha y hora: «Pronto em menos de um minuto.» Recurrentes |
| 13 | 12 · **El cierre de valor** | «Os teus mergulhadores fazem scan, tu vês-nos» → escanea → lo ves en tu CRM → comparte la inmersión **con tu logo: marketing orgánico** |
| 14 | Cierre (navy) | «Alguma dúvida? Estamos aqui.» Te ayudan a configurar el centro |

**El argumento en tres pasos (diapositiva 13), el que mejor resume Oquea:**
1. «O mergulhador faz scan ao QR» — registra su inmersión al momento.
2. «Tu vês-no no teu CRM» — historial, inmersiones, certificaciones y datos de cada buceador.
3. «Eles partilham o mergulho» — «Com o teu logótipo. Marketing orgânico para o teu centro.»

## 2. Cómo está maquetada (patrón para las plantillas)
- **Portada y cierre:** fondo navy `#1F294C`, titular blanco enorme, chip lima `#D0FF00` con icono, logo `oquea` en lima
  dentro del titular. Círculos concéntricos difuminados y un círculo gris abajo a la izquierda.
- **Diapositivas de paso:** dos columnas. Izquierda blanca: logo, chip «N · Primeiro passo» (número en círculo lima),
  titular a dos tonos (negro + azul `#3757BE`), texto gris, 2–3 tarjetas con icono en cuadrado azul claro, borde 1 px
  y sin sombra. Derecha sobre `#F1F6FD`: **1 o 2 móviles con la pantalla real**, con una flecha en círculo entre ellos.
- **Avisos:** tarjeta azul claro con icono ✓ o ⓘ y texto azul; consejo con bombilla en círculo lima.
- Paginación «n / 14» abajo a la derecha.

## 3. Lo que confirma
- **EN PRODUCCIÓN** (sale en capturas reales): acceso sin contraseña, perfil, «Mis centros» con varios centros,
  alta de centro con verificación, unidades, logo/fotos/redes, QR del centro (compartir y descargar), equipo con
  roles Owner/Staff, dive sites, actividades recurrentes, inmersión guardada por QR, **pestaña CRM** y tarjeta para
  compartir con el logo del centro.
- La app se usa en el **navegador del móvil**: `oquea.app` (no hace falta descargar nada).

## 4. Capturas cargadas
19 pantallas reales en `tenants/oquea/assets/img/producto/app/` (`01-acceso` … `19-inmersion-guardada`), a 375×812.
Sirven para recrear las pantallas y para el recorrido de Aprende. **Son 1x**: para la propuesta, recreación en HTML
o capturas a 2x/3x. La foto aérea de la tarjeta para compartir: `img/fotos/share-card-aerea.png`.
No se cargó: el logo de una agencia de certificación que sale en la tarjeta (marca de un tercero).

## 5. Choques con lo que ya tenemos (decide tú)
| Dato | Guía (PT) | Entrega 00 | Cargado hoy |
|---|---|---|---|
| Teléfono | +34 623 790 890 | WhatsApp +34 673 225 293 | 673… |
| Web | `www.oquea.app` | `oquea.com` | oquea.com |
| Idioma de las capturas | inglés (alguna en español) | — | — |

## 6. Lo que NO se copia sin firma
- «Verificação em menos de 24h» (diapositivas 8 y 9): es un **plazo de servicio**. Fuera de las propuestas hasta que
  Enrique lo confirme por escrito.
- «Escreve-nos e criamo-los por ti» (dive sites) y la ayuda para configurar el centro: es un **servicio**. ¿Se ofrece
  siempre, gratis? Confirmar antes de venderlo.

## PENDIENTE
- ¿Qué teléfono y qué web van en el pie? Lo sabe: Enrique.
- ¿La guía se usó en Portugal o Brasil? ¿Hay versión en español? Lo sabe: Cristian.
- ¿Los plazos y servicios del apartado 6 se pueden prometer? Lo sabe: Enrique.
