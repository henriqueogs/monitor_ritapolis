import { initBotId } from 'botid/client/core';
import { ROTAS_PROTEGIDAS } from './lib/botid';

// Next.js 15.3+: roda no navegador antes da hidratação. Anexa o desafio do BotID só às
// chamadas listadas (POST /api/perguntar); o resto do site não é afetado. Uma falha aqui
// não pode derrubar a página (o servidor libera a pergunta se a verificação falhar).
try {
  initBotId({ protect: ROTAS_PROTEGIDAS });
} catch (error) {
  console.error('BotID não iniciou', error);
}
