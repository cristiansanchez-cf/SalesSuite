/**
 * Subir el logo de los emails (Ajustes → Tus mensajes: diseño y firma). Solo PNG o JPG de verdad (por sus primeros
 * bytes, no por lo que diga el navegador): Gmail no enseña SVG y Outlook no siempre WEBP. Como mucho 1 MB.
 */
export const EMAIL_LOGO_MAX_BYTES = 1024 * 1024;

export function emailLogoType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}
