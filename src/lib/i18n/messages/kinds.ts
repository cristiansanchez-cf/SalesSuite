/** Tipos de cliente por espacio (docs/CRM_DINAMICO.md §21). */
import { defineMessages } from '../core';

export const kindsMessages = defineMessages({
  es: {
    tab: 'Tipos de cliente', title: 'Tipos de cliente',
    lede: 'Cómo se separan tus empresas en pestañas (en Enjoy: Empresas y DJs; en un centro de buceo: Centros y ONGs). El primero es el principal: no se quita, solo se renombra, y es el de las empresas nuevas.',
    label: 'Nombre (una)', plural: 'Plural (pestaña)', icon: 'Icono', remove: 'Quitar', main: 'Principal', days: 'Plazo (días)', daysBig: 'Grande (días)',
    daysHelp: 'Plazo para cerrar, en días desde el primer contacto. Si se pasa, el tablero lo avisa (no la cierra). «Grande»: si es un grupo o un sitio grande o masivo.',
    add: 'Añadir tipo', newLabel: 'p. ej. ONG', newPlural: 'p. ej. ONGs', save: 'Guardar tipos', ok: 'Tipos guardados.',
    removeHelp: 'Las empresas de un tipo que quitas pasan al principal (no se pierde nada).',
    work: {
      title: 'Trabaja con', help: 'Promotoras, DJs (residentes o invitados) o locales con los que trabaja. Si no está en el CRM, se crea.',
      name: 'Busca en tu CRM', namePh: 'Escribe el nombre…', kind: 'Es', note: 'Nota', notePh: 'p. ej. los jueves en la terraza',
      add: 'Enlazar', remove: 'Quitar enlace', none: 'Aún no hay ninguna enlazada.', ok: 'Enlazada con la que ya tenías.', okNew: 'Creada y enlazada.', removed: 'Enlace quitado.',
      have: 'Ya en tu CRM', create: (n: string) => `Crear «${n}» nueva`, chosen: 'Enlazar con', newOne: 'Nueva:', change: 'Cambiar', pick: 'Elige una de la lista o «Crear nueva».', searching: 'Buscando…', sectionPh: (plural: string) => `Escribe el nombre (se busca en ${plural})…`, addTo: (n: string, plural: string) => `Añadir «${n}» a ${plural}`, addToHelp: (plural: string) => `Si no aparece, lo añades a ${plural} desde aquí y queda enlazado.`, linkNew: (plural: string) => `Añadir a ${plural} y enlazar`, noneYet: 'Ninguno todavía.', others: 'Otros enlaces', min: 'Escribe al menos 2 letras.',
    },
  },
  en: {
    tab: 'Client types', title: 'Client types',
    lede: 'How your companies are split into tabs (at Enjoy: Companies and DJs; at a dive business: Centres and NGOs). The first one is the main type: it can’t be removed, only renamed, and new companies get it.',
    label: 'Name (one)', plural: 'Plural (tab)', icon: 'Icon', remove: 'Remove', main: 'Main', days: 'Deadline (days)', daysBig: 'Large (days)',
    daysHelp: 'Days from first contact to close. If it goes over, the board flags it (it doesn’t close it). «Large»: a group, or a large or huge place.',
    add: 'Add type', newLabel: 'e.g. NGO', newPlural: 'e.g. NGOs', save: 'Save types', ok: 'Types saved.',
    removeHelp: 'Companies of a removed type move to the main one (nothing is lost).',
    work: {
      title: 'Works with', help: 'Promoters, DJs (resident or guest) or venues they work with. If it’s not in the CRM, it’s created.',
      name: 'Search your CRM', namePh: 'Type the name…', kind: 'It is a', note: 'Note', notePh: 'e.g. Thursdays on the terrace',
      add: 'Link', remove: 'Remove link', none: 'Nothing linked yet.', ok: 'Linked to the one you already had.', okNew: 'Created and linked.', removed: 'Link removed.',
      have: 'Already in your CRM', create: (n: string) => `Create «${n}» as new`, chosen: 'Link with', newOne: 'New:', change: 'Change', pick: 'Pick one from the list or «Create new».', searching: 'Searching…', sectionPh: (plural: string) => `Type the name (searches in ${plural})…`, addTo: (n: string, plural: string) => `Add «${n}» to ${plural}`, addToHelp: (plural: string) => `If it doesn’t show up, add it to ${plural} from here and it gets linked.`, linkNew: (plural: string) => `Add to ${plural} and link`, noneYet: 'None yet.', others: 'Other links', min: 'Type at least 2 letters.',
    },
  },
  pt: {
    tab: 'Tipos de cliente', title: 'Tipos de cliente',
    lede: 'Como suas empresas se separam em abas (na Enjoy: Empresas e DJs; num centro de mergulho: Centros e ONGs). O primeiro é o principal: não sai, só se renomeia, e é o das empresas novas.',
    label: 'Nome (uma)', plural: 'Plural (aba)', icon: 'Ícone', remove: 'Tirar', main: 'Principal', days: 'Prazo (dias)', daysBig: 'Grande (dias)',
    daysHelp: 'Prazo para fechar, em dias desde o primeiro contato. Se passar, o quadro avisa (não fecha). «Grande»: um grupo ou um lugar grande ou massivo.',
    add: 'Adicionar tipo', newLabel: 'ex. ONG', newPlural: 'ex. ONGs', save: 'Salvar tipos', ok: 'Tipos salvos.',
    removeHelp: 'As empresas de um tipo que você tirar passam para o principal (nada se perde).',
    work: {
      title: 'Trabalha com', help: 'Promotoras, DJs (residentes ou convidados) ou locais com que trabalha. Se não estiver no CRM, é criado.',
      name: 'Busque no seu CRM', namePh: 'Escreva o nome…', kind: 'É', note: 'Nota', notePh: 'ex. às quintas no terraço',
      add: 'Vincular', remove: 'Tirar vínculo', none: 'Ainda não há nenhuma vinculada.', ok: 'Vinculada à que você já tinha.', okNew: 'Criada e vinculada.', removed: 'Vínculo tirado.',
      have: 'Já no seu CRM', create: (n: string) => `Criar «${n}» nova`, chosen: 'Vincular com', newOne: 'Nova:', change: 'Trocar', pick: 'Escolha uma da lista ou «Criar nova».', searching: 'Buscando…', sectionPh: (plural: string) => `Escreva o nome (busca em ${plural})…`, addTo: (n: string, plural: string) => `Adicionar «${n}» a ${plural}`, addToHelp: (plural: string) => `Se não aparecer, adicione a ${plural} daqui e fica vinculado.`, linkNew: (plural: string) => `Adicionar a ${plural} e vincular`, noneYet: 'Nenhum ainda.', others: 'Outros vínculos', min: 'Escreva pelo menos 2 letras.',
    },
  },
  ko: {
    tab: '고객 유형', title: '고객 유형',
    lede: '회사를 탭으로 나누는 방식입니다(Enjoy: 회사와 DJ, 다이빙 센터: 센터와 NGO). 첫 번째가 기본 유형으로, 삭제할 수 없고 이름만 바꿀 수 있으며 새 회사에 적용됩니다.',
    label: '이름(단수)', plural: '복수(탭)', icon: '아이콘', remove: '삭제', main: '기본', days: '기한(일)', daysBig: '대형(일)',
    daysHelp: '첫 연락부터 성사까지의 기한(일). 넘기면 보드가 알려줍니다(자동으로 닫지 않음). «대형»: 그룹 또는 대형·초대형 장소.',
    add: '유형 추가', newLabel: '예: NGO', newPlural: '예: NGO들', save: '유형 저장', ok: '저장했습니다.',
    removeHelp: '삭제한 유형의 회사는 기본 유형으로 이동합니다(잃는 것은 없습니다).',
    work: {
      title: '함께 일하는 곳', help: '함께 일하는 프로모터, DJ(레지던트·게스트), 매장. CRM에 없으면 새로 만듭니다.',
      name: 'CRM에서 찾기', namePh: '이름을 입력하세요…', kind: '유형', note: '메모', notePh: '예: 목요일 테라스',
      add: '연결', remove: '연결 해제', none: '아직 연결된 곳이 없습니다.', ok: '이미 있던 곳과 연결했습니다.', okNew: '만들고 연결했습니다.', removed: '연결을 해제했습니다.',
      have: '이미 CRM에 있음', create: (n: string) => `«${n}» 새로 만들기`, chosen: '연결 대상', newOne: '새로:', change: '변경', pick: '목록에서 고르거나 «새로 만들기»를 누르세요.', searching: '찾는 중…', sectionPh: (plural: string) => `이름을 입력하세요(${plural}에서 검색)…`, addTo: (n: string, plural: string) => `«${n}»을(를) ${plural}에 추가`, addToHelp: (plural: string) => `목록에 없으면 여기서 ${plural}에 추가하고 바로 연결됩니다.`, linkNew: (plural: string) => `${plural}에 추가하고 연결`, noneYet: '아직 없습니다.', others: '기타 연결', min: '2글자 이상 입력하세요.',
    },
  },
});
