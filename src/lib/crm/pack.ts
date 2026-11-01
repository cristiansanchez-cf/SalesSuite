/**
 * Cualificación por espacio (docs/CRM_DINAMICO.md §45). Las preguntas, los pesos, los tramos de tamaño, los paquetes y
 * las fichas de promotora y DJ (`priority.ts`, `profiles.ts`) son las de Enjoy: un «paquete» con nombre (`nightlife`,
 * ocio nocturno). Un espacio lo tiene si lo dice `crm_settings.qualification`; sin él, la ficha no enseña
 * Cualificación ni nota ni «Le encaja», y la IA (Apuntar, Investigar, Limpiar) solo saca lo general: empresa, personas,
 * contacto, interacción, próximo paso, datos clave y los campos del CRM del espacio.
 */
export const QUAL_PACKS = ['nightlife'] as const;
export type QualPack = (typeof QUAL_PACKS)[number];
/** Lo guardado → un paquete conocido, o null (sin cualificación). */
export const normalizePack = (v: unknown): QualPack | null => ((QUAL_PACKS as readonly string[]).includes(v as string) ? (v as QualPack) : null);
/** Lo que se puede marcar sin paquete: solo el tamaño (lo pregunta «Generar pago» si las tarifas van por tamaño, §35). */
export const NO_PACK_QUAL: readonly string[] = ['size'];
