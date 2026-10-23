'use strict';

/**
 * Revalida os alertas gravados com as regras determinísticas de src/alertas/revalidacao.js.
 *
 *   node scripts/revalidar-alertas.js                       # relatório dos ativos (somente leitura)
 *   node scripts/revalidar-alertas.js --incluir-rejeitados  # inclui os já arquivados pelo editorial
 *   node scripts/revalidar-alertas.js --saida relatorio.md  # grava o relatório em arquivo
 *   node scripts/revalidar-alertas.js --json                # saída JSON (para outra ferramenta)
 *   node scripts/revalidar-alertas.js --aplicar             # move para 'revisao' quem não deve ficar publicado
 *
 * --aplicar só tira de 'publicado'/'candidato' o que a revalidação marca como "não publicar" e
 * grava os motivos no histórico editorial (origem 'revalidacao'). Nada é apagado: o revisor
 * confirma ou descarta na tela /admin/alertas/:id.
 */

const fs = require('node:fs');
const repo = require('../src/db/alertas-repo');
const { avaliarAlerta, resumirRevalidacao, RECOMENDACAO } = require('../src/alertas/revalidacao');

const PAGINA = 200;
const ESTADO_REJEITADO = 'rejeitado';
const ESTADO_REVISAO = 'revisao';
const ESTADOS_RETIRAVEIS = new Set(['publicado', 'candidato', 'evidencias_prontas', 'analisado']);
const PREFIXO_MOTIVO = 'REVALIDACAO_';

const ROTULO_RECOMENDACAO = {
  [RECOMENDACAO.NAO_PUBLICAR]: 'Não publicar como está',
  [RECOMENDACAO.CONFERIR]: 'Conferir antes de publicar',
  [RECOMENDACAO.OK]: 'Sem pendência automática',
};

function lerArgs(argv) {
  const iSaida = argv.indexOf('--saida');
  return {
    incluirRejeitados: argv.includes('--incluir-rejeitados'),
    json: argv.includes('--json'),
    aplicar: argv.includes('--aplicar'),
    saida: iSaida >= 0 ? argv[iSaida + 1] : null,
  };
}

function listarIdsAtivos() {
  const ids = [];
  for (let pagina = 1; ; pagina += 1) {
    const { dados } = repo.listarAlertas({ status: 'ativo', pagina, limite: PAGINA });
    ids.push(...dados.map((a) => a.id));
    if (dados.length < PAGINA) {
      return ids;
    }
  }
}

function revalidarTodos({ incluirRejeitados }) {
  return listarIdsAtivos()
    .map((id) => repo.getAlerta(id))
    .filter((alerta) => alerta && (incluirRejeitados || alerta.estado_editorial !== ESTADO_REJEITADO))
    .map((alerta) => ({
      id: alerta.id,
      titulo: alerta.titulo,
      estado_editorial: alerta.estado_editorial,
      categoria: alerta.categoria,
      ...avaliarAlerta(alerta),
    }));
}

function aplicar(itens) {
  const alvos = itens.filter(
    (item) => item.recomendacao === RECOMENDACAO.NAO_PUBLICAR && ESTADOS_RETIRAVEIS.has(item.estado_editorial)
  );
  for (const item of alvos) {
    repo.setEstadoEditorial(item.id, ESTADO_REVISAO, {
      origem: 'revalidacao',
      motivos: item.pendencias.map((p) => `${PREFIXO_MOTIVO}${p.codigo}`),
    });
  }
  return alvos.map((item) => item.id);
}

function linhaItem(item) {
  const pendencias = item.pendencias.map((p) => `  - **${p.codigo}** (${p.gravidade}): ${p.mensagem}`);
  return [`- #${item.id} [${item.estado_editorial}] ${item.titulo}`, ...pendencias].join('\n');
}

function relatorioMarkdown(itens, resumo, movidos) {
  const secoes = Object.values(RECOMENDACAO).map((rec) => {
    const doGrupo = itens.filter((item) => item.recomendacao === rec);
    if (!doGrupo.length) {
      return null;
    }
    return [`## ${ROTULO_RECOMENDACAO[rec]} (${doGrupo.length})`, '', ...doGrupo.map(linhaItem)].join('\n');
  });
  const pendencias = Object.entries(resumo.por_pendencia).map(([codigo, n]) => `- ${codigo}: ${n}`);
  return [
    `# Revalidação de alertas (${new Date().toISOString().slice(0, 10)})`,
    '',
    `Total revalidado: ${resumo.total}`,
    ...(movidos ? [`Movidos para revisão: ${movidos.length ? movidos.map((id) => `#${id}`).join(', ') : 'nenhum'}`] : []),
    '',
    '## Pendências por regra',
    '',
    ...(pendencias.length ? pendencias : ['- nenhuma']),
    '',
    ...secoes.filter(Boolean).flatMap((secao) => [secao, '']),
  ].join('\n');
}

function main() {
  const args = lerArgs(process.argv.slice(2));
  const itens = revalidarTodos(args);
  const resumo = resumirRevalidacao(itens);
  const movidos = args.aplicar ? aplicar(itens) : null;
  const saida = args.json
    ? JSON.stringify({ resumo, movidos, itens }, null, 2)
    : relatorioMarkdown(itens, resumo, movidos);
  if (args.saida) {
    fs.writeFileSync(args.saida, `${saida}\n`);
    process.stdout.write(`Relatório gravado em ${args.saida}\n`);
    return;
  }
  process.stdout.write(`${saida}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`revalidar-alertas falhou: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { relatorioMarkdown, lerArgs };
