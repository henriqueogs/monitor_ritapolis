/**
 * Sincroniza dados de vencedores e valores finais do PNCP para documentos locais.
 *
 * Usa a API de Consulta Pública do PNCP (/api/consulta/v1/contratacoes/publicacao).
 * Para cada contratação encontrada, tenta localizar o documento local pelo numero_pncp
 * e enriquece com vencedor e valor final homologado.
 *
 * LIMITAÇÃO: Municípios que não publicam no PNCP retornam 204 (sem dados).
 * Use `--check` para verificar a cobertura antes de sincronizar.
 *
 * Uso:
 *   node scripts/pncp-sincronizar.js --check --ano=2026
 *   node scripts/pncp-sincronizar.js --dry-run --ano=2026
 *   node scripts/pncp-sincronizar.js --ano=2026
 *   node scripts/pncp-sincronizar.js --ano=2026 --cnpj=18557553000105
 */

process.loadEnvFile?.() || require('dotenv').config();

const {
  verificarCoberturaMunicipio,
  gerarContratacoesPorCnpj,
  extrairNumeroPncp,
  extrairVencedor,
} = require('../src/integracoes/pncp-orgaos');
const db = require('../src/db');
const config = require('../src/config');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ANO = args.ano ? Number(args.ano) : new Date().getFullYear();
const CNPJ_FILTER = args.cnpj ? String(args.cnpj).replace(/\D/g, '') : null;
const DRY_RUN = Boolean(args['dry-run']);
const CHECK_ONLY = Boolean(args.check);
const VERBOSE = Boolean(args.verbose);

const CNPJS = CNPJ_FILTER
  ? [CNPJ_FILTER]
  : [config.cnpjPrefeitura, config.cnpjCamara];

async function checkCobertura() {
  console.log(`[PNCP] Verificando cobertura para o município IBGE ${config.ibgeCode} (${ANO})...\n`);
  const total = await verificarCoberturaMunicipio({ codigoMunicipioIbge: config.ibgeCode, ano: ANO });

  if (total === 0) {
    console.log('  Resultado: 0 registros encontrados (município não publica no PNCP)');
    console.log('\n  Este município pode estar publicando licitações no seu portal próprio');
    console.log('  mas ainda não integrou ao Portal Nacional de Contratações Públicas.');
    console.log('  A integração PNCP funcionará automaticamente quando isso ocorrer.');
  } else {
    console.log(`  Resultado: ${total} contrataç${total === 1 ? 'ão' : 'ões'} encontradas no PNCP para ${ANO}`);
    console.log('  Execute sem --check para sincronizar os dados.');
  }
  return total;
}

async function sincronizarCnpj(cnpj) {
  const stats = { total: 0, correspondencias: 0, atualizadas: 0, erros: 0 };
  console.log(`\n[PNCP] CNPJ ${cnpj} — ano ${ANO}...`);

  for await (const { modalidade, items } of gerarContratacoesPorCnpj(cnpj, ANO)) {
    stats.total += items.length;
    if (VERBOSE) {console.log(`  Modalidade ${modalidade}: ${items.length} contrataç${items.length === 1 ? 'ão' : 'ões'}`);}

    for (const item of items) {
      const numeroPncp = extrairNumeroPncp(item);
      if (!numeroPncp) {continue;}

      const doc = db.getDocumentoByNumeroPncp(numeroPncp);
      if (!doc) {continue;}

      stats.correspondencias++;
      const vencedor = extrairVencedor(item);

      if (VERBOSE || DRY_RUN) {
        console.log(`  ✓ ${numeroPncp} → doc #${doc.id} "${doc.titulo?.slice(0, 60)}" | ${vencedor?.nome || 'sem vencedor'}`);
      }

      if (!DRY_RUN && vencedor) {
        const changed = db.upsertDadosPncp(doc.id, {
          vencedor_nome: vencedor.nome,
          vencedor_cnpj: vencedor.cnpj,
          valor_final: vencedor.valor,
          numero_pncp: numeroPncp,
          data_resultado: item.dataResultadoCompra || item.dataPublicacaoPncp || null
        });
        if (changed > 0) {stats.atualizadas++;}
      } else if (DRY_RUN && vencedor) {
        stats.atualizadas++;
      }
    }
  }

  return stats;
}

async function main() {
  if (CHECK_ONLY) {
    await checkCobertura();
    return;
  }

  if (DRY_RUN) {console.log('[PNCP] Modo dry-run — nenhum dado será salvo.\n');}

  // Verificação rápida antes de sincronizar
  const cobertura = await verificarCoberturaMunicipio({ codigoMunicipioIbge: config.ibgeCode, ano: ANO });
  if (cobertura === 0) {
    console.log(`[PNCP] Município IBGE ${config.ibgeCode} não tem dados publicados no PNCP para ${ANO}.`);
    console.log('       Execute com --check para detalhes. Sincronização encerrada.');
    return;
  }

  const totais = { total: 0, correspondencias: 0, atualizadas: 0, erros: 0 };

  for (const cnpj of CNPJS) {
    try {
      const stats = await sincronizarCnpj(cnpj);
      console.log(`  Compras PNCP: ${stats.total} | Locais: ${stats.correspondencias} | ${DRY_RUN ? 'Seriam atualizadas' : 'Atualizadas'}: ${stats.atualizadas}`);
      totais.total += stats.total;
      totais.correspondencias += stats.correspondencias;
      totais.atualizadas += stats.atualizadas;
    } catch (err) {
      console.error(`Erro CNPJ ${cnpj}:`, err.message);
      totais.erros++;
    }
  }

  console.log(`\n[PNCP] Resumo:`);
  console.log(`  Total PNCP: ${totais.total} | Correspondências locais: ${totais.correspondencias} | ${DRY_RUN ? 'Seriam atualizadas' : 'Atualizadas'}: ${totais.atualizadas}`);
  if (totais.erros) {console.log(`  Erros: ${totais.erros}`);}
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
