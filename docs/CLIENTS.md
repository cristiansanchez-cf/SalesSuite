# Clientes (fase 1)

Criterio de Cristian: el CRM sirve para **conseguir clientes nuevos**, pero también para **mantener los que ya tienes**:
escribirles de vez en cuando, saber qué se acordó y si cambia, y que cualquiera del equipo (o quien llegue nuevo) sepa
exactamente qué ha pasado. Ejemplo: Deep Delay (festival), cerrado con un acuerdo sin cobro de por medio («70/30 para
ellos si conseguimos marcas; nos avisan antes de cada festival»).

## Qué hay

- **Cerrar con acuerdo** (ficha → tarjeta «Acuerdo»): qué habéis acordado, desde cuándo y cada cuánto escribirle
  (2 semanas, 1, 2 o 3 meses, o no hace falta).
  - **Gerente o admin**: cierra directamente. **Comercial** (el que la lleva): lo propone; aviso «X propone cerrar Y con
    un acuerdo» a admins y gerentes, que lo confirman o lo rechazan en la ficha. Mismo criterio que al cobrar: lo que
    cierra no es el «ya casi está» de quien vende.
  - Al activarse, la empresa pasa a **cliente** (como al pagar: `status customer`, `won_at`), aviso informativo y sale en
    **Clientes**. El historial es el mismo: nada se mueve de sitio.
  - **Cambiar el acuerdo**: versión nueva; la anterior queda en «Versiones anteriores», con su fecha.
- **Clientes** (menú, después de CRM): los ya cerrados (por pago o acuerdo). Primero los que toca escribir (próximo paso
  vencido) y los que llevan más tiempo sin hablar; con su acuerdo, desde cuándo son clientes y quién los lleva. El
  comercial ve los suyos; admin y gerentes, todos o los suyos.
- **Contacto periódico**: con «escribirle cada N», el próximo paso se pone solo («Ver cómo va (cliente)») a N días al
  cerrar y cada vez que se apunta una interacción con el cliente. Entra en Hoy, en el resumen de la mañana y en el
  calendario sin hacer nada más.
- **WhatsApp y Apuntar con IA**: «He cerrado Deep Delay: 70/30 si conseguimos marcas…» → la IA saca las condiciones
  (`agreement`, solo si dice que ha cerrado; interesado o negociando no cuenta), el resumen las enseña («🤝 Cierre con
  acuerdo: …») y al guardar se cierra con ese acuerdo (o se propone, si es un comercial). En Apuntar, el acuerdo sale
  en la revisión para editarlo o quitarlo.
- **Marcas** (Enjoy): tipo propio con su pestaña (marcas de bebida, Uber…), como DJs y Promotoras. **Estadio**: formato
  más en la cualificación (escala de festival).

Datos: `account_agreement` (versiones: pending → active → replaced, o rejected), RPC `agreement_propose`,
`agreement_decide` y la interna `agreement_activate` (migración 20270109; test SQL 90). Avisos `agreement_pending`
(acción, se resuelve al decidir) y `agreement_closed` (informativo).

## Siguiente (fases 2 y 3)

- **Documentos** del cliente (contrato de servicio, NDA, facturas): guardados aquí, con límites (tipo, fecha, tamaño).
- **Cofundo Finanzas**: si el espacio lo usa, los contratos, las facturas y si ha cobrado se leen de allí (no se guardan
  dos veces); si no, se guardan aquí. Falta saber cómo expone Finanzas esos datos.
- **Alertas de uso**: con las métricas de uso de la app (Enjoy), avisar cuando un cliente deja de usarla unas semanas
  («¿pasa algo? ¿podemos ayudar?») antes de perderlo.
