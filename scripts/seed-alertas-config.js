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
      fatos_agregados: true,
    },
    descricao: 'Liga/desliga cada detector. Edite o JSON (true/false por gatilho).',
  },
  {
    chave: 'alertas:investigacao_ia_ativa',
    valor: true,
    descricao: 'Liga a etapa de investigacao assistida por IA para descobertas factuais relevantes.',
  },
  {
    chave: 'alertas:investigacao_min_arvores',
    valor: 20,
    descricao: 'Quantidade minima de arvores em um ano para gerar descoberta investigativa de supressao/corte.',
  },
  {
    chave: 'alertas:investigacao_max_por_ciclo',
    valor: 20,
    descricao: 'Numero maximo de descobertas factuais que passam pela investigacao IA em cada ciclo.',
  },
  {
    chave: 'alertas:investigacao_temas_ativos',
    valor: {
      'meio_ambiente.supressao_arvores': true,
      'compras.precos_itens': true,
      'contratos.recorrencia_fornecedor_objeto': true,
      'eventos.gastos_eventos_publicos': true,
    },
    descricao: 'Temas investigativos ativos para a expansao das Descobertas.',
  },
  {
    chave: 'alertas:investigacao_confianca_min_publica',
    valor: 0.55,
    descricao: 'Confianca minima para publicar automaticamente uma descoberta investigativa.',
  },
  {
    chave: 'alertas:investigacao_publicacao_automatica',
    valor: true,
    descricao: 'Publica automaticamente descobertas investigativas que passem contrato, evidencia e confianca.',
  },
  {
    chave: 'descobertas:investigacao_scheduler_ativo',
    valor: true,
    descricao: 'Liga a rotina incremental que reprocessa descobertas pendentes com IA em ciclos pequenos.',
  },
  {
    chave: 'descobertas:investigacao_por_ciclo',
    valor: 4,
    descricao: 'Quantidade de descobertas reavaliadas por IA em cada ciclo incremental.',
  },
  {
    chave: 'descobertas:investigacao_delay_ms',
    valor: 15000,
    descricao: 'Delay entre analises IA de descobertas no worker incremental.',
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
