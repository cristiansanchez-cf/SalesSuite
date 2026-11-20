# Paquetes

Criterio de Cristian: Enjoy pasa a vender por paquetes; «hay que incluirlo en muchos sitios: presentaciones, cierres y
pagos, Learn… y luego ver cómo hacer este proceso más fácil para otras empresas (startups que iteran rápido)».

Enjoy: **Canciones** (puede ir gratis: las propinas son para Enjoy; con suscripción, para el local), **Mensajes y fotos
en pantalla**, **Álbum** y **Fidelización**. 25 € al mes cada uno (pequeño y mediano), 50 € (grande); lo normal, 75–100 €.

## Un catálogo, en todas partes

- **Configurar → Tarifas → Paquetes** (admin): nombre, en una frase, qué incluye (una cosa por línea), precio por tamaño
  (pequeño, mediano, grande; masivo paga como grande; vacío = no se ofrece a ese tamaño), cada cuánto, y si puede ir
  gratis y en qué condiciones. Desactivar = deja de ofrecerse (lo ya cerrado no cambia).
- **Cierre** (ficha): criterio de Cristian: «generar enlace no es tan usual; debería ser el input manual de que ha
  pagado X paquetes, precio normal o menor (descuento)». Con catálogo, la tarjeta es:
  - **Cerrar**: qué paquetes (y cuáles gratis), el precio **normal** (sale de su tamaño; si no lo tiene, mediano) u
    **otro precio** (se ve el % de descuento), y algo más acordado. Un solo botón. Gerente o admin cierra; el comercial
    propone y un gerente lo confirma (como el acuerdo).
  - **En prueba** (docs/CLIENTS.md §En prueba).
  - **Generar enlace de pago** (Stripe), en un modal: lo raro.
  - Ya cliente: sus paquetes en etiquetas, el precio con el descuento, las condiciones de lo gratis y «Cambiar paquetes
    o precio» (versión nueva; la anterior al historial).
- **Clientes**: lo que tiene contratado y a qué precio, de un vistazo.
- Espacios sin paquetes: todo como antes (Con pago / Sin pago / En prueba).

Datos: `product` (migración 20270111; test SQL 92), `account_agreement.packages` («clave» o «clave:free»), `price`
(al mes) y `list_price` (el normal en ese momento); `payment_request.packages`. Lógica pura en `src/lib/crm/packages.ts`.
Las condiciones del acuerdo llevan lo escrito y, debajo, los paquetes en texto (para el historial y la IA).
Smoke: `scripts/smoke-packages.cjs`.

- **La IA con el catálogo**: Apuntar y WhatsApp («he cerrado 12 Torremolinos: canciones gratis y álbum a 25 €») sacan
  `agreement_packages` (claves, «:free» si va gratis) y `agreement_price`; el resumen lo enseña («🤝 Cierre con acuerdo:
  Canciones (gratis) + Álbum · 25 €/mes») y al guardar se cierra con esos paquetes (sin precio, el normal por tamaño).
  Investigar con IA dice en el resumen qué paquetes le encajan y por qué.
- **Aprende → Paquetes y precios**: una tabla de precios por tamaño y cada paquete con lo que incluye y lo gratis,
  sacado del catálogo (siempre al día).

- **Propuestas**: en el editor, «Paquetes»: tamaño del local, qué paquetes (y cuáles gratis) y el precio (el normal;
  otro, solo un admin, como el precio a medida) → «Poner en la propuesta» añade la diapositiva «Paquetes»
  (`packages-offer`) antes del precio, con lo que incluye cada uno, lo gratis con sus condiciones y el total (con el
  descuento si lo hay). Es una FOTO del catálogo (operación `setPackages`, la monta el servidor): lo enviado no cambia si
  luego cambian los precios, y los precios no se tocan a mano (setProps conserva la foto). Módulo en el catálogo de Enjoy:
  migración 20270112. Smoke: `scripts/smoke-proposal-packages.cjs`.

## Siguiente

- Fidelización con su propia diapositiva visual (pases, sellos, el aviso «vuelve», las notificaciones): hacen falta
  capturas o imágenes reales.
- Cambiar el modelo de negocio con IA: contarlo y que proponga los cambios (paquetes, propuestas, Aprende).
