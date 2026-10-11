/** Tipos de cliente por espacio (docs/CRM_DINAMICO.md §21). */
import { defineMessages } from '../core';

export const kindsMessages = defineMessages({
  es: {
    tab: 'Tipos de cliente', title: 'Tipos de cliente',
    lede: 'Cómo se separan tus empresas en pestañas (en Enjoy: Empresas y DJs; en un centro de buceo: Centros y ONGs). El primero es el principal: no se quita, solo se renombra, y es el de las empresas nuevas.',
    label: 'Nombre (una)', plural: 'Plural (pestaña)', icon: 'Icono', remove: 'Quitar', main: 'Principal',
    add: 'Añadir tipo', newLabel: 'p. ej. ONG', newPlural: 'p. ej. ONGs', save: 'Guardar tipos', ok: 'Tipos guardados.',
    removeHelp: 'Las empresas de un tipo que quitas pasan al principal (no se pierde nada).',
    work: {
      title: 'Trabaja con', help: 'Promotoras, DJs (residentes o invitados) o locales con los que trabaja. Si no está en el CRM, se crea.',
      name: 'Nombre', namePh: 'p. ej. Fiestas ucranianas VLC', kind: 'Si es nueva, es', note: 'Nota', notePh: 'p. ej. los jueves en la terraza',
      add: 'Enlazar', remove: 'Quitar enlace', none: 'Aún no hay ninguna enlazada.', ok: 'Enlazada.', okNew: 'Creada y enlazada.', removed: 'Enlace quitado.',
    },
  },
  en: {
    tab: 'Client types', title: 'Client types',
    lede: 'How your companies are split into tabs (at Enjoy: Companies and DJs; at a dive business: Centres and NGOs). The first one is the main type: it can’t be removed, only renamed, and new companies get it.',
    label: 'Name (one)', plural: 'Plural (tab)', icon: 'Icon', remove: 'Remove', main: 'Main',
    add: 'Add type', newLabel: 'e.g. NGO', newPlural: 'e.g. NGOs', save: 'Save types', ok: 'Types saved.',
    removeHelp: 'Companies of a removed type move to the main one (nothing is lost).',
    work: {
      title: 'Works with', help: 'Promoters, DJs (resident or guest) or venues they work with. If it’s not in the CRM, it’s created.',
      name: 'Name', namePh: 'e.g. Ukrainian Parties VLC', kind: 'If new, it is a', note: 'Note', notePh: 'e.g. Thursdays on the terrace',
      add: 'Link', remove: 'Remove link', none: 'Nothing linked yet.', ok: 'Linked.', okNew: 'Created and linked.', removed: 'Link removed.',
    },
  },
  pt: {
    tab: 'Tipos de cliente', title: 'Tipos de cliente',
    lede: 'Como suas empresas se separam em abas (na Enjoy: Empresas e DJs; num centro de mergulho: Centros e ONGs). O primeiro é o principal: não sai, só se renomeia, e é o das empresas novas.',
    label: 'Nome (uma)', plural: 'Plural (aba)', icon: 'Ícone', remove: 'Tirar', main: 'Principal',
    add: 'Adicionar tipo', newLabel: 'ex. ONG', newPlural: 'ex. ONGs', save: 'Salvar tipos', ok: 'Tipos salvos.',
    removeHelp: 'As empresas de um tipo que você tirar passam para o principal (nada se perde).',
    work: {
      title: 'Trabalha com', help: 'Promotoras, DJs (residentes ou convidados) ou locais com que trabalha. Se não estiver no CRM, é criado.',
      name: 'Nome', namePh: 'ex. Festas ucranianas VLC', kind: 'Se for nova, é', note: 'Nota', notePh: 'ex. às quintas no terraço',
      add: 'Vincular', remove: 'Tirar vínculo', none: 'Ainda não há nenhuma vinculada.', ok: 'Vinculada.', okNew: 'Criada e vinculada.', removed: 'Vínculo tirado.',
    },
  },
  ko: {
    tab: '고객 유형', title: '고객 유형',
    lede: '회사를 탭으로 나누는 방식입니다(Enjoy: 회사와 DJ, 다이빙 센터: 센터와 NGO). 첫 번째가 기본 유형으로, 삭제할 수 없고 이름만 바꿀 수 있으며 새 회사에 적용됩니다.',
    label: '이름(단수)', plural: '복수(탭)', icon: '아이콘', remove: '삭제', main: '기본',
    add: '유형 추가', newLabel: '예: NGO', newPlural: '예: NGO들', save: '유형 저장', ok: '저장했습니다.',
    removeHelp: '삭제한 유형의 회사는 기본 유형으로 이동합니다(잃는 것은 없습니다).',
    work: {
      title: '함께 일하는 곳', help: '함께 일하는 프로모터, DJ(레지던트·게스트), 매장. CRM에 없으면 새로 만듭니다.',
      name: '이름', namePh: '예: 우크라이나 파티 VLC', kind: '새로 만들면 유형', note: '메모', notePh: '예: 목요일 테라스',
      add: '연결', remove: '연결 해제', none: '아직 연결된 곳이 없습니다.', ok: '연결했습니다.', okNew: '만들고 연결했습니다.', removed: '연결을 해제했습니다.',
    },
  },
});
