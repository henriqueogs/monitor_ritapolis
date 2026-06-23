const crypto = require('crypto');
const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const {
  syncDocumentoAnexosLicitacao,
  listDocumentoAnexosParaExtracao,
  saveDocumentoAnexoTexto,
  listDocumentoAnexosTextoResultados,
  enriquecerProdutosComResultadosAnexo
} = require('../src/db');
const { extractOfficialFileText, inferFileExtension } = require('../src/parsers/document-file');

function parseArgs(argv) {
  const options = {
    ano: new Date().getFullYear(),
    documentoId: null,
    limite: null,
    force: false,
    semDownload: false
  };

  argv.forEach((arg) => {
    if (arg === '--all') {
      options.ano = null;
      return;
    }

    if (arg === '--force') {
      options.force = true;
      return;
    }

    if (arg === '--sem-download') {
      options.semDownload = true;
      return;
    }

    if (arg.startsWith('--ano=')) {
      const ano = Number(arg.split('=')[1]);
      if (Number.isFinite(ano)) {options.ano = ano;}
      return;
    }

    if (arg.startsWith('--documento=')) {
      const documentoId = Number(arg.split('=')[1]);
      if (Number.isFinite(documentoId)) {options.documentoId = documentoId;}
      return;
    }

    if (arg.startsWith('--limite=')) {
      const limite = Number(arg.split('=')[1]);
      if (Number.isFinite(limite) && limite > 0) {options.limite = limite;}
    }
  });

  return options;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value || '', 'utf8').digest('hex');
}

async function baixarAnexo(anexo) {
  const response = await axios.get(anexo.url, {
    responseType: 'arraybuffer',
    timeout: 45000,
    headers: {
      'User-Agent': 'Mozilla/5.0 Monitor-Ritapolis/1.0'
    }
  });

  return Buffer.from(response.data);
}

async function extrairTextoAnexo(anexo) {
  const buffer = await baixarAnexo(anexo);
  const arquivo = await extractOfficialFileText(buffer, {
    filename: anexo.nome,
    url: anexo.url
  });
  const texto = arquivo.text || '';

  return {
    texto,
    textoHash: texto ? sha256(texto) : null,
    status: arquivo.error ? 'erro' : 'ok',
    erro: arquivo.error || null,
    parser: arquivo.info?.parser || null,
    paginas: arquivo.pages ?? null,
    tipoArquivo: arquivo.info?.tipo_arquivo || inferFileExtension({ filename: anexo.nome, url: anexo.url })
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  setupDatabase();

  const resultado = {
    ano: options.ano ? Number(options.ano) : null,
    documento_id: options.documentoId ? Number(options.documentoId) : null,
    anexos_sincronizados: syncDocumentoAnexosLicitacao({
      ano: options.ano,
      documentoId: options.documentoId
    }),
    anexos_para_extracao: 0,
    anexos_extraidos: 0,
    anexos_com_erro: 0,
    anexos_reutilizados: 0,
    itens_resultado_extraidos: 0,
    produtos_atualizados: 0,
    produtos_criados: 0,
    produtos_ignorados: 0,
    detalhes: []
  };

  const anexos = options.semDownload
    ? []
    : listDocumentoAnexosParaExtracao({
        ano: options.ano,
        documentoId: options.documentoId,
        limite: options.limite,
        force: options.force
      });

  resultado.anexos_para_extracao = anexos.length;

  for (const anexo of anexos) {
    try {
      const extraido = await extrairTextoAnexo(anexo);
      saveDocumentoAnexoTexto({
        id: anexo.id,
        texto: extraido.texto,
        textoHash: extraido.textoHash,
        status: extraido.status,
        erro: extraido.erro,
        parser: extraido.parser,
        paginas: extraido.paginas
      });

      if (extraido.status === 'ok') {
        resultado.anexos_extraidos += 1;
      } else {
        resultado.anexos_com_erro += 1;
      }

      resultado.detalhes.push({
        anexo_id: anexo.id,
        documento_id: anexo.documento_id,
        nome: anexo.nome,
        tipo: anexo.tipo,
        status: extraido.status,
        chars: extraido.texto.length,
        paginas: extraido.paginas,
        parser: extraido.parser
      });
    } catch (error) {
      saveDocumentoAnexoTexto({
        id: anexo.id,
        texto: null,
        textoHash: null,
        status: 'erro',
        erro: error.message,
        parser: null,
        paginas: null
      });
      resultado.anexos_com_erro += 1;
      resultado.detalhes.push({
        anexo_id: anexo.id,
        documento_id: anexo.documento_id,
        nome: anexo.nome,
        tipo: anexo.tipo,
        status: 'erro',
        erro: error.message
      });
    }
  }

  const textos = listDocumentoAnexosTextoResultados({
    ano: options.ano,
    documentoId: options.documentoId
  });
  resultado.anexos_reutilizados = Math.max(textos.length - resultado.anexos_extraidos, 0);

  textos.forEach((anexo) => {
    const enriquecimento = enriquecerProdutosComResultadosAnexo({
      documentoId: anexo.documento_id,
      anexoId: anexo.id,
      texto: anexo.texto_completo
    });

    resultado.itens_resultado_extraidos += enriquecimento.itens_resultado_extraidos;
    resultado.produtos_atualizados += enriquecimento.produtos_atualizados;
    resultado.produtos_criados += enriquecimento.produtos_criados;
    resultado.produtos_ignorados += enriquecimento.produtos_ignorados;
  });

  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
