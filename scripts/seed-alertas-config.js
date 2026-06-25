'use strict';

/**
 * Semeia (seed) a tabela alertas_config com as chaves de threshold/gatilhos que o
 * gerador de descobertas lê em runtime, para que apareçam EDITÁVEIS em
 * /admin/alertas. Sem isso, a tabela fica vazia e o painel mostra "usando
 * defaults" sem linhas para ajustar.
 *
 * Idempotente e NÃO-DESTRUTIVO: só grava chaves ausentes — valores já ajustados
 * pelo operador no painel são preservados.
 *
 * Os valores-semente seguem o tom de "curiosidade, não alarme" (CLAUDE.md): para
 * um município pequeno, min_repeticao=2 dispara em quase toda categoria (ruído);
 * 3 mantém só temas com repetição real.
 *
 * Uso:
 *   node scripts/seed-alertas-config.js            # semeia o que falta
 *   node scripts/seed-alertas-config.js --reset    # sobrescreve com os defaults
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const repo = require('../src/db/alertas-repo');

// Marcador único: getConfig devolve isto quando a chave não existe na tabela.
const AUSENTE = Symbol('ausente');

const SEMENTES = [
  {
    chave: 'alertas:min_repeticao',
    valor: 4,
    descricao:
      'Mínimo de processos numa mesma categoria/ano para virar uma descoberta. Controla o ' +
      'tamanho do feed. 2-3 é ruidoso num município pequeno; 4 corta clusters triviais (só 3 ' +
      'processos) e mantém repetição com sinal. Suba para enxugar o feed.',
  },
  {
    chave: 'alertas:valor_threshold',
    valor: 1000000,
    descricao:
      'Valor mínimo (R$) somado por categoria/ano para elevar a descoberta a "Vale conferir" ' +
      '(em vez de "Curiosidade"). Não remove do feed, só rotula. 1M reserva o destaque para ' +
      'gastos realmente grandes num município pequeno; baixe para destacar mais.',
  },
  {
    chave: 'alertas:anomalia_multiplicador',
    valor: 3,
    descricao:
      'Quantas vezes acima da média histórica o volume de um período precisa estar para virar anomalia temporal.',
  },
  {
    chave: 'alertas:anomalia_min_absoluto',
    valor: 3,
    descricao: 'Mínimo absoluto de processos no período para a anomalia temporal ser considerada (evita ruído de base pequena).',
  },
  {
    chave: 'alertas:gatilhos_ativos',
    valor: {
      repeticao_tematica: true,
      risco_alto: true,
      valor_relevante: true,
      anomalia_temporal: true,
      questionamentos: true,
    },
    descricao: 'Liga/desliga cada detector. Edite o JSON (true/false por gatilho).',
  },
];

function main() {
  const reset = process.argv.includes('--reset');
  setupDatabase();

  let semeadas = 0;
  let preservadas = 0;
  for (const s of SEMENTES) {
    const atual = repo.getConfig(s.chave, AUSENTE);
    if (atual !== AUSENTE && !reset) {
      preservadas += 1;
      console.warn(`= ${s.chave} já existe (${JSON.stringify(atual)}) — preservado`);
      continue;
    }
    repo.setConfig(s.chave, s.valor, s.descricao);
    semeadas += 1;
    console.warn(`${reset ? '↻' : '+'} ${s.chave} = ${JSON.stringify(s.valor)}`);
  }

  console.warn(`\n${reset ? 'Reset' : 'Seed'} concluído — ${semeadas} gravada(s), ${preservadas} preservada(s).`);
  console.warn('Ajuste fino em /admin/alertas e clique "Gerar descobertas agora".');
}

main();
