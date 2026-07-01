/**
 * Extrai texto de atas, homologações e resultados já coletados como anexos,
 * depois roda os parsers para popular vencedor + valor + produtos.
 *
 * Pipeline:
 *   documentos_anexos (tipo=ata|homologacao|resultado, status≠ok)
 *     → download PDF
 *     → extractOfficialFileText()
 *     → saveDocumentoAnexoTexto()
 *     → enriquecerProdutosComResultadosAnexo()   ← produtos
 *     → parseLicitacaoDetalhes()                 ← vencedor + valor
 *     → upsertLicitacaoDetalhesExtraidos()
 *
 * Uso:
 *   node scripts/extrair-texto-anexos.js [--ano=YYYY] [--documento-id=N] [--limite=N] [--force]
 */

process.loadEnvFile?.() || require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const db = require('../src/db');
const { extractOfficialFileText } = require('../src/parsers/document-file');
const { parseLicitacaoDetalhes } = require('../src/parsers/licitacao-detalhes');
const { classificarArquivoTecnicoVisual, STATUS_TECNICO_VISUAL } = require('../src/parsers/technical-visual');
const { criarProgresso } = require('../src/utils/progress');
const config = require('../src/config');
const logger = require('../src/logger');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ANO = args.ano ? Number(args.ano) : new Date().getFullYear();
const DOCUMENTO_ID = args['documento-id'] ? Number(args['documento-id']) : undefined;
const LIMITE = args.limite ? Number(args.limite) : undefined;
const FORCE = Boolean(args.force);
// Modo "recuperáveis": propostas e anexos "outro" com cara de resultado (PDF/doc)
// que o filtro padrão (só ata/homologacao/resultado) ignora.
const RECUPERAVEIS = Boolean(args.recuperaveis);
// Modo "rederivar": re-extrai vencedor/valor do texto de anexos de resultado JÁ
// extraídos (status ok) cujo documento ainda não tem valor — sem download.
const REDERIVAR = Boolean(args.rederivar);

const NOME_RESULTADO_TERMOS = ['resultado', 'homologa', 'julgamento', 'adjudica', 'classifica', 'vencedor', 'extrato', 'mapa'];

async function downloadBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: config.collectorTimeoutMs * 2,
    headers: {
      'user-agent': config.collectorUserAgent,
      accept: '*/*'
    }
  });
  return Buffer.from(response.data);
}

async function processarAnexo(anexo, { derivar = true } = {}) {
  const resultado = {
    id: anexo.id,
    documento_id: anexo.documento_id,
    nome: anexo.nome,
    tipo: anexo.tipo,
    texto_extraido: false,
    tecnico_visual: false,
    vencedor_extraido: false,
    produtos_salvos: 0,
    erro: null
  };

  // 1. Download
  let buffer;
  try {
    buffer = await downloadBuffer(anexo.url);
  } catch (err) {
    resultado.erro = `download: ${err.message}`;
    db.saveDocumentoAnexoTexto({ id: anexo.id, status: 'erro_download', erro: err.message });
    return resultado;
  }

  // 2. Extrair texto
  let extraction;
  try {
    extraction = await extractOfficialFileText(buffer, { url: anexo.url, filename: anexo.nome });
  } catch (err) {
    resultado.erro = `extracao: ${err.message}`;
    db.saveDocumentoAnexoTexto({ id: anexo.id, status: 'erro_extracao', erro: err.message });
    return resultado;
  }

  if (extraction.error || !extraction.text?.trim()) {
    const err = extraction.error || 'texto vazio';
    const statusSugerido = extraction.info?.status_sugerido || 'erro_pdf';
    resultado.erro = err;
    db.saveDocumentoAnexoTexto({
      id: anexo.id,
      status: statusSugerido,
      erro: err,
      parser: extraction.info?.parser,
      paginas: extraction.pages
    });
    return resultado;
  }

  const texto = extraction.text;
  const textoHash = crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
  const tecnicoVisual = classificarArquivoTecnicoVisual({ nome: anexo.nome, texto, extension: anexo.url });

  // 3. Salvar texto
  db.saveDocumentoAnexoTexto({
    id: anexo.id,
    texto,
    textoHash,
    status: tecnicoVisual.visual ? STATUS_TECNICO_VISUAL : 'ok',
    parser: extraction.info?.parser,
    paginas: extraction.pages
  });
  resultado.texto_extraido = true;

  if (tecnicoVisual.visual) {
    resultado.tecnico_visual = true;
    return resultado;
  }

  // Propostas são lances (não resultados): extraímos só o texto (transparência),
  // sem derivar vencedor/valor — seria registrar preço de lance como final.
  if (!derivar) {
    return resultado;
  }

  // 4. Extrair produtos via parser de resultados
  try {
    const prod = db.enriquecerProdutosComResultadosAnexo({
      documentoId: anexo.documento_id,
      anexoId: anexo.id,
      texto
    });
    resultado.produtos_salvos = prod.produtos_criados + prod.produtos_atualizados;
  } catch (err) {
    logger.debug('enriquecerProdutos falhou', { anexoId: anexo.id, err: err.message });
  }

  // 5. Extrair vencedor + valor via parser de detalhes
  try {
    const detalhes = parseLicitacaoDetalhes(texto, { anexos: [{ nome: anexo.nome || '' }] });
    if (detalhes && (detalhes.vencedor_nome || detalhes.valor_final)) {
      db.upsertLicitacaoDetalhesExtraidos({ id: anexo.documento_id }, detalhes);
      resultado.vencedor_extraido = true;
    }
  } catch (err) {
    logger.warn('parseLicitacaoDetalhes falhou', { anexoId: anexo.id, erro: err.message });
  }

  return resultado;
}

