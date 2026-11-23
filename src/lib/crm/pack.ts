/**
 * Cualificación por espacio (docs/CRM_DINAMICO.md §45). Las preguntas, los pesos, los tramos de tamaño, los paquetes y
 * las fichas de promotora y DJ (`priority.ts`, `profiles.ts`) son las de Enjoy: un «paquete» con nombre (`nightlife`,
 * ocio nocturno). Un espacio lo tiene si lo dice `crm_settings.qualification`; sin él, la ficha no enseña
 * Cualificación ni nota ni «Le encaja», y la IA (Apuntar, Investigar, Limpiar) solo saca lo general: empresa, personas,
 * contacto, interacción, próximo paso, datos clave y los campos del CRM del espacio.
 */
// 'diving': buceo (Oquea, §47; src/lib/crm/diving.ts).
export const QUAL_PACKS = ['nightlife', 'diving'] as const;
export type QualPack = (typeof QUAL_PACKS)[number];
/** Lo guardado → un paquete conocido, o null (sin cualificación). */
export const normalizePack = (v: unknown): QualPack | null => (typeof v === 'string' && (QUAL_PACKS as readonly string[]).includes(v) ? (v as QualPack) : null);
/** ¿Es el de ocio nocturno? (lo que antes era «hay paquete»: preguntas, pesos, tamaño en tramos, «Le encaja»). */
export const isNight = (p: QualPack | null | undefined): p is 'nightlife' => p === 'nightlife';
/** Lo que se puede marcar sin paquete: solo el tamaño (lo pregunta «Generar pago» si las tarifas van por tamaño, §35). */
export const NO_PACK_QUAL: readonly string[] = ['size'];
