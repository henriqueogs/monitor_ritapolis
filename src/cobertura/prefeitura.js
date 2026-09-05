const ColetorSitePrefeitura = require('../coletores/site-prefeitura');
const { db } = require('../db');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function getPrefeituraAreas() {
  return ColetorSitePrefeitura.AREAS.map((area) => ({ ...area }));
}

function getCoberturaPrefeituraSourceLinks() {
  return getPrefeituraAreas().map((area) => ({
    id: area.id,
    titulo: area.titulo,
    url: area.publicUrl
  }));
}

function getKnownPdfUrls() {
  return new Set(
    db
      .prepare("SELECT url_pdf FROM documentos WHERE fonte = 'site_prefeitura' AND IFNULL(url_pdf, '') <> ''")
      .all()
      .map((row) => row.url_pdf)
  );
}

function getKnownAreaSourceCounts() {
  const counts = new Map();

  for (const area of getPrefeituraAreas()) {
    const total = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM documentos
         WHERE fonte = 'site_prefeitura'
           AND url_origem IN (?, ?)`
      )
      .get(area.publicUrl, area.technicalUrl)?.total || 0;

    counts.set(area.id, total);
  }

  return counts;
}

function inferAnoFromRecord(record) {
  if (record.dataPublicacao) {
    return Number(String(record.dataPublicacao).slice(0, 4));
  }

  const source = `${record.numero || ''} ${record.titulo || ''}`;
  const match = source.match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

function toCoverageItem(record, area, conhecidos) {
  const pdfUrl = record.attachments.find((attachment) => attachment.url)?.url || null;
  const presente = pdfUrl ? conhecidos.has(pdfUrl) : false;

  return {
    area_id: area.id,
    area_titulo: area.titulo,
    titulo: record.titulo,
    numero: record.numero,
    ano: inferAnoFromRecord(record),
    url_origem: area.publicUrl,
    url_tecnica: area.technicalUrl,
    url_pdf: pdfUrl,
    presente_no_sistema: presente
  };
}

function summarizeByYear(dados) {
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

  return Array.from(porAno.values()).sort((a, b) => {
    if (a.ano === 'sem_ano') {return 1;}
    if (b.ano === 'sem_ano') {return -1;}
    return Number(b.ano) - Number(a.ano);
  });
}

function buildAreaSummary({ area, status, registros, conhecidosAreaCount = 0, erro = null }) {
  return {
    id: area.id,
    titulo: area.titulo,
    tipo: area.tipo,
    page_id: area.pageId,
    public_url: area.publicUrl,
    technical_url: area.technicalUrl,
    status,
    erro,
    encontrados_site: registros.length,
    presentes_sistema: registros.filter((item) => item.presente_no_sistema).length,
    ausentes_sistema: registros.filter((item) => !item.presente_no_sistema).length,
    documentos_conhecidos_area: conhecidosAreaCount
  };
}

async function compararCoberturaPrefeitura({ limite = 500 } = {}) {
  const normalizedLimit = Math.max(1, Number(limite) || 500);
  const cacheKey = `prefeitura:${normalizedLimit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return {
      ...cached.payload,
      cache: 'hit'
    };
  }

  const coletor = new ColetorSitePrefeitura();
  const conhecidos = getKnownPdfUrls();
  const conhecidosPorArea = getKnownAreaSourceCounts();
  const areas = [];
  const registros = [];
  const erros = [];

  // `normalizedLimit` e um teto POR AREA (nao dividido entre elas) -- antes
  // era um orcamento global, e a primeira area da lista ('editais', que
  // sozinha bate no teto) consumia tudo, deixando as outras 4 marcadas
  // 'nao_consultada_por_limite' pra sempre, mesmo sem nunca terem sido
  // olhadas. `collectRecordsForPage` pagina e para cedo ao bater o
  // maxRecords, entao o custo extra por area e limitado ao que ela
  // realmente tem (as menores param bem antes de 500).
  for (const area of getPrefeituraAreas()) {
    try {
      const encontrados = await coletor.collectRecordsForPage(area, { maxRecords: normalizedLimit });
      const areaRegistros = encontrados.map((record) => toCoverageItem(record, area, conhecidos));
      registros.push(...areaRegistros);
      areas.push(buildAreaSummary({
        area,
        status: 'ok',
        registros: areaRegistros,
        conhecidosAreaCount: conhecidosPorArea.get(area.id) || 0
      }));
    } catch (error) {
      const erro = error.message || 'Falha ao consultar area';
      erros.push({
        area_id: area.id,
        titulo: area.titulo,
        public_url: area.publicUrl,
        technical_url: area.technicalUrl,
        erro
      });
      areas.push(buildAreaSummary({
        area,
        status: 'indisponivel',
        registros: [],
        conhecidosAreaCount: conhecidosPorArea.get(area.id) || 0,
        erro
      }));
    }
  }

  const areasDisponiveis = areas.filter((area) => area.status === 'ok').length;
  const status = areasDisponiveis === areas.length
    ? 'ok'
    : areasDisponiveis > 0
      ? 'parcial'
      : 'indisponivel';

  // Resumo/por_ano/ausentes usam TODOS os registros (de todas as areas), nao
  // so os primeiros `normalizedLimit` -- cada area ja tem seu proprio teto
  // (acima), entao truncar de novo aqui so escondia as areas menores atras
  // da maior ('editais' vindo primeiro preenchia sozinha o corte de exibicao,
  // e o Resumo geral parecia so falar de editais mesmo com as outras areas
  // corretas na lista "Areas monitoradas").
  const dados = registros.slice(0, normalizedLimit);
  const payload = {
    status,
    fontes_consultadas: getCoberturaPrefeituraSourceLinks(),
    areas,
    erros,
    total_site: registros.length,
    total_presentes_sistema: registros.filter((item) => item.presente_no_sistema).length,
    total_ausentes_sistema: registros.filter((item) => !item.presente_no_sistema).length,
    por_ano: summarizeByYear(registros),
    ausentes: registros.filter((item) => !item.presente_no_sistema),
    dados,
    cache: 'miss'
  };

  cache.set(cacheKey, {
    createdAt: Date.now(),
    payload
  });

  return payload;
}

module.exports = {
  compararCoberturaPrefeitura,
  getCoberturaPrefeituraSourceLinks,
  getPrefeituraAreas
};
