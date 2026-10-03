import type { PlaybookService } from './service';

/**
 * Acciones de formulario comunes de las páginas del playbook (sin JS).
 * Devuelve la clave de éxito para el Post/Redirect/Get.
 */
export async function learnAction(pb: PlaybookService, f: FormData, ctx: { moduleId: string | null; topic: string }): Promise<string> {
  const str = (k: string) => String(f.get(k) ?? '');
  switch (str('action')) {
    case 'change':
      await pb.proposeChange({ playId: str('playId'), title: str('title'), body: str('body') });
      return 'change';
    case 'tip':
      await pb.shareTip({ moduleId: ctx.moduleId, kind: str('kind') || 'tip', title: str('title'), body: str('body') });
      return pb.isPartner ? 'tip-pending' : 'tip';
    case 'withdraw':
      await pb.withdraw(str('id'));
      return 'withdraw';
    case 'learned':
      await pb.markLearned(ctx.topic, str('done') === '1');
      return str('done') === '1' ? 'learned' : 'unlearned';
    default:
      return '';
  }
}

export const LEARN_FLASH: Record<string, string> = {
  change: 'Mejora enviada al líder. Te avisaremos en esta ficha cuando la revise.',
  tip: '¡Gracias! Tu truco ya es visible para el equipo.',
  'tip-pending': '¡Gracias! El equipo lo revisará antes de publicarlo.',
  withdraw: 'Aporte retirado.',
  learned: 'Marcado como aprendido.',
  unlearned: 'Desmarcado.',
};
