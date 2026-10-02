import type { APIRoute } from 'astro';

/** Compatibilidad: redirige a /admin/auth/confirm conservando los parámetros. */
export const GET: APIRoute = ({ url, redirect }) => redirect(`/admin/auth/confirm${url.search}`, 303);
