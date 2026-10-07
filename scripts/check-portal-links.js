'use strict';

/**
 * Checa, via API pública, se os deep-links do Portal da Transparência (campo
 * `portal.url` dos últimos empenhos) ainda abrem o empenho certo. Roda fora da
 * VM (workflow portal-links.yml): o portal devolve 403 para o IP de datacenter
 * da Oracle, o que torna falsa a checagem do daily-scheduler.
 *
 *   node scripts/check-portal-links.js [apiUrl]    # sai com 1 se algum link falhar
 */

const API = process.argv[2] || 'https://api.ritapolis.com/api';
const AMOSTRA = 6;
const PAUSA_MS = 800;
const TIMEOUT_MS = 20000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const pausar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checar({ empenho, portal }) {
  if (!portal?.especifico) { return { empenho, ok: false, status: 'sem_link_especifico' }; }
  try {
    const r = await fetch(portal.url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) { return { empenho, ok: false, status: `http_${r.status}` }; }
    const ok = (await r.text()).includes(empenho);
    return { empenho, ok, status: ok ? 'ok' : 'sem_empenho_no_html' };
  } catch (err) {
    return { empenho, ok: false, status: `erro: ${err.message}` };
  }
}

async function main() {
  const resumo = await (await fetch(`${API}/transparencia/resumo`, { signal: AbortSignal.timeout(60000) })).json();
  const amostra = (resumo.ultimosEmpenhos || []).slice(0, AMOSTRA);
  if (!amostra.length) { throw new Error('API sem ultimosEmpenhos para amostrar'); }
  const resultados = [];
  for (const empenho of amostra) {
    resultados.push(await checar(empenho));
    await pausar(PAUSA_MS);
  }
  for (const r of resultados) { console.log(`${r.ok ? '✓' : '✗'} ${r.empenho} → ${r.status}`); }
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`${resultados.length - falhas}/${resultados.length} links válidos.`);
  if (falhas) { throw new Error('Deep-links falharam — o portal pode ter mudado o contrato de URL (ou bloqueou este IP).'); }
}

main().catch((err) => { console.error(`::error::${err.message}`); process.exit(1); });
