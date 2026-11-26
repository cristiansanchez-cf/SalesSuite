# Propuestas: crear y compartir sin ayuda (26-nov-2026)

Criterio de Cristian: la primera vez nadie sabía crear una propuesta sin que se lo enseñaran, y nadie entendía «prueba» y
«real» (ni que había que publicar y luego «pasar a real»).

## Nueva propuesta, paso a paso (`src/pages/admin/index.astro`, diálogo `#nuevo`)

1. **¿Para quién es?** La empresa (del CRM o escrita) y con quién habla. «Crear y editar» aquí la crea vacía, como antes
   (para quien ya sabe), o «Empezar desde» otra la copia y salta las preguntas.
2. **¿Qué tipo de cliente es?** Los sectores del espacio (los que tienen receta, primero) u «Otro / no lo sé».
3. **¿Cómo la quieres?** Las preguntas de la receta del sector (estilo completa o visual, sus elecciones y qué incluir):
   las mismas que «Monta la propuesta para este cliente» del editor, ahora al principio.
4. **Resumen** y «Crear la propuesta»: se crea, se pone el sector y se monta con esas respuestas (`setSegment` +
   `applyPreset`). El editor la abre con «Ya la tienes montada» y los tres pasos que quedan.

## Compartir: dos enlaces (`Builder.svelte`, bloque «Compartir»)

- **Enlace de prueba** (`/prueba/<id>.<firma>`, `src/lib/admin/test-link.ts`): desde que se crea, también en borrador.
  Para abrirla en el móvil o mandársela a un compañero. Nunca cuenta ni avisa. Firmado con un secreto del servidor
  (`DOSSIER_TEST_SECRET` o, si no, derivado de la clave de servicio); la página la monta con los permisos de quien la hizo.
- **Enlace para el cliente** (`/d/<token>`): un botón, «Crear el enlace para el cliente», que publica, crea el enlace y lo
  deja contando. Ya no hay «Publicar» y luego «Prueba / Real». Las que estaban en modo prueba lo dicen junto al enlace
  («Este enlace aún no cuenta…» · «Que cuente»).
- «Enlaces (n)» (plegado): más enlaces con caducidad, revocar y «Dejar de compartir» (despublicar).

## Orden del editor (26-nov-2026)

De arriba abajo, lo que se usa más primero:

1. **Compartir**: enlace de prueba y enlace para el cliente.
2. **Módulos**: el contenido.
3. **Precio** y **Paquetes**.
4. **Personaliza** (logo, fotos, vídeo, música).
5. **Seguimiento**: próximo paso y resultado.
6. **Más** (plegado, `editor-more`): cuenta y actores (sector, quién decide), datos del cliente y «Más acciones»
   (duplicar, archivar…).

«Tu contacto en esta propuesta» queda en una línea arriba (`rep-contact-card`, un `<details>`). Solo sale abierto y en
naranja si hay canal sin número.
