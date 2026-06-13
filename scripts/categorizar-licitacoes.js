const { DatabaseSync } = require('node:sqlite');
const { salvarCategoria, getCategoriasStats } = require('../src/db');
const { classificarCategoria } = require('../src/licitacoes/categoria');

// ── Script principal ─────────────────────────────────────────────────────────

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function main() {
  const config = require('../src/config');
  const db = new DatabaseSync(config.dbPath);

  const ano = readFlag('ano');
  const forcar = process.argv.includes('--forcar');
  const verbose = process.argv.includes('--verbose');

  const filtros = ["d.tipo IN ('edital', 'publicacao_extrato')"];
  const params = [];

  if (ano) {
    filtros.push('d.ano = ?');
    params.push(Number(ano));
  }

  if (!forcar) {
    filtros.push('NOT EXISTS (SELECT 1 FROM licitacoes_categorias lc WHERE lc.documento_id = d.id)');
  }

  const documentos = db.prepare(`
    SELECT
      d.id, d.titulo, d.ano, d.tipo,
      GROUP_CONCAT(DISTINCT p.descricao) AS produtos_texto,
      r.resumo_json
    FROM documentos d
    LEFT JOIN licitacoes_produtos p ON p.documento_id = d.id
    LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
      AND r.id = (SELECT id FROM documentos_resumos_ai WHERE documento_id = d.id AND status = 'ok' AND provider <> 'mock' ORDER BY id DESC LIMIT 1)
    WHERE ${filtros.join(' AND ')}
    GROUP BY d.id
    ORDER BY d.ano DESC, d.id DESC
  `).all(...params);

  console.log(`Classificando ${documentos.length} licitação${documentos.length !== 1 ? 'ões' : ''}${ano ? ` de ${ano}` : ''}${forcar ? ' (forçando reclassificação)' : ''}...`);
  console.log('');

  const contadores = {};
  let processados = 0;

  for (const doc of documentos) {
    let objeto = '';
    try {
      const resumo = doc.resumo_json ? JSON.parse(doc.resumo_json) : null;
      objeto = resumo?.objeto || (typeof resumo?.licitacao === 'object' ? resumo.licitacao?.objeto : '') || '';
    } catch { /* JSON inválido — objeto fica vazio */ }

    const produtos = doc.produtos_texto ? doc.produtos_texto.split(',').filter(Boolean) : [];
    const resultado = classificarCategoria({ titulo: doc.titulo, objeto, produtos });

    salvarCategoria({
      documento_id: doc.id,
      categoria: resultado.categoria,
      subcategoria: resultado.subcategoria,
      confianca: resultado.confianca,
      origem: 'keyword',
      keywords_matched: resultado.keywords_matched
    });

    contadores[resultado.categoria] = (contadores[resultado.categoria] || 0) + 1;
    processados++;

    if (verbose) {
      console.log(
        `[${resultado.confianca.toFixed(2)}] ${resultado.categoria.padEnd(28)} | ${doc.ano} | ${doc.titulo.slice(0, 60)}`
      );
      if (resultado.keywords_matched?.length) {
        console.log(`       keywords: ${resultado.keywords_matched.join(', ')}`);
      }
    }
  }

  console.log(`Classificados: ${processados}`);
  console.log('');

  const stats = getCategoriasStats();
  console.log('── Distribuição por categoria (acumulado) ───────────────');
  const maxTotal = Math.max(...stats.por_categoria.map((c) => c.total));
  for (const c of stats.por_categoria) {
    const bar = '█'.repeat(Math.round((c.total / maxTotal) * 20)).padEnd(20, '░');
    console.log(
      `${c.categoria.padEnd(28)} ${bar} ${String(c.total).padStart(4)} (conf.média ${c.confianca_media.toFixed(2)})`
    );
  }
  console.log('');
  console.log(`Total classificados: ${stats.total_classificados} / ${stats.total_editais}`);
  if (stats.pendentes > 0) {
    console.log(`Pendentes: ${stats.pendentes} — rode sem filtros para classificar todos`);
  }
}

main();
