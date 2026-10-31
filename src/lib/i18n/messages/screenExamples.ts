/** Catálogo → Mensajes de la pantalla: los ejemplos que salen en la pantalla en vivo de las propuestas. */
import { defineMessages } from '../core';

export const screenExamplesMessages = defineMessages({
  es: {
    title: 'Mensajes de la pantalla',
    lede: 'Lo que sale de ejemplo en la pantalla en vivo de todas las propuestas, en las pantallas sin texto propio. Cambia en todas en un minuto como mucho, también en las ya enviadas.',
    cta: 'Mensajes de ejemplo de la pantalla', ctaHelp: 'Los mensajes, pies de foto y dedicatorias que salen de ejemplo en la pantalla en vivo.',
    groups: { messages: 'Mensajes', photos: 'Pies de foto', songs: 'Dedicatorias de canciones' } as Record<string, string>,
    helps: {
      messages: 'Salen a pantalla completa, como si los mandara alguien del público.',
      photos: 'El texto que acompaña a la foto que sube alguien.',
      songs: 'Lo que dedica quien pide la canción (va con la carátula).',
    } as Record<string, string>,
    by: 'Firma', byPh: 'Nombre (o vacío)', text: 'Texto', textPh: 'Lo que sale en la pantalla',
    kit: 'Ahora salen los de ejemplo de Enjoy. Cámbialos y guarda.', custom: 'Ahora salen los vuestros.',
    save: 'Guardar', reset: 'Volver a los de ejemplo', saved: 'Guardado: ya salen en las propuestas.', resetDone: 'Vuelven a salir los de ejemplo.',
    empty: 'Deja al menos un texto en algún grupo, o vuelve a los de ejemplo.', back: 'Catálogo',
  },
  en: {
    title: 'Screen messages',
    lede: 'The examples shown on the live screen of every proposal, on screens without their own text. Changes reach all of them within a minute, including those already sent.',
    cta: 'Screen example messages', ctaHelp: 'The messages, photo captions and dedications shown as examples on the live screen.',
    groups: { messages: 'Messages', photos: 'Photo captions', songs: 'Song dedications' } as Record<string, string>,
    helps: {
      messages: 'Shown full screen, as if someone in the crowd had sent them.',
      photos: 'The text that goes with a photo someone uploads.',
      songs: 'What the person requesting the song dedicates (shown with the cover).',
    } as Record<string, string>,
    by: 'Signed by', byPh: 'Name (or empty)', text: 'Text', textPh: 'What shows on the screen',
    kit: 'Enjoy’s sample ones are showing now. Change them and save.', custom: 'Yours are showing now.',
    save: 'Save', reset: 'Back to the sample ones', saved: 'Saved: they now show in proposals.', resetDone: 'The sample ones show again.',
    empty: 'Keep at least one text in some group, or go back to the sample ones.', back: 'Catalog',
  },
  pt: {
    title: 'Mensagens do ecrã',
    lede: 'O que aparece como exemplo no ecrã em direto de todas as propostas, nos ecrãs sem texto próprio. Muda em todas num minuto no máximo, também nas já enviadas.',
    cta: 'Mensagens de exemplo do ecrã', ctaHelp: 'As mensagens, legendas de fotos e dedicatórias que aparecem como exemplo no ecrã em direto.',
    groups: { messages: 'Mensagens', photos: 'Legendas de fotos', songs: 'Dedicatórias de músicas' } as Record<string, string>,
    helps: {
      messages: 'Aparecem em ecrã inteiro, como se alguém do público as enviasse.',
      photos: 'O texto que acompanha a foto que alguém envia.',
      songs: 'O que dedica quem pede a música (aparece com a capa).',
    } as Record<string, string>,
    by: 'Assinatura', byPh: 'Nome (ou vazio)', text: 'Texto', textPh: 'O que aparece no ecrã',
    kit: 'Agora aparecem os de exemplo da Enjoy. Muda-os e guarda.', custom: 'Agora aparecem os vossos.',
    save: 'Guardar', reset: 'Voltar aos de exemplo', saved: 'Guardado: já aparecem nas propostas.', resetDone: 'Voltam a aparecer os de exemplo.',
    empty: 'Deixa pelo menos um texto em algum grupo, ou volta aos de exemplo.', back: 'Catálogo',
  },
  ko: {
    title: '화면 메시지',
    lede: '모든 제안서의 라이브 화면에서, 자체 문구가 없는 화면에 예시로 나오는 내용입니다. 이미 보낸 제안서를 포함해 늦어도 1분 안에 모두 바뀝니다.',
    cta: '화면 예시 메시지', ctaHelp: '라이브 화면에 예시로 나오는 메시지, 사진 캡션, 신청곡 문구입니다.',
    groups: { messages: '메시지', photos: '사진 캡션', songs: '신청곡 문구' } as Record<string, string>,
    helps: {
      messages: '관객이 보낸 것처럼 전체 화면에 나옵니다.',
      photos: '누군가 올린 사진과 함께 나오는 문구입니다.',
      songs: '곡을 신청한 사람이 남기는 말입니다(앨범 커버와 함께 나옵니다).',
    } as Record<string, string>,
    by: '보낸 사람', byPh: '이름(또는 비워 두기)', text: '문구', textPh: '화면에 나오는 내용',
    kit: '지금은 Enjoy 예시가 나옵니다. 바꾸고 저장하세요.', custom: '지금은 직접 정한 문구가 나옵니다.',
    save: '저장', reset: '예시로 되돌리기', saved: '저장했습니다. 이제 제안서에 나옵니다.', resetDone: '다시 예시가 나옵니다.',
    empty: '어느 그룹이든 문구를 하나 이상 남기거나 예시로 되돌리세요.', back: '카탈로그',
  },
});
