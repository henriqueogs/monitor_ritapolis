'use strict';

/**
 * Parsing puro (sem I/O) do relatório de Folha Salarial do Portal da
 * Transparência — mesmo fluxo sessão+thread+CSV já usado pra despesas
 * (ver portal-transparencia-thread.js), módulo "Folha" em vez de
 * "Tempo_Real_Despesa". Coletor de I/O fica em folha-thread-http.js.
 *
 * O CSV não é uma lista tabular (uma linha = um registro) como o de
 * despesas — é um "relatório impresso" com um bloco de texto por
 * servidor/competência, com as rubricas de provento/desconto listadas
 * dentro do bloco. Por isso o parser é uma máquina de estados sobre os
 * blocos, não um mapa linha-a-linha.
 */

const { parseLinhaCsv, parseValorCsv } = require('./portal-transparencia-thread');
const logger = require('../logger');

/**
 * O rodapé de cada bloco ("Remuneração Bruta: ...\n Total ...") tem uma
 * quebra de linha DENTRO de um campo CSV entre aspas — um split ingênuo por
 * `\r?\n` corromperia esse campo no meio. Reconstrói linhas lógicas
 * balanceando aspas antes de aplicar o parser de blocos.
 */
function reconstruirLinhasLogicas(texto) {
  const fisicas = String(texto || '').split(/\r?\n/);
  const logicas = [];
  let buffer = null;
  for (const linha of fisicas) {
    buffer = buffer === null ? linha : `${buffer}\n${linha}`;
    const aspas = (buffer.match(/"/g) || []).length;
    if (aspas % 2 === 0) {
      logicas.push(buffer);
      buffer = null;
    }
  }
  if (buffer !== null) {
    logicas.push(buffer);
  }
  return logicas;
}

// "Rótulo: valor" -- tolera espaço antes dos dois-pontos (a fonte manda
// "CPF : ***..." com espaço, mas "Nome:"/"Situação:" sem).
function campoValor(campo, rotulo) {
  const escapado = rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(campo || '').match(new RegExp(`^${escapado}\\s*:\\s*(.*)$`, 's'));
  return match ? match[1].trim() || null : null;
}

function novoRegistro() {
  return { rubricas: [], emRubricas: false };
}

function flush(registro, registros) {
  if (!registro || registro.vinculo === undefined) {
    return;
  }
  if (registro.remuneracaoBruta === undefined) {
    logger.warn('folha-thread: registro sem rodape (Remuneracao Bruta) descartado', {
      vinculo: registro.vinculo,
      matricula: registro.matricula,
      competenciaAno: registro.competenciaAno,
      competenciaMes: registro.competenciaMes,
    });
    return;
  }
  const { emRubricas: _emRubricas, ...limpo } = registro;
  registros.push(limpo);
}

/**
 * @returns {Array<{vinculo, matricula, nomeServidor, cpfMascarado, situacao,
 *   formaAdmissao, cargo, funcao, secretaria, lotacao, siglaCargo,
 *   dataAdmissao, cargaHoraria, salarioBase, competenciaAno, competenciaMes,
 *   remuneracaoBruta, totalLiquido,
 *   rubricas: Array<{codigo, descricao, referencia, proventos, descontos}>}>}
 */
function parseCsvFolha(csvText) {
  const linhas = reconstruirLinhasLogicas(csvText);
  const registros = [];
  let atual = null;

  for (const linhaBruta of linhas) {
    const campos = parseLinhaCsv(linhaBruta);
    const c0 = String(campos[0] || '').trim();

    const vinculoMatch = c0.match(/^Vínculo:\s*(\S+)\s*\/\s*Matrícula:\s*(\S+)/);
    if (vinculoMatch) {
      // Um registro aberto sem rodapé (bloco truncado/malformado) é
      // descartado aqui, não silenciosamente sobrescrito.
      flush(atual, registros);
      atual = novoRegistro();
      atual.vinculo = vinculoMatch[1];
      atual.matricula = vinculoMatch[2];
      atual.nomeServidor = campoValor(campos[1], 'Nome');
      atual.cpfMascarado = campoValor(campos[2], 'CPF');
      atual.situacao = campoValor(campos[3], 'Situação');
      continue;
    }

    if (!atual) {
      continue; // fora de um bloco de registro (cabecalho de mes, labels, linha em branco)
    }

    if (c0.startsWith('Forma de Admissão:')) {
      atual.formaAdmissao = campoValor(campos[0], 'Forma de Admissão');
      atual.cargo = campoValor(campos[1], 'Cargo');
      atual.funcao = campoValor(campos[2], 'Função');
      continue;
    }

    if (c0.startsWith('Secretaria:')) {
      atual.secretaria = campoValor(campos[0], 'Secretaria');
      atual.salarioBase = parseValorCsv(campoValor(campos[1], 'Salário base'));
      const competencia = campoValor(campos[2], 'Competência');
      const compMatch = competencia?.match(/(\d{2})\/(\d{4})/);
      if (compMatch) {
        atual.competenciaMes = Number(compMatch[1]);
        atual.competenciaAno = Number(compMatch[2]);
      }
      atual.cargaHoraria = campoValor(campos[3], 'Carga horária semanal/plantões');
      continue;
    }

    if (c0.startsWith('Lotação:')) {
      atual.lotacao = campoValor(campos[0], 'Lotação');
      atual.siglaCargo = campoValor(campos[1], 'Sigla do Cargo');
      atual.dataAdmissao = campoValor(campos[2], 'Data de Admissão');
      continue;
    }

    if (c0 === 'Cód' && String(campos[1] || '').trim() === 'Descrição') {
      atual.emRubricas = true;
      continue;
    }

    const footerMatch = c0.match(/Remuneração Bruta:\s*([\d.,]+)/);
    if (footerMatch) {
      atual.remuneracaoBruta = parseValorCsv(footerMatch[1]);
      const liquidoMatch = c0.match(/Total da Remuneração Após Deduções:\s*([\d.,]+)/);
      atual.totalLiquido = liquidoMatch ? parseValorCsv(liquidoMatch[1]) : null;
      atual.emRubricas = false;
      flush(atual, registros);
      atual = null;
      continue;
    }

    if (atual.emRubricas && c0) {
      atual.rubricas.push({
        codigo: c0,
        descricao: String(campos[1] || '').trim() || null,
        referencia: String(campos[2] || '').trim() || null,
        proventos: parseValorCsv(campos[3]),
        descontos: parseValorCsv(campos[4]),
      });
    }
  }

  // Registro aberto no fim do arquivo sem rodape -- mesma regra de descarte.
  flush(atual, registros);

  return registros;
}

module.exports = { reconstruirLinhasLogicas, parseCsvFolha };
