import type { APIRoute } from 'astro';
import { logout } from '~/lib/admin/auth';

export const POST: APIRoute = async (ctx) => {
  await logout(ctx);
  return ctx.redirect('/admin/login', 303);
};
