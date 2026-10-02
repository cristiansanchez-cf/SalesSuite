/**
 * Lectura de env en runtime (servidor). Astro inlinea import.meta.env en build; con el adapter
 * Node queremos poder configurar el contenedor sin rebuild, así que process.env tiene prioridad.
 */
export function env(name: string): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  return (fromProcess || (import.meta.env as Record<string, string | undefined>)[name]) || undefined;
}
