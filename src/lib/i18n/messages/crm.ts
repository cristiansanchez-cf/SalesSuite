/** CRM dinámico (docs/CRM_DINAMICO.md): campos de cada espacio, ficha de la cuenta y filtros. */
import { defineMessages } from '../core';

export const crmMessages = defineMessages({
  es: {
    types: {
      text: 'Texto', long_text: 'Texto largo', number: 'Número', money: 'Importe', checkbox: 'Sí / no', select: 'Selección',
      multi_select: 'Selección múltiple', date: 'Fecha', url: 'Enlace', email: 'Email', phone: 'Teléfono', rating: 'Valoración',
    },
    typeHints: {
      text: 'Una línea', long_text: 'Varios párrafos', number: 'Aforo, nº de instructores…', money: 'En euros', checkbox: '¿Tiene pantalla?',
      select: 'Una opción de una lista', multi_select: 'Varias opciones', date: 'Día', url: 'Web, Instagram…', email: 'Correo', phone: 'Con prefijo', rating: 'De 0 a 5',
    },
    editor: {
      eyebrow: 'Equipo', title: 'Campos del CRM',
      lede: 'Lo que guardáis de cada cuenta, como las columnas de una tabla de Notion. Cada espacio tiene los suyos; el nombre, la zona, el sector y quién la trabaja ya vienen de serie.',
      add: 'Añadir campo', edit: 'Editar', save: 'Guardar campo', create: 'Crear campo', up: 'Subir', down: 'Bajar', archive: 'Archivar', restore: 'Recuperar',
      label: 'Nombre', type: 'Tipo', typeLocked: 'El tipo no se cambia: crea otro campo si hace falta.', options: 'Opciones',
      optionsHelp: 'Una por línea. Solo para selección.', group: 'Sección de la ficha', groupHelp: 'Opcional, p. ej. «El local» o «Redes».',
      help: 'Ayuda', helpHelp: 'Una línea que verá quien rellena la ficha.', inList: 'Columna en la lista de cuentas', filterable: 'Se puede filtrar por él',
      required: 'Obligatorio', segments: 'Solo en estos sectores', segmentsHelp: 'Sin marcar ninguno, en todos.',
      flags: { inList: 'En la lista', filterable: 'Filtro', required: 'Obligatorio' },
      archived: (n: number) => `Archivados · ${n}`, archivedHelp: 'Sus datos se conservan; vuelven al recuperarlos.',
      emptyTitle: 'Todavía no hay campos', emptyDetail: 'Añade el primero, por ejemplo «¿Tiene pantalla?» o «Aforo».',
      okSaved: 'Campo guardado.', okArchived: 'Campo archivado: sus datos se conservan.', okRestored: 'Campo recuperado.',
      archiveTitle: (l: string) => `¿Archivar «${l}»?`, archiveDoes: 'Deja de verse en las fichas, en la lista y en los filtros.',
      archiveDoesNot: 'No borra ningún dato: al recuperarlo, vuelve todo.', allSectors: 'Todos los sectores',
    },
    card: {
      title: 'Ficha', save: 'Guardar ficha', okSaved: 'Ficha guardada.', yes: 'Sí', no: 'No', choose: 'Elige…', empty: '—',
      noFields: 'Este espacio aún no tiene campos.', noFieldsAdmin: 'Créalos en Equipo → Campos del CRM.', manage: 'Editar los campos',
      other: 'Otros datos',
    },
    filters: { title: 'Filtrar por', any: 'Cualquiera', clear: 'Quitar filtros', apply: 'Filtrar', search: 'Contiene…' },
  },
  en: {
    types: {
      text: 'Text', long_text: 'Long text', number: 'Number', money: 'Amount', checkbox: 'Yes / no', select: 'Select',
      multi_select: 'Multi-select', date: 'Date', url: 'Link', email: 'Email', phone: 'Phone', rating: 'Rating',
    },
    typeHints: {
      text: 'One line', long_text: 'Several paragraphs', number: 'Capacity, no. of instructors…', money: 'In euros', checkbox: 'Has a screen?',
      select: 'One option from a list', multi_select: 'Several options', date: 'Day', url: 'Website, Instagram…', email: 'Email', phone: 'With country code', rating: 'From 0 to 5',
    },
    editor: {
      eyebrow: 'Team', title: 'CRM fields',
      lede: 'What you keep about each account, like the columns of a Notion table. Each workspace has its own; name, zone, sector and owner come built in.',
      add: 'Add field', edit: 'Edit', save: 'Save field', create: 'Create field', up: 'Move up', down: 'Move down', archive: 'Archive', restore: 'Restore',
      label: 'Name', type: 'Type', typeLocked: 'The type can’t be changed: create another field if needed.', options: 'Options',
      optionsHelp: 'One per line. Only for selects.', group: 'Section of the record', groupHelp: 'Optional, e.g. «The venue» or «Social».',
      help: 'Help', helpHelp: 'One line shown to whoever fills in the record.', inList: 'Column in the accounts list', filterable: 'Can be filtered by',
      required: 'Required', segments: 'Only in these sectors', segmentsHelp: 'If none is ticked, in all of them.',
      flags: { inList: 'In list', filterable: 'Filter', required: 'Required' },
      archived: (n) => `Archived · ${n}`, archivedHelp: 'Their data is kept; it comes back when restored.',
      emptyTitle: 'No fields yet', emptyDetail: 'Add the first one, for example «Has a screen?» or «Capacity».',
      okSaved: 'Field saved.', okArchived: 'Field archived: its data is kept.', okRestored: 'Field restored.',
      archiveTitle: (l) => `Archive «${l}»?`, archiveDoes: 'It stops showing in records, in the list and in filters.',
      archiveDoesNot: 'No data is deleted: restoring it brings everything back.', allSectors: 'All sectors',
    },
    card: {
      title: 'Record', save: 'Save record', okSaved: 'Record saved.', yes: 'Yes', no: 'No', choose: 'Choose…', empty: '—',
      noFields: 'This workspace has no fields yet.', noFieldsAdmin: 'Create them in Team → CRM fields.', manage: 'Edit the fields',
      other: 'Other details',
    },
    filters: { title: 'Filter by', any: 'Any', clear: 'Clear filters', apply: 'Filter', search: 'Contains…' },
  },
  pt: {
    types: {
      text: 'Texto', long_text: 'Texto longo', number: 'Número', money: 'Valor', checkbox: 'Sim / não', select: 'Seleção',
      multi_select: 'Seleção múltipla', date: 'Data', url: 'Link', email: 'Email', phone: 'Telefone', rating: 'Avaliação',
    },
    typeHints: {
      text: 'Uma linha', long_text: 'Vários parágrafos', number: 'Capacidade, nº de instrutores…', money: 'Em euros', checkbox: 'Tem tela?',
      select: 'Uma opção de uma lista', multi_select: 'Várias opções', date: 'Dia', url: 'Site, Instagram…', email: 'Email', phone: 'Com código do país', rating: 'De 0 a 5',
    },
    editor: {
      eyebrow: 'Equipe', title: 'Campos do CRM',
      lede: 'O que vocês guardam de cada conta, como as colunas de uma tabela do Notion. Cada espaço tem os seus; nome, zona, setor e responsável já vêm de série.',
      add: 'Adicionar campo', edit: 'Editar', save: 'Salvar campo', create: 'Criar campo', up: 'Subir', down: 'Descer', archive: 'Arquivar', restore: 'Recuperar',
      label: 'Nome', type: 'Tipo', typeLocked: 'O tipo não muda: crie outro campo se precisar.', options: 'Opções',
      optionsHelp: 'Uma por linha. Só para seleção.', group: 'Seção da ficha', groupHelp: 'Opcional, ex.: «O local» ou «Redes».',
      help: 'Ajuda', helpHelp: 'Uma linha que verá quem preenche a ficha.', inList: 'Coluna na lista de contas', filterable: 'Pode ser filtrado',
      required: 'Obrigatório', segments: 'Só nestes setores', segmentsHelp: 'Sem marcar nenhum, em todos.',
      flags: { inList: 'Na lista', filterable: 'Filtro', required: 'Obrigatório' },
      archived: (n) => `Arquivados · ${n}`, archivedHelp: 'Os dados são mantidos; voltam ao recuperar.',
      emptyTitle: 'Ainda não há campos', emptyDetail: 'Adicione o primeiro, por exemplo «Tem tela?» ou «Capacidade».',
      okSaved: 'Campo salvo.', okArchived: 'Campo arquivado: os dados são mantidos.', okRestored: 'Campo recuperado.',
      archiveTitle: (l) => `Arquivar «${l}»?`, archiveDoes: 'Deixa de aparecer nas fichas, na lista e nos filtros.',
      archiveDoesNot: 'Não apaga nenhum dado: ao recuperar, volta tudo.', allSectors: 'Todos os setores',
    },
    card: {
      title: 'Ficha', save: 'Salvar ficha', okSaved: 'Ficha salva.', yes: 'Sim', no: 'Não', choose: 'Escolha…', empty: '—',
      noFields: 'Este espaço ainda não tem campos.', noFieldsAdmin: 'Crie-os em Equipe → Campos do CRM.', manage: 'Editar os campos',
      other: 'Outros dados',
    },
    filters: { title: 'Filtrar por', any: 'Qualquer', clear: 'Limpar filtros', apply: 'Filtrar', search: 'Contém…' },
  },
  ko: {
    types: {
      text: '텍스트', long_text: '긴 텍스트', number: '숫자', money: '금액', checkbox: '예 / 아니요', select: '선택',
      multi_select: '다중 선택', date: '날짜', url: '링크', email: '이메일', phone: '전화', rating: '평점',
    },
    typeHints: {
      text: '한 줄', long_text: '여러 문단', number: '수용 인원, 강사 수…', money: '유로', checkbox: '스크린이 있나요?',
      select: '목록에서 하나', multi_select: '여러 개', date: '날짜', url: '웹사이트, 인스타그램…', email: '이메일', phone: '국가 번호 포함', rating: '0~5',
    },
    editor: {
      eyebrow: '팀', title: 'CRM 필드',
      lede: '각 계정에 대해 저장하는 정보로, Notion 표의 열과 같습니다. 워크스페이스마다 따로 있으며 이름, 구역, 업종, 담당자는 기본으로 제공됩니다.',
      add: '필드 추가', edit: '편집', save: '필드 저장', create: '필드 만들기', up: '위로', down: '아래로', archive: '보관', restore: '복원',
      label: '이름', type: '유형', typeLocked: '유형은 바꿀 수 없습니다. 필요하면 새 필드를 만드세요.', options: '옵션',
      optionsHelp: '한 줄에 하나. 선택 유형에만 해당합니다.', group: '기록의 섹션', groupHelp: '선택 사항, 예: «매장», «SNS».',
      help: '도움말', helpHelp: '기록을 작성하는 사람에게 보이는 한 줄.', inList: '계정 목록에 열로 표시', filterable: '필터로 사용',
      required: '필수', segments: '이 업종에서만', segmentsHelp: '아무것도 선택하지 않으면 모든 업종.',
      flags: { inList: '목록', filterable: '필터', required: '필수' },
      archived: (n) => `보관됨 · ${n}`, archivedHelp: '데이터는 유지되며 복원하면 다시 나타납니다.',
      emptyTitle: '아직 필드가 없습니다', emptyDetail: '첫 필드를 추가하세요. 예: «스크린이 있나요?», «수용 인원».',
      okSaved: '필드를 저장했습니다.', okArchived: '필드를 보관했습니다. 데이터는 유지됩니다.', okRestored: '필드를 복원했습니다.',
      archiveTitle: (l) => `«${l}»을(를) 보관할까요?`, archiveDoes: '기록, 목록, 필터에서 더 이상 보이지 않습니다.',
      archiveDoesNot: '데이터는 삭제되지 않습니다. 복원하면 모두 돌아옵니다.', allSectors: '모든 업종',
    },
    card: {
      title: '기록', save: '기록 저장', okSaved: '기록을 저장했습니다.', yes: '예', no: '아니요', choose: '선택…', empty: '—',
      noFields: '이 워크스페이스에는 아직 필드가 없습니다.', noFieldsAdmin: '팀 → CRM 필드에서 만드세요.', manage: '필드 편집',
      other: '기타 정보',
    },
    filters: { title: '필터', any: '전체', clear: '필터 지우기', apply: '필터 적용', search: '포함…' },
  },
});
