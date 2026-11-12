# Catálogo con tu IA

Para que cada espacio monte y cambie sus presentaciones sin pasar por Cofundo. Solo el **admin** del espacio
(Configurar → Catálogo y precios).

## «Cámbialo con tu IA» (`/admin/catalog/ia`)
1. **Copiar el prompt** y pegárselo a su ChatGPT o Claude. Lleva:
   - los tipos de diapositiva que hay, para qué sirve cada uno y un ejemplo de su formato (los generales, y los
     especiales de un producto solo si el espacio ya los usa: pantalla en vivo, consola, sello…);
   - lo que el espacio ya tiene en el catálogo (clave, tipo, nombre y contenido);
   - las reglas: textos para el cliente, sin inventar cifras ni testimonios, `{company}`/`{prospect}`, imágenes solo con
     https que ya existan, **mejor interactivo que varias capturas** (pestañas o los tipos del producto), y lo que no
     encaje va a `peticiones`;
   - el formato de vuelta: `{ "modules": [{ key, block_type, name, description, props }], "peticiones": [...] }`.
   Si tienen su presentación de ahora (PDF, PowerPoint, web), se la adjuntan a su IA y la usa de base.
2. **Pegar lo que devuelva** (con o sin el texto de alrededor) → **Revisar**: cada módulo sale como *Nuevo*, *Cambia*
   (misma key), *Igual* o *No vale* (tipo que no existe, key de otro tipo o formato incorrecto, con los errores para
   devolvérselos a su IA). Las `peticiones` salen aparte: son diapositivas o animaciones nuevas que construimos nosotros.
3. **Crear borradores**: nunca se publica nada solo. Un módulo que cambia recibe una versión borrador nueva (con el
   precio que tenía); uno nuevo se crea con su primer borrador. Se revisan en la vista previa y se publican desde el
   catálogo. Como mucho 20 módulos de una vez.

Lógica pura y probada en `src/lib/catalog/ai-kit.ts` (`kitPrompt`, `readKit`, `planKit`, `applyKit`).

## «Pídele un cambio» (en cada versión de un módulo)
Para cosas pequeñas («cambia el título por…», «quita la tercera pestaña», «más corto»):
- Una instrucción de **400 caracteres como mucho**, un módulo cada vez.
- La IA (`claude-sonnet-5-5`, herramienta `save_props`) devuelve el contenido completo; se valida con el esquema del tipo
  (si no vale, un segundo intento con los errores). Lo que no le piden, igual; no inventa datos.
- Se guarda **siempre en un borrador**: si la versión estaba publicada, en una versión nueva (la publicada no se toca).
  Se enseña qué textos han cambiado y se puede **deshacer**.
- Cuenta para el **tope de IA por persona y día** y el gasto del mes del espacio (Plataforma → Coste por empresa);
  se apunta como `catalog.edit`.

`src/lib/catalog/ai-edit.ts`. En las pruebas (`AI_RESEARCH_FIXTURE=1`, sin clave) una IA de mentira entiende
«cambia «X» por «Y»». Smoke: `scripts/smoke-catalog-ai.cjs`.

## Lo que no hace (todavía)
- Editar las recetas por sector y las combinaciones de serie desde la app (siguen en `tenant.json`).
- Crear tipos de diapositiva nuevos o animaciones del producto: eso son las `peticiones`, las construimos nosotros.
