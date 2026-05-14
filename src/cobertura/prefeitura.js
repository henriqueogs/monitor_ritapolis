const ColetorSitePrefeitura = require('../coletores/site-prefeitura');
const { db } = require('../db');

function getKnownPdfUrls() {
  return new Set(
    db
      .prepare("SELECT url_pdf FROM documentos WHERE fonte = 'site_prefeitura' AND IFNULL(url_pdf, '') <> ''")
      .all()
      .map((row) => row.url_pdf)
  );
}

function inferAnoFromRecord(record) {
  if (record.dataPublicacao) {
    return Number(String(record.dataPublicacao).slice(0, 4));
  }

  const source = `${record.numero || ''} ${record.titulo || ''}`;
  const match = source.match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

async function compararCoberturaPrefeitura({ limite = 500 } = {}) {
  const coletor = new ColetorSitePrefeitura();
  const conhecidos = getKnownPdfUrls();
  const registros = [];

  for (const target of ColetorSitePrefeitura.TARGET_PAGES) {
    const encontrados = await coletor.collectRecordsForPage(target);
    registros.push(
      ...encontrados.map((record) => {
        const pdfUrl = record.attachments.find((attachment) => attachment.url)?.url || null;
        const presente = pdfUrl ? conhecidos.has(pdfUrl) : false;

        return {
          titulo: record.titulo,
          numero: record.numero,
          ano: inferAnoFromRecord(record),
          url_origem: record.pageUrl,
          url_pdf: pdfUrl,
          presente_no_sistema: presente
        };
      })
    );

    if (registros.length >= limite) {
      break;
    }
  }

  const dados = registros.slice(0, limite);
  const porAno = new Map();
  for (const item of dados) {
    const ano = item.ano || 'sem_ano';
    const atual = porAno.get(ano) || { ano, encontrados_site: 0, presentes_sistema: 0, ausentes_sistema: 0 };
    atual.encontrados_site += 1;
    if (item.presente_no_sistema) {
      atual.presentes_sistema += 1;
    } else {
      atual.ausentes_sistema += 1;
    }
    porAno.set(ano, atual);
  }

  return {
    total_site: dados.length,
    total_presentes_sistema: dados.filter((item) => item.presente_no_sistema).length,
    total_ausentes_sistema: dados.filter((item) => !item.presente_no_sistema).length,
    por_ano: Array.from(porAno.values()).sort((a, b) => {
      if (a.ano === 'sem_ano') return 1;
      if (b.ano === 'sem_ano') return -1;
      return Number(b.ano) - Number(a.ano);
    }),
    ausentes: dados.filter((item) => !item.presente_no_sistema),
    dados
  };
}

module.exports = {
  compararCoberturaPrefeitura
};
