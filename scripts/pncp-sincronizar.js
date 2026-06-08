/**
 * Sincroniza dados de vencedores e valores finais do PNCP para documentos locais.
 *
 * Usa a API /pncp-api/v1/orgaos/{cnpj}/compras para buscar compras diretamente
 * por CNPJ — mais confiável que a busca fuzzy por data+modalidade do pncp-diagnostico.
 *
 * Uso:
 *   node scripts/pncp-sincronizar.js [--ano=YYYY] [--cnpj=CNPJ] [--dry-run] [--max=N] [--verbose]
 */

process.loadEnvFile?.() || require('dotenv').config();

const {
  listarComprasPorCnpj,
  listarItensCompra,
  buscarResultadosItem,
  parsePncpNumeroControle,
  extrairVencedorResultados
} = require('../src/integracoes/pncp-orgaos');
const db = require('../src/db');
const config = require('../src/config');
const logger = require('../src/logger');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ANO = args.ano ? Number(args.ano) : null;
const CNPJ_FILTER = args.cnpj ? String(args.cnpj).replace(/\D/g, '') : null;
const DRY_RUN = Boolean(args['dry-run']);
const MAX_COMPRAS = args.max ? Number(args.max) : null;
const VERBOSE = Boolean(args.verbose);

const CNPJS = CNPJ_FILTER
  ? [CNPJ_FILTER]
  : [config.cnpjPrefeitura, config.cnpjCamara];

async function processarCompra(cnpj, compra) {
  const numeroPncp = compra.numeroControlePNCP;
  if (!numeroPncp) return null;

  const doc = db.getDocumentoByNumeroPncp(numeroPncp);
  if (!doc) return null;

  const parsed = parsePncpNumeroControle(numeroPncp);
  if (!parsed) return null;

  let vencedor_nome = null;
  let vencedor_cnpj = null;
  let valor_final = 0;
  let temResultado = false;

  try {
    const { items: itens } = await listarItensCompra(cnpj, parsed.ano, parsed.sequencial);

    for (const item of itens) {
      try {
        const resultados = await buscarResultadosItem(cnpj, parsed.ano, parsed.sequencial, item.numeroItem);
        const vencedor = extrairVencedorResultados(resultados);

        if (vencedor) {
          temResultado = true;
          if (!vencedor_nome) vencedor_nome = vencedor.nomeRazaoSocialFornecedor || null;
          if (!vencedor_cnpj) vencedor_cnpj = vencedor.niFornecedor || null;
          if (vencedor.valorTotalHomologado) {
            valor_final += Number(vencedor.valorTotalHomologado);
          }
        }
      } catch {
        // Item sem resultado — normal para itens desertos ou cancelados
      }
    }
  } catch (err) {
    if (VERBOSE) logger.debug(`Sem itens PNCP para ${numeroPncp}: ${err.message}`);
  }

  return {
    documento_id: doc.id,
    titulo: doc.titulo,
    numero_pncp: numeroPncp,
    vencedor_nome,
    vencedor_cnpj,
    valor_final: temResultado ? valor_final : null,
    data_resultado: compra.dataResultadoCompra || compra.dataPublicacaoPncp || null
  };
}

async function sincronizarCnpj(cnpj) {
  const stats = { total: 0, correspondencias: 0, atualizadas: 0, erros: 0 };
  let pagina = 1;
  const tamanhoPagina = 50;

  console.log(`\n[PNCP] Consultando compras do CNPJ ${cnpj}${ANO ? ` (${ANO})` : ''}...`);

  while (true) {
    let resp;
    try {
      resp = await listarComprasPorCnpj(cnpj, { ano: ANO, pagina, tamanhoPagina });
    } catch (err) {
      console.error(`  Erro na pág ${pagina}: ${err.message}`);
      stats.erros++;
      break;
    }

    if (!resp.items.length) break;
    stats.total += resp.items.length;

    for (const compra of resp.items) {
      if (MAX_COMPRAS && stats.total > MAX_COMPRAS) break;

      const resultado = await processarCompra(cnpj, compra);
      if (!resultado) continue;

      stats.correspondencias++;

      if (VERBOSE) {
        console.log(`  ✓ ${resultado.numero_pncp} → doc #${resultado.documento_id} (${resultado.vencedor_nome || 'sem vencedor'})`);
      }

      if (!DRY_RUN && (resultado.vencedor_nome || resultado.valor_final)) {
        const changed = db.upsertDadosPncp(resultado.documento_id, resultado);
        if (changed > 0) stats.atualizadas++;
      } else if (DRY_RUN && (resultado.vencedor_nome || resultado.valor_final)) {
        stats.atualizadas++;
      }
    }

    if (pagina >= resp.totalPaginas) break;
    pagina++;
  }

  return stats;
}

async function main() {
  if (DRY_RUN) console.log('[PNCP] Modo dry-run — nenhum dado será salvo.\n');

  const totais = { total: 0, correspondencias: 0, atualizadas: 0, erros: 0 };

  for (const cnpj of CNPJS) {
    try {
      const stats = await sincronizarCnpj(cnpj);
      console.log(`  Compras PNCP: ${stats.total} | Locais encontradas: ${stats.correspondencias} | ${DRY_RUN ? 'Seriam atualizadas' : 'Atualizadas'}: ${stats.atualizadas} | Erros: ${stats.erros}`);
      totais.total += stats.total;
      totais.correspondencias += stats.correspondencias;
      totais.atualizadas += stats.atualizadas;
      totais.erros += stats.erros;
    } catch (err) {
      console.error(`Erro ao processar CNPJ ${cnpj}:`, err.message);
      totais.erros++;
    }
  }

  console.log(`\n[PNCP] Resumo final:`);
  console.log(`  Total compras PNCP: ${totais.total}`);
  console.log(`  Correspondências locais: ${totais.correspondencias}`);
  console.log(`  ${DRY_RUN ? 'Seriam atualizadas' : 'Registros atualizados'}: ${totais.atualizadas}`);
  if (totais.erros) console.log(`  Erros: ${totais.erros}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
