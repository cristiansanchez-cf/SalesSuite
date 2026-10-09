/** CRM fase 3 (docs/CRM_DINAMICO.md §10): contacto, interacciones, próximo paso y «Hoy». */
import { defineMessages } from '../core';

export const followupMessages = defineMessages({
  es: {
    channels: { instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', phone: 'Llamada', email: 'Email', visit: 'Visita', meeting: 'Reunión', other: 'Otro' },
    outcomes: { no_reply: 'Sin respuesta', replied: 'Contestó', interested: 'Interesado', not_interested: 'No interesado', meeting: 'Cita conseguida', note: 'Solo una nota' },
    reasons: {
      first: 'Primer contacto', retry: (n: number) => `Intento ${n} de 3`, next_actor: 'Probar con otra persona', visit: 'Nadie contesta: ir en persona',
      follow_up: 'Seguir la conversación', meeting: 'Preparar la cita', closed: 'No interesado: sin próximo paso',
    },
    contact: {
      title: 'Contacto', phone: 'Teléfono', email: 'Email', instagram: 'Instagram', linkedin: 'LinkedIn', website: 'Web', mapsUrl: 'Google Maps',
      from: (name: string) => `de ${name}`, none: 'Aún no hay datos de contacto.', edit: 'Editar contacto', save: 'Guardar contacto',
      call: 'Llamar', whatsapp: 'WhatsApp', mail: 'Email', open: 'Abrir', help: 'Pega el enlace o el usuario (@club).',
    },
    follow: {
      title: 'Seguimiento', next: 'Próximo paso', noNext: 'Sin próximo paso.', when: 'Cuándo', with: 'Con quién', company: 'La empresa', via: 'Por dónde',
      what: 'Qué hacer', whatPh: 'Proponer una cita el jueves…', log: 'Apuntar lo que ha pasado', logHelp: 'Al guardar, la app propone el siguiente paso con la regla de los 3 intentos.',
      result: 'Qué pasó', note: 'Nota', notePh: 'Lo que has visto o te han dicho…', save: 'Guardar', change: 'Cambiar el próximo paso', clear: 'Quitar',
      saveNext: 'Guardar próximo paso', history: (n: number) => `Interacciones · ${n}`, empty: 'Todavía no hay nada apuntado.', remove: 'Borrar',
      suggested: 'La app propone', overdue: 'Vencido', today: 'Hoy', tomorrow: 'Mañana', later: 'Más adelante', rule: 'Regla: 3 mensajes sin respuesta por persona, hasta 3 personas; después, en persona.',
      ok: { logged: 'Apuntado. Próximo paso actualizado.', noted: 'Nota guardada.', next: 'Próximo paso guardado.', cleared: 'Próximo paso quitado.', contact: 'Contacto guardado.', removed: 'Borrado.' },
    },
    today: {
      title: 'Hoy en tus cuentas', lede: 'Lo que toca, en orden. Vencido primero.', empty: 'Nada pendiente para hoy ni mañana.', emptyHint: 'Apunta lo que pase con cada empresa y el próximo paso aparecerá aquí.',
      counts: (o: number, t: number, m: number) => [o && `${o} vencidos`, t && `${t} hoy`, m && `${m} mañana`].filter(Boolean).join(' · '), last: 'Último', open: 'Abrir ficha', done: 'Apuntar',
    },
    fix: {
      title: 'Arreglos', igTitle: 'Instagram del local guardado en la persona', igBody: (n: number) => (n ? `${n} locales tienen su Instagram en la ficha de una persona. Pasarlo a la empresa:` : 'No hay nada que pasar.'),
      igApply: (n: number) => `Pasar ${n} a sus empresas`, igDone: (n: number) => `${n} Instagram pasados a sus empresas.`,
    },
  },
  en: {
    channels: { instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', phone: 'Call', email: 'Email', visit: 'Visit', meeting: 'Meeting', other: 'Other' },
    outcomes: { no_reply: 'No reply', replied: 'Replied', interested: 'Interested', not_interested: 'Not interested', meeting: 'Meeting booked', note: 'Just a note' },
    reasons: {
      first: 'First contact', retry: (n: number) => `Attempt ${n} of 3`, next_actor: 'Try another person', visit: 'Nobody replies: go in person',
      follow_up: 'Keep the conversation going', meeting: 'Prepare the meeting', closed: 'Not interested: no next step',
    },
    contact: {
      title: 'Contact', phone: 'Phone', email: 'Email', instagram: 'Instagram', linkedin: 'LinkedIn', website: 'Website', mapsUrl: 'Google Maps',
      from: (name: string) => `from ${name}`, none: 'No contact details yet.', edit: 'Edit contact', save: 'Save contact',
      call: 'Call', whatsapp: 'WhatsApp', mail: 'Email', open: 'Open', help: 'Paste the link or the handle (@club).',
    },
    follow: {
      title: 'Follow-up', next: 'Next step', noNext: 'No next step.', when: 'When', with: 'With whom', company: 'The company', via: 'Channel',
      what: 'What to do', whatPh: 'Propose a meeting on Thursday…', log: 'Log what happened', logHelp: 'When you save, the app proposes the next step using the 3-attempt rule.',
      result: 'What happened', note: 'Note', notePh: 'What you saw or were told…', save: 'Save', change: 'Change the next step', clear: 'Remove',
      saveNext: 'Save next step', history: (n: number) => `Interactions · ${n}`, empty: 'Nothing logged yet.', remove: 'Delete',
      suggested: 'The app suggests', overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', later: 'Later', rule: 'Rule: 3 unanswered messages per person, up to 3 people; then in person.',
      ok: { logged: 'Logged. Next step updated.', noted: 'Note saved.', next: 'Next step saved.', cleared: 'Next step removed.', contact: 'Contact saved.', removed: 'Deleted.' },
    },
    today: {
      title: 'Today in your accounts', lede: 'What’s due, in order. Overdue first.', empty: 'Nothing due today or tomorrow.', emptyHint: 'Log what happens with each company and its next step will show up here.',
      counts: (o: number, t: number, m: number) => [o && `${o} overdue`, t && `${t} today`, m && `${m} tomorrow`].filter(Boolean).join(' · '), last: 'Last', open: 'Open record', done: 'Log',
    },
    fix: {
      title: 'Fixes', igTitle: 'Venue Instagram saved on the person', igBody: (n: number) => (n ? `${n} venues have their Instagram on a person’s record. Move it to the company:` : 'Nothing to move.'),
      igApply: (n: number) => `Move ${n} to their companies`, igDone: (n: number) => `${n} Instagram accounts moved to their companies.`,
    },
  },
  pt: {
    channels: { instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', phone: 'Ligação', email: 'Email', visit: 'Visita', meeting: 'Reunião', other: 'Outro' },
    outcomes: { no_reply: 'Sem resposta', replied: 'Respondeu', interested: 'Interessado', not_interested: 'Não interessado', meeting: 'Reunião marcada', note: 'Só uma nota' },
    reasons: {
      first: 'Primeiro contato', retry: (n: number) => `Tentativa ${n} de 3`, next_actor: 'Tentar outra pessoa', visit: 'Ninguém responde: ir pessoalmente',
      follow_up: 'Seguir a conversa', meeting: 'Preparar a reunião', closed: 'Não interessado: sem próximo passo',
    },
    contact: {
      title: 'Contato', phone: 'Telefone', email: 'Email', instagram: 'Instagram', linkedin: 'LinkedIn', website: 'Site', mapsUrl: 'Google Maps',
      from: (name: string) => `de ${name}`, none: 'Ainda não há dados de contato.', edit: 'Editar contato', save: 'Salvar contato',
      call: 'Ligar', whatsapp: 'WhatsApp', mail: 'Email', open: 'Abrir', help: 'Cole o link ou o usuário (@club).',
    },
    follow: {
      title: 'Acompanhamento', next: 'Próximo passo', noNext: 'Sem próximo passo.', when: 'Quando', with: 'Com quem', company: 'A empresa', via: 'Por onde',
      what: 'O que fazer', whatPh: 'Propor uma reunião na quinta…', log: 'Anotar o que aconteceu', logHelp: 'Ao salvar, o app propõe o próximo passo com a regra das 3 tentativas.',
      result: 'O que aconteceu', note: 'Nota', notePh: 'O que você viu ou ouviu…', save: 'Salvar', change: 'Mudar o próximo passo', clear: 'Tirar',
      saveNext: 'Salvar próximo passo', history: (n: number) => `Interações · ${n}`, empty: 'Ainda não há nada anotado.', remove: 'Apagar',
      suggested: 'O app sugere', overdue: 'Atrasado', today: 'Hoje', tomorrow: 'Amanhã', later: 'Mais tarde', rule: 'Regra: 3 mensagens sem resposta por pessoa, até 3 pessoas; depois, pessoalmente.',
      ok: { logged: 'Anotado. Próximo passo atualizado.', noted: 'Nota salva.', next: 'Próximo passo salvo.', cleared: 'Próximo passo removido.', contact: 'Contato salvo.', removed: 'Apagado.' },
    },
    today: {
      title: 'Hoje nas suas contas', lede: 'O que toca, em ordem. Atrasados primeiro.', empty: 'Nada pendente para hoje nem amanhã.', emptyHint: 'Anote o que acontecer com cada empresa e o próximo passo aparece aqui.',
      counts: (o: number, t: number, m: number) => [o && `${o} atrasados`, t && `${t} hoje`, m && `${m} amanhã`].filter(Boolean).join(' · '), last: 'Último', open: 'Abrir ficha', done: 'Anotar',
    },
    fix: {
      title: 'Ajustes', igTitle: 'Instagram do local salvo na pessoa', igBody: (n: number) => (n ? `${n} locais têm o Instagram na ficha de uma pessoa. Passar para a empresa:` : 'Nada para passar.'),
      igApply: (n: number) => `Passar ${n} para as empresas`, igDone: (n: number) => `${n} Instagram passados para as empresas.`,
    },
  },
  ko: {
    channels: { instagram: '인스타그램', linkedin: '링크드인', whatsapp: '왓츠앱', phone: '전화', email: '이메일', visit: '방문', meeting: '미팅', other: '기타' },
    outcomes: { no_reply: '응답 없음', replied: '응답함', interested: '관심 있음', not_interested: '관심 없음', meeting: '미팅 확정', note: '메모만' },
    reasons: {
      first: '첫 연락', retry: (n: number) => `${n}/3번째 시도`, next_actor: '다른 사람에게 시도', visit: '응답 없음: 직접 방문',
      follow_up: '대화 이어가기', meeting: '미팅 준비', closed: '관심 없음: 다음 단계 없음',
    },
    contact: {
      title: '연락처', phone: '전화', email: '이메일', instagram: '인스타그램', linkedin: '링크드인', website: '웹사이트', mapsUrl: '구글 지도',
      from: (name: string) => `${name}의 연락처`, none: '아직 연락처가 없습니다.', edit: '연락처 수정', save: '연락처 저장',
      call: '전화', whatsapp: '왓츠앱', mail: '이메일', open: '열기', help: '링크나 아이디(@club)를 붙여넣으세요.',
    },
    follow: {
      title: '후속 조치', next: '다음 단계', noNext: '다음 단계 없음.', when: '언제', with: '누구와', company: '회사', via: '채널',
      what: '할 일', whatPh: '목요일 미팅 제안…', log: '있었던 일 기록', logHelp: '저장하면 3번 시도 규칙에 따라 다음 단계를 제안합니다.',
      result: '결과', note: '메모', notePh: '보거나 들은 것…', save: '저장', change: '다음 단계 바꾸기', clear: '지우기',
      saveNext: '다음 단계 저장', history: (n: number) => `연락 기록 · ${n}`, empty: '아직 기록이 없습니다.', remove: '삭제',
      suggested: '앱의 제안', overdue: '기한 지남', today: '오늘', tomorrow: '내일', later: '나중에', rule: '규칙: 한 사람당 응답 없는 메시지 3번, 최대 3명; 그다음 직접 방문.',
      ok: { logged: '기록했습니다. 다음 단계를 업데이트했습니다.', noted: '메모를 저장했습니다.', next: '다음 단계를 저장했습니다.', cleared: '다음 단계를 지웠습니다.', contact: '연락처를 저장했습니다.', removed: '삭제했습니다.' },
    },
    today: {
      title: '오늘 내 계정', lede: '할 일을 순서대로. 기한 지난 것부터.', empty: '오늘과 내일 할 일이 없습니다.', emptyHint: '회사마다 있었던 일을 기록하면 다음 단계가 여기에 나옵니다.',
      counts: (o: number, t: number, m: number) => [o && `기한 지남 ${o}`, t && `오늘 ${t}`, m && `내일 ${m}`].filter(Boolean).join(' · '), last: '최근', open: '기록 열기', done: '기록',
    },
    fix: {
      title: '정리', igTitle: '사람 기록에 저장된 매장 인스타그램', igBody: (n: number) => (n ? `${n}개 매장의 인스타그램이 사람 기록에 있습니다. 회사로 옮기기:` : '옮길 것이 없습니다.'),
      igApply: (n: number) => `${n}개를 회사로 옮기기`, igDone: (n: number) => `인스타그램 ${n}개를 회사로 옮겼습니다.`,
    },
  },
});
