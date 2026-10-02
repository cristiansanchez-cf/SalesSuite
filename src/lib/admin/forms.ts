import { AdminError } from './service';

/** Ejecuta una acción de formulario: errores de negocio → mensaje para la página; el resto se propaga. */
export async function formAction(fn: () => Promise<unknown>): Promise<{ error: string | null; details: string[] }> {
  try {
    await fn();
    return { error: null, details: [] };
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message, details: e.details ?? [] };
    throw e;
  }
}

/** Mensaje de éxito tras Post/Redirect/Get (?ok=clave). Solo claves conocidas: nada de texto libre en la URL. */
export function flash(url: URL, messages: Record<string, string>): string | null {
  const k = url.searchParams.get('ok');
  return k && Object.hasOwn(messages, k) ? messages[k] : null;
}