// Seleção dos anexos "recuperáveis" (propostas + "outro" com cara de resultado,
// em formato extraível) que o filtro padrão de resultados ignora.
function listarRecuperaveis() {
  const termos = NOME_RESULTADO_TERMOS.map(() => 'lower(da.nome) LIKE ?').join(' OR ');
  const params = NOME_RESULTADO_TERMOS.map((t) => `%${t}%`);
  const limit = LIMITE ? `LIMIT ${Math.max(Number(LIMITE), 1)}` : '';
  return db.db
    .prepare(
      `SELECT da.id, da.documento_id, da.nome, da.url, da.tipo, d.ano
         FROM documentos_anexos da
         JOIN documentos d ON d.id = da.documento_id
        WHERE da.url LIKE 'http%'
          AND (da.status_extracao IS NULL OR da.status_extracao <> 'ok' OR IFNULL(da.texto_completo,'') = '')
          AND IFNULL(da.status_extracao,'') <> 'requer_ocr'
          AND IFNULL(da.status_extracao,'') <> 'tecnico_visual'
          AND (lower(da.nome) LIKE '%.pdf' OR lower(da.nome) LIKE '%.docx' OR lower(da.nome) LIKE '%.doc')
          AND (da.tipo = 'proposta' OR (da.tipo = 'outro' AND (${termos})))
        ORDER BY d.ano DESC, da.id ${limit}`
    )
    .all(...params);
}

// Re-deriva vencedor/valor do texto de anexos de resultado JÁ extraídos, para
// documentos que ainda não têm valor_final. Sem download.
function reDerivar() {
  const alvos = db.db
    .prepare(
      `SELECT da.id, da.documento_id, da.nome, da.texto_completo
         FROM documentos_anexos da
         JOIN documentos d ON d.id = da.documento_id
        WHERE d.tipo = 'edital'
          AND da.status_extracao = 'ok'
          AND da.tipo IN ('ata','homologacao','resultado','classificacao','contrato')
          AND LENGTH(IFNULL(da.texto_completo,'')) > 200
          AND NOT EXISTS (
            SELECT 1 FROM licitacoes_detalhes ld
             WHERE ld.documento_id = da.documento_id AND ld.valor_final > 0
          )
        ORDER BY d.ano DESC, da.id`
    )
    .all();

  const prog = criarProgresso('rederivar-valor', { total: alvos.length });
  const stats = { total: 0, valores: 0 };
  for (const a of alvos) {
    stats.total++;
    let categoria = 'sem_valor';
    try {
      const detalhes = parseLicitacaoDetalhes(a.texto_completo, { anexos: [{ nome: a.nome || '' }] });
      if (detalhes && detalhes.valor_final > 0) {
        db.upsertLicitacaoDetalhesExtraidos({ id: a.documento_id }, detalhes);
        stats.valores++;
        categoria = 'valor';
      }
    } catch (err) {
      categoria = 'erro';
      logger.warn('rederivar: parse falhou', { anexoId: a.id, erro: err.message });
    }
    prog.tick(`doc#${a.documento_id}`, categoria);
  }
  prog.finish(`valores derivados: ${stats.valores} de ${stats.total} anexos`);
  console.log(`\n[REDERIVAR] valor_final preenchido em ${stats.valores} documento(s) (de ${stats.total} anexos de resultado).`);
}

async function main() {
  if (REDERIVAR) {
    console.log('[REDERIVAR] re-derivando valor de anexos já extraídos (sem download)...\n');
    reDerivar();
    return;
  }

  const anexos = RECUPERAVEIS
    ? listarRecuperaveis()
    : db.listDocumentoAnexosParaExtracao({ ano: ANO, documentoId: DOCUMENTO_ID, limite: LIMITE, force: FORCE });

  console.log(
    `[ANEXOS] ${RECUPERAVEIS ? 'recuperáveis (propostas + resultados mal-classificados)' : `ano=${ANO}`}${LIMITE ? ` limite=${LIMITE}` : ''}${FORCE ? ' (force)' : ''}\n`
  );

  if (!anexos.length) {
    console.log('  Nenhum anexo para processar.');
    return;
  }

  console.log(`  ${anexos.length} anexo(s) para processar.\n`);

  const prog = criarProgresso(RECUPERAVEIS ? 'extrair-anexos-recuperaveis' : 'extrair-anexos', { total: anexos.length });
  const stats = { total: 0, textos: 0, vencedores: 0, produtos: 0, erros: 0 };

  for (const anexo of anexos) {
    stats.total++;
    // Em "recuperáveis", propostas não derivam vencedor/valor (são lances).
    const derivar = !(RECUPERAVEIS && anexo.tipo === 'proposta');
    const r = await processarAnexo(anexo, { derivar });

    let categoria = 'texto';
    if (r.erro) {
      stats.erros++;
      categoria = 'erro';
    } else {
      stats.textos++;
      if (r.tecnico_visual) {
        categoria = 'tecnico';
      } else if (r.vencedor_extraido) {
        stats.vencedores++;
        categoria = 'vencedor';
      }
      stats.produtos += r.produtos_salvos;
    }
    prog.tick(`doc#${anexo.documento_id} ${categoria}`, categoria);
  }

  prog.finish(`textos: ${stats.textos} · vencedores: ${stats.vencedores} · produtos: ${stats.produtos} · erros: ${stats.erros}`);
  console.log(`\n[ANEXOS] Processados: ${stats.total} | Texto: ${stats.textos} | Vencedores: ${stats.vencedores} | Produtos: ${stats.produtos} | Erros: ${stats.erros}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
