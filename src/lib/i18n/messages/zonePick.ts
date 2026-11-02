/** Buscador de ciudad al dar de alta o editar una empresa (docs/CRM_DINAMICO.md §44). */
import { defineMessages } from '../core';

export const zonePickMessages = defineMessages({
  es: {
    label: 'Ciudad', ph: 'Busca: Bilbao, Málaga, Ibiza…',
    help: 'Cualquier ciudad, de aquí o de fuera: si aún no está, se añade sola.',
    none: 'Sin ciudad', change: 'Cambiar', clear: 'Quitar',
    townIn: (t: string, p: string) => `${t} (${p})`, newTown: 'Pueblo nuevo', searching: 'Buscando en el mapa…',
    nothing: 'No sale. Si es un pueblo, escribe «Pueblo, Provincia» (por ejemplo «Requena, Valencia»).',
  },
  en: {
    label: 'City', ph: 'Search: Bilbao, Málaga, Ibiza…',
    help: 'Any city, here or abroad: if it isn’t there yet, it’s added automatically.',
    none: 'No city', change: 'Change', clear: 'Remove',
    townIn: (t: string, p: string) => `${t} (${p})`, newTown: 'New town', searching: 'Searching the map…',
    nothing: 'Nothing found. If it’s a town, type «Town, Province» (e.g. «Requena, Valencia»).',
  },
  pt: {
    label: 'Cidade', ph: 'Pesquisar: Bilbao, Málaga, Ibiza…',
    help: 'Qualquer cidade, daqui ou de fora: se ainda não existir, é adicionada sozinha.',
    none: 'Sem cidade', change: 'Mudar', clear: 'Remover',
    townIn: (t: string, p: string) => `${t} (${p})`, newTown: 'Vila nova', searching: 'A procurar no mapa…',
    nothing: 'Não aparece. Se for uma vila, escreva «Vila, Província» (por exemplo «Requena, Valencia»).',
  },
  ko: {
    label: '도시', ph: '검색: Bilbao, Málaga, Ibiza…',
    help: '국내외 어느 도시든 됩니다. 아직 없으면 자동으로 추가됩니다.',
    none: '도시 없음', change: '변경', clear: '지우기',
    townIn: (t: string, p: string) => `${t} (${p})`, newTown: '새 마을', searching: '지도에서 찾는 중…',
    nothing: '결과가 없습니다. 마을이라면 «마을, 주»로 입력하세요(예: «Requena, Valencia»).',
  },
});
