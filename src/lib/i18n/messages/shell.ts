/** Estructura común de la consola: navegación, cabecera, campana, perfil, avisos, Mi cuenta y componentes compartidos. */
import { defineMessages } from '../core';

const es = {
  nav: {
    start: 'Empieza aquí', analytics: 'Analítica', home: 'Inicio', dossiers: 'Dossiers', myAccounts: 'Mis cuentas', accounts: 'Cuentas', compose: 'Preparar mensaje', wins: 'Qué ha funcionado',
    learn: 'Aprende', myCommissions: 'Mis comisiones', setup: 'Configuración guiada', playbook: 'Playbook y mercado', catalog: 'Catálogo',
    team: 'Equipo', territory: 'Territorio', commissions: 'Comisiones', prices: 'Tarifas y pagos', brand: 'Marca', sell: 'Vender', configure: 'Configurar',
    modes: 'Modo', sections: 'Secciones', pendingReview: (n: number) => `${n} pendientes de revisar`, pending: (n: number) => `${n} pendientes`,
  },
  role: { admin: 'Admin', lead: 'Jefe/a de ventas', rep: 'Comercial', partner: 'Colaborador' },
  shell: {
    navigation: 'Navegación', openMenu: 'Abrir menú', loading: 'Cargando…', closeMenu: 'Cerrar menú', menu: 'Menú', workspace: 'Espacio de trabajo',
    workspaceHint: 'Espacio en el que trabajas', myAccount: 'Mi cuenta', logout: 'Salir', language: 'Idioma',
    demo: 'Modo demo: los datos viven en memoria y se pierden al reiniciar el servidor.',
  },
  bell: {
    title: 'Avisos', label: (n: number) => (n ? `Avisos: ${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Avisos'), markAll: 'Marcar todo como leído',
    empty: 'Todo al día. Te avisaremos aquí cuando algo necesite tu atención.', needsAction: 'Pide tu acción', dismiss: 'Descartar', dismissLabel: (t: string) => `Descartar: ${t}`,
    all: 'Ver todos los avisos',
  },
  notifications: {
    eyebrow: 'Tu actividad', title: 'Avisos', lede: 'Lo que necesita tu acción aparece primero. Lo informativo te llega en el resumen de los lunes, no suelto.',
    filter: 'Filtro', open: 'Pendientes', all: 'Todos', emptyOpen: 'Todo al día', emptyAll: 'Todavía no tienes avisos',
    emptyBecause: 'Te avisaremos aquí cuando alguien proponga algo para el playbook, documente un cierre o se sume al equipo.',
    resolved: 'Resuelto', emailOn: 'Te escribimos cuando algo pide tu acción y los lunes un resumen.', emailOff: 'Has desactivado los emails: solo verás los avisos aquí.', change: 'Cambiar',
  },
  account: {
    eyebrow: 'Tu perfil', title: 'Mi cuenta', welcome: 'Bienvenido/a.', welcomeLede: 'Dinos cómo te llamas. La contraseña es opcional: siempre puedes entrar con un código por email.',
    name: 'Nombre', phone: 'Teléfono', phoneHelp: 'Opcional. Lo ven tus compañeros de zona para llamarte o escribirte por WhatsApp.',
    password: 'Contraseña', passwordHelp: 'Opcional, mínimo 10 caracteres', repeat: 'Repite la contraseña', save: 'Guardar',
    language: 'Idioma de la consola', languageHelp: 'Se guarda en tu cuenta: lo verás igual en cualquier dispositivo.', languageSaved: 'Idioma guardado.',
    notifyEyebrow: 'Avisos', notifyTitle: 'Emails', notifyLabel: 'Avisarme por email',
    dailyLabel: 'Resumen diario a las 7:00', dailyHelp: 'Tus seguimientos vencidos y de hoy, y las propuestas abiertas o sin próximo paso, con el mensaje preparado. Solo si hay algo que mover.', timezone: 'Tu zona horaria',
    notifyHelp: 'Solo cuando algo necesita tu acción (agrupado en un email) y, los lunes, un resumen de lo que sigue abierto. Lo informativo nunca llega suelto.',
    notifySave: 'Guardar preferencia', notifySaved: 'Preferencia guardada.', saved: 'Guardado', savedDemo: 'Guardado (en demo no hay contraseñas)',
    errShort: 'La contraseña debe tener al menos 10 caracteres', errMismatch: 'Las contraseñas no coinciden', errSame: 'La nueva contraseña debe ser distinta de la anterior',
    errSave: 'No se pudo guardar', errPhone: 'Escribe el teléfono solo con números (puedes empezar por +34)',
  },
  ui: {
    failureTitle: 'Fallo inesperado de la aplicación.', failureBody: 'Es un error nuestro, no tuyo. Si se repite, pásanos el código',
    doesNot: 'Lo que no hace:', cancel: 'Cancelar', clearFilters: 'Quitar filtros',
  },
};

export const shellMessages = defineMessages({
  es,
  en: {
    nav: {
      start: 'Start here', analytics: 'Analytics', home: 'Home', dossiers: 'Proposals', myAccounts: 'My accounts', accounts: 'Accounts', compose: 'Write a message', wins: 'What worked',
      learn: 'Learn', myCommissions: 'My commissions', setup: 'Guided setup', playbook: 'Playbook & market', catalog: 'Catalog',
      team: 'Team', territory: 'Territory', commissions: 'Commissions', prices: 'Pricing', brand: 'Brand', sell: 'Sell', configure: 'Configure',
      modes: 'Mode', sections: 'Sections', pendingReview: (n) => `${n} waiting for review`, pending: (n) => `${n} pending`,
    },
    role: { admin: 'Admin', lead: 'Sales lead', rep: 'Sales rep', partner: 'Partner' },
    shell: {
      navigation: 'Navigation', openMenu: 'Open menu', loading: 'Loading…', closeMenu: 'Close menu', menu: 'Menu', workspace: 'Workspace',
      workspaceHint: 'The workspace you are in', myAccount: 'My account', logout: 'Log out', language: 'Language',
      demo: 'Demo mode: data lives in memory and is lost when the server restarts.',
    },
    bell: {
      title: 'Notifications', label: (n) => (n ? `Notifications: ${n} open` : 'Notifications'), markAll: 'Mark all as read',
      empty: 'All caught up. We will let you know here when something needs your attention.', needsAction: 'Needs your action', dismiss: 'Dismiss', dismissLabel: (t) => `Dismiss: ${t}`,
      all: 'See all notifications',
    },
    notifications: {
      eyebrow: 'Your activity', title: 'Notifications', lede: 'What needs your action comes first. Everything else arrives in the Monday summary, not one by one.',
      filter: 'Filter', open: 'Open', all: 'All', emptyOpen: 'All caught up', emptyAll: 'No notifications yet',
      emptyBecause: 'You will see here when someone suggests something for the playbook, documents a deal or joins the team.',
      resolved: 'Resolved', emailOn: 'We email you when something needs your action, plus a summary on Mondays.', emailOff: 'Emails are off: you will only see notifications here.', change: 'Change',
    },
    account: {
      eyebrow: 'Your profile', title: 'My account', welcome: 'Welcome.', welcomeLede: 'Tell us your name. A password is optional: you can always sign in with a code by email.',
      name: 'Name', phone: 'Phone', phoneHelp: 'Optional. Colleagues in your territory see it to call you or message you on WhatsApp.',
      password: 'Password', passwordHelp: 'Optional, at least 10 characters', repeat: 'Repeat the password', save: 'Save',
      language: 'Console language', languageHelp: 'Saved to your account: you will see it on any device.', languageSaved: 'Language saved.',
      notifyEyebrow: 'Notifications', notifyTitle: 'Emails', notifyLabel: 'Email me',
      dailyLabel: 'Daily summary at 7:00', dailyHelp: 'Your overdue and due-today follow-ups, plus opened proposals or ones with no next step, with the message ready. Only when there is something to move.', timezone: 'Your time zone',
      notifyHelp: 'Only when something needs your action (grouped in one email) and, on Mondays, a summary of what is still open. Informational updates never arrive on their own.',
      notifySave: 'Save preference', notifySaved: 'Preference saved.', saved: 'Saved', savedDemo: 'Saved (demo mode has no passwords)',
      errShort: 'The password must have at least 10 characters', errMismatch: 'The passwords do not match', errSame: 'The new password must be different from the old one',
      errSave: 'Could not save', errPhone: 'Use only digits for the phone (you can start with +44)',
    },
    ui: {
      failureTitle: 'Unexpected application failure.', failureBody: 'This is our mistake, not yours. If it happens again, send us the code',
      doesNot: 'What it does not do:', cancel: 'Cancel', clearFilters: 'Clear filters',
    },
  },
  pt: {
    nav: {
      start: 'Comece aqui', analytics: 'Análise', home: 'Início', dossiers: 'Propostas', myAccounts: 'Minhas contas', accounts: 'Contas', compose: 'Preparar mensagem', wins: 'O que funcionou',
      learn: 'Aprenda', myCommissions: 'Minhas comissões', setup: 'Configuração guiada', playbook: 'Playbook e mercado', catalog: 'Catálogo',
      team: 'Equipe', territory: 'Território', commissions: 'Comissões', prices: 'Tarifas', brand: 'Marca', sell: 'Vender', configure: 'Configurar',
      modes: 'Modo', sections: 'Seções', pendingReview: (n) => `${n} aguardando revisão`, pending: (n) => `${n} pendentes`,
    },
    role: { admin: 'Admin', lead: 'Gerente de vendas', rep: 'Vendedor(a)', partner: 'Parceiro(a)' },
    shell: {
      navigation: 'Navegação', openMenu: 'Abrir menu', loading: 'Carregando…', closeMenu: 'Fechar menu', menu: 'Menu', workspace: 'Espaço de trabalho',
      workspaceHint: 'O espaço em que você trabalha', myAccount: 'Minha conta', logout: 'Sair', language: 'Idioma',
      demo: 'Modo demo: os dados ficam na memória e se perdem ao reiniciar o servidor.',
    },
    bell: {
      title: 'Avisos', label: (n) => (n ? `Avisos: ${n} ${n === 1 ? 'pendente' : 'pendentes'}` : 'Avisos'), markAll: 'Marcar tudo como lido',
      empty: 'Tudo em dia. Avisaremos aqui quando algo precisar da sua atenção.', needsAction: 'Precisa da sua ação', dismiss: 'Descartar', dismissLabel: (t) => `Descartar: ${t}`,
      all: 'Ver todos os avisos',
    },
    notifications: {
      eyebrow: 'Sua atividade', title: 'Avisos', lede: 'O que precisa da sua ação aparece primeiro. O informativo chega no resumo de segunda-feira, não solto.',
      filter: 'Filtro', open: 'Pendentes', all: 'Todos', emptyOpen: 'Tudo em dia', emptyAll: 'Você ainda não tem avisos',
      emptyBecause: 'Avisaremos aqui quando alguém propuser algo para o playbook, documentar um fechamento ou entrar na equipe.',
      resolved: 'Resolvido', emailOn: 'Escrevemos quando algo pede sua ação e, às segundas, um resumo.', emailOff: 'Você desativou os emails: verá os avisos só aqui.', change: 'Alterar',
    },
    account: {
      eyebrow: 'Seu perfil', title: 'Minha conta', welcome: 'Boas-vindas.', welcomeLede: 'Diga-nos seu nome. A senha é opcional: você sempre pode entrar com um código por email.',
      name: 'Nome', phone: 'Telefone', phoneHelp: 'Opcional. Seus colegas de região veem para ligar ou escrever pelo WhatsApp.',
      password: 'Senha', passwordHelp: 'Opcional, mínimo de 10 caracteres', repeat: 'Repita a senha', save: 'Salvar',
      language: 'Idioma do console', languageHelp: 'Fica salvo na sua conta: você verá o mesmo em qualquer dispositivo.', languageSaved: 'Idioma salvo.',
      notifyEyebrow: 'Avisos', notifyTitle: 'Emails', notifyLabel: 'Avisar-me por email',
      dailyLabel: 'Resumo diário às 7:00', dailyHelp: 'Seus acompanhamentos atrasados e de hoje, e as propostas abertas ou sem próximo passo, com a mensagem pronta. Só quando há algo para mover.', timezone: 'Seu fuso horário',
      notifyHelp: 'Só quando algo precisa da sua ação (agrupado em um email) e, às segundas, um resumo do que continua aberto. O informativo nunca chega solto.',
      notifySave: 'Salvar preferência', notifySaved: 'Preferência salva.', saved: 'Salvo', savedDemo: 'Salvo (no demo não há senhas)',
      errShort: 'A senha deve ter pelo menos 10 caracteres', errMismatch: 'As senhas não coincidem', errSame: 'A nova senha deve ser diferente da anterior',
      errSave: 'Não foi possível salvar', errPhone: 'Escreva o telefone só com números (pode começar com +55)',
    },
    ui: {
      failureTitle: 'Falha inesperada da aplicação.', failureBody: 'O erro é nosso, não seu. Se repetir, envie-nos o código',
      doesNot: 'O que não faz:', cancel: 'Cancelar', clearFilters: 'Limpar filtros',
    },
  },
  ko: {
    nav: {
      start: '여기서 시작', analytics: '분석', home: '홈', dossiers: '제안서', myAccounts: '내 계정', accounts: '계정', compose: '메시지 작성', wins: '효과 있었던 것',
      learn: '학습', myCommissions: '내 커미션', setup: '가이드 설정', playbook: '플레이북과 시장', catalog: '카탈로그',
      team: '팀', territory: '담당 지역', commissions: '커미션', prices: '요금과 결제', brand: '브랜드', sell: '판매', configure: '설정',
      modes: '모드', sections: '섹션', pendingReview: (n) => `검토 대기 ${n}건`, pending: (n) => `대기 ${n}건`,
    },
    role: { admin: '관리자', lead: '영업 리더', rep: '영업 담당자', partner: '파트너' },
    shell: {
      navigation: '내비게이션', openMenu: '메뉴 열기', loading: '불러오는 중…', closeMenu: '메뉴 닫기', menu: '메뉴', workspace: '워크스페이스',
      workspaceHint: '현재 작업 중인 워크스페이스', myAccount: '내 계정', logout: '로그아웃', language: '언어',
      demo: '데모 모드: 데이터는 메모리에만 저장되며 서버를 다시 시작하면 사라집니다.',
    },
    bell: {
      title: '알림', label: (n) => (n ? `알림: 대기 ${n}건` : '알림'), markAll: '모두 읽음으로 표시',
      empty: '모두 처리했습니다. 확인이 필요한 일이 생기면 여기서 알려드립니다.', needsAction: '처리 필요', dismiss: '닫기', dismissLabel: (t) => `닫기: ${t}`,
      all: '모든 알림 보기',
    },
    notifications: {
      eyebrow: '내 활동', title: '알림', lede: '처리가 필요한 항목이 먼저 표시됩니다. 참고용 소식은 따로 보내지 않고 월요일 요약에 담습니다.',
      filter: '필터', open: '대기 중', all: '전체', emptyOpen: '모두 처리했습니다', emptyAll: '아직 알림이 없습니다',
      emptyBecause: '누군가 플레이북에 제안하거나, 거래를 기록하거나, 팀에 합류하면 여기에 표시됩니다.',
      resolved: '해결됨', emailOn: '처리가 필요할 때와 월요일 요약을 이메일로 보내드립니다.', emailOff: '이메일을 끄셨습니다. 알림은 여기서만 볼 수 있습니다.', change: '변경',
    },
    account: {
      eyebrow: '내 프로필', title: '내 계정', welcome: '환영합니다.', welcomeLede: '이름을 알려주세요. 비밀번호는 선택 사항이며, 언제든 이메일 코드로 로그인할 수 있습니다.',
      name: '이름', phone: '전화번호', phoneHelp: '선택 사항. 같은 지역 동료가 전화나 WhatsApp으로 연락할 때 사용합니다.',
      password: '비밀번호', passwordHelp: '선택 사항, 최소 10자', repeat: '비밀번호 확인', save: '저장',
      language: '콘솔 언어', languageHelp: '계정에 저장되어 어느 기기에서나 같은 언어로 표시됩니다.', languageSaved: '언어를 저장했습니다.',
      notifyEyebrow: '알림', notifyTitle: '이메일', notifyLabel: '이메일로 알림 받기',
      dailyLabel: '매일 오전 7시 요약', dailyHelp: '기한이 지났거나 오늘 해야 할 후속 연락, 열람됐거나 다음 단계가 없는 제안서를 메시지와 함께 보내 드립니다. 할 일이 있을 때만 보냅니다.', timezone: '시간대',
      notifyHelp: '처리가 필요할 때만(한 통으로 묶어서) 보내고, 월요일에는 아직 열려 있는 항목을 요약해 드립니다. 참고용 소식은 따로 보내지 않습니다.',
      notifySave: '설정 저장', notifySaved: '설정을 저장했습니다.', saved: '저장했습니다', savedDemo: '저장했습니다 (데모에는 비밀번호가 없습니다)',
      errShort: '비밀번호는 10자 이상이어야 합니다', errMismatch: '비밀번호가 일치하지 않습니다', errSame: '새 비밀번호는 이전 비밀번호와 달라야 합니다',
      errSave: '저장하지 못했습니다', errPhone: '전화번호는 숫자로만 입력하세요 (+82로 시작할 수 있습니다)',
    },
    ui: {
      failureTitle: '예기치 않은 애플리케이션 오류입니다.', failureBody: '사용자의 잘못이 아닌 저희 쪽 오류입니다. 다시 발생하면 다음 코드를 보내주세요',
      doesNot: '하지 않는 일:', cancel: '취소', clearFilters: '필터 지우기',
    },
  },
});
