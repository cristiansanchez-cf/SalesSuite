/**
 * Nombra superadmin de la plataforma (docs/ORG.md) a una persona, por email. Ve y gestiona todos los espacios.
 * Si aún no tiene usuario, se le invita (le llega el email para entrar). No imprime el email.
 *
 *   ADMIN_EMAILS=tu@email.com npx tsx scripts/superadmin.ts [--dry-run] [--remove]
 */
import { createClient } from '@supabase/supabase-js';

const email = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim().toLowerCase();
const DRY = process.argv.includes('--dry-run');
const REMOVE = process.argv.includes('--remove');
const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Pon el email en «admin_email» (ADMIN_EMAILS)'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => { if (r.error) { console.error(`✗ ${what}: ${r.error.message}`); process.exit(1); } return r.data; };

let user = must(await sb.from('users').select('id').ilike('email', email).maybeSingle(), 'buscar usuario') as { id: string } | null;
if (!user && !REMOVE) {
  if (DRY) { console.log('• [prueba] no tiene usuario: se le invitaría por email'); process.exit(0); }
  const inv = await sb.auth.admin.inviteUserByEmail(email);
  if (inv.error || !inv.data.user) { console.error(`✗ invitar: ${inv.error?.message ?? 'sin usuario'}`); process.exit(1); }
  user = { id: inv.data.user.id };
  // El trigger crea la fila en public.users; por si tarda, se asegura.
  await sb.from('users').upsert({ id: user.id, email }, { onConflict: 'id', ignoreDuplicates: true });
  console.log('• invitado: le llega un email para entrar');
}
if (!user) { console.log('• no tenía usuario: nada que quitar'); process.exit(0); }
if (DRY) { console.log(`• [prueba] ${REMOVE ? 'dejaría de ser' : 'pasaría a ser'} superadmin`); process.exit(0); }
if (REMOVE) must(await sb.from('platform_admin').delete().eq('user_id', user.id), 'quitar superadmin');
else must(await sb.from('platform_admin').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true }), 'nombrar superadmin');
console.log(REMOVE ? '✓ Ya no es superadmin.' : '✓ Superadmin: entra en cualquier espacio (Plataforma, en el menú) y lo ve todo.');
