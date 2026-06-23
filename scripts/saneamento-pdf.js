const { setupDatabase } = require('../src/db/setup');
const { db, parseJson } = require('../src/db');
const ColetorSitePrefeitura = require('../src/coletores/site-prefeitura');
const {
  looksLikeMojibake,
  deepHasMojibake,
  deepRepairStrings,
  normalizeText
} = require('../src/utils/text');

function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) {continue;}
    const [key, value] = arg.slice(2).split('=');
    options[key] = value === undefined ? true : value;
  }

  return options;
}

function isSuspectRow(row) {
  const extras = parseJson(row.dados_extras);
  return (
    looksLikeMojibake(row.titulo) ||
    looksLikeMojibake(row.resumo) ||
    looksLikeMojibake(row.texto_completo) ||
    deepHasMojibake(extras)
  );
}

function buildItemFromRow(row) {
  const extras = deepRepairStrings(parseJson(row.dados_extras) || {});

  return {
    pageUrl: row.url_origem,
    cadastroTitle: extras.cadastro_titulo || 'Editais',
    fields: extras.campos || {},
    attachments: Array.isArray(extras.anexos) ? extras.anexos : [],
    titulo: normalizeText(row.titulo),
    numero: normalizeText(row.numero),
    dataPublicacao: row.data_publicacao
  };
}

async function main() {
  setupDatabase();

  const options = parseArgs(process.argv.slice(2));
  const fonte = options.fonte || 'site_prefeitura';
  const limite = options.limite ? Number(options.limite) : null;
  const ids = options.ids
    ? String(options.ids)
        .split(',')
        .map((value) => Number(value.trim()))
        .filter(Boolean)
    : [];
  const numeros = options.numeros
    ? String(options.numeros)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const rows = db
    .prepare(
      `SELECT *
       FROM documentos
       WHERE fonte = @fonte
         AND url_pdf IS NOT NULL
         AND url_pdf != ''
       ORDER BY id ASC`
    )
    .all({ fonte });

  const suspeitos = rows.filter(isSuspectRow);
  const filtrados = suspeitos.filter((row) => {
    if (ids.length && !ids.includes(Number(row.id))) {
      return false;
    }

    if (numeros.length && !numeros.includes(String(row.numero || '').trim())) {
      return false;
    }

    return true;
  });
  const selecionados = limite ? filtrados.slice(0, limite) : filtrados;
  const coletor = new ColetorSitePrefeitura();
  const resumo = {
    fonte,
    inspecionados: rows.length,
    suspeitos: suspeitos.length,
    filtrados: filtrados.length,
    selecionados: selecionados.length,
    corrigidos: 0,
    sem_mudanca: 0,
    falhas: 0,
    erros: []
  };

  for (const row of selecionados) {
    try {
      const before = {
        resumo: row.resumo,
        texto_completo: row.texto_completo,
        dados_extras: row.dados_extras
      };

      await coletor.processarRegistro(buildItemFromRow(row), {
        itens_novos: 0,
        itens_atualizados: 0,
        itens_com_erro: 0,
        detalhes: []
      });

      const after = db
        .prepare('SELECT resumo, texto_completo, dados_extras FROM documentos WHERE id = ?')
        .get(row.id);

      const changed =
        before.resumo !== after.resumo ||
        before.texto_completo !== after.texto_completo ||
        before.dados_extras !== after.dados_extras;

      if (changed) {
        resumo.corrigidos += 1;
      } else {
        resumo.sem_mudanca += 1;
      }
    } catch (error) {
      resumo.falhas += 1;
      resumo.erros.push({
        id: row.id,
        url_pdf: row.url_pdf,
        erro: error.message
      });
    }
  }

  console.log(JSON.stringify(resumo, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
