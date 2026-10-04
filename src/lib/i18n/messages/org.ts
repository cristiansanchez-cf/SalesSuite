/** Organigrama (/admin/team/org) y Plataforma (/admin/platform). Poco texto: la estructura se ve. */
import { defineMessages } from '../core';

const es = {
  eyebrow: 'Equipo', title: 'Organigrama',
  lede: 'Cada delegación es un equipo con su gerente y sus zonas. El gerente ve solo a los suyos; la dirección lo ve todo.',
  top: 'Dirección', topHint: 'Admin y gerentes globales: ven todo el espacio.', global: 'Gerente global', admin: 'Admin',
  manager: 'Gerente', noManager: 'Sin gerente', pickManager: 'Elegir gerente', zones: 'Zonas', addZone: '＋ Zona', noZones: 'Sin zonas',
  people: (n: number) => (n === 1 ? '1 comercial' : `${n} comerciales`), empty: 'Nadie todavía',
  unassigned: 'Sin delegación', unassignedHint: 'Comerciales que aún no están en ningún equipo.',
  moveTo: 'Mover a…', none: 'Sin delegación',
  newTitle: 'Nueva delegación', name: 'Nombre', namePlaceholder: 'Levante', create: 'Crear delegación',
  rename: 'Guardar', remove: 'Quitar delegación', removeConfirm: 'Su gente queda sin delegación (no se borra nadie).',
  readOnly: 'Así está montado tu equipo. Cambiarlo es cosa de la dirección.',
  ok: { created: 'Delegación creada.', saved: 'Guardado.', removed: 'Delegación quitada.', moved: 'Persona movida.', zone: 'Zonas actualizadas.' } as Record<string, string>,
  platform: {
    eyebrow: 'Superadmin', title: 'Plataforma', lede: 'Todos los espacios. Entra en cualquiera como admin.',
    spaces: 'espacios', members: 'personas', delegations: 'delegaciones', dossiers: 'propuestas', published: 'publicadas', revenue: 'ingresos', open: 'Entrar', here: 'Estás aquí', suspended: 'Suspendido',
  },
};

export const orgMessages = defineMessages({
  es,
  en: {
    eyebrow: 'Team', title: 'Org chart',
    lede: 'Each branch is a team with its manager and its areas. A manager sees only their team; leadership sees everything.',
    top: 'Leadership', topHint: 'Admins and global managers: they see the whole space.', global: 'Global manager', admin: 'Admin',
    manager: 'Manager', noManager: 'No manager', pickManager: 'Pick a manager', zones: 'Areas', addZone: '＋ Area', noZones: 'No areas',
    people: (n) => (n === 1 ? '1 rep' : `${n} reps`), empty: 'Nobody yet',
    unassigned: 'No branch', unassignedHint: 'Reps who are not in a team yet.',
    moveTo: 'Move to…', none: 'No branch',
    newTitle: 'New branch', name: 'Name', namePlaceholder: 'East', create: 'Create branch',
    rename: 'Save', remove: 'Remove branch', removeConfirm: 'Its people will have no branch (nobody is deleted).',
    readOnly: 'This is how your team is set up. Leadership changes it.',
    ok: { created: 'Branch created.', saved: 'Saved.', removed: 'Branch removed.', moved: 'Person moved.', zone: 'Areas updated.' },
    platform: {
      eyebrow: 'Superadmin', title: 'Platform', lede: 'Every space. Enter any of them as admin.',
      spaces: 'spaces', members: 'people', delegations: 'branches', dossiers: 'proposals', published: 'published', revenue: 'revenue', open: 'Enter', here: 'You are here', suspended: 'Suspended',
    },
  },
  pt: {
    eyebrow: 'Equipe', title: 'Organograma',
    lede: 'Cada delegação é uma equipe com seu gerente e suas zonas. O gerente vê só os seus; a direção vê tudo.',
    top: 'Direção', topHint: 'Admins e gerentes globais: veem todo o espaço.', global: 'Gerente global', admin: 'Admin',
    manager: 'Gerente', noManager: 'Sem gerente', pickManager: 'Escolher gerente', zones: 'Zonas', addZone: '＋ Zona', noZones: 'Sem zonas',
    people: (n) => (n === 1 ? '1 vendedor' : `${n} vendedores`), empty: 'Ninguém ainda',
    unassigned: 'Sem delegação', unassignedHint: 'Vendedores que ainda não estão em nenhuma equipe.',
    moveTo: 'Mover para…', none: 'Sem delegação',
    newTitle: 'Nova delegação', name: 'Nome', namePlaceholder: 'Sudeste', create: 'Criar delegação',
    rename: 'Salvar', remove: 'Remover delegação', removeConfirm: 'As pessoas ficam sem delegação (ninguém é apagado).',
    readOnly: 'Assim está montada a sua equipe. Quem muda é a direção.',
    ok: { created: 'Delegação criada.', saved: 'Salvo.', removed: 'Delegação removida.', moved: 'Pessoa movida.', zone: 'Zonas atualizadas.' },
    platform: {
      eyebrow: 'Superadmin', title: 'Plataforma', lede: 'Todos os espaços. Entre em qualquer um como admin.',
      spaces: 'espaços', members: 'pessoas', delegations: 'delegações', dossiers: 'propostas', published: 'publicadas', revenue: 'receita', open: 'Entrar', here: 'Você está aqui', suspended: 'Suspenso',
    },
  },
  ko: {
    eyebrow: '팀', title: '조직도',
    lede: '지사마다 매니저와 담당 지역이 있는 팀입니다. 매니저는 자기 팀만, 경영진은 전체를 봅니다.',
    top: '경영진', topHint: '관리자와 전체 매니저: 공간 전체를 봅니다.', global: '전체 매니저', admin: '관리자',
    manager: '매니저', noManager: '매니저 없음', pickManager: '매니저 선택', zones: '지역', addZone: '＋ 지역', noZones: '지역 없음',
    people: (n) => `영업 ${n}명`, empty: '아직 없음',
    unassigned: '지사 없음', unassignedHint: '아직 팀에 속하지 않은 영업 담당자.',
    moveTo: '이동…', none: '지사 없음',
    newTitle: '새 지사', name: '이름', namePlaceholder: '동부', create: '지사 만들기',
    rename: '저장', remove: '지사 삭제', removeConfirm: '소속 인원은 지사 없음이 됩니다(아무도 삭제되지 않음).',
    readOnly: '팀 구성입니다. 변경은 경영진이 합니다.',
    ok: { created: '지사를 만들었어요.', saved: '저장했어요.', removed: '지사를 삭제했어요.', moved: '이동했어요.', zone: '지역을 바꿨어요.' },
    platform: {
      eyebrow: '슈퍼관리자', title: '플랫폼', lede: '모든 공간. 어디든 관리자로 들어갈 수 있어요.',
      spaces: '공간', members: '명', delegations: '지사', dossiers: '제안서', published: '게시됨', revenue: '매출', open: '들어가기', here: '현재 공간', suspended: '정지됨',
    },
  },
});
