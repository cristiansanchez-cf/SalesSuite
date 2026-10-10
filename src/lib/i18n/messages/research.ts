/** Investigación con IA (docs/CRM_DINAMICO.md §13): propuestas con su fuente, que el comercial acepta o descarta. */
import { defineMessages } from '../core';

export const researchMessages = defineMessages({
  es: {
    title: 'Investigación con IA', unverified: 'Sin verificar',
    intro: 'Busca en la web lo público de esta empresa y te propone datos, cada uno con su fuente. Nada se guarda en la ficha hasta que lo aceptes.',
    run: 'Investigar con IA', rerun: 'Volver a investigar', running: 'Investigando… (hasta un minuto)',
    at: (when: string) => `Investigada ${when}`, look: 'Para mirar tú', proposals: (n: number) => `Propuestas · ${n}`,
    none: 'No ha encontrado nada que se pueda comprobar.', accept: 'Aceptar', dismiss: 'Descartar', source: 'Fuente',
    decided: (a: number, d: number) => `${a} aceptadas · ${d} descartadas`, sources: (n: number) => `Fuentes · ${n}`,
    person: 'Persona', debt: 'Cierre o deudas', noKey: 'Para usarla, añade ANTHROPIC_API_KEY en Vercel.',
    zone: {
      run: 'Investigar con IA', max: (n: number) => `Hasta ${n} por vez`, progress: (i: number | string, n: number | string, name: string) => `Investigando ${i} de ${n}: ${name}…`,
      done: (n: number | string) => `Listo: ${n} investigadas`, skipped: (n: number | string) => ` · ${n} saltadas (ya investigadas o de otro)`, failed: (n: number | string) => ` · ${n} con error`,
      see: 'Ver las investigadas', filter: 'Investigadas por IA', badge: 'IA', stay: 'No cierres esta pestaña mientras investiga.',
    },
    ok: { run: 'Investigación lista: revisa las propuestas.', accept: 'Guardado en la ficha.', dismiss: 'Descartada.' },
  },
  en: {
    title: 'AI research', unverified: 'Unverified',
    intro: 'Searches the web for public information about this company and suggests data, each with its source. Nothing is saved until you accept it.',
    run: 'Research with AI', rerun: 'Research again', running: 'Researching… (up to a minute)',
    at: (when: string) => `Researched ${when}`, look: 'For you to check', proposals: (n: number) => `Suggestions · ${n}`,
    none: 'Found nothing that can be checked.', accept: 'Accept', dismiss: 'Dismiss', source: 'Source',
    decided: (a: number, d: number) => `${a} accepted · ${d} dismissed`, sources: (n: number) => `Sources · ${n}`,
    person: 'Person', debt: 'Closure or debts', noKey: 'To use it, add ANTHROPIC_API_KEY in Vercel.',
    zone: {
      run: 'Research with AI', max: (n: number) => `Up to ${n} at a time`, progress: (i: number | string, n: number | string, name: string) => `Researching ${i} of ${n}: ${name}…`,
      done: (n: number | string) => `Done: ${n} researched`, skipped: (n: number | string) => ` · ${n} skipped (already researched or someone else’s)`, failed: (n: number | string) => ` · ${n} failed`,
      see: 'See researched', filter: 'Researched by AI', badge: 'AI', stay: 'Keep this tab open while it researches.',
    },
    ok: { run: 'Research ready: review the suggestions.', accept: 'Saved to the record.', dismiss: 'Dismissed.' },
  },
  pt: {
    title: 'Pesquisa com IA', unverified: 'Não verificado',
    intro: 'Busca na web o que é público desta empresa e sugere dados, cada um com sua fonte. Nada é salvo na ficha até você aceitar.',
    run: 'Pesquisar com IA', rerun: 'Pesquisar de novo', running: 'Pesquisando… (até um minuto)',
    at: (when: string) => `Pesquisada ${when}`, look: 'Para você conferir', proposals: (n: number) => `Sugestões · ${n}`,
    none: 'Não encontrou nada que possa ser comprovado.', accept: 'Aceitar', dismiss: 'Descartar', source: 'Fonte',
    decided: (a: number, d: number) => `${a} aceitas · ${d} descartadas`, sources: (n: number) => `Fontes · ${n}`,
    person: 'Pessoa', debt: 'Fechamento ou dívidas', noKey: 'Para usar, adicione ANTHROPIC_API_KEY na Vercel.',
    zone: {
      run: 'Pesquisar com IA', max: (n: number) => `Até ${n} por vez`, progress: (i: number | string, n: number | string, name: string) => `Pesquisando ${i} de ${n}: ${name}…`,
      done: (n: number | string) => `Pronto: ${n} pesquisadas`, skipped: (n: number | string) => ` · ${n} puladas (já pesquisadas ou de outra pessoa)`, failed: (n: number | string) => ` · ${n} com erro`,
      see: 'Ver as pesquisadas', filter: 'Pesquisadas pela IA', badge: 'IA', stay: 'Não feche esta aba enquanto pesquisa.',
    },
    ok: { run: 'Pesquisa pronta: revise as sugestões.', accept: 'Salvo na ficha.', dismiss: 'Descartada.' },
  },
  ko: {
    title: 'AI 조사', unverified: '미확인',
    intro: '이 회사의 공개 정보를 웹에서 찾아 출처와 함께 제안합니다. 수락하기 전에는 아무것도 저장되지 않습니다.',
    run: 'AI로 조사', rerun: '다시 조사', running: '조사 중… (최대 1분)',
    at: (when: string) => `조사 ${when}`, look: '직접 확인할 것', proposals: (n: number) => `제안 · ${n}`,
    none: '확인할 수 있는 정보를 찾지 못했습니다.', accept: '수락', dismiss: '버리기', source: '출처',
    decided: (a: number, d: number) => `수락 ${a} · 버림 ${d}`, sources: (n: number) => `출처 · ${n}`,
    person: '사람', debt: '폐업 또는 부채', noKey: '사용하려면 Vercel에 ANTHROPIC_API_KEY를 추가하세요.',
    zone: {
      run: 'AI로 조사', max: (n: number) => `한 번에 최대 ${n}곳`, progress: (i: number | string, n: number | string, name: string) => `${n}곳 중 ${i}번째 조사 중: ${name}…`,
      done: (n: number | string) => `완료: ${n}곳 조사`, skipped: (n: number | string) => ` · ${n}곳 건너뜀(이미 조사했거나 다른 사람 담당)`, failed: (n: number | string) => ` · ${n}곳 오류`,
      see: '조사한 회사 보기', filter: 'AI 조사함', badge: 'AI', stay: '조사하는 동안 이 탭을 닫지 마세요.',
    },
    ok: { run: '조사 완료: 제안을 검토하세요.', accept: '상세에 저장했습니다.', dismiss: '버렸습니다.' },
  },
});
