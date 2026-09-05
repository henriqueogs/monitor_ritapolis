const { setupDatabase } = require('../src/db/setup');
const ColetorLegislacaoPrefeitura = require('../src/coletores/site-prefeitura-legislacao');

async function main() {
  setupDatabase();
  const coletor = new ColetorLegislacaoPrefeitura();
  const resultado = await coletor.run();
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
