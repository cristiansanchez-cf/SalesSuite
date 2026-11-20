# Clientes (fase 1)

Criterio de Cristian: el CRM sirve para **conseguir clientes nuevos**, pero también para **mantener los que ya tienes**:
escribirles de vez en cuando, saber qué se acordó y si cambia, y que cualquiera del equipo (o quien llegue nuevo) sepa
exactamente qué ha pasado. Ejemplo: Deep Delay (festival), cerrado con un acuerdo sin cobro de por medio («70/30 para
ellos si conseguimos marcas; nos avisan antes de cada festival»).

## Qué hay

- **Cierre** (ficha → una sola tarjeta): «Con pago» (enlace de Stripe o «ya ha pagado»), «Sin pago (acuerdo)» o
  «En prueba». Ya cliente: lo acordado y sus pagos. Criterio de Cristian: «me lía lo de cerrar y cobrar… es todo lo mismo».
- **Cerrar con acuerdo** (pestaña «Sin pago»): qué habéis acordado, desde cuándo y cada cuánto escribirle
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

## En prueba

Criterio de Cristian: «hay una etapa que es la de prueba… seria genial que saliera bien claro… Tnsi se va a pasar en
prueba 2 meses por un trato que hemos hecho. Otras están 10 o 15 días o un mes».

- **Empezarla**: ficha → Cierre → «En prueba»: 10 o 15 días, 1 o 2 meses (meses de verdad: el 31 + 1 mes es el último
  del mes siguiente) u otra fecha, y lo acordado para la prueba. Ya cliente (Tnsi: cliente con prueba por un trato):
  «Empezar la prueba» debajo de los pagos. La pone quien la lleva (o puede quedársela) o un gerente o admin.
- **Bien visible**: en la ficha, etiqueta en la cabecera y tarjeta arriba del todo (días que quedan, barra, fechas, lo
  acordado); en la lista del CRM, etiqueta y filtro «En prueba» (la que acaba antes primero); en el tablero, columna
  propia entre Cierre y Cerrada (manda sobre «Cerrada»); en Clientes, sección «En prueba» arriba. Los últimos 3 días o
  pasada la fecha, en rojo: «Prueba acabada hace N días».
- **Avisos**: al empezarla, próximo paso «Acaba la prueba: ¿se queda?» 3 días antes del fin (salvo que ya haya algo
  antes por hacer): sale en Hoy, en el resumen de la mañana y en el calendario. Mientras está en prueba no «se enfría».
- **Reserva**: sigue siendo de quien la lleva hasta el fin de la prueba más el plazo normal de reserva.
- **Al acabar**: si paga o se cierra con acuerdo después de empezarla, cuenta como convertida sola. Si ya era cliente,
  «Se queda». «No sigue» la acaba y, marcado por defecto, la descarta («no le interesa») para que nadie le vuelva a vender.
- **WhatsApp y Apuntar con IA**: «Tnsi se va a pasar en prueba 2 meses» → `trial_until` (el día que acaba); el resumen
  dice «⏳ En prueba hasta el…» y al guardar se pone en prueba (si no se puede, lo dice).

Datos: `account_trial` (una en marcha por empresa; `outcome` stays/leaves al acabar), RPC `trial_start` (empezar o cambiar
fechas; alarga la reserva) y `trial_end` (migración 20270110; test SQL 91). Lógica pura en `src/lib/crm/trial.ts`.
Smoke: `scripts/smoke-trial.cjs`.

## Siguiente (fases 2 y 3)

- **Documentos** del cliente (contrato de servicio, NDA, facturas): guardados aquí, con límites (tipo, fecha, tamaño).
- **Cofundo Finanzas**: si el espacio lo usa, los contratos, las facturas y si ha cobrado se leen de allí (no se guardan
  dos veces); si no, se guardan aquí. Falta saber cómo expone Finanzas esos datos.
- **Alertas de uso**: con las métricas de uso de la app (Enjoy), avisar cuando un cliente deja de usarla unas semanas
  («¿pasa algo? ¿podemos ayudar?») antes de perderlo.
