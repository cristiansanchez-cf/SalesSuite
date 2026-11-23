/** Conecta tu IA (docs/MCP.md): el servidor MCP del CRM y las claves personales. */
import { defineMessages } from '../core';

export const mcpMessages = defineMessages({
  es: {
    title: 'Conecta tu IA', eyebrow: 'MCP',
    lede: 'Usa el CRM desde tu IA (Claude, ChatGPT, Cursor…): pregúntale qué te toca hoy, cuéntale una visita para que la apunte, que cualifique una empresa o te prepare el próximo paso. Lo mismo que el asistente de WhatsApp, con tus permisos.',
    url: 'Dirección del servidor', name: 'Nombre de la conexión', namePh: 'P. ej.: Claude del portátil', create: 'Crear clave',
    newKey: 'Tu clave: cópiala ahora, no se vuelve a enseñar', copy: 'Copiar', copied: 'Copiado',
    how: 'Cómo conectarla', claudeCode: 'Claude Code (terminal)', cursor: 'Cursor, VS Code y otros (mcp.json)', claudeDesktop: 'Claude Desktop (claude_desktop_config.json)',
    oauthSoon: 'En claude.ai y ChatGPT se podrá añadir con un clic, entrando con tu cuenta.',
    list: 'Tus conexiones', lastUsed: (when: string) => `Usada ${when}`, never: 'Sin usar todavía', created: (when: string) => `Creada ${when}`,
    revoke: 'Revocar', revoked: 'Revocada', revokeConfirm: '¿Revocar esta conexión? La IA que la use dejará de poder entrar.',
    okCreated: 'Conexión creada.', okRevoked: 'Conexión revocada: ya no vale.', secret: 'Quien tenga la clave actúa como tú en este espacio: no la compartas. Si se te escapa, revócala.',
  },
  en: {
    title: 'Connect your AI', eyebrow: 'MCP',
    lede: 'Use the CRM from your AI (Claude, ChatGPT, Cursor…): ask what is due today, tell it about a visit so it logs it, have it qualify a company or prepare the next step. The same as the WhatsApp assistant, with your permissions.',
    url: 'Server address', name: 'Connection name', namePh: 'E.g.: Claude on my laptop', create: 'Create key',
    newKey: 'Your key: copy it now, it will not be shown again', copy: 'Copy', copied: 'Copied',
    how: 'How to connect it', claudeCode: 'Claude Code (terminal)', cursor: 'Cursor, VS Code and others (mcp.json)', claudeDesktop: 'Claude Desktop (claude_desktop_config.json)',
    oauthSoon: 'In claude.ai and ChatGPT you will be able to add it in one click, signing in with your account.',
    list: 'Your connections', lastUsed: (when: string) => `Used ${when}`, never: 'Not used yet', created: (when: string) => `Created ${when}`,
    revoke: 'Revoke', revoked: 'Revoked', revokeConfirm: 'Revoke this connection? The AI using it will no longer be able to get in.',
    okCreated: 'Connection created.', okRevoked: 'Connection revoked: it no longer works.', secret: 'Anyone with the key acts as you in this space: do not share it. If it leaks, revoke it.',
  },
  pt: {
    title: 'Conecte sua IA', eyebrow: 'MCP',
    lede: 'Use o CRM pela sua IA (Claude, ChatGPT, Cursor…): pergunte o que tem para hoje, conte uma visita para ela anotar, peça para qualificar uma empresa ou preparar o próximo passo. O mesmo que o assistente do WhatsApp, com as suas permissões.',
    url: 'Endereço do servidor', name: 'Nome da conexão', namePh: 'Ex.: Claude do notebook', create: 'Criar chave',
    newKey: 'Sua chave: copie agora, ela não será mostrada de novo', copy: 'Copiar', copied: 'Copiado',
    how: 'Como conectar', claudeCode: 'Claude Code (terminal)', cursor: 'Cursor, VS Code e outros (mcp.json)', claudeDesktop: 'Claude Desktop (claude_desktop_config.json)',
    oauthSoon: 'No claude.ai e no ChatGPT vai dar para adicionar com um clique, entrando com a sua conta.',
    list: 'Suas conexões', lastUsed: (when: string) => `Usada ${when}`, never: 'Ainda não usada', created: (when: string) => `Criada ${when}`,
    revoke: 'Revogar', revoked: 'Revogada', revokeConfirm: 'Revogar esta conexão? A IA que a usa não vai mais conseguir entrar.',
    okCreated: 'Conexão criada.', okRevoked: 'Conexão revogada: não vale mais.', secret: 'Quem tiver a chave age como você neste espaço: não compartilhe. Se vazar, revogue.',
  },
  ko: {
    title: 'AI 연결', eyebrow: 'MCP',
    lede: 'AI(Claude, ChatGPT, Cursor…)에서 CRM을 사용하세요: 오늘 할 일을 묻고, 방문 내용을 말하면 기록하고, 회사를 평가하거나 다음 단계를 준비하게 하세요. WhatsApp 도우미와 같으며 내 권한으로 작동합니다.',
    url: '서버 주소', name: '연결 이름', namePh: '예: 노트북의 Claude', create: '키 만들기',
    newKey: '내 키: 지금 복사하세요. 다시 표시되지 않습니다', copy: '복사', copied: '복사됨',
    how: '연결 방법', claudeCode: 'Claude Code (터미널)', cursor: 'Cursor, VS Code 등 (mcp.json)', claudeDesktop: 'Claude Desktop (claude_desktop_config.json)',
    oauthSoon: 'claude.ai와 ChatGPT에서는 계정으로 로그인해 한 번의 클릭으로 추가할 수 있게 됩니다.',
    list: '내 연결', lastUsed: (when: string) => `${when} 사용`, never: '아직 사용 안 함', created: (when: string) => `${when} 생성`,
    revoke: '취소', revoked: '취소됨', revokeConfirm: '이 연결을 취소할까요? 이를 사용하는 AI는 더 이상 접속할 수 없습니다.',
    okCreated: '연결을 만들었습니다.', okRevoked: '연결을 취소했습니다: 더 이상 작동하지 않습니다.', secret: '키를 가진 사람은 이 공간에서 나로 행동합니다: 공유하지 마세요. 유출되면 취소하세요.',
  },
});
