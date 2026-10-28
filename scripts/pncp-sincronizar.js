/**
 * Sincroniza vencedores e valores finais homologados do PNCP para documentos locais.
 *
 * Mesma rotina do agendador diário (src/coletas/pncp-vencedores.js): consulta as
 * contratações do órgão (/api/consulta/v1/contratacoes/publicacao), casa pelo número
 * de controle PNCP e busca itens e resultados (/api/pncp/v1/orgaos/.../itens/.../resultados).
 *
 * LIMITAÇÃO: Municípios que não publicam no PNCP retornam 204 (sem dados).
 * Use `--check` para verificar a cobertura antes de sincronizar.
 *
 * Uso:
 *   node scripts/pncp-sincronizar.js --check --ano=2026
 *   node scripts/pncp-sincronizar.js --dry-run --ano=2026
 *   node scripts/pncp-sincronizar.js --ano=2026
 *   node scripts/pncp-sincronizar.js --ano=2026 --cnpj=<cnpj do órgão>
 *   node scripts/pncp-sincronizar.js --ano=2026 --orgao=prefeitura   (ou camara)
 */

process.loadEnvFile?.() || require('dotenv').config();

const { verificarCoberturaMunicipio } = require('../src/integracoes/pncp-orgaos');
const { sincronizarVencedoresPncp } = require('../src/coletas/pncp-vencedores');
const config = require('../src/config');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ANO = args.ano ? Number(args.ano) : new Date().getFullYear();
// --orgao=prefeitura|camara escolhe o CNPJ do ente pela configuração (sem CNPJ à mão no package.json).
const CNPJ_POR_ORGAO = { prefeitura: config.cnpjPrefeitura, camara: config.cnpjCamara };
if (args.orgao && !CNPJ_POR_ORGAO[args.orgao]) {
  console.error(`--orgao inválido: "${args.orgao}" (use prefeitura ou camara)`);
  process.exit(1);
}
const CNPJ_FILTER = args.cnpj
  ? String(args.cnpj).replace(/\D/g, '')
  : CNPJ_POR_ORGAO[args.orgao] || null;
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

  const totais = await sincronizarVencedoresPncp({ cnpjs: CNPJS, anos: [ANO], dryRun: DRY_RUN });

  console.log(`\n[PNCP] Resumo (${CNPJS.length} órgão(s), ${ANO}):`);
  console.log(
    `  Compras PNCP: ${totais.consultadas} | Correspondências locais: ${totais.correspondencias}` +
      ` | ${DRY_RUN ? 'Seriam atualizadas' : 'Atualizadas'}: ${totais.atualizadas}` +
      ` | Sem resultado ainda: ${totais.sem_resultado}`
  );
  if (totais.erros) {
    console.log(`  Erros: ${totais.erros}`);
    for (const falha of totais.falhas.slice(0, VERBOSE ? undefined : 5)) {
      console.log(`    ${falha.cnpj} ${falha.ano}${falha.numeroPncp ? ` ${falha.numeroPncp}` : ''}: ${falha.erro}`);
    }
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
