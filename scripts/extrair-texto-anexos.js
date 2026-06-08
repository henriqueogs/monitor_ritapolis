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

async function processarAnexo(anexo) {
  const resultado = {
    id: anexo.id,
    documento_id: anexo.documento_id,
    nome: anexo.nome,
    tipo: anexo.tipo,
    texto_extraido: false,
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
    resultado.erro = err;
    db.saveDocumentoAnexoTexto({ id: anexo.id, status: 'erro_pdf', erro: err });
    return resultado;
  }

  const texto = extraction.text;
  const textoHash = crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

  // 3. Salvar texto
  db.saveDocumentoAnexoTexto({
    id: anexo.id,
    texto,
    textoHash,
    status: 'ok',
    parser: extraction.info?.parser,
    paginas: extraction.pages
  });
  resultado.texto_extraido = true;

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

async function main() {
  console.log(`[ANEXOS] Iniciando extração — ano=${ANO}${DOCUMENTO_ID ? ` doc=${DOCUMENTO_ID}` : ''}${LIMITE ? ` limite=${LIMITE}` : ''}${FORCE ? ' (force)' : ''}\n`);

  const anexos = db.listDocumentoAnexosParaExtracao({
    ano: ANO,
    documentoId: DOCUMENTO_ID,
    limite: LIMITE,
    force: FORCE
  });

  if (!anexos.length) {
    console.log('  Nenhum anexo pendente encontrado.');
    return;
  }

  console.log(`  ${anexos.length} anexo(s) para processar.\n`);

  const stats = { total: 0, textos: 0, vencedores: 0, produtos: 0, erros: 0 };

  for (const anexo of anexos) {
    stats.total++;
    process.stdout.write(`  [${stats.total}/${anexos.length}] doc#${anexo.documento_id} "${(anexo.nome || 'sem nome').slice(0, 50)}"... `);

    const r = await processarAnexo(anexo);

    if (r.erro) {
      stats.erros++;
      console.log(`ERRO: ${r.erro}`);
    } else {
      stats.textos++;
      if (r.vencedor_extraido) stats.vencedores++;
      stats.produtos += r.produtos_salvos;
      const flags = [r.vencedor_extraido ? '✓ vencedor' : '', r.produtos_salvos ? `✓ ${r.produtos_salvos} produtos` : ''].filter(Boolean).join(' ') || 'texto ok';
      console.log(flags);
    }
  }

  console.log(`\n[ANEXOS] Resumo:`);
  console.log(`  Processados: ${stats.total} | Texto extraído: ${stats.textos} | Vencedores: ${stats.vencedores} | Produtos: ${stats.produtos} | Erros: ${stats.erros}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
