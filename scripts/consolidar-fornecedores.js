const { consolidarFornecedores, getFornecedoresRanking } = require('../src/db');

function formatValor(valor) {
  if (!valor || valor === 0) {return 'R$ —';}
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function main() {
  console.log('Consolidando perfis de fornecedores...');

  const resultado = consolidarFornecedores();
  console.log(`Perfis salvos: ${resultado.salvos} (${resultado.total} CNPJs únicos encontrados)`);
  console.log('');

  const ranking = getFornecedoresRanking({ limite: 20, ordem: 'valor' });

  console.log('── Ranking por valor total ──────────────────────────────────────────');
  console.log(
    `${'#'.padEnd(4)} ${'CNPJ'.padEnd(20)} ${'Nome'.padEnd(45)} ${'Valor'.padStart(16)} ${'Vitórias'.padStart(9)} ${'Itens'.padStart(6)}`
  );
  console.log('─'.repeat(110));

  ranking.forEach((f, i) => {
    const nome = (f.nome_canonico || '—').slice(0, 44);
    console.log(
      `${String(i + 1).padEnd(4)} ${f.cnpj.padEnd(20)} ${nome.padEnd(45)} ${formatValor(f.total_valor_combinado).padStart(16)} ${String(f.n_vitorias).padStart(9)} ${String(f.n_itens_produtos).padStart(6)}`
    );
  });

  console.log('');
  console.log('Concluído. Use npm run inteligencia:fornecedores para atualizar.');
}

main();
